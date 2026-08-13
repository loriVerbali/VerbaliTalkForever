import SQLite from 'react-native-sqlite-storage';
import type {
  EvidenceRow,
  ExtractionRow,
  KnowledgeItemRow,
  KnowledgeStatus,
  MemoryItemKind,
  MemoryItemRow,
  RecentItemRow,
  SequenceRow,
  TimePatternRow,
} from '../types/personalMemory';
import {normalizeMemoryText} from '../types/personalMemory';
import type {TimeBucket} from './timeOfDay';

// Enable promise-based API
SQLite.enablePromise(true);

const DATABASE_NAME = 'personal_memory.db';
const DATABASE_VERSION = '1.0';
const DATABASE_DISPLAYNAME = 'Personal Memory Database';
const DATABASE_SIZE = 200000;
const SCHEMA_VERSION = 1;

const RECENT_ITEMS_CAP = 200;
const EXTRACTION_QUEUE_CAP = 50;

export interface NewKnowledgeItem {
  category: string;
  subject: string;
  value?: string | null;
  statement: string;
  confidence: number;
  source: 'intake' | 'ai' | 'caregiver';
  status?: KnowledgeStatus;
  confirmed?: boolean;
  aiContextEnabled?: boolean;
  pepesItemId?: string | null;
  firstLearned?: Date;
}

const TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS memory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK(kind IN ('word','sentence','answer')),
    text TEXT NOT NULL,
    normalized TEXT NOT NULL,
    first_used DATETIME NOT NULL,
    last_used DATETIME NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 1,
    pinned INTEGER NOT NULL DEFAULT 0,
    UNIQUE(kind, normalized)
  )`,
  `CREATE TABLE IF NOT EXISTS time_patterns (
    item_id INTEGER NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
    bucket TEXT NOT NULL CHECK(bucket IN ('morning','afternoon','evening','night')),
    use_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (item_id, bucket)
  )`,
  `CREATE TABLE IF NOT EXISTS sequences (
    prev_normalized TEXT NOT NULL,
    next_normalized TEXT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 1,
    last_used DATETIME NOT NULL,
    PRIMARY KEY (prev_normalized, next_normalized)
  )`,
  `CREATE TABLE IF NOT EXISTS recent_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    used_at DATETIME NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('Home','Convo'))
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN
      ('person','relationship','place','food','activity','object',
       'like','dislike','routine','fact')),
    subject TEXT NOT NULL,
    value TEXT,
    statement TEXT NOT NULL,
    confidence REAL NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('intake','ai','caregiver')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN
      ('active','suggested','possibly_outdated','replaced','inactive','rejected')),
    confirmed INTEGER NOT NULL DEFAULT 0,
    ai_context_enabled INTEGER NOT NULL DEFAULT 1,
    pepes_item_id TEXT,
    replaced_by INTEGER REFERENCES knowledge_items(id),
    first_learned DATETIME NOT NULL,
    last_reinforced DATETIME NOT NULL,
    usage_checked_at DATETIME,
    review_flag TEXT CHECK(review_flag IN ('possibly_outdated','promotion_offer')),
    review_dismissed_until DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    knowledge_id INTEGER NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('create','reinforce','contradict','caregiver')),
    communication_text TEXT,
    occurred_at DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS extraction_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    occurred_at DATETIME NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS pending_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL,
    created_at DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_items_norm ON memory_items (normalized)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_items_last_used ON memory_items (last_used)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_status_cat ON knowledge_items (status, category)`,
  `CREATE INDEX IF NOT EXISTS idx_recent_used_at ON recent_items (used_at)`,
];

const ALL_TABLES = [
  'memory_items',
  'time_patterns',
  'sequences',
  'recent_items',
  'knowledge_items',
  'knowledge_evidence',
  'extraction_queue',
  'pending_updates',
  'meta',
];

function toIso(date: Date): string {
  return date.toISOString();
}

function rowsToArray<T>(result: any): T[] {
  const out: T[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    out.push(result.rows.item(i));
  }
  return out;
}

export class PersonalMemoryDb {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    try {
      // If already initialized, close first to avoid stale references
      if (this.db) {
        try {
          await this.db.close();
        } catch (e) {
          console.warn('[PersonalMemory] Error closing previous DB connection:', e);
        }
        this.db = null;
      }

      this.db = await SQLite.openDatabase({
        name: DATABASE_NAME,
        version: DATABASE_VERSION,
        displayName: DATABASE_DISPLAYNAME,
        size: DATABASE_SIZE,
        location: 'default',
      });

      await this.createTables();
      await this.db.executeSql(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } catch (error) {
      console.error('[PersonalMemory] init() failed:', error);
      this.db = null;
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('Personal memory database not initialized');
    }
    return this.db;
  }

  private async createTables(): Promise<void> {
    const db = this.getDb();
    for (const statement of TABLE_STATEMENTS) {
      await db.executeSql(statement);
    }
  }

  // ── Communication Memory ──────────────────────────────────────────────────

  /**
   * Upsert one memory item; bumps use_count and last_used on existing rows.
   * (Manual UPDATE-then-INSERT: older Android SQLite lacks ON CONFLICT DO UPDATE.)
   */
  async upsertMemoryItem(
    kind: MemoryItemKind,
    text: string,
    occurredAt: Date,
  ): Promise<number> {
    const db = this.getDb();
    const normalized = normalizeMemoryText(text);
    if (!normalized) {
      return -1;
    }
    const iso = toIso(occurredAt);
    const [update] = await db.executeSql(
      `UPDATE memory_items SET use_count = use_count + 1, last_used = ?
       WHERE kind = ? AND normalized = ?`,
      [iso, kind, normalized],
    );
    if (update.rowsAffected === 0) {
      const [insert] = await db.executeSql(
        `INSERT INTO memory_items (kind, text, normalized, first_used, last_used, use_count)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [kind, text.trim(), normalized, iso, iso],
      );
      return insert.insertId;
    }
    const [row] = await db.executeSql(
      `SELECT id FROM memory_items WHERE kind = ? AND normalized = ?`,
      [kind, normalized],
    );
    return row.rows.length > 0 ? row.rows.item(0).id : -1;
  }

  async bumpTimePattern(itemId: number, bucket: TimeBucket): Promise<void> {
    const db = this.getDb();
    const [update] = await db.executeSql(
      `UPDATE time_patterns SET use_count = use_count + 1
       WHERE item_id = ? AND bucket = ?`,
      [itemId, bucket],
    );
    if (update.rowsAffected === 0) {
      await db.executeSql(
        `INSERT INTO time_patterns (item_id, bucket, use_count) VALUES (?, ?, 1)`,
        [itemId, bucket],
      );
    }
  }

  async upsertSequence(
    prev: string,
    next: string,
    occurredAt: Date,
  ): Promise<void> {
    const db = this.getDb();
    const prevNorm = normalizeMemoryText(prev);
    const nextNorm = normalizeMemoryText(next);
    if (!prevNorm || !nextNorm) {
      return;
    }
    const iso = toIso(occurredAt);
    const [update] = await db.executeSql(
      `UPDATE sequences SET use_count = use_count + 1, last_used = ?
       WHERE prev_normalized = ? AND next_normalized = ?`,
      [iso, prevNorm, nextNorm],
    );
    if (update.rowsAffected === 0) {
      await db.executeSql(
        `INSERT INTO sequences (prev_normalized, next_normalized, use_count, last_used)
         VALUES (?, ?, 1, ?)`,
        [prevNorm, nextNorm, iso],
      );
    }
  }

  async insertRecentItem(
    kind: MemoryItemKind,
    text: string,
    usedAt: Date,
    source: 'Home' | 'Convo',
  ): Promise<void> {
    const db = this.getDb();
    await db.executeSql(
      `INSERT INTO recent_items (kind, text, used_at, source) VALUES (?, ?, ?, ?)`,
      [kind, text.trim(), toIso(usedAt), source],
    );
    await db.executeSql(
      `DELETE FROM recent_items WHERE id NOT IN (
         SELECT id FROM recent_items ORDER BY id DESC LIMIT ?
       )`,
      [RECENT_ITEMS_CAP],
    );
  }

  async getMemoryItems(opts?: {kind?: MemoryItemKind}): Promise<MemoryItemRow[]> {
    const db = this.getDb();
    const [result] = opts?.kind
      ? await db.executeSql(
          `SELECT * FROM memory_items WHERE kind = ? ORDER BY last_used DESC`,
          [opts.kind],
        )
      : await db.executeSql(`SELECT * FROM memory_items ORDER BY last_used DESC`);
    return rowsToArray<MemoryItemRow>(result);
  }

  async getMemoryItemsByNormalized(
    normalizedTexts: string[],
  ): Promise<MemoryItemRow[]> {
    if (normalizedTexts.length === 0) {
      return [];
    }
    const db = this.getDb();
    const placeholders = normalizedTexts.map(() => '?').join(',');
    const [result] = await db.executeSql(
      `SELECT * FROM memory_items WHERE normalized IN (${placeholders})`,
      normalizedTexts,
    );
    return rowsToArray<MemoryItemRow>(result);
  }

  async getTimePatterns(itemIds: number[]): Promise<TimePatternRow[]> {
    if (itemIds.length === 0) {
      return [];
    }
    const db = this.getDb();
    const placeholders = itemIds.map(() => '?').join(',');
    const [result] = await db.executeSql(
      `SELECT * FROM time_patterns WHERE item_id IN (${placeholders})`,
      itemIds,
    );
    return rowsToArray<TimePatternRow>(result);
  }

  async getSequencesFrom(
    prevNormalized: string,
    limit: number,
  ): Promise<SequenceRow[]> {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT * FROM sequences WHERE prev_normalized = ?
       ORDER BY use_count DESC, last_used DESC LIMIT ?`,
      [prevNormalized, limit],
    );
    return rowsToArray<SequenceRow>(result);
  }

  async getTopSequences(limit: number): Promise<SequenceRow[]> {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT * FROM sequences ORDER BY use_count DESC, last_used DESC LIMIT ?`,
      [limit],
    );
    return rowsToArray<SequenceRow>(result);
  }

  async getRecentItems(limit: number): Promise<RecentItemRow[]> {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT * FROM recent_items ORDER BY id DESC LIMIT ?`,
      [limit],
    );
    return rowsToArray<RecentItemRow>(result);
  }

  async setPinned(itemId: number, pinned: boolean): Promise<void> {
    const db = this.getDb();
    await db.executeSql(`UPDATE memory_items SET pinned = ? WHERE id = ?`, [
      pinned ? 1 : 0,
      itemId,
    ]);
  }

  async deleteMemoryItem(itemId: number): Promise<void> {
    const db = this.getDb();
    await db.executeSql(`DELETE FROM time_patterns WHERE item_id = ?`, [itemId]);
    await db.executeSql(`DELETE FROM memory_items WHERE id = ?`, [itemId]);
  }

  async clearRecentItems(): Promise<void> {
    const db = this.getDb();
    await db.executeSql(`DELETE FROM recent_items`);
  }

  // ── Personal Knowledge ────────────────────────────────────────────────────

  async insertKnowledgeItem(item: NewKnowledgeItem): Promise<number> {
    const db = this.getDb();
    const now = toIso(item.firstLearned ?? new Date());
    const [result] = await db.executeSql(
      `INSERT INTO knowledge_items
        (category, subject, value, statement, confidence, source, status,
         confirmed, ai_context_enabled, pepes_item_id, first_learned, last_reinforced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.category,
        item.subject,
        item.value ?? null,
        item.statement,
        item.confidence,
        item.source,
        item.status ?? 'active',
        item.confirmed ? 1 : 0,
        item.aiContextEnabled === false ? 0 : 1,
        item.pepesItemId ?? null,
        now,
        now,
      ],
    );
    return result.insertId;
  }

  async updateKnowledgeItem(
    id: number,
    patch: Partial<
      Pick<
        KnowledgeItemRow,
        | 'subject'
        | 'value'
        | 'statement'
        | 'confidence'
        | 'status'
        | 'confirmed'
        | 'ai_context_enabled'
        | 'pepes_item_id'
        | 'replaced_by'
        | 'last_reinforced'
        | 'usage_checked_at'
        | 'review_flag'
        | 'review_dismissed_until'
      >
    >,
  ): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return;
    }
    const db = this.getDb();
    const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
    await db.executeSql(
      `UPDATE knowledge_items SET ${setClause} WHERE id = ?`,
      [...entries.map(([, v]) => v), id],
    );
  }

  async getKnowledgeItems(filter?: {
    status?: KnowledgeStatus[];
    category?: string;
    pepesItemId?: string;
    reviewFlag?: string;
  }): Promise<KnowledgeItemRow[]> {
    const db = this.getDb();
    const where: string[] = [];
    const params: any[] = [];
    if (filter?.status && filter.status.length > 0) {
      where.push(`status IN (${filter.status.map(() => '?').join(',')})`);
      params.push(...filter.status);
    }
    if (filter?.category) {
      where.push('category = ?');
      params.push(filter.category);
    }
    if (filter?.pepesItemId) {
      where.push('pepes_item_id = ?');
      params.push(filter.pepesItemId);
    }
    if (filter?.reviewFlag) {
      where.push('review_flag = ?');
      params.push(filter.reviewFlag);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [result] = await db.executeSql(
      `SELECT * FROM knowledge_items ${whereSql} ORDER BY last_reinforced DESC`,
      params,
    );
    return rowsToArray<KnowledgeItemRow>(result);
  }

  async getKnowledgeItemById(id: number): Promise<KnowledgeItemRow | null> {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT * FROM knowledge_items WHERE id = ?`,
      [id],
    );
    return result.rows.length > 0 ? result.rows.item(0) : null;
  }

  async insertEvidence(
    knowledgeId: number,
    kind: 'create' | 'reinforce' | 'contradict' | 'caregiver',
    communicationText: string | null,
    occurredAt: Date,
  ): Promise<void> {
    const db = this.getDb();
    await db.executeSql(
      `INSERT INTO knowledge_evidence (knowledge_id, kind, communication_text, occurred_at)
       VALUES (?, ?, ?, ?)`,
      [knowledgeId, kind, communicationText, toIso(occurredAt)],
    );
  }

  async getEvidence(knowledgeId: number): Promise<EvidenceRow[]> {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT * FROM knowledge_evidence WHERE knowledge_id = ? ORDER BY occurred_at DESC`,
      [knowledgeId],
    );
    return rowsToArray<EvidenceRow>(result);
  }

  async getReinforceEvidenceStats(): Promise<
    Array<{knowledge_id: number; reinforce_days: number}>
  > {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT knowledge_id, COUNT(DISTINCT date(occurred_at)) AS reinforce_days
       FROM knowledge_evidence WHERE kind = 'reinforce'
       GROUP BY knowledge_id`,
    );
    return rowsToArray(result);
  }

  async getContradictedKnowledgeIds(): Promise<number[]> {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT DISTINCT knowledge_id FROM knowledge_evidence WHERE kind = 'contradict'`,
    );
    return rowsToArray<{knowledge_id: number}>(result).map(r => r.knowledge_id);
  }

  // ── Extraction queue ──────────────────────────────────────────────────────

  async enqueueExtraction(
    eventId: string,
    text: string,
    source: string,
    occurredAt: Date,
  ): Promise<void> {
    const db = this.getDb();
    await db.executeSql(
      `INSERT OR IGNORE INTO extraction_queue (event_id, text, source, occurred_at)
       VALUES (?, ?, ?, ?)`,
      [eventId, text, source, toIso(occurredAt)],
    );
    await db.executeSql(
      `DELETE FROM extraction_queue WHERE id NOT IN (
         SELECT id FROM extraction_queue ORDER BY id DESC LIMIT ?
       )`,
      [EXTRACTION_QUEUE_CAP],
    );
  }

  async getExtractionBatch(limit: number): Promise<ExtractionRow[]> {
    const db = this.getDb();
    const [result] = await db.executeSql(
      `SELECT * FROM extraction_queue ORDER BY id ASC LIMIT ?`,
      [limit],
    );
    return rowsToArray<ExtractionRow>(result);
  }

  async bumpExtractionAttempts(ids: number[], maxAttempts: number): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const db = this.getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.executeSql(
      `UPDATE extraction_queue SET attempts = attempts + 1 WHERE id IN (${placeholders})`,
      ids,
    );
    await db.executeSql(
      `DELETE FROM extraction_queue WHERE attempts >= ?`,
      [maxAttempts],
    );
  }

  async clearExtractionQueue(): Promise<void> {
    const db = this.getDb();
    await db.executeSql(`DELETE FROM extraction_queue`);
  }

  async deleteExtractionRows(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }
    const db = this.getDb();
    const placeholders = eventIds.map(() => '?').join(',');
    await db.executeSql(
      `DELETE FROM extraction_queue WHERE event_id IN (${placeholders})`,
      eventIds,
    );
  }

  // ── Meta / lifecycle ──────────────────────────────────────────────────────

  async getMeta(key: string): Promise<string | null> {
    const db = this.getDb();
    const [result] = await db.executeSql(`SELECT value FROM meta WHERE key = ?`, [
      key,
    ]);
    return result.rows.length > 0 ? result.rows.item(0).value : null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    const db = this.getDb();
    const [update] = await db.executeSql(
      `UPDATE meta SET value = ? WHERE key = ?`,
      [value, key],
    );
    if (update.rowsAffected === 0) {
      await db.executeSql(`INSERT INTO meta (key, value) VALUES (?, ?)`, [
        key,
        value,
      ]);
    }
  }

  /** Drops and recreates every table (Reset Personal Memory). */
  async resetAll(): Promise<void> {
    const db = this.getDb();
    for (const table of ALL_TABLES) {
      await db.executeSql(`DROP TABLE IF EXISTS ${table}`);
    }
    await this.createTables();
  }

  async counts(): Promise<{
    memoryItems: number;
    nonIntakeKnowledge: number;
    suggested: number;
    flagged: number;
  }> {
    const db = this.getDb();
    const [items] = await db.executeSql(
      `SELECT COUNT(*) AS n FROM memory_items`,
    );
    const [nonIntake] = await db.executeSql(
      `SELECT COUNT(*) AS n FROM knowledge_items WHERE source != 'intake'`,
    );
    const [suggested] = await db.executeSql(
      `SELECT COUNT(*) AS n FROM knowledge_items WHERE status = 'suggested'`,
    );
    const [flagged] = await db.executeSql(
      `SELECT COUNT(*) AS n FROM knowledge_items
       WHERE review_flag IS NOT NULL
         AND status NOT IN ('inactive','rejected','replaced')
         AND (review_dismissed_until IS NULL OR review_dismissed_until < ?)`,
      [new Date().toISOString()],
    );
    return {
      memoryItems: items.rows.item(0).n,
      nonIntakeKnowledge: nonIntake.rows.item(0).n,
      suggested: suggested.rows.item(0).n,
      flagged: flagged.rows.item(0).n,
    };
  }
}

export const personalMemoryDb = new PersonalMemoryDb();
