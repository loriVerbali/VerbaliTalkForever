import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  PermissionsAndroid,
} from 'react-native';
import { useAdmin } from '../../contexts/adminContext';
import { useAppSettings } from '../../utils/persistance';
import fetchHelper from '../../utils/fetcher';
import TTSService from '../../utils/TTSService';
import WakeWordService from '../../utils/wakewordService';

import Voice, {
  startSpeechRecognition,
  stopSpeechRecognition,
  subscribeToSpeechEvents,
} from '../../utils/STTService';

const { height } = Dimensions.get('window');

const STT_DEBUG = false;
const SILENCE_TIMEOUT_MS = 2000;
const SKIP_STOP_PROMPT = 'Do you want to skip, or stop?';

const sttTrace = (...args: unknown[]) => {
  if (STT_DEBUG) {
    console.log(...args);
  }
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface Step {
  name: string;
  requirements: string;
  assistantMessage: string;
}

type VoiceState =
  | 'idle'
  | 'speaking'           // TTS is reading a question
  | 'listening'          // Mic is open for user's answer
  | 'processing'         // Sending user speech to API
  | 'promptingSkipStop'; // TTS asking "skip or stop?", then mic open again

// ─── Steps ──────────────────────────────────────────────────────────────────

const getIntakeSteps = (childName: string): Step[] => {
  const hasName = childName && childName.toLowerCase() !== 'your child';
  const nameDisplay = hasName ? childName : 'your child';
  const possessiveName = hasName ? `${childName}'s` : 'their';

  return [
    {
      name: 'Child Basic Info',
      requirements: hasName ? 'age' : 'name and age',
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
      name: 'Family outside the home',
      requirements: 'if they live close or far, city/state/country if far',
      assistantMessage:
        'What about family outside the home? Do they live close or far? If they live far, what city, state, or country are they in?',
    },
    {
      name: 'Therapists',
      requirements: 'name, role, where therapy happens',
      assistantMessage: `Does ${nameDisplay} work with any therapists? Please share their names, roles, and where therapy happens.`,
    },
    {
      name: 'School',
      requirements: 'school name, teachers names, teachers roles',
      assistantMessage:
        "How about school? Do they attend any school or program? What are the teachers' names and roles?",
    },
    {
      name: 'Routines',
      requirements:
        'routine steps, foods, drinks, people, places, objects, shows, songs, books',
      assistantMessage: `Lastly, let's talk about routines. What does a typical day look like? Feel free to mention ${possessiveName} favorite foods, drinks, places, shows, songs, or books.`,
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
  const { isTablet } = useAdmin();
  const { preferences, setItem } = useAppSettings();

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);

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
  const shouldResumeWakeWordRef = useRef(false);
  const lastPartialTextRef = useRef('');
  const lastReadMessageRef = useRef<string | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeStepIndexRef.current = activeStepIndex; }, [activeStepIndex]);
  useEffect(() => { stepStatusesRef.current = stepStatuses; }, [stepStatuses]);
  useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);
  useEffect(() => { voiceModeEnabledRef.current = isVoiceModeEnabled; }, [isVoiceModeEnabled]);

  // ── Animated border glow ───────────────────────────────────────────────────
  const borderGlowAnim = useRef(new Animated.Value(0)).current;
  const borderGlowLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startBorderGlow = useCallback(() => {
    borderGlowLoop.current?.stop();
    borderGlowAnim.setValue(0);
    borderGlowLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(borderGlowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(borderGlowAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    borderGlowLoop.current.start();
  }, [borderGlowAnim]);

  const stopBorderGlow = useCallback(() => {
    borderGlowLoop.current?.stop();
    borderGlowLoop.current = null;
    Animated.timing(borderGlowAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // Low-level timer helpers ────────────────────────────────────────────────
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const suspendWakeWordForIntake = useCallback(async () => {
    const wakeWordService = WakeWordService.getInstance();
    if (wakeWordService.isCurrentlyListening()) {
      shouldResumeWakeWordRef.current = true;
    }

    try {
      await wakeWordService.pauseDetection(true);
    } catch (error) {
      console.warn('Failed to suspend wakeword detection for intake:', error);
    }
  }, []);

  // End the current service-owned STT session before TTS or wake-word resumes.
  const stopVoiceSession = useCallback(async (resumeWakeWord = false) => {
    clearSilenceTimer();
    isRecordingRef.current = false;
    isSkipStopListeningRef.current = false;

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
        await WakeWordService.getInstance().startListening();
      } catch (error) {
        console.warn('Failed to restart wakeword detection:', error);
      }
    }
  }, []);

  // ── handleSend (defined early as a ref so silence handler can call it) ─────
  // We use a ref pattern so the silence callback doesn't need it in deps
  const handleSendRef = useRef<
    (overrideText?: string, currentMessages?: Message[]) => Promise<void>
  >(undefined);

  // ── handleStop (ref pattern) ───────────────────────────────────────────────
  const handleStopRef = useRef<
    (currentMessages?: Message[]) => Promise<void>
  >(undefined);

  // ── handleSkipWithMessages (ref pattern) ──────────────────────────────────
  const handleSkipWithMessagesRef = useRef<
    (currentMessages: Message[]) => Promise<void>
  >(undefined);

  // ── startListeningInternal (ref, to avoid mutual recursion with handleSilenceTimeout) ──
  const startListeningRef = useRef<
    (isSkipStop: boolean, currentMessages: Message[]) => Promise<void>
  >(undefined);

  const ensureIOSSpeechRecognition = useCallback(async () => {
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

    await startSpeechRecognition('en-US', {
      EXTRA_PARTIAL_RESULTS: true,
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
    });
  }, []);

  // ── TTS speaker ────────────────────────────────────────────────────────────
  const speakMessage = useCallback(async (text: string, onDone?: () => void) => {
    if (!voiceModeEnabledRef.current) { onDone?.(); return; }

    await suspendWakeWordForIntake();

    setVoiceState('speaking');
    if (Platform.OS === 'ios') {
      try {
        // Stop the STT mic before TTS so it doesn't pick up the speaker audio.
        await stopSpeechRecognition();
      } catch (error) {
        console.warn('[IntakeChat] Failed to stop STT before TTS:', error);
      }
    }
    TTSService.speak(text, true, () => {
      onDone?.();
    });
  }, [suspendWakeWordForIntake]);

  // ── Silence timeout handler ────────────────────────────────────────────────
  // Called when 2s of silence detected. Uses refs for all callbacks.
  const handleSilenceTimeout = useCallback(async (
    capturedText: string,
    isSkipStopPrompt: boolean,
    currentMessages: Message[],
  ) => {
    await stopVoiceSession();
    const trimmed = capturedText.trim();

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
      // First empty silence: ask "skip or stop?"
      setVoiceState('promptingSkipStop');
      speakMessage(SKIP_STOP_PROMPT, () => {
        if (!voiceModeEnabledRef.current) return;
        startListeningRef.current?.(true, currentMessages);
      });
      return;
    }

    // Voice commands
    const lower = trimmed.toLowerCase().replace(/[.,!?]$/, '');
    if (lower === 'skip') {
      setVoiceState('idle');
      handleSkipWithMessagesRef.current?.(currentMessages);
      return;
    }
    if (lower === 'stop') {
      setVoiceState('idle');
      handleStopRef.current?.(currentMessages);
      return;
    }

    // Normal answer: submit
    setInputText('');
    setVoiceState('processing');
    handleSendRef.current?.(trimmed, currentMessages);
  }, [stopVoiceSession, speakMessage]);

  // ── startListeningInternal ─────────────────────────────────────────────────
  const startListeningInternal = useCallback(async (
    isSkipStopPrompt: boolean,
    currentMessages: Message[],
  ) => {
    if (!voiceModeEnabledRef.current) return;

    isSkipStopListeningRef.current = isSkipStopPrompt;
    lastPartialTextRef.current = '';
    setInputText('');
    isRecordingRef.current = true;
    setVoiceState('listening');

    const onSilence = () => {
      const captured = lastPartialTextRef.current;
      handleSilenceTimeout(captured, isSkipStopPrompt, currentMessages);
    };

    if (Platform.OS === 'ios') {
      try {
        // Give TTS playback time to release the audio route before starting STT.
        await new Promise<void>(resolve => setTimeout(resolve, 600));
        await ensureIOSSpeechRecognition();
        silenceTimerRef.current = setTimeout(onSilence, SILENCE_TIMEOUT_MS);
      } catch (err) {
        console.error('[IntakeChat] Failed to start iOS speech recognition:', err);
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
        if (Voice) {
          await Voice.start('en-US', {
            EXTRA_PARTIAL_RESULTS: true,
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
            EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
          });
        }
        // Fallback silence guard
        silenceTimerRef.current = setTimeout(onSilence, SILENCE_TIMEOUT_MS);
      } catch (err) {
        console.error('[IntakeChat] Failed to start Android speech recognition:', err);
        isRecordingRef.current = false;
        setVoiceState('idle');
      }
    }
  }, [ensureIOSSpeechRecognition, handleSilenceTimeout]);

  // Keep startListeningRef in sync
  useEffect(() => { startListeningRef.current = startListeningInternal; }, [startListeningInternal]);

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
          clearSilenceTimer();
          silenceTimerRef.current = setTimeout(async () => {
            const captured = lastPartialTextRef.current;
            const isSkipStop = isSkipStopListeningRef.current;
            const currentMsgs = messagesRef.current;
            await handleSilenceTimeout(captured, isSkipStop, currentMsgs);
          }, SILENCE_TIMEOUT_MS);
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
  }, [handleSilenceTimeout, visible]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleStop = async (currentMessages?: Message[]) => {
    await stopVoiceSession(true);
    const msgs = currentMessages ?? messagesRef.current;
    const finalTranscript = msgs
      .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${m.content}`)
      .join('\\n\\n');

    await setItem('intakeActiveStepIndex', activeStepIndexRef.current.toString());
    await setItem('intakeStepStatuses', JSON.stringify(stepStatusesRef.current));
    onComplete(finalTranscript);
  };

  const handleSkipWithMessages = async (currentMessages: Message[]) => {
    const newStatuses = [...stepStatusesRef.current];
    newStatuses[activeStepIndexRef.current] = 'skipped';
    setStepStatuses(newStatuses);

    const nextIndex = activeStepIndexRef.current + 1;

    if (nextIndex >= INTAKE_STEPS.length) {
      const finalTranscript = currentMessages
        .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${m.content}`)
        .join('\\n\\n');
      await setItem('intakeActiveStepIndex', '0');
      await setItem('intakeStepStatuses', '[]');
      onComplete(finalTranscript);
    } else {
      setActiveStepIndex(nextIndex);
      await setItem('intakeActiveStepIndex', nextIndex.toString());
      await setItem('intakeStepStatuses', JSON.stringify(newStatuses));
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Skipping to next topic...\n\n${INTAKE_STEPS[nextIndex].assistantMessage}` },
      ]);
    }
  };

  const handleSend = async (overrideText?: string, currentMessages?: Message[]) => {
    const textToSend = overrideText ?? inputText;
    if (!textToSend.trim() || isTypingRef.current) return;

    const userMsg: Message = { role: 'user', content: textToSend.trim() };
    const baseMessages = currentMessages ?? messagesRef.current;
    const newTranscript = [...baseMessages, userMsg];
    setMessages(newTranscript);
    setInputText('');
    setIsTyping(true);

    try {
      const stepIdx = activeStepIndexRef.current;
      const activeStep = INTAKE_STEPS[stepIdx];
      const targetStep = INTAKE_STEPS[stepIdx + 1] || null;

      const result = await fetchHelper('intakeChat', {}, {
        childName,
        activeStep,
        targetStep,
        transcript: newTranscript,
        existingAnswers: baseMessages.filter(m => m.role === 'user').map(m => m.content),
      });

      let nextIndex = stepIdx;
      let nextMsgContent = result.assistant_next_question;
      let newStatuses = [...stepStatusesRef.current];

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
          .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${m.content}`)
          .join('\\n\\n');
        await setItem('intakeActiveStepIndex', '0');
        await setItem('intakeStepStatuses', '[]');
        onComplete(finalTranscript);
      } else {
        setActiveStepIndex(nextIndex);
        if (result.topic_complete) {
          await setItem('intakeActiveStepIndex', nextIndex.toString());
        }
        setMessages([...newTranscript, { role: 'assistant', content: nextMsgContent }]);
      }
    } catch {
      Alert.alert('Error', 'Something went wrong while chatting. Please try again.');
      setMessages(baseMessages);
    } finally {
      setIsTyping(false);
      setVoiceState('idle');
    }
  };

  // Keep action refs in sync
  useEffect(() => { handleStopRef.current = handleStop; });
  useEffect(() => { handleSkipWithMessagesRef.current = handleSkipWithMessages; });
  useEffect(() => { handleSendRef.current = handleSend; });

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
      { role: 'assistant', content: `Going back to "${step.name}"...` },
    ];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      const targetStep = INTAKE_STEPS[targetIndex + 1] || null;
      const result = await fetchHelper('intakeChat', {}, {
        childName,
        activeStep: step,
        targetStep,
        transcript: updatedMessages,
        isRevisit: true,
        existingAnswers: messagesRef.current.filter(m => m.role === 'user').map(m => m.content),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: result.assistant_next_question }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: step.assistantMessage }]);
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
      try { savedStatuses = JSON.parse(preferences.intakeStepStatuses || '[]'); } catch {}

      if (savedIndex >= INTAKE_STEPS.length) { savedIndex = 0; savedStatuses = []; }

      setStepStatuses(savedStatuses);
      setActiveStepIndex(savedIndex);

      const nameDisplay =
        childName && childName.toLowerCase() !== 'your child' ? childName : 'your child';
      const startMsg =
        savedIndex === 0
          ? `We'll keep this simple. Start with ${nameDisplay}, then I'll guide you one small step at a time.\n\n${INTAKE_STEPS[0].assistantMessage}`
          : INTAKE_STEPS[savedIndex].assistantMessage;

      setMessages([{ role: 'assistant', content: startMsg }]);
    } else if (!visible) {
      setMessages([]);
      setVoiceState('idle');
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

  // ── Auto-speak new assistant messages ─────────────────────────────────────
  useEffect(() => {
    if (!isVoiceModeEnabled) return;
    if (messages.length === 0) return;
    if (voiceState === 'processing') return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return;
    if (lastMsg.content === lastReadMessageRef.current) return;

    lastReadMessageRef.current = lastMsg.content;

    const t = setTimeout(() => {
      if (!voiceModeEnabledRef.current) return;
      speakMessage(lastMsg.content, () => {
        if (!voiceModeEnabledRef.current) return;
        // Snapshot messages at TTS completion time
        const currentMsgs = messagesRef.current;
        startListeningInternal(false, currentMsgs);
      });
    }, 300);

    return () => clearTimeout(t);
  }, [messages, isVoiceModeEnabled, voiceState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopVoiceSession(true);
      TTSService.stop?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => {
    const isAssistant = item.role === 'assistant';
    return (
      <View style={[styles.messageBubble, isAssistant ? styles.assistantBubble : styles.userBubble]}>
        <Text style={[styles.messageText, isAssistant ? styles.assistantText : styles.userText]}>
          {item.content}
        </Text>
      </View>
    );
  };

  // Border glow interpolations
  const glowOpacity = borderGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const glowScale = borderGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.004] });

  const voiceStatusLabel = (() => {
    if (!isVoiceModeEnabled) return null;
    switch (voiceState) {
      case 'speaking': return '🔊 Speaking…';
      case 'listening': return '🎙 Listening…';
      case 'processing': return '⏳ Processing…';
      case 'promptingSkipStop': return '🎙 Skip or stop?';
      default: return null;
    }
  })();

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
                <TouchableOpacity onPress={handleStopButton} style={styles.actionButton}>
                  <Text style={[styles.actionText, { color: '#E53935' }]}>Stop</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkip} style={styles.actionButton}>
                  <Text style={[styles.actionText, { color: '#FF9800' }]}>Skip</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.title}>{activeStepIndex + 1}/6</Text>

              <View style={styles.headerRightActions}>
                <TouchableOpacity
                  onPress={toggleVoiceMode}
                  style={[styles.voiceToggleBtn, isVoiceModeEnabled && styles.voiceToggleBtnActive]}>
                  <Text style={styles.voiceToggleText}>
                    {isVoiceModeEnabled ? '🎤 Voice On' : '🎤 Voice Off'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Progress pills */}
            <View style={styles.progressBarContainer}>
              {INTAKE_STEPS.map((step, index) => {
                let bgColor = '#e1e1e1';
                const status = stepStatuses[index];
                if (status === 'completed') { bgColor = '#4CAF50'; }
                else if (status === 'skipped') { bgColor = '#FF9800'; }
                else if (index === activeStepIndex) { bgColor = '#8E24AA'; }
                const isColored = status === 'completed' || status === 'skipped' || index === activeStepIndex;
                const isTappable = status === 'completed' || status === 'skipped';
                const pill = (
                  <View style={[styles.progressPill, { backgroundColor: bgColor }]}>
                    <Text
                      style={[styles.progressPillText, { color: isColored ? '#fff' : '#999' }]}
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
                  <View key={index} style={styles.progressPillWrapper}>{pill}</View>
                );
              })}
            </View>

            {/* Voice status indicator */}
            {voiceStatusLabel ? (
              <View style={styles.voiceStatusRow}>
                <Text style={styles.voiceStatusText}>{voiceStatusLabel}</Text>
              </View>
            ) : null}
          </View>

          {/* ── Message list ─────────────────────────────────────────────────── */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, idx) => idx.toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatContainer}
            style={styles.flatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />

          {/* ── Input area ───────────────────────────────────────────────────── */}
          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
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
              style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
              onPress={handleManualSend}
              disabled={!inputText.trim() || isTyping}>
              {isTyping ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Animated glowing border ─────────────────────────────────────── */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowBorder,
            isTablet && styles.glowBorderTablet,
            { opacity: glowOpacity, transform: [{ scale: glowScale }] },
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
    shadowOffset: { width: 0, height: 0 },
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
  actionText: {
    fontWeight: '700',
    fontSize: 14,
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
  voiceStatusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E24AA',
    letterSpacing: 0.3,
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
