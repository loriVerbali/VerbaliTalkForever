// Personal Memory hub (PRD): records completed communication, builds concise
// AI context blocks, drains the extraction queue, seeds from intake, applies
// validated AI updates, and runs drift detection. Every public method is safe
// to call when the DB failed to open — the service degrades to a no-op.

import DefaultPreference from 'react-native-default-preference';
import NetInfo from '@react-native-community/netinfo';
import fetchHelper from '../utils/fetcher';
import {personalMemoryDb} from '../utils/personalMemoryDb';
import {getTimeOfDay, TimeBucket} from '../utils/timeOfDay';
import {
  decayedScore,
  rankItems,
} from '../utils/memoryRanking';
import {initialPreferences} from '../utils/persistance';
import type {
  CompletedCommunicationEvent,
  KnowledgeItemRow,
  MemoryContext,
  MemoryUpdate,
} from '../types/personalMemory';
import {normalizeMemoryText} from '../types/personalMemory';
import {isExtractionEligible} from './personalMemory/extractionPrefilter';
import {
  duplicateKey,
  orderForApply,
  resolveContradiction,
  validateMemoryUpdates,
} from './personalMemory/memoryUpdateValidator';
import {
  capContextSize,
  selectContextFacts,
} from './personalMemory/memoryContextBuilder';
import {mapPepesToKnowledge} from './personalMemory/intakeSeeding';
import {
  computeDriftFlags,
  isDriftEligible,
  SubjectUsage,
} from './personalMemory/driftDetection';
import type {PepesData} from '../utils/pepesUtils';

const EXTRACTION_BATCH_SIZE = 10;
const EXTRACTION_MAX_ATTEMPTS = 3;
const EXISTING_FACTS_CAP = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function getPref(key: keyof typeof initialPreferences): Promise<string> {
  try {
    const value = await DefaultPreference.get(key as string);
    if (value === null || value === undefined || value === '' || value === 'init.NotSet') {
      return (initialPreferences as any)[key];
    }
    return value as string;
  } catch (e) {
    return (initialPreferences as any)[key];
  }
}

export function makeMemoryEventId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class PersonalMemoryService {
  private ready = false;
  private failed = false;
  // Serialized write chain: recording never blocks the tap path and writes
  // never interleave (same idea as pressChainRef in SentenceBuilderGrid).
  private writeChain: Promise<void> = Promise.resolve();
  private drainInFlight = false;
  private debugFailureCount = 0;

  async init(): Promise<void> {
    try {
      await personalMemoryDb.init();
      this.ready = true;
      this.failed = false;
      // Seed from intake + evaluate drift in the background.
      this.enqueueTask(() => this.seedFromIntake());
      this.enqueueTask(() => this.evaluateKnowledgeDrift());
    } catch (error) {
      // No-op mode: the app runs exactly as it does without Personal Memory.
      this.ready = false;
      this.failed = true;
      console.warn('[PersonalMemory] init failed — memory disabled for this run');
    }
  }

  isReady(): boolean {
    return this.ready && personalMemoryDb.isInitialized();
  }

  /** Re-open after profile import/export closed the DB underneath us. */
  async reopen(): Promise<void> {
    if (this.failed) {
      return;
    }
    try {
      await personalMemoryDb.init();
      this.ready = true;
    } catch (e) {
      this.ready = false;
    }
  }

  onDatabaseClosed(): void {
    this.ready = false;
  }

  private enqueueTask(task: () => Promise<void>): void {
    this.writeChain = this.writeChain
      .then(task)
      .catch(() => {
        this.debugFailureCount++;
      });
  }

  private async isLearningEnabled(): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }
    const enabled = await getPref('memoryEnabled');
    if (enabled !== '1') {
      return false;
    }
    const paused = await getPref('memoryLearningPaused');
    return paused !== '1';
  }

  private async isAiContextEnabled(): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }
    const enabled = await getPref('memoryEnabled');
    const aiEnabled = await getPref('memoryAiContextEnabled');
    return enabled === '1' && aiEnabled === '1';
  }

  // ── Recording (PRD §5) ────────────────────────────────────────────────────

  recordCompletedCommunication(event: CompletedCommunicationEvent): void {
    this.enqueueTask(async () => {
      if (!(await this.isLearningEnabled())) {
        return;
      }

      const {kind, text, words, source, occurredAt} = event;
      const bucket = getTimeOfDay(occurredAt);

      // 1–2. Upsert the full item + time bucket.
      const fullId = await personalMemoryDb.upsertMemoryItem(
        kind,
        text,
        occurredAt,
      );
      if (fullId > 0) {
        await personalMemoryDb.bumpTimePattern(fullId, bucket);
      }

      // Constituent words — for multi-word answers only. Sentence words are
      // already recorded one-by-one at tap time (logWordSelection), so
      // expanding a played sentence here would count every word twice;
      // answers are chosen whole from AI cards and never tap-recorded.
      if (kind === 'answer' && words.length > 1) {
        for (const word of words) {
          const wordId = await personalMemoryDb.upsertMemoryItem(
            'word',
            word,
            occurredAt,
          );
          if (wordId > 0) {
            await personalMemoryDb.bumpTimePattern(wordId, bucket);
          }
        }
      }

      // 3. Bigrams from completed sentences.
      if (kind === 'sentence') {
        for (let i = 0; i < words.length - 1; i++) {
          await personalMemoryDb.upsertSequence(
            words[i],
            words[i + 1],
            occurredAt,
          );
        }
      }

      // 4. Session-scoped recents.
      await personalMemoryDb.insertRecentItem(kind, text, occurredAt, source);

      // 5. Extraction eligibility prefilter (PRD §7.4). The queue exists
      // solely to be uploaded, so it must also respect the AI-context switch
      // at enqueue time — otherwise text captured while uploads are off would
      // be sent retroactively the moment the switch turns on.
      if (isExtractionEligible(text) && (await this.isAiContextEnabled())) {
        await personalMemoryDb.enqueueExtraction(
          event.eventId,
          text,
          source,
          occurredAt,
        );
        // 6. Kick the drainer if online (fire-and-forget).
        NetInfo.fetch()
          .then(state => {
            if (state.isConnected) {
              this.drainExtractionQueue();
            }
          })
          .catch(() => {});
      }
    });
  }

  // ── Ranking (PRD §6) ──────────────────────────────────────────────────────

  async getRankedWords(opts: {
    bucket?: TimeBucket;
    precedingWord?: string;
    limit: number;
  }): Promise<Array<{text: string; score: number}>> {
    if (!this.isReady()) {
      return [];
    }
    try {
      const items = await personalMemoryDb.getMemoryItems({kind: 'word'});
      const bucketCounts = new Map<
        number,
        Partial<Record<TimeBucket, number>>
      >();
      if (opts.bucket) {
        const patterns = await personalMemoryDb.getTimePatterns(
          items.map(i => i.id),
        );
        for (const pattern of patterns) {
          const entry = bucketCounts.get(pattern.item_id) || {};
          entry[pattern.bucket as TimeBucket] = pattern.use_count;
          bucketCounts.set(pattern.item_id, entry);
        }
      }
      let continuations: Set<string> | undefined;
      if (opts.precedingWord) {
        const sequences = await personalMemoryDb.getSequencesFrom(
          normalizeMemoryText(opts.precedingWord),
          20,
        );
        continuations = new Set(sequences.map(s => s.next_normalized));
      }
      return rankItems(
        items.map(item => ({
          id: item.id,
          text: item.text,
          useCount: item.use_count,
          lastUsedMs: Date.parse(item.last_used),
          pinned: item.pinned === 1,
        })),
        {
          bucket: opts.bucket,
          bucketCounts,
          continuations,
          limit: opts.limit,
        },
      );
    } catch (e) {
      return [];
    }
  }

  /** Batched decayed-score lookup for Verbi within-group ordering. */
  async getMemoryScores(labels: string[]): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    if (!this.isReady() || labels.length === 0) {
      return scores;
    }
    try {
      const enabled = await getPref('memoryEnabled');
      if (enabled !== '1') {
        return scores;
      }
      const normalized = labels.map(normalizeMemoryText).filter(Boolean);
      const rows = await personalMemoryDb.getMemoryItemsByNormalized(normalized);
      const now = Date.now();
      for (const row of rows) {
        scores.set(
          row.normalized,
          decayedScore(row.use_count, Date.parse(row.last_used), now) +
            (row.pinned === 1 ? 5 : 0),
        );
      }
    } catch (e) {
      // no scores — callers fall back to server order
    }
    return scores;
  }

  // ── AI context (PRD §9) ───────────────────────────────────────────────────

  async buildMemoryContext(opts?: {
    currentText?: string;
  }): Promise<MemoryContext | undefined> {
    try {
      if (!(await this.isAiContextEnabled())) {
        return undefined;
      }

      const recent = await personalMemoryDb.getRecentItems(30);
      const recentWords = Array.from(
        new Set(
          recent
            .filter(r => r.kind === 'word')
            .map(r => r.text.trim())
            .filter(Boolean),
        ),
      ).slice(0, 10);

      const ranked = await this.getRankedWords({limit: 10});
      const frequentWords = ranked.map(r => r.text);

      const sequences = await personalMemoryDb.getTopSequences(5);
      const commonSequences = sequences
        .filter(s => s.use_count >= 2)
        .map(s => `${s.prev_normalized} → ${s.next_normalized}`);

      const facts = await personalMemoryDb.getKnowledgeItems({
        status: ['active', 'possibly_outdated'],
      });
      const factStatements = selectContextFacts(facts, opts?.currentText);

      const context: MemoryContext = {};
      if (
        recentWords.length > 0 ||
        frequentWords.length > 0 ||
        commonSequences.length > 0
      ) {
        context.communication = {
          ...(recentWords.length > 0 ? {recentWords} : {}),
          ...(frequentWords.length > 0 ? {frequentWords} : {}),
          ...(commonSequences.length > 0 ? {commonSequences} : {}),
          timeOfDay: getTimeOfDay(),
        };
      }
      if (factStatements.length > 0) {
        context.personal = {facts: factStatements};
      }

      if (!context.communication && !context.personal) {
        return undefined;
      }
      return capContextSize(context);
    } catch (e) {
      return undefined;
    }
  }

  // ── Extraction pipeline (PRD §7) ──────────────────────────────────────────

  async drainExtractionQueue(): Promise<void> {
    if (this.drainInFlight || !this.isReady()) {
      return;
    }
    this.drainInFlight = true;
    try {
      const enabled = await getPref('memoryEnabled');
      const aiEnabled = await getPref('memoryAiContextEnabled');
      if (enabled !== '1' || aiEnabled !== '1') {
        return;
      }

      const batch = await personalMemoryDb.getExtractionBatch(
        EXTRACTION_BATCH_SIZE,
      );
      if (batch.length === 0) {
        return;
      }

      const childName = (await getPref('heroName')) || 'the user';
      const activeFacts = await personalMemoryDb.getKnowledgeItems({
        status: ['active'],
      });
      const existingFacts = activeFacts.slice(0, EXISTING_FACTS_CAP).map(f => ({
        id: f.id,
        category: f.category,
        subject: f.subject,
        value: f.value,
        statement: f.statement,
        source: f.source,
        confirmed: f.confirmed === 1,
      }));

      let response: any = null;
      try {
        response = await fetchHelper(
          'memoryExtract',
          {},
          {
            communications: batch.map(row => ({
              eventId: row.event_id,
              text: row.text,
              source: row.source,
              occurredAt: row.occurred_at,
            })),
            childName,
            existingFacts,
            locale: 'en-US',
          },
        );
      } catch (e) {
        response = null;
      }

      if (!response || !Array.isArray(response.memoryUpdates)) {
        // Failure: bump attempts; rows over the cap are dropped.
        await personalMemoryDb.bumpExtractionAttempts(
          batch.map(row => row.id),
          EXTRACTION_MAX_ATTEMPTS,
        );
        return;
      }

      await this.applyMemoryUpdates(response.memoryUpdates as MemoryUpdate[]);
      await personalMemoryDb.deleteExtractionRows(batch.map(r => r.event_id));
    } catch (e) {
      this.debugFailureCount++;
    } finally {
      this.drainInFlight = false;
    }
  }

  async applyMemoryUpdates(updates: MemoryUpdate[]): Promise<void> {
    if (!this.isReady() || updates.length === 0) {
      return;
    }

    const threshold = parseFloat(await getPref('memoryExtractionThreshold'));
    const paused = (await getPref('memoryLearningPaused')) === '1';
    const allFacts = await personalMemoryDb.getKnowledgeItems();
    const existingIds = new Set(allFacts.map(f => f.id));
    const activeDuplicates = new Set(
      allFacts
        .filter(f => f.status === 'active')
        .map(f => duplicateKey(f.category, f.subject)),
    );
    const rejectedBlocklist = new Set(
      allFacts
        .filter(f => f.status === 'rejected')
        .map(f => duplicateKey(f.category, f.subject)),
    );

    const {accepted} = validateMemoryUpdates(updates, {
      threshold: Number.isFinite(threshold) ? threshold : 0.85,
      existingIds,
      activeDuplicates,
      rejectedBlocklist,
      learningPaused: paused,
    });

    const now = new Date();
    const factById = new Map(allFacts.map(f => [f.id, f]));
    // Active facts created in this batch, keyed by the communication that
    // produced them — lets a contradict from the same communication retire its
    // target as `replaced` instead of `possibly_outdated`.
    const createdActiveIds = new Map<string, number>();

    for (const {update, createStatus, aiContextEnabled} of orderForApply(
      accepted,
    )) {
      try {
        if (update.action === 'create') {
          const id = await personalMemoryDb.insertKnowledgeItem({
            category: update.category,
            subject: update.subject,
            value: update.value ?? null,
            statement: update.statement,
            confidence: update.confidence,
            source: 'ai',
            status: createStatus,
            confirmed: false,
            aiContextEnabled,
          });
          await personalMemoryDb.insertEvidence(id, 'create', null, now);
          if (createStatus === 'active') {
            createdActiveIds.set(update.eventId, id);
          }
          // Prevent duplicate creates within the same batch.
          activeDuplicates.add(duplicateKey(update.category, update.subject));
        } else if (update.action === 'reinforce') {
          const target = factById.get(update.existingFactId as number);
          if (!target) {
            continue;
          }
          await personalMemoryDb.updateKnowledgeItem(target.id, {
            last_reinforced: now.toISOString(),
            confidence: Math.min(0.99, target.confidence + 0.05),
          });
          await personalMemoryDb.insertEvidence(
            target.id,
            'reinforce',
            null,
            now,
          );
        } else if (update.action === 'update') {
          const target = factById.get(update.existingFactId as number);
          if (!target) {
            continue;
          }
          const newId = await personalMemoryDb.insertKnowledgeItem({
            category: update.category,
            subject: update.subject,
            value: update.value ?? null,
            statement: update.statement,
            confidence: update.confidence,
            source: 'ai',
            status: 'active',
            confirmed: false,
          });
          await personalMemoryDb.insertEvidence(newId, 'create', null, now);
          await personalMemoryDb.updateKnowledgeItem(target.id, {
            status: 'replaced',
            replaced_by: newId,
          });
        } else if (update.action === 'contradict') {
          const target = factById.get(update.existingFactId as number);
          if (!target) {
            continue;
          }
          await personalMemoryDb.insertEvidence(
            target.id,
            'contradict',
            null,
            now,
          );
          const outcome = resolveContradiction(
            target,
            createdActiveIds.get(update.eventId),
          );
          if (outcome.kind === 'replaced') {
            await personalMemoryDb.updateKnowledgeItem(target.id, {
              status: 'replaced',
              replaced_by: outcome.replacedBy,
            });
          } else if (outcome.kind === 'possibly_outdated') {
            await personalMemoryDb.updateKnowledgeItem(target.id, {
              status: 'possibly_outdated',
            });
          } else {
            // Confirmed / intake / caregiver facts are never silently
            // overridden — queue a review card instead (PRD §8.3 hierarchy).
            await personalMemoryDb.updateKnowledgeItem(target.id, {
              review_flag: 'possibly_outdated',
            });
          }
        }
      } catch (e) {
        this.debugFailureCount++;
      }
    }
  }

  // ── Intake seeding (PRD §8.2) ─────────────────────────────────────────────

  async seedFromIntake(): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    try {
      const raw = await getPref('pepes');
      if (!raw) {
        return;
      }
      let pepes: PepesData;
      try {
        pepes = JSON.parse(raw);
      } catch (e) {
        return;
      }

      const seeds = mapPepesToKnowledge(pepes);
      const seedIds = new Set(seeds.map(s => s.pepesItemId));
      const mirrored = (await personalMemoryDb.getKnowledgeItems()).filter(
        f => f.source === 'intake' && f.pepes_item_id,
      );
      const mirroredById = new Map(
        mirrored.map(f => [f.pepes_item_id as string, f]),
      );

      for (const seed of seeds) {
        const existing = mirroredById.get(seed.pepesItemId);
        if (existing) {
          const patch: any = {};
          if (existing.statement !== seed.statement) {
            patch.statement = seed.statement;
          }
          if (existing.subject !== seed.subject) {
            patch.subject = seed.subject;
          }
          if ((existing.value ?? null) !== seed.value) {
            patch.value = seed.value;
          }
          if (existing.status === 'inactive') {
            // Tile was removed and has come back — revive the mirror.
            // Caregiver removals in the hero profile use 'rejected' precisely
            // so this branch can never resurrect them (AboutTheUser).
            patch.status = 'active';
          }
          if (Object.keys(patch).length > 0) {
            await personalMemoryDb.updateKnowledgeItem(existing.id, patch);
          }
        } else {
          const id = await personalMemoryDb.insertKnowledgeItem({
            category: seed.category,
            subject: seed.subject,
            value: seed.value,
            statement: seed.statement,
            confidence: 0.95,
            source: 'intake',
            status: 'active',
            confirmed: true,
            pepesItemId: seed.pepesItemId,
          });
          await personalMemoryDb.insertEvidence(id, 'caregiver', null, new Date());
        }
      }

      // Tiles removed by the caregiver deactivate their mirrored facts.
      for (const fact of mirrored) {
        if (
          !seedIds.has(fact.pepes_item_id as string) &&
          fact.status === 'active'
        ) {
          await personalMemoryDb.updateKnowledgeItem(fact.id, {
            status: 'inactive',
          });
        }
      }
    } catch (e) {
      this.debugFailureCount++;
    }
  }

  // ── Drift & promotion (PRD §8.3–8.4) ──────────────────────────────────────

  async evaluateKnowledgeDrift(): Promise<void> {
    if (!(await this.isLearningEnabled())) {
      return;
    }
    try {
      const now = new Date();
      const last = await personalMemoryDb.getMeta('lastDriftRun');
      if (last && now.getTime() - Date.parse(last) < MS_PER_DAY) {
        return;
      }
      await personalMemoryDb.setMeta('lastDriftRun', now.toISOString());

      const facts = await personalMemoryDb.getKnowledgeItems({
        status: ['active'],
      });
      const eligible = facts.filter(isDriftEligible);

      // Build usage map from memory_items (subject + pepes aliases).
      const aliasesBySubject = await this.buildAliasMap(eligible);
      const usage = new Map<string, SubjectUsage>();
      for (const fact of eligible) {
        const subjectKey = fact.subject.trim().toLowerCase();
        const names = aliasesBySubject.get(subjectKey) || [subjectKey];
        const rows = await personalMemoryDb.getMemoryItemsByNormalized(names);
        if (rows.length === 0) {
          usage.set(subjectKey, {last30: 0, prior60: 0, lastUsedMs: null});
          continue;
        }
        let lastUsedMs: number | null = null;
        let last30 = 0;
        let prior60 = 0;
        for (const row of rows) {
          const usedMs = Date.parse(row.last_used);
          if (lastUsedMs === null || usedMs > lastUsedMs) {
            lastUsedMs = usedMs;
          }
          const days = (now.getTime() - usedMs) / MS_PER_DAY;
          // Approximation from last_used + counts: recent-use share can't be
          // reconstructed exactly, so treat all use_count as in-window when
          // last_used falls in it (long windows make this good enough).
          if (days <= 30) {
            last30 += row.use_count;
          } else if (days <= 90) {
            prior60 += row.use_count;
          }
        }
        usage.set(subjectKey, {last30, prior60, lastUsedMs});
      }

      const contradicted = new Set(
        await personalMemoryDb.getContradictedKnowledgeIds(),
      );
      const flags = computeDriftFlags(
        eligible,
        usage,
        contradicted,
        now.getTime(),
      );

      for (const flag of flags) {
        const fact = eligible.find(f => f.id === flag.factId);
        if (!fact) {
          continue;
        }
        if (fact.source === 'ai' && fact.confirmed === 0) {
          await personalMemoryDb.updateKnowledgeItem(fact.id, {
            status: 'possibly_outdated',
            usage_checked_at: now.toISOString(),
          });
        } else {
          await personalMemoryDb.updateKnowledgeItem(fact.id, {
            review_flag: 'possibly_outdated',
            usage_checked_at: now.toISOString(),
          });
        }
      }

      await this.computePromotionOffers();
    } catch (e) {
      this.debugFailureCount++;
    }
  }

  private async buildAliasMap(
    facts: KnowledgeItemRow[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    let pepes: PepesData | null = null;
    try {
      const raw = await getPref('pepes');
      pepes = raw ? JSON.parse(raw) : null;
    } catch (e) {
      pepes = null;
    }
    for (const fact of facts) {
      const subjectKey = fact.subject.trim().toLowerCase();
      const names = [subjectKey];
      if (pepes) {
        for (const items of Object.values(pepes)) {
          for (const item of items || []) {
            if ((item.name || '').trim().toLowerCase() === subjectKey) {
              for (const alias of item.aliases || []) {
                const a = alias.trim().toLowerCase();
                if (a && !names.includes(a)) {
                  names.push(a);
                }
              }
            }
          }
        }
      }
      map.set(subjectKey, names);
    }
    return map;
  }

  private async computePromotionOffers(): Promise<void> {
    const aiFacts = (
      await personalMemoryDb.getKnowledgeItems({status: ['active']})
    ).filter(
      f =>
        f.source === 'ai' &&
        !f.pepes_item_id &&
        f.review_flag === null &&
        (f.confidence >= 0.9 || f.confirmed === 1),
    );
    if (aiFacts.length === 0) {
      return;
    }
    const stats = await personalMemoryDb.getReinforceEvidenceStats();
    const daysById = new Map(stats.map(s => [s.knowledge_id, s.reinforce_days]));
    for (const fact of aiFacts) {
      if ((daysById.get(fact.id) || 0) >= 3 || fact.confirmed === 1) {
        await personalMemoryDb.updateKnowledgeItem(fact.id, {
          review_flag: 'promotion_offer',
        });
      }
    }
  }

  // ── Lifecycle / caregiver actions ────────────────────────────────────────

  onAppForeground(): void {
    this.enqueueTask(async () => {
      await this.evaluateKnowledgeDrift();
    });
    NetInfo.fetch()
      .then(state => {
        if (state.isConnected) {
          this.drainExtractionQueue();
        }
      })
      .catch(() => {});
  }

  async clearRecentMemory(): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    await personalMemoryDb.clearRecentItems();
  }

  /** Discard everything queued for upload (AI-context switch turned off). */
  async clearExtractionQueue(): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    try {
      await personalMemoryDb.clearExtractionQueue();
    } catch (e) {
      this.debugFailureCount++;
    }
  }

  async resetAll(): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    await personalMemoryDb.resetAll();
    await DefaultPreference.set('memoryEnabled', '1');
    await DefaultPreference.set('memoryLearningPaused', '0');
    await DefaultPreference.set('memoryAiContextEnabled', '1');
    await DefaultPreference.set('memoryExtractionThreshold', '0.85');
  }

  async hasAnyMemory(): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }
    try {
      const counts = await personalMemoryDb.counts();
      return counts.memoryItems > 0 || counts.nonIntakeKnowledge > 0;
    } catch (e) {
      return false;
    }
  }

  async getReviewBadgeCount(): Promise<number> {
    if (!this.isReady()) {
      return 0;
    }
    try {
      const counts = await personalMemoryDb.counts();
      return counts.suggested + counts.flagged;
    } catch (e) {
      return 0;
    }
  }
}

export const personalMemoryService = new PersonalMemoryService();
