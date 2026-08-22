import { useReducer, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Node } from '../../../types/sentenceBuilder';
import { useAppSettings } from '../../../utils/persistance';
import { verbiApi } from '../services/verbiApi';
import { ensureVerbiMicPermission } from '../services/verbiMicPermission';
import {
  verbiReducer,
  initialVerbiState,
} from '../state/verbiReducer';
import { generateEventId } from '../utils/generateRequestId';
import {
  VerbiClientState,
  VerbiSuggestion,
  VerbiFolder,
  VERBI_EVENTS,
} from '../state/verbiTypes';
import { useVerbiPrediction } from './useVerbiPrediction';
import { useVerbiListening } from './useVerbiListening';
import mixpanel from '../../../utils/mixpanelInstance';

interface UseVerbiControllerInput {
  sentenceTokenIds: string[];
  nodes: Node[];
  boardId: string;
  locale: string;
  /**
   * Canonical word-add function from the parent grid.
   * Called when a Verbi word suggestion is selected.
   * Signature must match SentenceBuilderGrid's internal add path.
   */
  onAddVerbiWord: (nodeLabel: string, nodeSpokenText?: string) => void;
}

interface UseVerbiControllerReturn {
  verbiState: VerbiClientState;
  onWordAdded: (isFirstWord: boolean) => void;
  onWordRemoved: (isEmpty: boolean) => void;
  onSentenceCleared: () => void;
  /** Pass the spoken text where available so it is recorded as the child's turn. */
  onSentenceSpoken: (spokenText?: string) => void;
  onSuggestionSelected: (suggestion: VerbiSuggestion) => void;
  onFolderOpened: (folder: VerbiFolder) => void;
  onFolderBack: () => void;
}

export function useVerbiController({
  sentenceTokenIds,
  nodes,
  boardId,
  locale,
  onAddVerbiWord,
}: UseVerbiControllerInput): UseVerbiControllerReturn {
  const { preferences, setItem } = useAppSettings();
  const [state, dispatch] = useReducer(verbiReducer, initialVerbiState);
  const conversationCreatedRef = useRef(false);
  const permissionCheckedRef = useRef(false);

  // ─── Sync Settings ────────────────────────────────────────────────────────
  useEffect(() => {
    const enabled = preferences.verbiEnabled !== '0';
    const micEnabled = preferences.verbiMicrophoneEnabled !== '0';

    dispatch({ type: 'VERBI_TOGGLED', payload: enabled });
    dispatch({ type: 'MIC_TOGGLED', payload: micEnabled });
  }, [preferences.verbiEnabled, preferences.verbiMicrophoneEnabled]);

  // ─── Microphone Permission ────────────────────────────────────────────────
  // Listening stays off until the permission is known, so resolve it as soon as
  // Verbi and its microphone are both enabled.
  useEffect(() => {
    if (!state.enabled || !state.microphoneEnabled) return;
    if (state.permission !== 'unknown') return;
    if (permissionCheckedRef.current) return;

    permissionCheckedRef.current = true;
    let cancelled = false;

    ensureVerbiMicPermission().then(permission => {
      if (cancelled) return;
      dispatch({ type: 'PERMISSION_CHANGED', payload: permission });
    });

    return () => {
      cancelled = true;
    };
  }, [state.enabled, state.microphoneEnabled, state.permission]);

  // ─── Network Monitor ──────────────────────────────────────────────────────
  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(netState => {
      dispatch({
        type: 'ONLINE_STATE_CHANGED',
        payload: netState.isConnected ?? false,
      });
    });

    const unsubscribe = NetInfo.addEventListener(netState => {
      dispatch({
        type: 'ONLINE_STATE_CHANGED',
        payload: netState.isConnected ?? false,
      });
    });

    return () => unsubscribe();
  }, []);

  // ─── Conversation Lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    if (
      state.enabled &&
      state.isOnline &&
      !state.conversationId &&
      !conversationCreatedRef.current
    ) {
      conversationCreatedRef.current = true;
      verbiApi
        .createConversation(boardId, locale)
        .then(res => {
          dispatch({
            type: 'CONVERSATION_CREATED',
            payload: { conversationId: res.conversationId },
          });
        })
        .catch(err => {
          console.warn('[VerbiController] createConversation failed:', err);
          conversationCreatedRef.current = false;
        });
    }
  }, [state.enabled, state.isOnline, state.conversationId, boardId, locale]);

  // ─── Prediction Hook ──────────────────────────────────────────────────────
  const { requestPrediction } = useVerbiPrediction({
    state,
    dispatch,
    sentenceTokenIds,
    nodes,
    boardId,
    locale,
  });

  // ─── Listening Hook (Phase 2) ─────────────────────────────────────────────
  useVerbiListening({ state, dispatch });

  // ─── Word Added ───────────────────────────────────────────────────────────
  const onWordAdded = useCallback(
    (isFirstWord: boolean) => {
      dispatch({ type: 'WORD_ADDED', payload: { isFirstWord } });
      // Prediction is triggered by the state change effect below
    },
    [],
  );

  // ─── Word Removed ─────────────────────────────────────────────────────────
  const onWordRemoved = useCallback((isEmpty: boolean) => {
    if (isEmpty) {
      dispatch({ type: 'SENTENCE_CLEARED' });
    } else {
      dispatch({ type: 'WORD_REMOVED' });
    }
  }, []);

  // ─── Sentence Cleared ─────────────────────────────────────────────────────
  const onSentenceCleared = useCallback(() => {
    dispatch({ type: 'SENTENCE_CLEARED' });
  }, []);

  // ─── Sentence Spoken ──────────────────────────────────────────────────────
  // Records the child's side of the conversation. Without it the prediction
  // engine only ever sees partner speech — half a dialogue. Callers that fire
  // before the text is known (onSentenceWillSpeak) pass nothing; the call from
  // the played path carries the text and does the append.
  const onSentenceSpoken = useCallback(
    (spokenText?: string) => {
      dispatch({ type: 'SENTENCE_SPOKEN' });

      const text = spokenText?.trim();
      if (!text || !state.conversationId) return;

      verbiApi
        .appendUtterance(state.conversationId, {
          clientEventId: generateEventId(),
          turnId: state.activeTurnId ?? `turn_spoken_${Date.now().toString(36)}`,
          speaker: 'user',
          text,
          status: 'final',
          finalizedAt: new Date().toISOString(),
        })
        .then(result => {
          if (result?.contextVersion !== undefined) {
            dispatch({
              type: 'CONTEXT_VERSION_UPDATED',
              payload: { contextVersion: result.contextVersion },
            });
          }
        })
        .catch(err => {
          console.warn('[VerbiController] append user utterance failed:', err);
        });
    },
    [state.conversationId, state.activeTurnId],
  );

  // ─── Suggestion Selected ──────────────────────────────────────────────────
  const onSuggestionSelected = useCallback(
    (suggestion: VerbiSuggestion) => {
      if (suggestion.type === 'folder') {
        // Open folder — handled by onFolderOpened
        return;
      }

      mixpanel.track(VERBI_EVENTS.SUGGESTION_SELECTED, {
        rank: suggestion.rank,
        type: suggestion.type,
        category: suggestion.category,
        source: suggestion.source,
      });

      // Call canonical word-add path provided by parent
      onAddVerbiWord(suggestion.label, suggestion.spokenText);
    },
    [onAddVerbiWord],
  );

  // ─── Folder Opened ────────────────────────────────────────────────────────
  const onFolderOpened = useCallback((folder: VerbiFolder) => {
    mixpanel.track(VERBI_EVENTS.FOLDER_OPENED, { folderLabel: folder.label });
    dispatch({ type: 'FOLDER_OPENED', payload: folder });
  }, []);

  // ─── Folder Back ──────────────────────────────────────────────────────────
  const onFolderBack = useCallback(() => {
    mixpanel.track(VERBI_EVENTS.FOLDER_BACK);
    dispatch({ type: 'FOLDER_BACK' });
  }, []);

  // ─── Trigger Predictions on State Changes ────────────────────────────────
  useEffect(() => {
    if (
      state.predictionStatus === 'loading' &&
      state.enabled &&
      state.isOnline
    ) {
      requestPrediction(
        state.folderStack.length > 0
          ? state.folderStack[state.folderStack.length - 1]
          : null,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.predictionStatus,
    state.predictionSequence,
    state.enabled,
    state.isOnline,
    state.folderStack,
  ]);

  return {
    verbiState: state,
    onWordAdded,
    onWordRemoved,
    onSentenceCleared,
    onSentenceSpoken,
    onSuggestionSelected,
    onFolderOpened,
    onFolderBack,
  };
}
