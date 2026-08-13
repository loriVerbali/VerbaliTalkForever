import { useEffect, useRef, useCallback } from 'react';
import { Node } from '../../../types/sentenceBuilder';
import {
  VerbiAction,
  VerbiClientState,
  VerbiFolder,
  PredictionMode,
  VerbiSuggestion,
} from '../state/verbiTypes';
import { verbiApi } from '../services/verbiApi';
import { generateRequestId } from '../utils/generateRequestId';
import { normalizeSentenceSnapshot } from '../utils/normalizeSentenceSnapshot';
import { routePredictionMode } from '../utils/routePredictionMode';
import mixpanel from '../../../utils/mixpanelInstance';
import {
  VERBI_EVENTS,
  parseVerbiSuggestionLimit,
} from '../state/verbiTypes';
import {
  initVerbiImageCache,
  generateImageKey,
  getCachedImageUri,
} from '../services/verbiImageCache';
import { verbiDownloadQueue, DownloadTask } from '../services/verbiDownloadQueue';
import { useAppSettings } from '../../../utils/persistance';
import { resolvePepesImage } from '../../../utils/pepesUtils';

const DEBOUNCE_MS = 100;

interface UseVerbiPredictionInput {
  state: VerbiClientState;
  dispatch: (action: VerbiAction) => void;
  sentenceTokenIds: string[];
  nodes: Node[];
  boardId: string;
  locale: string;
}

export function useVerbiPrediction({
  state,
  dispatch,
  sentenceTokenIds,
  nodes,
  boardId,
  locale,
}: UseVerbiPredictionInput) {
  const { getItem } = useAppSettings();
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every new request. Aborting the fetch is not enough on its own:
  // a response that already came back is past the point where the signal can
  // stop it, and it would then paint suggestions for a sentence the user has
  // already moved on from. Each attempt captures its generation and gives up
  // the moment a newer word supersedes it.
  const generationRef = useRef(0);

  useEffect(() => {
    initVerbiImageCache();
  }, []);

  // Drop anything still pending when the screen goes away.
  useEffect(() => {
    return () => {
      // Deliberately reading the live value: this is a counter, and bumping
      // whatever it holds at teardown is exactly what invalidates in-flight work.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generationRef.current++;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const requestPrediction = useCallback(
    (overrideFolder?: VerbiFolder | null) => {
      // Don't request if offline or disabled
      if (!state.isOnline || !state.enabled) {
        return;
      }

      // Supersede everything older, right now — not 100ms from now when the
      // debounced body runs.
      const generation = ++generationRef.current;

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        if (generationRef.current !== generation) return;

        const snapshot = normalizeSentenceSnapshot(sentenceTokenIds, nodes);
        const activeFolder =
          overrideFolder !== undefined
            ? overrideFolder
            : state.folderStack.length > 0
            ? state.folderStack[state.folderStack.length - 1]
            : null;

        const isTurnStale =
          state.turnState === 'IDLE_EMPTY' ||
          state.turnState === 'READY_FOR_NEXT_TURN';

        const mode: PredictionMode = routePredictionMode({
          openVerbiFolder: activeFolder,
          sentenceItemCount: snapshot.itemCount,
          isTurnStale,
        });

        const requestId = generateRequestId();
        const turnId = state.activeTurnId ?? `turn_fallback_${Date.now()}`;

        dispatch({
          type: 'PREDICTION_REQUESTED',
          payload: { requestId, mode },
        });

        const now = Date.now();
        mixpanel.track(VERBI_EVENTS.PREDICTION_REQUESTED, {
          mode,
          turnId,
          hasConversation: !!state.conversationId,
        });

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          let parsedPepes: any = null;
          try {
            const pepesRaw = await getItem('pepes');
            if (pepesRaw) {
              parsedPepes = JSON.parse(pepesRaw);
            }
          } catch (e) {
            console.error('Error loading pepes for Verbi prediction context:', e);
          }

          // Read on every request so a change in the grid settings panel takes
          // effect on the next prediction without remounting this hook.
          const limit = parseVerbiSuggestionLimit(
            await getItem('verbiSuggestionLimit'),
          );

          const response = await verbiApi.predict(
            {
              requestId,
              conversationId: state.conversationId,
              turnId,
              mode,
              sentence: {
                text: snapshot.text,
                items: snapshot.items,
                isStale: isTurnStale,
              },
              folder: activeFolder
                ? {
                    id: activeFolder.id,
                    label: activeFolder.label,
                    category: activeFolder.category,
                  }
                : null,
              board: { boardId, locale },
              contextCues: {
                timeOfDay: getTimeOfDay(),
                date: new Date().toISOString().split('T')[0],
                pepes: parsedPepes,
              },
              limit,
            },
            controller.signal,
          );

          // A word landed while this was in the air: the answer describes a
          // sentence that no longer exists, so drop it rather than paint it.
          if (generationRef.current !== generation) return;

          const latencyMs = Date.now() - now;
          mixpanel.track(VERBI_EVENTS.PREDICTION_SUCCEEDED, {
            mode,
            latencyMs,
            suggestionCount: response.suggestions?.length ?? 0,
            fallbackUsed: response.fallbackUsed,
          });

          await initVerbiImageCache();
          const rawSuggestions = response.suggestions ?? [];
          const downloadTasks: DownloadTask[] = [];

          const mappedSuggestions: VerbiSuggestion[] = rawSuggestions.map(sug => {
            // First check if word matches a local Pepes item or alias
            const pepesImageUri = resolvePepesImage(sug.label, parsedPepes);
            if (pepesImageUri) {
              return {
                ...sug,
                localImagePath: pepesImageUri,
                imageUrl: pepesImageUri,
              };
            }

            const rawIconVal = sug.icon?.value;
            const remoteUrl =
              sug.imageUrl ||
              (typeof rawIconVal === 'string' && rawIconVal.startsWith('http')
                ? rawIconVal
                : undefined);

            if (
              !remoteUrl ||
              typeof remoteUrl !== 'string' ||
              !remoteUrl.startsWith('http')
            ) {
              return sug;
            }

            const filenameKey = generateImageKey(remoteUrl, sug.label || sug.id);
            const cachedUri = getCachedImageUri(filenameKey);

            if (cachedUri) {
              return { ...sug, localImagePath: cachedUri };
            } else {
              downloadTasks.push({
                imageUrl: remoteUrl,
                filenameKey,
                rank: sug.rank ?? 0,
                suggestionId: sug.id,
                onComplete: (suggestionId, localUri) => {
                  dispatch({
                    type: 'SUGGESTION_IMAGE_CACHED',
                    payload: { suggestionId, localUri },
                  });
                },
              });
              return sug;
            }
          });

          if (generationRef.current !== generation) return;

          dispatch({
            type: 'PREDICTION_SUCCEEDED',
            payload: {
              requestId,
              suggestions: mappedSuggestions,
              groups: response.groups ?? [],
              fallbackUsed: response.fallbackUsed ?? false,
            },
          });

          if (downloadTasks.length > 0) {
            verbiDownloadQueue.enqueueItems(downloadTasks);
          }
        } catch (error: any) {
          // Ignore abort errors — they're intentional
          if (error?.name === 'AbortError') {
            return;
          }

          // A superseded request must not surface an error over the request
          // that replaced it.
          if (generationRef.current !== generation) return;

          const code = (error as any)?.code ?? 'UNKNOWN';
          mixpanel.track(VERBI_EVENTS.PREDICTION_FAILED, { mode, code });

          dispatch({
            type: 'PREDICTION_FAILED',
            payload: { requestId, code },
          });
        } finally {
          // Only clear the slot if it is still ours — a newer request may have
          // already installed its own controller here.
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
        }
      }, DEBOUNCE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.isOnline,
      state.enabled,
      state.folderStack,
      state.turnState,
      state.activeTurnId,
      state.conversationId,
      sentenceTokenIds,
      nodes,
      boardId,
      locale,
      getItem,
    ],
  );

  const cancelPrediction = useCallback(() => {
    generationRef.current++;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return { requestPrediction, cancelPrediction };
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}
