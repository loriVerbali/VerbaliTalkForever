// App-side validation of AI-proposed memory updates (PRD §7.5). Pure module.

import type {
  KnowledgeCategory,
  MemoryUpdate,
} from '../../types/personalMemory';

const SUPPORTED_CATEGORIES: KnowledgeCategory[] = [
  'person',
  'relationship',
  'place',
  'food',
  'activity',
  'object',
  'like',
  'dislike',
  'routine',
  'fact',
];

const SUPPORTED_ACTIONS = ['create', 'reinforce', 'update', 'contradict'];

/** Minimum confidence for a proposal to enter the review queue at all. */
export const SUGGESTED_CONFIDENCE_FLOOR = 0.6;

// Defense-in-depth sensitive blocklist (also enforced in the extraction
// prompt). Explicitly-communicated sensitive facts require caregiver review
// before entering AI context (PRD §17).
const SENSITIVE_PATTERN =
  /\b(autis|adhd|diagnos|disorder|disabilit|medicat|therap|depress|anxiet|suicid|self[- ]harm|abuse|abused|divorce|custody|religio|church|mosque|synagogue|god|jesus|allah|muslim|christian|jewish|hindu|buddhis|atheis|politic|democrat|republican|election|gay|lesbian|transgender|sexual)\w*\b/i;

export interface AcceptedUpdate {
  update: MemoryUpdate;
  /** Resolved landing status for `create` actions. */
  createStatus: 'active' | 'suggested';
  /** Whether the fact must be excluded from AI context until confirmed. */
  aiContextEnabled: boolean;
}

export interface ValidationContext {
  /** Auto-accept confidence threshold (memoryExtractionThreshold, default 0.85). */
  threshold: number;
  /** Existing knowledge_items ids (for reinforce/update/contradict targets). */
  existingIds: Set<number>;
  /** `${category}:${subject.toLowerCase()}` keys of active facts. */
  activeDuplicates: Set<string>;
  /** Same-shaped keys of caregiver-rejected facts (Mark incorrect blocklist). */
  rejectedBlocklist: Set<string>;
  learningPaused: boolean;
}

export function duplicateKey(category: string, subject: string): string {
  return `${category}:${subject.trim().toLowerCase()}`;
}

export function validateMemoryUpdates(
  updates: MemoryUpdate[],
  ctx: ValidationContext,
): {accepted: AcceptedUpdate[]; rejectedCount: number} {
  const accepted: AcceptedUpdate[] = [];
  let rejectedCount = 0;

  if (ctx.learningPaused) {
    return {accepted, rejectedCount: updates.length};
  }

  for (const update of updates) {
    if (
      !update ||
      typeof update.subject !== 'string' ||
      !update.subject.trim() ||
      typeof update.statement !== 'string' ||
      !update.statement.trim() ||
      typeof update.confidence !== 'number' ||
      update.confidence < 0 ||
      update.confidence > 1 ||
      !SUPPORTED_ACTIONS.includes(update.action) ||
      !SUPPORTED_CATEGORIES.includes(update.category)
    ) {
      rejectedCount++;
      continue;
    }

    const key = duplicateKey(update.category, update.subject);

    if (ctx.rejectedBlocklist.has(key)) {
      rejectedCount++;
      continue;
    }

    if (update.action !== 'create') {
      const targetId = update.existingFactId;
      if (typeof targetId !== 'number' || !ctx.existingIds.has(targetId)) {
        rejectedCount++;
        continue;
      }
      accepted.push({update, createStatus: 'active', aiContextEnabled: true});
      continue;
    }

    // create
    if (update.confidence < SUGGESTED_CONFIDENCE_FLOOR) {
      rejectedCount++;
      continue;
    }
    if (ctx.activeDuplicates.has(key)) {
      // Duplicate of an active fact without being a reinforce — drop.
      rejectedCount++;
      continue;
    }

    const sensitive = SENSITIVE_PATTERN.test(
      `${update.subject} ${update.value ?? ''} ${update.statement}`,
    );
    const needsReview =
      sensitive ||
      update.needsCaregiverReview === true ||
      update.confidence < ctx.threshold;

    accepted.push({
      update,
      createStatus: needsReview ? 'suggested' : 'active',
      aiContextEnabled: !sensitive,
    });
  }

  return {accepted, rejectedCount};
}

/**
 * Apply order: contradicts last, so a contradict can link to a replacement
 * fact created by the same communication. Gemini frequently emits a
 * `contradict` + `create` pair (in either order) where the PRD's `update`
 * action was intended.
 */
export function orderForApply(accepted: AcceptedUpdate[]): AcceptedUpdate[] {
  return [
    ...accepted.filter(a => a.update.action !== 'contradict'),
    ...accepted.filter(a => a.update.action === 'contradict'),
  ];
}

export type ContradictOutcome =
  | {kind: 'replaced'; replacedBy: number}
  | {kind: 'possibly_outdated'}
  | {kind: 'review_flag'};

/**
 * Contradict landing rules (PRD §7.5 table + §8.3 hierarchy):
 * - confirmed / intake / caregiver fact → review card only, never overridden;
 * - unconfirmed AI fact with an active replacement created from the same
 *   communication → `replaced` (the pair is Gemini's `update` in disguise;
 *   leaving the old fact `possibly_outdated` would keep both sides of the
 *   contradiction eligible for AI context);
 * - unconfirmed AI fact, no replacement → `possibly_outdated`.
 */
export function resolveContradiction(
  target: {source: string; confirmed: number},
  pairedCreateId: number | undefined,
): ContradictOutcome {
  if (target.source !== 'ai' || target.confirmed === 1) {
    return {kind: 'review_flag'};
  }
  if (pairedCreateId !== undefined) {
    return {kind: 'replaced', replacedBy: pairedCreateId};
  }
  return {kind: 'possibly_outdated'};
}
