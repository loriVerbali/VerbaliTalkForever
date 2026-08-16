// Shared Personal Memory types. Keep this file free of react-native imports so
// pure-logic modules and their tests can use it without mocks.

export type MemoryItemKind = 'word' | 'sentence' | 'answer';

export type KnowledgeCategory =
  | 'person'
  | 'relationship'
  | 'place'
  | 'food'
  | 'activity'
  | 'object'
  | 'like'
  | 'dislike'
  | 'routine'
  | 'fact';

export type KnowledgeSource = 'intake' | 'ai' | 'caregiver';

export type KnowledgeStatus =
  | 'active'
  | 'suggested'
  | 'possibly_outdated'
  | 'replaced'
  | 'inactive'
  | 'rejected';

export type ReviewFlag = 'possibly_outdated' | 'promotion_offer';

export type MemoryUpdateAction = 'create' | 'reinforce' | 'update' | 'contradict';

export interface MemoryItemRow {
  id: number;
  kind: MemoryItemKind;
  text: string;
  normalized: string;
  first_used: string;
  last_used: string;
  use_count: number;
  pinned: number;
}

export interface TimePatternRow {
  item_id: number;
  bucket: string;
  use_count: number;
}

export interface SequenceRow {
  prev_normalized: string;
  next_normalized: string;
  use_count: number;
  last_used: string;
}

export interface RecentItemRow {
  id: number;
  kind: string;
  text: string;
  used_at: string;
  source: string;
}

export interface KnowledgeItemRow {
  id: number;
  category: KnowledgeCategory;
  subject: string;
  value: string | null;
  statement: string;
  confidence: number;
  source: KnowledgeSource;
  status: KnowledgeStatus;
  confirmed: number;
  ai_context_enabled: number;
  pepes_item_id: string | null;
  replaced_by: number | null;
  first_learned: string;
  last_reinforced: string;
  usage_checked_at: string | null;
  review_flag: ReviewFlag | null;
  review_dismissed_until: string | null;
}

export interface EvidenceRow {
  id: number;
  knowledge_id: number;
  kind: 'create' | 'reinforce' | 'contradict' | 'caregiver';
  communication_text: string | null;
  occurred_at: string;
}

export interface ExtractionRow {
  id: number;
  event_id: string;
  text: string;
  source: string;
  occurred_at: string;
  attempts: number;
}

export interface CompletedCommunicationEvent {
  eventId: string;
  kind: MemoryItemKind;
  text: string;
  words: string[];
  source: 'Home' | 'Convo';
  occurredAt: Date;
  question?: string;
}

/** AI-proposed knowledge update returned by POST /api/memory/extract. */
export interface MemoryUpdate {
  eventId: string;
  action: MemoryUpdateAction;
  category: KnowledgeCategory;
  subject: string;
  value?: string | null;
  statement: string;
  confidence: number;
  existingFactId?: number | null;
  needsCaregiverReview?: boolean;
}

/** Concise context block injected into Q&A and Verbi requests (PRD §9.1). */
export interface MemoryContext {
  communication?: {
    recentWords?: string[];
    frequentWords?: string[];
    commonSequences?: string[];
    timeOfDay?: string;
  };
  personal?: {
    facts: string[];
  };
}

export function normalizeMemoryText(text: string): string {
  return text.trim().toLowerCase();
}
