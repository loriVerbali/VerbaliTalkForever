// ─── Verbi Feature Types ────────────────────────────────────────────────────

export type TurnState =
  | 'IDLE_EMPTY'
  | 'BUILDING'
  | 'WAITING_FOR_PARTNER'
  | 'READY_FOR_NEXT_TURN';

export type PredictionMode = 'folder' | 'starter' | 'continuation';

/**
 * Part-of-speech tag the engine returns on every suggestion. Treat it as an
 * open vocabulary: it identifies the word's POS, not its display colour — the
 * colour comes from `VerbiSuggestion.color` / `VerbiGroupSpec.color`.
 */
export type VerbiSuggestionCategory =
  | 'pronoun'
  | 'verb'
  | 'adjective'
  | 'noun'
  | 'social'
  | 'preposition'
  | 'question'
  | (string & {});

export type VerbiSuggestion = {
  id: string;
  type: 'word' | 'folder';
  label: string;
  spokenText: string;
  imageUrl?: string;
  localImagePath?: string;
  icon?: {
    kind: 'image' | 'emoji' | 'existingAsset' | 'remoteImage' | 'none';
    value?: string;
  };
  category: VerbiSuggestionCategory;
  /** Engine-supplied hex (`#RRGGBB`). Source of truth for how this card paints. */
  color?: string;
  /** Id of the `VerbiGroupSpec` this suggestion belongs to, when the engine groups. */
  groupId?: string;
  rank: number;
  source: 'ai' | 'fallback';
};

/**
 * A display group described by the engine: its own label, colour and ordering,
 * so the client never has to derive any of those from category strings.
 *
 * Membership resolves in this order: explicit `suggestionIds`, then suggestions
 * carrying a matching `groupId`, then suggestions whose `category` matches.
 */
export type VerbiGroupSpec = {
  id?: string;
  /** Human-facing heading, already localised by the engine. */
  label?: string;
  category?: VerbiSuggestionCategory;
  /** Hex (`#RRGGBB`) for the group's border/fill/header and its cards. */
  color?: string;
  /** Ids of the member suggestions, in display order. */
  suggestionIds?: string[];
};

export type VerbiFolder = {
  id: string;
  label: string;
  category: string;
};

export type ListeningState =
  | 'off'
  | 'ready'
  | 'listening'
  | 'paused_for_tts'
  | 'processing'
  | 'error';

export type MicPermission = 'unknown' | 'granted' | 'denied' | 'blocked';

export type PredictionStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'offline';

export type VerbiClientState = {
  enabled: boolean;
  microphoneEnabled: boolean;
  permission: MicPermission;

  conversationId?: string;
  contextVersion: number;
  activeTurnId?: string;
  turnState: TurnState;
  /** Epoch ms of the last word tap; gates partner-speech re-predictions. */
  lastWordAddedAt: number;

  latestRequestId?: string;
  predictionStatus: PredictionStatus;
  predictionSequence: number;
  suggestions: VerbiSuggestion[];
  /** Engine-described display groups. Empty ⇒ group locally by category. */
  groups: VerbiGroupSpec[];
  fallbackUsed: boolean;

  folderStack: VerbiFolder[];

  listeningState: ListeningState;

  lastError?: {
    code: string;
    recoverable: boolean;
  };

  isOnline: boolean;
};

// ─── State Machine Actions ───────────────────────────────────────────────────

export type VerbiAction =
  | { type: 'WORD_ADDED'; payload: { isFirstWord: boolean } }
  | { type: 'WORD_REMOVED' }
  | { type: 'SENTENCE_CLEARED' }
  | { type: 'SENTENCE_SPOKEN' }
  | {
      type: 'PREDICTION_REQUESTED';
      payload: { requestId: string; mode: PredictionMode };
    }
  | {
      type: 'PREDICTION_SUCCEEDED';
      payload: {
        requestId: string;
        suggestions: VerbiSuggestion[];
        groups: VerbiGroupSpec[];
        fallbackUsed: boolean;
      };
    }
  | {
      type: 'SUGGESTION_IMAGE_CACHED';
      payload: { suggestionId: string; localUri: string };
    }
  | { type: 'PREDICTION_FAILED'; payload: { requestId: string; code?: string } }
  | { type: 'FOLDER_OPENED'; payload: VerbiFolder }
  | { type: 'FOLDER_BACK' }
  | { type: 'PARTNER_TRANSCRIPT_FINALIZED'; payload: { contextVersion: number } }
  | { type: 'CONTEXT_VERSION_UPDATED'; payload: { contextVersion: number } }
  | { type: 'LISTENING_STATE_CHANGED'; payload: ListeningState }
  | { type: 'CONVERSATION_CREATED'; payload: { conversationId: string } }
  | { type: 'VERBI_TOGGLED'; payload: boolean }
  | { type: 'MIC_TOGGLED'; payload: boolean }
  | { type: 'ONLINE_STATE_CHANGED'; payload: boolean }
  | { type: 'PERMISSION_CHANGED'; payload: MicPermission };

// ─── API Contracts ───────────────────────────────────────────────────────────

export type PredictionRequestItem = {
  id?: string;
  label: string;
  spokenText?: string;
};

export type PredictionRequest = {
  requestId: string;
  conversationId?: string;
  turnId: string;
  mode: PredictionMode;
  sentence: {
    text: string;
    items: PredictionRequestItem[];
    isStale: boolean;
  };
  folder?: {
    id?: string;
    label: string;
    category?: string;
  } | null;
  board: {
    boardId: string;
    locale: string;
  };
  contextCues?: {
    timeOfDay?: string;
    date?: string;
    pepes?: any;
  };
  limit?: number;
};

/** Selectable values for how many suggestions Verbi returns per request. */
export const VERBI_SUGGESTION_LIMITS = [10, 15, 20] as const;

export const DEFAULT_VERBI_SUGGESTION_LIMIT = 10;

/** Coerces a stored preference string into one of the allowed limits. */
export function parseVerbiSuggestionLimit(value?: string | null): number {
  const parsed = Number(value);
  return (VERBI_SUGGESTION_LIMITS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_VERBI_SUGGESTION_LIMIT;
}

export type PredictionResponse = {
  requestId: string;
  turnId: string;
  contextVersionUsed: number;
  mode: PredictionMode;
  suggestions: VerbiSuggestion[];
  /** Optional display grouping; absent on older engine builds. */
  groups?: VerbiGroupSpec[];
  generatedAt: string;
  promptVersion?: string;
  modelVersion?: string;
  fallbackUsed: boolean;
};

export type ConversationResponse = {
  conversationId: string;
  contextVersion: number;
  expiresAt?: string;
};

export type UtteranceBody = {
  clientEventId: string;
  turnId: string;
  speaker: 'user' | 'partner';
  text: string;
  status: 'final';
  finalizedAt: string;
};

export type UtteranceResponse = {
  utteranceId: string;
  contextVersion: number;
  enrichmentStatus: 'queued' | 'skipped';
};

// ─── Analytics Events ────────────────────────────────────────────────────────

export const VERBI_EVENTS = {
  ENABLED_CHANGED: 'verbi_enabled_changed',
  MICROPHONE_CHANGED: 'verbi_microphone_changed',
  PREDICTION_REQUESTED: 'verbi_prediction_requested',
  PREDICTION_SUCCEEDED: 'verbi_prediction_succeeded',
  PREDICTION_FAILED: 'verbi_prediction_failed',
  SUGGESTION_SELECTED: 'verbi_suggestion_selected',
  FOLDER_OPENED: 'verbi_folder_opened',
  FOLDER_BACK: 'verbi_folder_back',
  LISTENING_STARTED: 'verbi_listening_started',
  LISTENING_STOPPED: 'verbi_listening_stopped',
  TRANSCRIPT_FINALIZED: 'verbi_transcript_finalized',
  FALLBACK_USED: 'verbi_fallback_used',
} as const;

// ─── POS Category Labels ─────────────────────────────────────────────────────

/**
 * Section headings for the column. The column groups by part of speech, so
 * these are the only headings it ever shows — the engine's own group labels
 * (which are topical) are deliberately not used. Keys are the canonical POS
 * values from `normalizePos`; never add topic entries here.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  pronoun: 'Pronouns',
  verb: 'Verbs',
  adjective: 'Adjectives',
  adverb: 'Adverbs',
  noun: 'Nouns',
  social: 'Social',
  preposition: 'Prepositions',
  question: 'Questions',
  conjunction: 'Conjunctions',
  article: 'Articles',
  other: 'Other',
};
