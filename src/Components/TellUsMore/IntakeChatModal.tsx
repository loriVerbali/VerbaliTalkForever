import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  PermissionsAndroid,
} from 'react-native';
import {useAdmin} from '../../contexts/adminContext';
import {useAppSettings} from '../../utils/persistance';
import fetchHelper from '../../utils/fetcher';
import TTSService from '../../utils/TTSService';
import WakeWordService from '../../utils/wakewordService';
import FastImage from 'react-native-fast-image';

import Voice, {
  startSpeechRecognition,
  stopSpeechRecognition,
  subscribeToSpeechEvents,
} from '../../utils/STTService';

const {height} = Dimensions.get('window');

const STT_DEBUG = false;
const INTAKE_INITIAL_SPEECH_TIMEOUT_MS = 8000;
const INTAKE_RESPONSE_SILENCE_TIMEOUT_MS = 3000;
const SKIP_STOP_SILENCE_TIMEOUT_MS = 2000;
const WELCOME_LISTEN_TIMEOUT_MS = 12000;
const SKIP_STOP_PROMPT = 'Do you want to skip, or stop?';
const IOS_TTS_TO_STT_SETTLE_MS = 100;

const REPEAT_PHRASES = [
  'repeat',
  'say that again',
  'what was the question',
  'again',
];

const WELCOME_SCRIPT =
  "Welcome! My name is Verbi. I'm the AI assistant built into the app, and I'll support your child by providing helpful suggestions as they communicate.\n\nI'm also here to make setting up and personalizing the app faster and easier for you.\n\nI'll ask you a few questions to learn about your child's world—the people, places, activities, interests, and everyday situations that are important to them.\n\nThis information will help me provide more relevant suggestions throughout the app, making it easier for your child to participate in conversations, share what they are thinking, and connect with the people around them.\n\nWhen we're finished, I'll organize everything in the right places for you. You'll only need to review the information and add the pictures you want to use.\n\nThe process should only take a few minutes, and you can make changes later. You can also skip a question, stop a section, or come back to it at any time.\n\nWhen you're ready, just say \"I'm ready\" or tap Begin.";

const sttTrace = (...args: unknown[]) => {
  if (STT_DEBUG) {
    console.log(...args);
  }
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  role: 'assistant' | 'user';
  content: string;
  rationale?: string; // privacy/context note shown below sensitive questions
}

interface Step {
  name: string;
  requirements: string;
  assistantMessage: string;
}

type VoiceState =
  | 'idle'
  | 'speaking' // TTS is reading a question
  | 'preparing' // STT is opening after TTS finishes
  | 'listening' // Mic is open for user's answer
  | 'processing' // Sending user speech to API
  | 'promptingSkipStop'; // TTS asking "skip or stop?", then mic open again

type ChatPhase = 'welcome' | 'active';

// ─── Steps ──────────────────────────────────────────────────────────────────

const getIntakeSteps = (childName: string): Step[] => {
  const hasName = childName && childName.toLowerCase() !== 'your child';
  const nameDisplay = hasName ? childName : 'your child';
  const possessiveName = hasName ? `${childName}'s` : 'their';

  return [
    {
      name: 'Child Basic Info',
      requirements: hasName
        ? 'age, date of birth, home address'
        : 'name, age, date of birth, home address',
      assistantMessage: hasName
        ? `Let's start with some facts about ${nameDisplay}. How old are they?`
        : `Let's start with some facts about ${nameDisplay}. What is their name and age?`,
    },
    {
      name: 'Caregivers',
      requirements: 'names, relationships, what the child calls them',
      assistantMessage: `Who are ${possessiveName} primary caregivers? Please share their names, relationships, and what ${nameDisplay} calls them.`,
    },
    {
      name: 'Household Members',
      requirements:
        'siblings (names, ages, what child calls them), other adults living at home, grandparents in the home',
      assistantMessage: `Besides the caregivers, who else lives at home with ${nameDisplay}?`,
    },
    {
      name: 'Pets',
      requirements: 'pet name, type of animal, nickname the child uses for the pet',
      assistantMessage: `Does ${nameDisplay} have any pets?`,
    },
    {
      name: 'Family outside the home',
      requirements:
        'names, relationships, whether they live close or far, city/state/country if far',
      assistantMessage: `Tell me about ${possessiveName} family who don't live at home. Who comes to mind?`,
    },
    {
      name: 'Therapists',
      requirements: 'name, role, where therapy happens',
      assistantMessage: `Does ${nameDisplay} work with any therapists? Please share their names, roles, and where therapy happens.`,
    },
    {
      name: 'School',
      requirements: 'school name, teachers names, teachers roles',
      assistantMessage: `How about school? Does ${nameDisplay} attend any school or program? What are the teachers' names and roles?`,
    },
    {
      name: 'Routines',
      requirements:
        'routine steps, foods, drinks, people, places, objects, shows, songs, books',
      assistantMessage: `Lastly, let's talk about routines. What does a typical day look like for ${nameDisplay}? Feel free to mention ${possessiveName} favorite foods, drinks, places, shows, songs, or books.`,
    },
  ];
};

// ─── Component ──────────────────────────────────────────────────────────────

interface IntakeChatModalProps {
  visible: boolean;
  childName: string;
  onCancel: () => void;
  onComplete: (transcript: string) => void;
}

const IntakeChatModal: React.FC<IntakeChatModalProps> = ({
  visible,
  childName,
  onCancel,
  onComplete,
}) => {
  const INTAKE_STEPS = useMemo(() => getIntakeSteps(childName), [childName]);
  const {isTablet} = useAdmin();
  const {preferences, setItem} = useAppSettings();

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);

  // ── Phase & pause state ────────────────────────────────────────────────────
  const [chatPhase, setChatPhase] = useState<ChatPhase>('welcome');
  const [isPaused, setIsPaused] = useState(false);

  // ── Voice mode state ───────────────────────────────────────────────────────
  const [isVoiceModeEnabled, setIsVoiceModeEnabled] = useState(true);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

  // ── Stable refs (avoid closure staleness) ─────────────────────────────────
  const messagesRef = useRef<Message[]>(messages);
  const activeStepIndexRef = useRef(activeStepIndex);
  const stepStatusesRef = useRef(stepStatuses);
  const isTypingRef = useRef(isTyping);
  const voiceModeEnabledRef = useRef(true);
  const isRecordingRef = useRef(false);
  const isSkipStopListeningRef = useRef(false);
  const isWelcomeListeningRef = useRef(false);
  const shouldResumeWakeWordRef = useRef(false);
  const visibleRef = useRef(visible);
  const voiceTurnIdRef = useRef(0);
  const lastPartialTextRef = useRef('');
  const lastReadMessageRef = useRef<string | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatPhaseRef = useRef<ChatPhase>('welcome');
  const isPausedRef = useRef(false);
  // Tracks whether we've already given the user one silent-retry turn.
  // Reset to false whenever the user actually speaks or a new question is asked.
  const silenceRetryUsedRef = useRef(false);
  // True when the user has manually typed into the input (not populated by STT).
  // While true, the silence timer is suppressed and the input is not cleared on
  // turn transitions so the user has full time to finish typing.
  const isManualInputRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    activeStepIndexRef.current = activeStepIndex;
  }, [activeStepIndex]);
  useEffect(() => {
    stepStatusesRef.current = stepStatuses;
  }, [stepStatuses]);
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);
  useEffect(() => {
    voiceModeEnabledRef.current = isVoiceModeEnabled;
  }, [isVoiceModeEnabled]);
  useEffect(() => {
    chatPhaseRef.current = chatPhase;
  }, [chatPhase]);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // ── Animated border glow ───────────────────────────────────────────────────
  const borderGlowAnim = useRef(new Animated.Value(0)).current;
  const borderGlowLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startBorderGlow = useCallback(() => {
    borderGlowLoop.current?.stop();
    borderGlowAnim.setValue(0);
    borderGlowLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(borderGlowAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(borderGlowAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    borderGlowLoop.current.start();
  }, [borderGlowAnim]);

  const stopBorderGlow = useCallback(() => {
    borderGlowLoop.current?.stop();
    borderGlowLoop.current = null;
    Animated.timing(borderGlowAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [borderGlowAnim]);

  useEffect(() => {
    if (voiceState === 'listening' || voiceState === 'promptingSkipStop') {
      startBorderGlow();
    } else {
      stopBorderGlow();
    }
  }, [voiceState, startBorderGlow, stopBorderGlow]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    }
  }, [messages]);

  // Low-level timer helpers ────────────────────────────────────────────────
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const invalidateVoiceTurn = useCallback(() => {
    voiceTurnIdRef.current += 1;
  }, []);

  const isVoiceTurnActive = useCallback(
    (turnId: number) =>
      visibleRef.current &&
      voiceModeEnabledRef.current &&
      !isPausedRef.current &&
      voiceTurnIdRef.current === turnId,
    [],
  );

  const getSilenceTimeout = useCallback(
    (isSkipStopPrompt: boolean) => {
      const userTimeout =
        parseInt(preferences.intakeSilenceTimeoutMs || '3000') ||
        INTAKE_RESPONSE_SILENCE_TIMEOUT_MS;
      return isSkipStopPrompt ? SKIP_STOP_SILENCE_TIMEOUT_MS : userTimeout;
    },
    [preferences.intakeSilenceTimeoutMs],
  );


  const getInitialSilenceTimeout = useCallback(
    (isSkipStopPrompt: boolean) =>
      isSkipStopPrompt
        ? SKIP_STOP_SILENCE_TIMEOUT_MS
        : INTAKE_INITIAL_SPEECH_TIMEOUT_MS,
    [],
  );

  const suspendWakeWordForIntake = useCallback(async () => {
    const wakeWordService = WakeWordService.getInstance();
    if (wakeWordService.isCurrentlyListening()) {
      shouldResumeWakeWordRef.current = true;
    }

    try {
      await wakeWordService.pauseDetection(false);
    } catch (error) {
      console.warn('Failed to suspend wakeword detection for intake:', error);
    }
  }, []);

  // End the current service-owned STT session before TTS or wake-word resumes.
  const stopVoiceSession = useCallback(
    async (resumeWakeWord = false) => {
      invalidateVoiceTurn();
      clearSilenceTimer();
      isRecordingRef.current = false;
      isSkipStopListeningRef.current = false;
      isWelcomeListeningRef.current = false;

      try {
        if (Voice) {
          if (Platform.OS === 'ios') {
            await stopSpeechRecognition();
          } else {
            await Voice.stop();
          }
        }
      } catch {}

      if (resumeWakeWord && shouldResumeWakeWordRef.current) {
        shouldResumeWakeWordRef.current = false;
        try {
          await WakeWordService.getInstance().resumeDetection();
        } catch (error) {
          console.warn('Failed to restart wakeword detection:', error);
        }
      }
    },
    [clearSilenceTimer, invalidateVoiceTurn],
  );

  // ── handleSend (defined early as a ref so silence handler can call it) ─────
  // We use a ref pattern so the silence callback doesn't need it in deps
  const handleSendRef =
    useRef<
      (overrideText?: string, currentMessages?: Message[]) => Promise<void>
    >(undefined);

  // ── handleStop (ref pattern) ───────────────────────────────────────────────
  const handleStopRef =
    useRef<(currentMessages?: Message[]) => Promise<void>>(undefined);

  // ── handleSkipWithMessages (ref pattern) ──────────────────────────────────
  const handleSkipWithMessagesRef =
    useRef<(currentMessages: Message[]) => Promise<void>>(undefined);

  // ── handleRepeat (ref pattern) ────────────────────────────────────────────
  const handleRepeatRef =
    useRef<(currentMessages?: Message[]) => void>(undefined);

  // ── beginChat (ref pattern) ───────────────────────────────────────────────
  const beginChatRef = useRef<() => void>(undefined);

  // ── startListeningInternal (ref, to avoid mutual recursion with handleSilenceTimeout) ──
  const startListeningRef =
    useRef<(isSkipStop: boolean, currentMessages: Message[]) => Promise<void>>(
      undefined,
    );

  const ensureIOSSpeechRecognition = useCallback(
    async (isSkipStopPrompt: boolean) => {
      const silenceTimeout = getSilenceTimeout(isSkipStopPrompt);
      const hasMicPermission = await Voice.hasIOSMicPermissions();
      const micGranted = hasMicPermission
        ? true
        : await Voice.requestIOSMicPermissions(10000);
      if (!micGranted) {
        throw new Error('Microphone permission was not granted.');
      }

      const hasSpeechPermission =
        await Voice.hasIOSSpeechRecognitionPermissions();
      const speechGranted = hasSpeechPermission
        ? true
        : await Voice.requestIOSSpeechRecognitionPermissions(10000);
      if (!speechGranted) {
        throw new Error('Speech recognition permission was not granted.');
      }

      await startSpeechRecognition(
        'en-US',
        {
          EXTRA_PARTIAL_RESULTS: true,
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: silenceTimeout,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS:
            silenceTimeout,
        },
        'intake',
      );
    },
    [getSilenceTimeout],
  );

  // ── TTS speaker ────────────────────────────────────────────────────────────
  const speakMessage = useCallback(
    async (text: string, onDone?: () => void) => {
      if (!visibleRef.current || !voiceModeEnabledRef.current) {
        return;
      }

      await suspendWakeWordForIntake();

      const turnId = voiceTurnIdRef.current + 1;
      voiceTurnIdRef.current = turnId;
      setVoiceState('speaking');
      if (Platform.OS === 'ios') {
        try {
          // Stop the STT mic before TTS so it doesn't pick up the speaker audio.
          await stopSpeechRecognition();
        } catch (error) {
          console.warn('[IntakeChat] Failed to stop STT before TTS:', error);
        }
      }
      TTSService.speak(
        text,
        true,
        () => {
          if (!isVoiceTurnActive(turnId)) return;
          onDone?.();
        },
        // Intake opens STT immediately, so restarting the wake-word listener
        // here would make both recognizers compete for the microphone.
        false,
      );
    },
    [isVoiceTurnActive, suspendWakeWordForIntake],
  );

  // ── Silence timeout handler ────────────────────────────────────────────────
  // Called when 2s of silence detected. Uses refs for all callbacks.
  const handleSilenceTimeout = useCallback(
    async (
      capturedText: string,
      isSkipStopPrompt: boolean,
      currentMessages: Message[],
    ) => {
      await stopVoiceSession();
      const trimmed = capturedText.trim();

      // ── Welcome phase: any recognised speech begins the chat ──────────────
      if (chatPhaseRef.current === 'welcome') {
        if (trimmed.length > 0) {
          // Any speech during welcome → begin
          beginChatRef.current?.();
        } else {
          setVoiceState('idle');
        }
        return;
      }

      if (isSkipStopPrompt) {
        // Second turn: user was asked "skip or stop?"
        if (trimmed.length === 0) {
          setVoiceState('idle');
          handleStopRef.current?.(currentMessages);
        } else {
          const lower = trimmed.toLowerCase();
          if (lower.includes('skip')) {
            setVoiceState('idle');
            handleSkipWithMessagesRef.current?.(currentMessages);
          } else {
            setVoiceState('idle');
            handleStopRef.current?.(currentMessages);
          }
        }
        return;
      }

      if (trimmed.length === 0) {
        if (!silenceRetryUsedRef.current) {
          // First empty silence: give the user another turn instead of asking skip/stop.
          silenceRetryUsedRef.current = true;
          startListeningRef.current?.(false, currentMessages);
        } else {
          // Second empty silence in a row: now ask "skip or stop?"
          silenceRetryUsedRef.current = false;
          setVoiceState('promptingSkipStop');
          speakMessage(SKIP_STOP_PROMPT, () => {
            if (!voiceModeEnabledRef.current) return;
            startListeningRef.current?.(true, currentMessages);
          });
        }
        return;
      }

      // ── Repeat detection (voice) ───────────────────────────────────────────
      const lower = trimmed.toLowerCase().replace(/[.,!?]$/, '');
      const isRepeatRequest = REPEAT_PHRASES.some(p => lower.includes(p));
      if (isRepeatRequest) {
        setVoiceState('idle');
        handleRepeatRef.current?.(currentMessages);
        return;
      }

      // Voice commands — use includes() so partial recognition like "skip this" or "skip please" also works
      const SKIP_PHRASES = ['skip', 'next', 'move on', 'skip this', 'skip it', 'skip section'];
      const STOP_PHRASES = ['stop', "i'm done", 'im done', 'finish', "that's enough", 'done', 'end'];

      if (SKIP_PHRASES.some(p => lower === p || lower.startsWith(p + ' '))) {
        setVoiceState('idle');
        handleSkipWithMessagesRef.current?.(currentMessages);
        return;
      }
      if (STOP_PHRASES.some(p => lower === p || lower.startsWith(p + ' '))) {
        setVoiceState('idle');
        handleStopRef.current?.(currentMessages);
        return;
      }

      // Normal answer: reset retry flag and submit
      silenceRetryUsedRef.current = false;
      setInputText('');
      setVoiceState('processing');
      handleSendRef.current?.(trimmed, currentMessages);
    },
    [stopVoiceSession, speakMessage],
  );

  const armSilenceTimer = useCallback(
    (
      turnId: number,
      isSkipStopPrompt: boolean,
      currentMessages: Message[],
      timeoutMs?: number,
    ) => {
      // If the user is actively typing, don't arm the timer — they need
      // uninterrupted time to finish their response.
      if (isManualInputRef.current) return;
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(async () => {
        if (!isVoiceTurnActive(turnId)) return;
        // Double-check: if the user started typing while we were waiting, abort.
        if (isManualInputRef.current) return;
        const captured = lastPartialTextRef.current;
        const isSkipStop = isSkipStopListeningRef.current || isSkipStopPrompt;
        await handleSilenceTimeout(captured, isSkipStop, currentMessages);
      }, timeoutMs ?? getSilenceTimeout(isSkipStopPrompt));
    },
    [
      clearSilenceTimer,
      getSilenceTimeout,
      handleSilenceTimeout,
      isVoiceTurnActive,
    ],
  );

  // ── startListeningInternal ─────────────────────────────────────────────────
  const startListeningInternal = useCallback(
    async (isSkipStopPrompt: boolean, currentMessages: Message[]) => {
      if (!visibleRef.current || !voiceModeEnabledRef.current) return;
      if (isPausedRef.current) return;

      const isWelcome = chatPhaseRef.current === 'welcome';
      const turnId = voiceTurnIdRef.current + 1;
      voiceTurnIdRef.current = turnId;
      isSkipStopListeningRef.current = isSkipStopPrompt;
      isWelcomeListeningRef.current = isWelcome;
      // Only reset the input when there is no manually-typed text already
      // waiting. If the user typed something while Verbi was speaking, we keep
      // it so they can still hit Send without losing their work.
      if (!isManualInputRef.current) {
        lastPartialTextRef.current = '';
        setInputText('');
      }
      setVoiceState('preparing');

      // Welcome phase uses a longer initial timeout since we're waiting for "I'm ready"
      const initialSilenceTimeout = isWelcome
        ? WELCOME_LISTEN_TIMEOUT_MS
        : getInitialSilenceTimeout(isSkipStopPrompt);
      const silenceTimeout = isWelcome
        ? WELCOME_LISTEN_TIMEOUT_MS
        : getSilenceTimeout(isSkipStopPrompt);

      if (Platform.OS === 'ios') {
        try {
          await new Promise<void>(resolve =>
            setTimeout(resolve, IOS_TTS_TO_STT_SETTLE_MS),
          );
          if (!isVoiceTurnActive(turnId)) return;
          await ensureIOSSpeechRecognition(isSkipStopPrompt);
          if (!isVoiceTurnActive(turnId)) {
            await stopSpeechRecognition();
            return;
          }
          isRecordingRef.current = true;
          setVoiceState(isSkipStopPrompt ? 'promptingSkipStop' : 'listening');
          armSilenceTimer(
            turnId,
            isSkipStopPrompt,
            currentMessages,
            initialSilenceTimeout,
          );
        } catch (err) {
          console.error(
            '[IntakeChat] Failed to start iOS speech recognition:',
            err,
          );
          isRecordingRef.current = false;
          setVoiceState('idle');
        }
      } else {
        // Android: Voice recognition
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            isRecordingRef.current = false;
            setVoiceState('idle');
            return;
          }
          if (!isVoiceTurnActive(turnId)) return;
          if (Voice) {
            await Voice.start('en-US', {
              EXTRA_PARTIAL_RESULTS: true,
              EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: silenceTimeout,
              EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS:
                silenceTimeout,
            });
          }
          if (!isVoiceTurnActive(turnId)) {
            await Voice.stop();
            return;
          }
          isRecordingRef.current = true;
          setVoiceState(isSkipStopPrompt ? 'promptingSkipStop' : 'listening');
          // Fallback silence guard
          armSilenceTimer(
            turnId,
            isSkipStopPrompt,
            currentMessages,
            initialSilenceTimeout,
          );
        } catch (err) {
          console.error(
            '[IntakeChat] Failed to start Android speech recognition:',
            err,
          );
          isRecordingRef.current = false;
          setVoiceState('idle');
        }
      }
    },
    [
      armSilenceTimer,
      ensureIOSSpeechRecognition,
      getInitialSilenceTimeout,
      getSilenceTimeout,
      isVoiceTurnActive,
    ],
  );

  // Keep startListeningRef in sync
  useEffect(() => {
    startListeningRef.current = startListeningInternal;
  }, [startListeningInternal]);

  // ── Voice event handlers ───────────────────────────────────────────
  useEffect(() => {
    return subscribeToSpeechEvents({
      onSpeechPartialResults: (event: any) => {
        sttTrace(
          '[STT TRACE][Intake] partial event',
          JSON.stringify(event),
          `visible=${visible}`,
          `isRecordingRef=${isRecordingRef.current}`,
        );
        if (!visible || !isRecordingRef.current) {
          sttTrace('[STT TRACE][Intake] partial ignored');
          return;
        }
        const partial = event?.value?.[0] ?? '';
        if (partial && partial !== lastPartialTextRef.current) {
          lastPartialTextRef.current = partial;
          setInputText(partial);
          const turnId = voiceTurnIdRef.current;
          const silenceTimeout = isWelcomeListeningRef.current
            ? WELCOME_LISTEN_TIMEOUT_MS
            : getSilenceTimeout(isSkipStopListeningRef.current);
          armSilenceTimer(
            turnId,
            isSkipStopListeningRef.current,
            messagesRef.current,
            silenceTimeout,
          );
        }
      },
      onSpeechResults: (event: any) => {
        sttTrace(
          '[STT TRACE][Intake] final event',
          JSON.stringify(event),
          `visible=${visible}`,
          `isRecordingRef=${isRecordingRef.current}`,
        );
        if (!visible || !isRecordingRef.current) {
          sttTrace('[STT TRACE][Intake] final ignored');
          return;
        }
        const result = event?.value?.[0] ?? '';
        if (result) {
          lastPartialTextRef.current = result;
          setInputText(result);
          const silenceTimeout = isWelcomeListeningRef.current
            ? WELCOME_LISTEN_TIMEOUT_MS
            : getSilenceTimeout(isSkipStopListeningRef.current);
          armSilenceTimer(
            voiceTurnIdRef.current,
            isSkipStopListeningRef.current,
            messagesRef.current,
            silenceTimeout,
          );
        }
      },
      onSpeechError: (event: any) => {
        sttTrace(
          '[STT TRACE][Intake] error event',
          JSON.stringify(event),
          `visible=${visible}`,
          `isRecordingRef=${isRecordingRef.current}`,
        );
        if (!visible || !isRecordingRef.current) {
          sttTrace('[STT TRACE][Intake] error ignored');
          return;
        }
        isRecordingRef.current = false;
        setVoiceState('idle');
      },
    });
  }, [armSilenceTimer, getSilenceTimeout, visible]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleStop = async (currentMessages?: Message[]) => {
    await stopVoiceSession(true);
    const msgs = currentMessages ?? messagesRef.current;
    const finalTranscript = msgs
      .map(
        m =>
          `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${m.content}`,
      )
      .join('\n\n');

    await setItem(
      'intakeActiveStepIndex',
      activeStepIndexRef.current.toString(),
    );
    await setItem(
      'intakeStepStatuses',
      JSON.stringify(stepStatusesRef.current),
    );
    onComplete(finalTranscript);
  };

  const handleSkipWithMessages = async (currentMessages: Message[]) => {
    const newStatuses = [...stepStatusesRef.current];
    newStatuses[activeStepIndexRef.current] = 'skipped';
    setStepStatuses(newStatuses);

    const nextIndex = activeStepIndexRef.current + 1;

    if (nextIndex >= INTAKE_STEPS.length) {
      const finalTranscript = currentMessages
        .map(
          m =>
            `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${
              m.content
            }`,
        )
        .join('\n\n');
      await setItem('intakeActiveStepIndex', '0');
      await setItem('intakeStepStatuses', '[]');
      onComplete(finalTranscript);
    } else {
      setActiveStepIndex(nextIndex);
      await setItem('intakeActiveStepIndex', nextIndex.toString());
      await setItem('intakeStepStatuses', JSON.stringify(newStatuses));
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Skipping to next topic...\n\n${INTAKE_STEPS[nextIndex].assistantMessage}`,
        },
      ]);
    }
  };

  const handleSend = async (
    overrideText?: string,
    currentMessages?: Message[],
  ) => {
    const textToSend = overrideText ?? inputText;
    if (!textToSend.trim() || isTypingRef.current) return;

    const userMsg: Message = {role: 'user', content: textToSend.trim()};
    const baseMessages = currentMessages ?? messagesRef.current;
    const newTranscript = [...baseMessages, userMsg];
    setMessages(newTranscript);
    setInputText('');
    isManualInputRef.current = false; // message sent — no longer a manual draft
    setIsTyping(true);

    try {
      const stepIdx = activeStepIndexRef.current;
      const activeStep = INTAKE_STEPS[stepIdx];
      const targetStep = INTAKE_STEPS[stepIdx + 1] || null;

      const result = await fetchHelper(
        'intakeChat',
        {},
        {
          childName,
          activeStep,
          targetStep,
          transcript: newTranscript,
          existingAnswers: baseMessages
            .filter(m => m.role === 'user')
            .map(m => m.content),
        },
      );

      let nextIndex = stepIdx;
      let nextMsgContent = result.assistant_next_question;
      let newStatuses = [...stepStatusesRef.current];

      // Handle LLM-detected intent (skip/stop signals from the API)
      const detectedIntent = result.detected_intent ?? '';
      if (detectedIntent === 'stop') {
        await stopVoiceSession(true);
        const finalTranscript = newTranscript
          .map(
            m =>
              `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${
                m.content
              }`,
          )
          .join('\n\n');
        if (result.transition_message) {
          setMessages([
            ...newTranscript,
            {role: 'assistant', content: result.transition_message},
          ]);
        }
        await setItem('intakeActiveStepIndex', activeStepIndexRef.current.toString());
        await setItem('intakeStepStatuses', JSON.stringify(stepStatusesRef.current));
        onComplete(finalTranscript);
        return;
      }

      if (detectedIntent === 'skip') {
        // Treat as a user-initiated skip — advance step immediately
        await handleSkipWithMessages(newTranscript);
        return;
      }

      if (result.topic_complete) {
        newStatuses[stepIdx] = 'completed';
        setStepStatuses(newStatuses);
        await setItem('intakeStepStatuses', JSON.stringify(newStatuses));
        if (result.transition_message) {
          nextMsgContent = `${result.transition_message}\n\n${nextMsgContent}`;
        }
        nextIndex += 1;
      }

      if (nextIndex >= INTAKE_STEPS.length && result.topic_complete) {
        await stopVoiceSession(true);
        const finalTranscript = newTranscript
          .map(
            m =>
              `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${
                m.content
              }`,
          )
          .join('\n\n');
        await setItem('intakeActiveStepIndex', '0');
        await setItem('intakeStepStatuses', '[]');
        onComplete(finalTranscript);
      } else {
        setActiveStepIndex(nextIndex);
        if (result.topic_complete) {
          await setItem('intakeActiveStepIndex', nextIndex.toString());
        }
        const nextMsg: Message = {role: 'assistant', content: nextMsgContent};
        if (result.question_rationale) {
          nextMsg.rationale = result.question_rationale;
        }
        setMessages([...newTranscript, nextMsg]);
      }
    } catch {
      Alert.alert(
        'Error',
        'Something went wrong while chatting. Please try again.',
      );
      setMessages(baseMessages);
    } finally {
      setIsTyping(false);
      setVoiceState('idle');
    }
  };

  // Keep action refs in sync
  useEffect(() => {
    handleStopRef.current = handleStop;
  });
  useEffect(() => {
    handleSkipWithMessagesRef.current = handleSkipWithMessages;
  });
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  // ── Tap-to-skip action ─────────────────────────────────────────────────────
  const handleSkip = () => {
    stopVoiceSession();
    TTSService.stop?.();
    setVoiceState('idle');
    handleSkipWithMessages(messagesRef.current);
  };

  // ── Tap-to-stop action ─────────────────────────────────────────────────────
  const handleStopButton = () => {
    TTSService.stop?.();
    setVoiceState('idle');
    handleStop();
  };

  // ── Pause / Resume ─────────────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    stopVoiceSession();
    TTSService.stop?.();
    setVoiceState('idle');
    setIsPaused(true);
  }, [stopVoiceSession]);

  const handleResume = useCallback(() => {
    // Null out lastRead so the current question re-speaks automatically
    lastReadMessageRef.current = null;
    setIsPaused(false);
  }, []);

  // ── Repeat last question ───────────────────────────────────────────────────
  const handleRepeat = useCallback(
    (currentMessages?: Message[]) => {
      const msgs = currentMessages ?? messagesRef.current;
      const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
      if (!lastAssistant) return;

      stopVoiceSession();
      TTSService.stop?.();
      setVoiceState('idle');

      if (voiceModeEnabledRef.current && !isPausedRef.current) {
        // The stored message may contain a transition prefix joined with the
        // question (e.g. "Skipping to next topic...\n\nWhat is their name?").
        // Extract only the actual question — the last paragraph after "\n\n".
        const segments = lastAssistant.content.split('\n\n');
        const questionOnly = segments[segments.length - 1].trim();
        const repeatText = `Let's try that again. ${questionOnly}`;

        speakMessage(repeatText, () => {
          if (!voiceModeEnabledRef.current || isPausedRef.current) return;
          silenceRetryUsedRef.current = false; // repeat → treat as fresh turn
          startListeningRef.current?.(false, messagesRef.current);
        });
      }
    },
    [stopVoiceSession, speakMessage],
  );

  // ── beginChat – transitions from welcome → active ──────────────────────────
  const beginChat = useCallback(() => {
    stopVoiceSession();
    TTSService.stop?.();
    lastReadMessageRef.current = null; // Ensure first question is spoken
    const firstMsg = INTAKE_STEPS[0].assistantMessage;
    setMessages([{role: 'assistant', content: firstMsg}]);
    setChatPhase('active');
  }, [stopVoiceSession, INTAKE_STEPS]);

  // Keep new action refs in sync
  useEffect(() => {
    handleRepeatRef.current = handleRepeat;
  });
  useEffect(() => {
    beginChatRef.current = beginChat;
  });

  // ── Jump to step (progress bar tap) ───────────────────────────────────────
  const handleJumpToStep = async (targetIndex: number) => {
    if (isTyping) return;
    const status = stepStatusesRef.current[targetIndex];
    if (status !== 'completed' && status !== 'skipped') return;

    await stopVoiceSession();
    TTSService.stop?.();
    setVoiceState('idle');

    const step = INTAKE_STEPS[targetIndex];
    setActiveStepIndex(targetIndex);
    await setItem('intakeActiveStepIndex', targetIndex.toString());

    const updatedMessages: Message[] = [
      ...messagesRef.current,
      {role: 'assistant', content: `Going back to "${step.name}"...`},
    ];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      const targetStep = INTAKE_STEPS[targetIndex + 1] || null;
      const result = await fetchHelper(
        'intakeChat',
        {},
        {
          childName,
          activeStep: step,
          targetStep,
          transcript: updatedMessages,
          isRevisit: true,
          existingAnswers: messagesRef.current
            .filter(m => m.role === 'user')
            .map(m => m.content),
        },
      );
      setMessages(prev => [
        ...prev,
        {role: 'assistant', content: result.assistant_next_question},
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {role: 'assistant', content: step.assistantMessage},
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // ── Manual send (typed) ────────────────────────────────────────────────────
  const handleManualSend = () => {
    stopVoiceSession();
    TTSService.stop?.();
    setVoiceState('idle');
    handleSend();
  };

  // ── Toggle voice mode ──────────────────────────────────────────────────────
  const toggleVoiceMode = () => {
    if (isVoiceModeEnabled) {
      stopVoiceSession();
      TTSService.stop?.();
      setVoiceState('idle');
      setIsVoiceModeEnabled(false);
    } else {
      lastReadMessageRef.current = null; // Reset so current message gets re-read
      setIsVoiceModeEnabled(true);
    }
  };

  useEffect(() => {
    if (visible) {
      suspendWakeWordForIntake();
    }
  }, [suspendWakeWordForIntake, visible]);

  // ── Initialize chat when modal opens ──────────────────────────────────────
  useEffect(() => {
    if (visible && messagesRef.current.length === 0) {
      let savedIndex = parseInt(preferences.intakeActiveStepIndex || '0', 10);
      let savedStatuses: string[] = [];
      try {
        savedStatuses = JSON.parse(preferences.intakeStepStatuses || '[]');
      } catch {}

      if (savedIndex >= INTAKE_STEPS.length) {
        savedIndex = 0;
        savedStatuses = [];
      }

      setStepStatuses(savedStatuses);
      setActiveStepIndex(savedIndex);

      if (savedIndex === 0) {
        // Fresh start → show welcome screen first (no messages yet)
        setChatPhase('welcome');
      } else {
        // Resuming a saved session → skip welcome, jump straight in
        setChatPhase('active');
        setMessages([
          {role: 'assistant', content: INTAKE_STEPS[savedIndex].assistantMessage},
        ]);
      }
    } else if (!visible) {
      setMessages([]);
      setVoiceState('idle');
      setChatPhase('welcome');
      setIsPaused(false);
      stopVoiceSession(true);
      TTSService.stop?.();
      lastReadMessageRef.current = null;
    }
  }, [
    INTAKE_STEPS,
    childName,
    preferences.intakeActiveStepIndex,
    preferences.intakeStepStatuses,
    stopVoiceSession,
    visible,
  ]);

  // ── Welcome phase: auto-speak after 500ms ─────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (chatPhase !== 'welcome') return;
    if (!isVoiceModeEnabled) return;
    if (isPaused) return;

    const t = setTimeout(() => {
      if (
        !voiceModeEnabledRef.current ||
        chatPhaseRef.current !== 'welcome' ||
        isPausedRef.current
      )
        return;

      speakMessage(WELCOME_SCRIPT, () => {
        if (
          !voiceModeEnabledRef.current ||
          chatPhaseRef.current !== 'welcome' ||
          isPausedRef.current
        )
          return;
        // Listen for "I'm ready" / "begin" / "start"
        startListeningRef.current?.(false, []);
      });
    }, 500);

    return () => clearTimeout(t);
  }, [visible, chatPhase, isVoiceModeEnabled, isPaused, speakMessage]);

  // ── Auto-speak new assistant messages (active phase only) ─────────────────
  useEffect(() => {
    if (!isVoiceModeEnabled) return;
    if (isPaused) return;
    if (chatPhase !== 'active') return;
    if (messages.length === 0) return;
    if (voiceState === 'processing') return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return;
    if (lastMsg.content === lastReadMessageRef.current) return;

    lastReadMessageRef.current = lastMsg.content;

    const t = setTimeout(() => {
      if (!voiceModeEnabledRef.current || isPausedRef.current) return;
      const spokenText = lastMsg.rationale
        ? `${lastMsg.content} … ${lastMsg.rationale}`
        : lastMsg.content;
      speakMessage(spokenText, () => {
        if (!voiceModeEnabledRef.current || isPausedRef.current) return;
        // Snapshot messages at TTS completion time
        const currentMsgs = messagesRef.current;
        silenceRetryUsedRef.current = false; // fresh question → reset retry flag
        startListeningInternal(false, currentMsgs);
      });
    }, 300);

    return () => clearTimeout(t);
  }, [messages, isVoiceModeEnabled, voiceState, isPaused, chatPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopVoiceSession(true);
      TTSService.stop?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderMessage = ({item}: {item: Message}) => {
    const isAssistant = item.role === 'assistant';
    return (
      <View style={styles.messageWrapper}>
        <View
          style={[
            styles.messageBubble,
            isAssistant ? styles.assistantBubble : styles.userBubble,
          ]}>
          <Text
            style={[
              styles.messageText,
              isAssistant ? styles.assistantText : styles.userText,
            ]}>
            {item.content}
          </Text>
        </View>
        {isAssistant && item.rationale ? (
          <View style={styles.rationaleBadge}>
            <Text style={styles.rationaleIcon}>🔒</Text>
            <Text style={styles.rationaleText}>{item.rationale}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  // Border glow interpolations
  const glowOpacity = borderGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const glowScale = borderGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.004],
  });

  const voiceStatusLabel = (() => {
    if (!isVoiceModeEnabled) return null;
    switch (voiceState) {
      case 'speaking':
        return chatPhase === 'welcome' ? '🔊 Verbi is speaking…' : '🔊 Speaking…';
      case 'preparing':
        return null;
      case 'listening':
        return chatPhase === 'welcome'
          ? '🎙 Say "I\'m ready" or tap Begin…'
          : '🎙 Listening…';
      case 'processing':
        return '⏳ Processing…';
      case 'promptingSkipStop':
        return '🎙 Skip or stop?';
      default:
        return null;
    }
  })();
  const showVoiceStatusGif = isVoiceModeEnabled && voiceState === 'preparing';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, isTablet && styles.containerTablet]}>
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerLeftActions}>
                {/* Pause / Resume – always visible in both phases */}
                <TouchableOpacity
                  onPress={isPaused ? handleResume : handlePause}
                  style={[
                    styles.actionButton,
                    isPaused && styles.resumeButton,
                  ]}>
                  <Text
                    style={[
                      styles.actionText,
                      {color: isPaused ? '#fff' : '#1565C0'},
                    ]}>
                    {isPaused ? '▶ Resume' : '⏸ Pause'}
                  </Text>
                </TouchableOpacity>

                {/* Stop / Skip / Repeat – active phase only */}
                {chatPhase === 'active' && (
                  <>
                    <TouchableOpacity
                      onPress={handleStopButton}
                      style={styles.actionButton}>
                      <Text style={[styles.actionText, {color: '#E53935'}]}>
                        Stop
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSkip}
                      style={styles.actionButton}>
                      <Text style={[styles.actionText, {color: '#FF9800'}]}>
                        Skip
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRepeat()}
                      style={styles.actionButton}>
                      <Text style={[styles.actionText, {color: '#6A1B9A'}]}>
                        🔁 Repeat
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <Text style={styles.title}>
                {chatPhase === 'welcome'
                  ? 'Welcome'
                  : `${activeStepIndex + 1}/${INTAKE_STEPS.length}`}
              </Text>

              <View style={styles.headerRightActions}>
                <TouchableOpacity
                  onPress={toggleVoiceMode}
                  style={[
                    styles.voiceToggleBtn,
                    isVoiceModeEnabled && styles.voiceToggleBtnActive,
                  ]}>
                  <Text style={styles.voiceToggleText}>
                    {isVoiceModeEnabled ? '🎤 Voice On' : '🎤 Voice Off'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Progress pills – active phase only */}
            {chatPhase === 'active' && (
              <View style={styles.progressBarContainer}>
                {INTAKE_STEPS.map((step, index) => {
                  let bgColor = '#e1e1e1';
                  const status = stepStatuses[index];
                  if (status === 'completed') {
                    bgColor = '#4CAF50';
                  } else if (status === 'skipped') {
                    bgColor = '#FF9800';
                  } else if (index === activeStepIndex) {
                    bgColor = '#8E24AA';
                  }
                  const isColored =
                    status === 'completed' ||
                    status === 'skipped' ||
                    index === activeStepIndex;
                  const isTappable =
                    status === 'completed' || status === 'skipped';
                  const pill = (
                    <View
                      style={[
                        styles.progressPill,
                        {backgroundColor: bgColor},
                      ]}>
                      <Text
                        style={[
                          styles.progressPillText,
                          {color: isColored ? '#fff' : '#999'},
                        ]}
                        numberOfLines={1}>
                        {step.name}
                      </Text>
                    </View>
                  );
                  return isTappable ? (
                    <TouchableOpacity
                      key={index}
                      style={styles.progressPillWrapper}
                      onPress={() => handleJumpToStep(index)}
                      activeOpacity={0.75}>
                      {pill}
                    </TouchableOpacity>
                  ) : (
                    <View key={index} style={styles.progressPillWrapper}>
                      {pill}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Paused banner */}
            {isPaused && (
              <View style={styles.pausedBanner}>
                <Text style={styles.pausedBannerText}>
                  ⏸ Paused — tap Resume when you're ready to continue
                </Text>
              </View>
            )}

            {/* Voice status indicator */}
            {!isPaused &&
              (showVoiceStatusGif ? (
                <View style={styles.voiceStatusRow}>
                  <FastImage
                    source={require('../../assets/movie/output.gif')}
                    style={styles.voiceStatusGif}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                </View>
              ) : voiceStatusLabel ? (
                <View style={styles.voiceStatusRow}>
                  <Text style={styles.voiceStatusText}>{voiceStatusLabel}</Text>
                </View>
              ) : null)}
          </View>

          {/* ── Welcome screen ───────────────────────────────────────────────── */}
          {chatPhase === 'welcome' ? (
            <View style={styles.welcomeContent}>
              <ScrollView
                style={styles.welcomeScrollView}
                contentContainerStyle={styles.welcomeScrollContent}
                showsVerticalScrollIndicator={false}>
                {/* Verbi avatar / name badge */}
                <View style={styles.verbiNameBadge}>
                  <Text style={styles.verbiNameText}>✨ Verbi</Text>
                </View>
                <Text style={styles.welcomeText}>{WELCOME_SCRIPT}</Text>
              </ScrollView>

              <TouchableOpacity
                style={styles.beginButton}
                onPress={beginChat}
                activeOpacity={0.85}>
                <Text style={styles.beginButtonText}>Begin</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── Message list ──────────────────────────────────────────────── */}
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(_, idx) => idx.toString()}
                renderItem={renderMessage}
                contentContainerStyle={styles.chatContainer}
                style={styles.flatList}
                onContentSizeChange={() =>
                  flatListRef.current?.scrollToEnd({animated: true})
                }
                onLayout={() =>
                  flatListRef.current?.scrollToEnd({animated: true})
                }
              />

              {/* ── Input area ────────────────────────────────────────────────── */}
              <View style={styles.inputArea}>
                <TextInput
                  disableFullscreenUI
                  style={styles.input}
                  value={inputText}
                  onChangeText={text => {
                    setInputText(text);
                    // Mark as manual input so the silence timer is suppressed
                    // and turn transitions don't wipe the text.
                    isManualInputRef.current = text.length > 0;
                  }}
                  placeholder={
                    isVoiceModeEnabled && voiceState === 'listening'
                      ? 'Speak now…'
                      : 'Type your response…'
                  }
                  placeholderTextColor="#999"
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (!inputText.trim() || isTyping) && styles.sendButtonDisabled,
                  ]}
                  onPress={handleManualSend}
                  disabled={!inputText.trim() || isTyping}>
                  {isTyping ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.sendText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* ── Animated glowing border ─────────────────────────────────────── */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowBorder,
            isTablet && styles.glowBorderTablet,
            {opacity: glowOpacity, transform: [{scale: glowScale}]},
          ]}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Glowing border
  glowBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 5,
    borderColor: '#CE93D8',
    shadowColor: '#8E24AA',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 30,
    zIndex: 999,
  },
  glowBorderTablet: {
    top: '10%',
    left: '10%',
    right: '10%',
    bottom: '10%',
    borderRadius: 24,
  },

  // Modal container
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
    flexDirection: 'column',
  },
  containerTablet: {
    width: '80%',
    height: '80%',
    borderRadius: 20,
    overflow: 'hidden',
  },

  // Header
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'column',
    gap: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeftActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  headerRightActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  resumeButton: {
    backgroundColor: '#1565C0',
  },
  actionText: {
    fontWeight: '700',
    fontSize: 14,
  },

  // Paused banner
  pausedBanner: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#90CAF9',
    alignItems: 'center',
  },
  pausedBannerText: {
    color: '#1565C0',
    fontWeight: '600',
    fontSize: 13,
  },

  // Voice mode toggle
  voiceToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  voiceToggleBtnActive: {
    backgroundColor: '#F3E5F5',
    borderColor: '#8E24AA',
  },
  voiceToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E24AA',
  },

  // Progress bar
  progressBarContainer: {
    flexDirection: 'row',
    gap: 5,
    width: '100%',
  },
  progressPillWrapper: {
    flex: 1,
    height: height * 0.05,
  },
  progressPill: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPillText: {
    fontSize: height * 0.015,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeText: {
    fontSize: 24,
    color: '#999',
  },

  // Voice status label
  voiceStatusRow: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  voiceStatusGif: {
    width: height * 0.06,
    height: height * 0.04,
  },
  voiceStatusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E24AA',
    letterSpacing: 0.3,
  },

  // Welcome screen
  welcomeContent: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 8,
  },
  welcomeScrollView: {
    flex: 1,
  },
  welcomeScrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  verbiNameBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3E5F5',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#CE93D8',
  },
  verbiNameText: {
    color: '#6A1B9A',
    fontWeight: '700',
    fontSize: 15,
  },
  welcomeText: {
    fontSize: 16,
    lineHeight: 26,
    color: '#333',
    letterSpacing: 0.1,
  },
  beginButton: {
    backgroundColor: '#8E24AA',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#6A1B9A',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  beginButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },

  // Chat
  chatContainer: {
    padding: 20,
    paddingBottom: 130,
    gap: 12,
    flexGrow: 1,
  },
  flatList: {
    flex: 1,
  },
  messageWrapper: {
    flexDirection: 'column',
    gap: 4,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 16,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#8E24AA',
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  assistantText: {
    color: '#333',
  },
  userText: {
    color: '#fff',
  },
  rationaleBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    backgroundColor: '#EDE7F6',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: '85%',
    gap: 6,
  },
  rationaleIcon: {
    fontSize: 12,
    lineHeight: 18,
  },
  rationaleText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5E35B1',
    flex: 1,
    fontStyle: 'italic',
  },

  // Input area
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'flex-end',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 48,
    maxHeight: 120,
    fontSize: 16,
    color: '#333',
  },
  sendButton: {
    backgroundColor: '#8E24AA',
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default IntakeChatModal;
