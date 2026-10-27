import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import fetchHelper from '../utils/fetcher';
import { useAppSettings } from '../utils/persistance';
import { personalMemoryService } from '../services/PersonalMemoryService';
import mixpanel from '../utils/mixpanelInstance';
import {
  localLlmEngine,
  LocalLlmState,
} from '../services/localLlm/localLlmEngine';
import {
  MEMORY_SNAPSHOT_MS,
  resolveLocalModelKey,
} from '../services/localLlm/localLlmModels';
import {
  clampCount,
  heuristicAnswers,
  LocalMemoryContext,
  LocalPepes,
  LocalStableContext,
} from '../services/localLlm/localAnswerPrompt';

// New type for messages in conversation history
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// New type for possible answers from assistant
interface PossibleAnswerItem {
  word: string;
  type?: string;
  imageUrl?: string;
}

/** The subset of generateAnswers' options a prefill needs. */
interface PrefillOptions {
  metadata?: { contextInfo?: string };
  number?: number;
}

interface AssistantContextType {
  generateAnswers: (
    sentence: string,
    options?: any,
  ) => Promise<PossibleAnswerItem[]>;
  /**
   * On-device AI only: feed a partial transcript while the partner is still
   * talking, so the final question evaluates only its last words. Cheap and
   * safe to call on every partial; a no-op when the option is off or the
   * model is not loaded yet. Stable identity: safe to call from handlers
   * subscribed once.
   */
  prefillAnswers: (partialSentence: string, options?: PrefillOptions) => void;
  /**
   * On-device AI only: re-read the people list and personal memory and
   * re-prime the cached prompt head if they changed. Call on entering the
   * conversation screen. Stable identity.
   */
  refreshLocalLlm: () => void;
  conversationHistory: Message[];
  addToConversationHistory: (
    userMessage: string,
    assistantResponse: string,
    maxHistoryLength?: number,
  ) => void;
  updateLastAssistantMessage: (selectionText: string) => void;
  clearHistory: () => void;
  /** On-device model state; `status` is 'idle' while the option is off. */
  localLlm: LocalLlmState;
  localLlmEnabled: boolean;
}

const AssistantContext = createContext<AssistantContextType | undefined>(
  undefined,
);

interface AssistantProviderProps {
  children: ReactNode;
}

export const AssistantProvider: React.FC<AssistantProviderProps> = ({
  children,
}) => {
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const { preferences, getItem } = useAppSettings();

  // ─── On-device AI (adult fork only) ──────────────────────────────────────
  // The model is loaded as soon as the option is on so the first question does
  // not pay the multi-second load, and unloaded when it is turned off so the
  // memory goes back to the rest of the app.
  const localLlmEnabled = preferences.localLlmEnabled === '1';
  const localModelKey = resolveLocalModelKey(preferences.localLlmModel);
  const [localLlm, setLocalLlm] = useState<LocalLlmState>(
    localLlmEngine.getState(),
  );

  // Home subscribes to speech events once and calls into this context from
  // that first closure, so everything the answer paths read goes through
  // this ref rather than the render the function was created in.
  const latest = useRef({
    preferences,
    getItem,
    conversationHistory,
    localLlmEnabled,
    localModelKey,
  });
  latest.current = {
    preferences,
    getItem,
    conversationHistory,
    localLlmEnabled,
    localModelKey,
  };

  // Personal memory for the on-device prompt is a snapshot taken between
  // questions, not ranked per sentence: it sits in the cached prompt head,
  // where any change re-evaluates everything after it. Rebuilt after a
  // question once it is older than MEMORY_SNAPSHOT_MS.
  const memorySnapshot = useRef<{ context?: LocalMemoryContext; at: number }>({
    at: 0,
  });
  // Partials can arrive faster than the pepes read resolves; keep the newest.
  const prefillSeq = useRef(0);

  useEffect(() => localLlmEngine.subscribe(setLocalLlm), []);

  // The on-device helpers, built once. They read live values through
  // `latest` and the refs above, so they keep a stable identity and are safe
  // to call from handlers subscribed once (Home's speech events).
  const local = useMemo(() => {
    const readPepes = async (): Promise<LocalPepes> => {
      try {
        const raw = await latest.current.getItem('pepes');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('Error loading pepes for AI context:', e);
        return null;
      }
    };

    const loadMemorySnapshot = async (): Promise<void> => {
      let context: LocalMemoryContext | undefined;
      try {
        context = await personalMemoryService.buildMemoryContext();
      } catch {
        context = undefined;
      }
      memorySnapshot.current = { context, at: Date.now() };
    };

    /** The session-constant prompt head; identical for warm-up, prefill and question. */
    const buildStableContext = (
      pepes: LocalPepes,
      count: number,
    ): LocalStableContext => {
      const prefs = latest.current.preferences;
      return {
        userName: prefs.heroName || '',
        pepes,
        tellUsMore: prefs.tellUsMore || '',
        count,
        memoryContext: memorySnapshot.current.context,
      };
    };

    /** Re-read everything in the head and prime it (a no-op when unchanged). */
    const warmUp = async (): Promise<void> => {
      if (!latest.current.localLlmEnabled) return;
      const [pepes] = await Promise.all([readPepes(), loadMemorySnapshot()]);
      const { localLlmEnabled: enabled, localModelKey: key, preferences: prefs } =
        latest.current;
      if (!enabled) return;
      localLlmEngine.warmUp(
        key,
        buildStableContext(pepes, clampCount(prefs.answersCount)),
      );
    };

    const prefill = (partialSentence: string, options: PrefillOptions = {}) => {
      const {
        localLlmEnabled: enabled,
        localModelKey: key,
        conversationHistory: history,
        preferences: prefs,
      } = latest.current;
      if (!enabled || !partialSentence.trim()) return;
      // Never wait for a load here: a prefill is only worth it when the
      // model is idle and ready.
      if (!localLlmEngine.isReady(key)) return;
      const count = clampCount(options.number ?? prefs.answersCount);
      const seq = (prefillSeq.current += 1);
      readPepes()
        .then(pepes => {
          if (seq !== prefillSeq.current) return;
          localLlmEngine.prefill(
            {
              ...buildStableContext(pepes, count),
              sentence: partialSentence,
              mode: 'generate_answers',
              contextInfo: options.metadata?.contextInfo,
              conversationHistory: history,
            },
            key,
          );
        })
        .catch(() => undefined);
    };

    return { readPepes, loadMemorySnapshot, buildStableContext, warmUp, prefill };
  }, []);

  useEffect(() => {
    if (!localLlmEnabled) {
      localLlmEngine.release().catch(() => undefined);
      return;
    }
    // Hand the engine the session-constant part of the prompt so it can be
    // evaluated once at load time instead of on every question. The head
    // reads heroName / tellUsMore through `latest`, hence those deps.
    let cancelled = false;
    (async () => {
      const [pepes] = await Promise.all([
        local.readPepes(),
        local.loadMemorySnapshot(),
      ]);
      if (cancelled) return;
      localLlmEngine.warmUp(
        localModelKey,
        local.buildStableContext(pepes, clampCount(preferences.answersCount)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    local,
    localLlmEnabled,
    localModelKey,
    preferences.heroName,
    preferences.tellUsMore,
    preferences.answersCount,
  ]);

  const refreshLocalLlm = useCallback(() => {
    local.warmUp().catch(() => undefined);
  }, [local]);

  const prefillAnswers = local.prefill;

  const addToConversationHistory = (
    userMessage: string,
    assistantResponse: string,
    maxHistoryLength: number = 20, // Keep last 20 exchanges
  ) => {
    setConversationHistory(prev => {
      const newHistory = [
        ...prev,
        { role: 'user' as const, content: userMessage, timestamp: Date.now() },
        {
          role: 'assistant' as const,
          content: assistantResponse,
          timestamp: Date.now(),
        },
      ];

      // Keep only the most recent exchanges
      return newHistory.slice(-maxHistoryLength * 2); // *2 because each exchange has user + assistant
    });
  };

  const updateLastAssistantMessage = (selectionText: string) => {
    setConversationHistory(prev => {
      if (prev.length === 0) return prev;

      const newHistory = [...prev];
      const lastIndex = newHistory.length - 1;

      if (newHistory[lastIndex].role === 'assistant') {
        newHistory[lastIndex] = {
          ...newHistory[lastIndex],
          content: `${newHistory[lastIndex].content}. User picked: ${selectionText}`,
        };
      }

      return newHistory;
    });
  };

  const clearHistory = () => {
    setConversationHistory([]);
  };

  const generateAnswers = async (sentence: string, options: any = {}) => {
    const {
      mode = 'generate_answers',
      metadata = {},
      prior = {},
      countMin = 5,
      countMax = 5,
      genderType = 'white boy',
    } = options;

    const requestedNumber = options.number || countMax || 10;

    // Read the current values, not the ones of the render that created the
    // closure Home is calling from.
    const {
      preferences: prefs,
      conversationHistory: history,
      localLlmEnabled: localEnabled,
      localModelKey: localKey,
    } = latest.current;

    // Get pepes data for context if not already provided
    const parsedPepes = await local.readPepes();

    // ─── On-device path ────────────────────────────────────────────────────
    // While the option is on, no answer request leaves the device: a model
    // that cannot load yields the built-in heuristic answers, never a call to
    // the backend. Settings shows the load error so a caregiver can fix it.
    if (localEnabled) {
      // The adult backend stores nothing for learning_feedback and returns
      // an empty list; match that without a round trip.
      if (mode === 'learning_feedback') return [];

      if (mode === 'generate_answers' || mode === 'generate_more_answers') {
        const count = clampCount(requestedNumber);
        const priorAnswers = Array.isArray(prior?.answers) ? prior.answers : [];
        try {
          const answers = await localLlmEngine.generateAnswers(
            {
              // Stable head - must match what the warm-up and prefills primed.
              ...local.buildStableContext(parsedPepes, count),
              // Per-question tail.
              sentence,
              mode,
              contextInfo: options.metadata?.contextInfo,
              conversationHistory: history,
              priorAnswers,
            },
            localKey,
          );
          // Between questions is the time to pick up what the user has said
          // since; the head is re-primed in the background if it changed.
          if (Date.now() - memorySnapshot.current.at > MEMORY_SNAPSHOT_MS) {
            local.warmUp().catch(() => undefined);
          }
          return answers;
        } catch (error) {
          // Only a model that could not load gets here (generation failures
          // already fell back to heuristic answers inside the engine).
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(
            `[AssistantContext] on-device model unavailable (${reason}); showing built-in answers`,
          );
          mixpanel.track('local_llm_model_unavailable', {
            model: localKey,
            mode,
            reason,
          });
          return heuristicAnswers(sentence, count, priorAnswers);
        }
      }
      // Any other mode is a backend-only feature; with the option on it has
      // nothing to answer with.
      return [];
    }

    // Personal Memory context (undefined when disabled/empty — key omitted)
    const memoryContext = mode.startsWith('generate_')
      ? await personalMemoryService.buildMemoryContext({currentText: sentence})
      : undefined;

    try {
      const response = await fetchHelper(
        'generateAnswers',
        {},
        {
          sentence,
          number: requestedNumber,
          mode,
          metadata: {
            kidName: options.metadata?.kidName || 'I', // Replace with actual kid name
            speaker: options.metadata?.speaker || 'anyone', // Replace with actual speaker
            audience: options.metadata?.audience || 'my', // Replace with actual audience
            tellUsMore: prefs.tellUsMore || '', // Add Tell Us More context
            pepes: parsedPepes, // Add People & Stuff data context
            ...(memoryContext ? { memoryContext } : {}), // Personal Memory context
            ...(mode.startsWith('generate_') ? { conversationHistory: history } : {}), // Only include history in generate modes
            ...metadata,
          },
          prior,
          options: {
            number: requestedNumber,
            countMin,
            countMax,
            genderType,
          },
        },
      );

      if (response && response.results) {
        return response.results; // Array of { word, imageUrl } objects
      } else {
        throw new Error(
          'Invalid response format from generateAnswers endpoint',
        );
      }
    } catch (error) {
      throw error;
    }
  };

  return (
    <AssistantContext.Provider
      value={{
        generateAnswers,
        prefillAnswers,
        refreshLocalLlm,
        conversationHistory,
        addToConversationHistory,
        updateLastAssistantMessage,
        clearHistory,
        localLlm,
        localLlmEnabled,
      }}>
      {children}
    </AssistantContext.Provider>
  );
};

export const useAssistant = () => {
  const context = useContext(AssistantContext);
  if (context === undefined) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return context;
};

export default AssistantContext;
