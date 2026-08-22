import {
  VerbiAction,
  VerbiClientState,
  TurnState,
} from './verbiTypes';

function generateTurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// A partner utterance landing within this window of a word tap does not repaint
// the column: the child is mid-reach, and the next tap re-predicts with the new
// context anyway (the server always reads the latest utterances).
const TAP_QUIET_WINDOW_MS = 2000;

/**
 * Keep surviving suggestions in their current relative order and append
 * newcomers after them. buildVerbiGroups sections by category, so this keeps
 * every card the child has already seen in its slot within its group.
 *
 * Newcomers (cards not previously on screen) are ordered by Personal Memory
 * usage score when available, falling back to server order — surviving cards
 * never move (stability under the child's finger beats freshness).
 */
export function stableMergeSuggestions(
  oldSuggestions: VerbiClientState['suggestions'],
  newSuggestions: VerbiClientState['suggestions'],
): VerbiClientState['suggestions'] {
  const withMemoryOrder = [...newSuggestions].sort((a, b) => {
    const am = a.memoryScore ?? 0;
    const bm = b.memoryScore ?? 0;
    if (am !== bm) return bm - am;
    return 0; // stable sort keeps server rank order
  });
  if (oldSuggestions.length === 0) return withMemoryOrder;
  const oldIndex = new Map(oldSuggestions.map((s, i) => [s.id, i]));
  return withMemoryOrder.sort((a, b) => {
    const ai = oldIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = oldIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

export const initialVerbiState: VerbiClientState = {
  enabled: true,
  microphoneEnabled: true,
  permission: 'unknown',
  conversationId: undefined,
  contextVersion: 0,
  activeTurnId: undefined,
  lastWordAddedAt: 0,
  turnState: 'IDLE_EMPTY',
  latestRequestId: undefined,
  predictionStatus: 'idle',
  predictionSequence: 0,
  suggestions: [],
  groups: [],
  fallbackUsed: false,
  folderStack: [],
  listeningState: 'off',
  lastError: undefined,
  isOnline: true,
};

export function verbiReducer(
  state: VerbiClientState,
  action: VerbiAction,
): VerbiClientState {
  switch (action.type) {
    // ─── Word Add ─────────────────────────────────────────────────────────────
    case 'WORD_ADDED': {
      const isNewTurn =
        action.payload.isFirstWord ||
        state.turnState === 'IDLE_EMPTY' ||
        state.turnState === 'WAITING_FOR_PARTNER' ||
        state.turnState === 'READY_FOR_NEXT_TURN';

      const newTurnId = isNewTurn
        ? generateTurnId()
        : state.activeTurnId;

      return {
        ...state,
        turnState: 'BUILDING',
        activeTurnId: newTurnId,
        lastWordAddedAt: Date.now(),
        predictionStatus: 'loading',
        predictionSequence: state.predictionSequence + 1,
        // Keep the previous suggestions painted even on a new turn. Clearing
        // here blanks the column for the whole debounce+network window on the
        // first word, which reads as a flicker; the loading overlay already
        // dims them and blocks taps until the fresh prediction replaces them.
        fallbackUsed: false,
        folderStack: [],
        lastError: undefined,
      };
    }

    // ─── Word Remove ──────────────────────────────────────────────────────────
    case 'WORD_REMOVED': {
      // Stay in BUILDING if any words remain (caller is responsible for
      // transitioning to SENTENCE_CLEARED when bar is empty)
      return {
        ...state,
        predictionStatus: 'loading',
        predictionSequence: state.predictionSequence + 1,
        folderStack: [],
        lastError: undefined,
      };
    }

    // ─── Sentence Cleared (bar emptied or Reset pressed) ──────────────────────
    case 'SENTENCE_CLEARED': {
      return {
        ...state,
        turnState: 'IDLE_EMPTY',
        activeTurnId: undefined,
        predictionStatus: 'loading',
        predictionSequence: state.predictionSequence + 1,
        suggestions: [],
        groups: [],
        fallbackUsed: false,
        folderStack: [],
        lastError: undefined,
      };
    }

    // ─── Sentence Spoken (Speak button pressed) ───────────────────────────────
    case 'SENTENCE_SPOKEN': {
      return {
        ...state,
        turnState: 'WAITING_FOR_PARTNER',
        predictionStatus: 'loading',
        predictionSequence: state.predictionSequence + 1,
        folderStack: [],
      };
    }

    // ─── Prediction Requested ─────────────────────────────────────────────────
    case 'PREDICTION_REQUESTED': {
      return {
        ...state,
        latestRequestId: action.payload.requestId,
        predictionStatus: 'loading',
      };
    }

    // ─── Prediction Succeeded ─────────────────────────────────────────────────
    case 'PREDICTION_SUCCEEDED': {
      // Out-of-order guard: discard if this isn't the latest request
      if (action.payload.requestId !== state.latestRequestId) {
        return state;
      }
      return {
        ...state,
        predictionStatus: 'success',
        suggestions: stableMergeSuggestions(
          state.suggestions,
          action.payload.suggestions,
        ),
        groups: action.payload.groups,
        fallbackUsed: action.payload.fallbackUsed,
        lastError: undefined,
      };
    }

    // ─── Prediction Failed ────────────────────────────────────────────────────
    case 'PREDICTION_FAILED': {
      // Out-of-order guard
      if (action.payload.requestId !== state.latestRequestId) {
        return state;
      }
      return {
        ...state,
        predictionStatus: 'error',
        lastError: {
          code: action.payload.code ?? 'PREDICTION_ERROR',
          recoverable: true,
        },
      };
    }

    // ─── Folder Opened ────────────────────────────────────────────────────────
    case 'FOLDER_OPENED': {
      return {
        ...state,
        folderStack: [...state.folderStack, action.payload],
        predictionStatus: 'loading',
        predictionSequence: state.predictionSequence + 1,
        suggestions: [],
        groups: [],
      };
    }

    // ─── Folder Back ──────────────────────────────────────────────────────────
    case 'FOLDER_BACK': {
      const newStack = state.folderStack.slice(0, -1);
      return {
        ...state,
        folderStack: newStack,
        predictionStatus: 'loading',
        predictionSequence: state.predictionSequence + 1,
        suggestions: [],
        groups: [],
      };
    }

    // ─── Partner Transcript Finalized ─────────────────────────────────────────
    case 'PARTNER_TRANSCRIPT_FINALIZED': {
      const newContextVersion = action.payload.contextVersion;
      const newTurnState: TurnState =
        state.turnState === 'WAITING_FOR_PARTNER'
          ? 'READY_FOR_NEXT_TURN'
          : state.turnState;

      // Mid-reach guard: if the child just tapped a word, take the context but
      // don't repaint — the tap they're about to make re-predicts anyway.
      const childMidReach =
        state.turnState === 'BUILDING' &&
        Date.now() - state.lastWordAddedAt < TAP_QUIET_WINDOW_MS;

      return {
        ...state,
        contextVersion: newContextVersion,
        turnState: newTurnState,
        ...(childMidReach
          ? {}
          : {
              predictionStatus: 'loading' as const,
              predictionSequence: state.predictionSequence + 1,
            }),
      };
    }

    // ─── Context Version Updated (own utterance recorded) ────────────────────
    case 'CONTEXT_VERSION_UPDATED': {
      return {
        ...state,
        contextVersion: action.payload.contextVersion,
      };
    }

    // ─── Listening State Changed ──────────────────────────────────────────────
    case 'LISTENING_STATE_CHANGED': {
      return {
        ...state,
        listeningState: action.payload,
      };
    }

    // ─── Conversation Created ─────────────────────────────────────────────────
    case 'CONVERSATION_CREATED': {
      return {
        ...state,
        conversationId: action.payload.conversationId,
        predictionStatus: 'loading',
        predictionSequence: state.predictionSequence + 1,
      };
    }

    // ─── Settings Toggles ─────────────────────────────────────────────────────
    case 'VERBI_TOGGLED': {
      return {
        ...state,
        enabled: action.payload,
        // Reset to idle if turned off
        ...(action.payload === false
          ? {
              turnState: 'IDLE_EMPTY' as TurnState,
              predictionStatus: 'idle' as const,
              suggestions: [],
              groups: [],
              listeningState: 'off' as const,
              folderStack: [],
              activeTurnId: undefined,
            }
          : {}),
      };
    }

    case 'MIC_TOGGLED': {
      return {
        ...state,
        microphoneEnabled: action.payload,
        listeningState: action.payload ? 'ready' : 'off',
      };
    }

    // ─── Network / Permission ─────────────────────────────────────────────────
    case 'ONLINE_STATE_CHANGED': {
      return {
        ...state,
        isOnline: action.payload,
        // If going offline while loading, reset prediction status
        predictionStatus:
          !action.payload && state.predictionStatus === 'loading'
            ? 'offline'
            : state.predictionStatus,
      };
    }

    case 'PERMISSION_CHANGED': {
      return {
        ...state,
        permission: action.payload,
        listeningState:
          action.payload === 'granted'
            ? 'ready'
            : 'off',
      };
    }

    default:
      return state;
  }
}
