import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { subscribeToSpeechEvents, startSpeechRecognition, stopSpeechRecognition } from '../../../utils/STTService';
import TTSService from '../../../utils/TTSService';
import WakeWordService from '../../../utils/wakewordService';
import {
  VerbiAction,
  VerbiClientState,
  UtteranceBody,
  VERBI_EVENTS,
} from '../state/verbiTypes';
import { verbiApi } from '../services/verbiApi';
import { generateEventId } from '../utils/generateRequestId';
import mixpanel from '../../../utils/mixpanelInstance';

const INACTIVITY_TIMEOUT_MS = 60_000; // 60 seconds
// Quiet gap after a finalized fragment before the partner's utterance is
// considered complete. The recognizer can emit several finals for one spoken
// sentence; coalescing them means one utterance row, one context bump and one
// re-prediction per partner turn instead of one per fragment.
const TRANSCRIPT_FLUSH_MS = 1_300;

interface UseVerbiListeningInput {
  state: VerbiClientState;
  dispatch: (action: VerbiAction) => void;
}

export function useVerbiListening({ state, dispatch }: UseVerbiListeningInput) {
  const isListeningRef = useRef(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const utteranceAbortRef = useRef<AbortController | null>(null);
  // Finalized fragments waiting to be coalesced into one utterance.
  const pendingFragmentsRef = useRef<string[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest flush closure, so timers armed under an older render still send
  // with current conversation/turn ids.
  const flushRef = useRef<() => void>(() => {});
  // Track TTS state separately to coordinate pause/resume
  const ttsSpeakingRef = useRef(false);
  // True while the mic is closed for TTS but the turn still wants it back.
  const pausedForTtsRef = useRef(false);
  // True while we hold the wake-word engine paused so STT can own the mic.
  const wakeWordPausedRef = useRef(false);

  // ─── Wake-word Coordination ──────────────────────────────────────────────
  // The wake-word detector owns the microphone on this screen; it must release
  // it before speech recognition can start, and get it back once we stop.
  // Asks the service rather than trusting our own flag: TTS playback resumes
  // wake-word detection behind our back, so the mic may need reclaiming again
  // even though we already paused it once this session.
  const releaseMicFromWakeWord = useCallback(async () => {
    try {
      const wakeWord = WakeWordService.getInstance();
      if (!wakeWord.isCurrentlyListening()) return;
      wakeWordPausedRef.current = true;
      await wakeWord.pauseDetection(false);
    } catch (error) {
      console.warn('[VerbiListening] wakeword pause failed:', error);
    }
  }, []);

  const returnMicToWakeWord = useCallback(() => {
    if (!wakeWordPausedRef.current) return;
    wakeWordPausedRef.current = false;
    WakeWordService.getInstance()
      .resumeDetection()
      .catch(error =>
        console.warn('[VerbiListening] wakeword resume failed:', error),
      );
  }, []);

  // ─── TTS Callbacks ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsubStart = TTSService.onSpeakStart(() => {
      ttsSpeakingRef.current = true;
      if (isListeningRef.current) {
        dispatch({ type: 'LISTENING_STATE_CHANGED', payload: 'paused_for_tts' });
        pausePartnerSTT();
      }
    });

    const unsubEnd = TTSService.onSpeakEnd(() => {
      ttsSpeakingRef.current = false;
      // Resume if we should still be listening — the ear is on whenever Verbi
      // is on, regardless of turn state.
      if (
        state.enabled &&
        state.microphoneEnabled &&
        state.permission === 'granted' &&
        state.isOnline &&
        appStateRef.current === 'active'
      ) {
        resumePartnerSTT();
      }
    });

    return () => {
      unsubStart();
      unsubEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.enabled, state.microphoneEnabled, state.permission, state.isOnline]);

  // ─── AppState Monitor ────────────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      appStateRef.current = nextState;
      if (
        nextState !== 'active' &&
        (isListeningRef.current || pausedForTtsRef.current)
      ) {
        stopPartnerSTT('background');
      }
    });
    return () => sub.remove();
  }, []);

  // ─── STT Subscription ────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToSpeechEvents(
      {
        onSpeechResults: (event: any) => {
          // Only accept finalized results (not partials) and only if we're the active listener
          if (!isListeningRef.current) return;
          // Ignore if TTS is playing — that's our own voice output
          if (ttsSpeakingRef.current) return;

          const results: string[] = event?.value ?? [];
          const finalText = results[0]?.trim() ?? '';
          if (!finalText) return;

          bufferFinalFragment(finalText);
        },
        onSpeechError: () => {
          if (!isListeningRef.current) return;
          dispatch({ type: 'LISTENING_STATE_CHANGED', payload: 'error' });
          isListeningRef.current = false;
        },
      },
      { key: 'verbi-partner' },
    );

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.conversationId, state.activeTurnId]);

  // ─── Inactivity Timer ────────────────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        stopPartnerSTT('timeout');
      }
    }, INACTIVITY_TIMEOUT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Start/Stop Logic ────────────────────────────────────────────────────
  const startPartnerSTT = useCallback(async () => {
    if (isListeningRef.current) return;
    if (ttsSpeakingRef.current) return;
    if (appStateRef.current !== 'active') return;

    try {
      dispatch({ type: 'LISTENING_STATE_CHANGED', payload: 'listening' });
      isListeningRef.current = true;
      pausedForTtsRef.current = false;
      await releaseMicFromWakeWord();
      await startSpeechRecognition('en-US');
      resetInactivityTimer();

      mixpanel.track(VERBI_EVENTS.LISTENING_STARTED, {
        turnId: state.activeTurnId,
      });
    } catch (error) {
      console.warn('[VerbiListening] startSpeechRecognition failed:', error);
      dispatch({ type: 'LISTENING_STATE_CHANGED', payload: 'error' });
      isListeningRef.current = false;
      returnMicToWakeWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeTurnId, releaseMicFromWakeWord, returnMicToWakeWord]);

  const pausePartnerSTT = useCallback(async () => {
    if (!isListeningRef.current) return;
    // Clear the flag so resumePartnerSTT can reopen the mic once TTS finishes;
    // the inactivity timer keeps running because the turn itself is unchanged.
    isListeningRef.current = false;
    pausedForTtsRef.current = true;
    try {
      await stopSpeechRecognition();
    } catch {
      // Best-effort
    }
  }, []);

  const resumePartnerSTT = useCallback(async () => {
    if (isListeningRef.current) return;
    if (ttsSpeakingRef.current) return;
    await startPartnerSTT();
  }, [startPartnerSTT]);

  const stopPartnerSTT = useCallback(
    async (reason: 'tts' | 'timeout' | 'background' | 'settings' | 'turn_end') => {
      if (
        !isListeningRef.current &&
        !pausedForTtsRef.current &&
        reason !== 'turn_end'
      ) {
        return;
      }

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      // Don't lose speech that was still waiting for its quiet gap.
      flushRef.current();

      dispatch({ type: 'LISTENING_STATE_CHANGED', payload: 'off' });
      isListeningRef.current = false;
      pausedForTtsRef.current = false;

      try {
        await stopSpeechRecognition();
      } catch {
        // Best-effort
      }

      returnMicToWakeWord();

      mixpanel.track(VERBI_EVENTS.LISTENING_STOPPED, { reason });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [returnMicToWakeWord],
  );

  // ─── Buffer & Coalesce Final Fragments ───────────────────────────────────
  // The recognizer may finalize a spoken sentence in several pieces, and some
  // engines emit cumulative finals ("what do" → "what do you want"). Merge
  // pieces as they arrive and only send once the partner has actually stopped.
  const bufferFinalFragment = useCallback((text: string) => {
    const fragments = pendingFragmentsRef.current;
    const last = fragments[fragments.length - 1];

    if (last && text.toLowerCase().startsWith(last.toLowerCase())) {
      // Cumulative final: the new text supersedes the previous fragment.
      fragments[fragments.length - 1] = text;
    } else if (last && last.toLowerCase().startsWith(text.toLowerCase())) {
      // Regression/duplicate of what we already hold — ignore.
    } else {
      fragments.push(text);
    }

    resetInactivityTimer();

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushRef.current();
    }, TRANSCRIPT_FLUSH_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushTranscript = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const fragments = pendingFragmentsRef.current;
    if (fragments.length === 0) return;
    pendingFragmentsRef.current = [];

    const text = fragments.join(' ').trim();
    if (!text || !state.conversationId) return;

    dispatch({ type: 'LISTENING_STATE_CHANGED', payload: 'processing' });

    // Cancel any previous utterance request
    if (utteranceAbortRef.current) {
      utteranceAbortRef.current.abort();
    }
    const controller = new AbortController();
    utteranceAbortRef.current = controller;

    const body: UtteranceBody = {
      clientEventId: generateEventId(),
      // Ambient speech (no turn open) still belongs to the conversation.
      turnId:
        state.activeTurnId ??
        `turn_ambient_${Date.now().toString(36)}`,
      speaker: 'partner',
      text,
      status: 'final',
      finalizedAt: new Date().toISOString(),
    };

    try {
      const result = await verbiApi.appendUtterance(
        state.conversationId,
        body,
        controller.signal,
      );

      if (result?.contextVersion !== undefined) {
        dispatch({
          type: 'PARTNER_TRANSCRIPT_FINALIZED',
          payload: { contextVersion: result.contextVersion },
        });

        mixpanel.track(VERBI_EVENTS.TRANSCRIPT_FINALIZED, {
          contextVersion: result.contextVersion,
        });
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.warn('[VerbiListening] appendUtterance failed:', error);
      }
    } finally {
      utteranceAbortRef.current = null;
      // Return to listening state if conditions still met
      if (
        isListeningRef.current &&
        !ttsSpeakingRef.current &&
        appStateRef.current === 'active'
      ) {
        dispatch({ type: 'LISTENING_STATE_CHANGED', payload: 'listening' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.conversationId, state.activeTurnId]);

  useEffect(() => {
    flushRef.current = flushTranscript;
  }, [flushTranscript]);

  // ─── Lifecycle: keep the ear on while Verbi is usable ─────────────────────
  // The mic listens in every turn state — before the first tap (so a partner's
  // question primes the starter board), while building, and after Speak (so the
  // reply is heard). The inactivity timer bounds an idle mic; any board
  // activity (predictionSequence bump) re-opens it.
  useEffect(() => {
    const shouldListen =
      state.enabled &&
      state.microphoneEnabled &&
      state.permission === 'granted' &&
      state.isOnline &&
      !!state.conversationId &&
      appStateRef.current === 'active';

    if (shouldListen && !isListeningRef.current && !pausedForTtsRef.current) {
      startPartnerSTT();
    } else if (
      !shouldListen &&
      (isListeningRef.current || pausedForTtsRef.current)
    ) {
      stopPartnerSTT('settings');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.enabled,
    state.microphoneEnabled,
    state.permission,
    state.isOnline,
    state.conversationId,
    state.turnState,
    state.predictionSequence,
  ]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        // Fire-and-forget: send whatever the partner finished saying.
        flushRef.current();
      }
      if (utteranceAbortRef.current) {
        utteranceAbortRef.current.abort();
      }
      if (isListeningRef.current || pausedForTtsRef.current) {
        stopSpeechRecognition().catch(() => {});
        isListeningRef.current = false;
        pausedForTtsRef.current = false;
      }
      returnMicToWakeWord();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
