import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  Animated,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, RouteProp} from '@react-navigation/native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

import Inputs, {InputsRef} from '../Components/Inputs';
import ImageGallery from '../Components/ImageGallery';
import MatalkIcon from '../Components/MatalkIcon';
import {useAssistant} from '../contexts/AssistantContext';
import {
  useChatContext,
  getContextualInfo,
} from '../contexts/ChatContextProvider';
import TTSService from '../utils/TTSService';
import FastImage from 'react-native-fast-image';
import HomeButton from '../Components/HomeButton';
import mixpanel from '../utils/mixpanelInstance';
import {logConversation} from '../utils/conversationLogger';
import {useAdmin} from '../contexts/adminContext';
import {views} from '../utils/constants';
import {useAppSettings} from '../utils/persistance';
import WakeWordService from '../utils/wakewordService';
import Voice, {
  logSpeechDiagnostics,
  releaseMicrophone,
  startSpeechRecognition,
  stopSpeechRecognition,
  subscribeToSpeechEvents,
} from '../utils/STTService';
import {useDatabase} from '../contexts/DatabaseContext';
import {iepCapture} from '../features/iep/capture/iepCapture';
import {
  personalMemoryService,
  makeMemoryEventId,
} from '../services/PersonalMemoryService';

type RootStackParamList = {
  Home: {
    stateof?: 'Attention' | 'Keyboard' | string;
    wakewordPaused?: boolean;
    recordingPermissionsReady?: boolean;
  };
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  route?: HomeScreenRouteProp;
}
const DEBUGWITHOUTTRANSCRIPTION = false;
const STT_DEBUG = false;
const TRANSCRIPTIONERRORMESSAGE = "Verbi couldn't hear you. Tap Home to retry.";
const ISSUEMESSAGE = 'I am having an issue, Tap Home to retry';
const DEBUGTRANSCRIPTION = 'how are you feeling after that walk?';

const sttTrace = (...args: unknown[]) => {
  if (STT_DEBUG) {
    console.log(...args);
  }
};

const sttWarn = (...args: unknown[]) => {
  if (STT_DEBUG) {
    console.warn(...args);
  }
};

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {width: viewportWidth, height: viewportHeight} = useWindowDimensions();
  // Read live rather than captured at module load: on Android the size seeded
  // at startup can still be the pre-rotation (portrait) one, and a release
  // bundle evaluates this file before the corrected size arrives.
  const width = viewportWidth;
  const height = viewportHeight;
  const {
    generateAnswers,
    prefillAnswers,
    refreshLocalLlm,
    conversationHistory,
    addToConversationHistory,
    updateLastAssistantMessage,
    localLlm,
  } = useAssistant();
  const {weather, location} = useChatContext();
  const {isTablet} = useAdmin();
  const shortSide = Math.min(viewportWidth, viewportHeight);
  const recordingContainerSize = Math.min(
    shortSide * (isTablet ? 0.5 : 0.72),
    isTablet ? 420 : 280,
  );
  const insets = useSafeAreaInsets();
  const {getItem, preferences} = useAppSettings();
  const {addUtterance, addAIResponseTime, addAIResolved} = useDatabase();
  const stateof = route?.params?.stateof ?? '';
  const wakewordPaused = route?.params?.wakewordPaused === true;
  const recordingPermissionsReady =
    route?.params?.recordingPermissionsReady === true;
  const [isRecording, setIsRecording] = useState(false);
  const recordingGlowAnim = useRef(new Animated.Value(0)).current;
  const recordingGlowLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Function to resolve pepes images for answer words
  const resolvePepesImage = async (word: string, fallbackUrl: string = '') => {
    try {
      const pepesData = await getItem('pepes');
      if (!pepesData) return fallbackUrl;

      const parsed = JSON.parse(pepesData);
      const allCategories = [
        'People',
        'Medicine',
        'Pets',
        'TVShows',
        'Food',
        'Drinks',
        'Places',
      ];

      for (const category of allCategories) {
        const items = parsed[category] || [];
        for (const item of items) {
          // Check if word matches name or any alias
          const nameMatch = item.name?.toLowerCase() === word.toLowerCase();
          const aliasMatch = item.aliases?.some(
            (alias: string) => alias.toLowerCase() === word.toLowerCase(),
          );

          if ((nameMatch || aliasMatch) && item.imageUri) {
            return item.imageUri;
          }
        }
      }
    } catch (error) {}

    return fallbackUrl || '';
  };

  // Function to log word selection to database
  const logWordSelection = async (word: string, source: 'Home' | 'Convo') => {
    try {
      await addUtterance({
        word: word.trim(),
        dateof: new Date(),
        source: source,
      });
    } catch (error) {
      // Fail silently as requested
    }
  };

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const [gobackAfterSelection, setGobackAfterSelection] = useState(true);
  const [waitingForNextConversation, setWaitingForNextConversation] =
    useState(false);
  const [directAnswers, setDirectAnswers] = useState<
    Array<{word: string; imageUrl?: string}>
  >([]);
  const [accumulatedPriors, setAccumulatedPriors] = useState<string[]>([]);

  // AI Resolved tracking state
  const [currentAIRecord, setCurrentAIRecord] = useState<{
    question: string;
    round1Answers: string[];
    round1Picked?: string;
    round2Answers?: string[];
    round2Picked?: string;
    round3Answers?: string[];
    round3Picked?: string;
    currentRound: number;
  } | null>(null);

  // Responsive values based on device type
  const responsiveValues = {
    // Icon sizes
    microphoneSize: isTablet
      ? {width: 45, height: 45}
      : {width: 35, height: 35},
    fetchingSize: isTablet
      ? {width: 200, height: 200}
      : {
          width: Math.min(shortSide * 0.32, 120),
          height: Math.min(shortSide * 0.32, 120),
        },
    matalkIconSize: isTablet ? undefined : {transform: [{scale: 0.8}]},

    // Layout dimensions
    inputNavigationHeight: isTablet ? height * 0.11 : height * 0.1,
    contentMarginTop: isTablet ? 10 : 8,
    contentPadding: isTablet ? 20 : 15,

    // Microphone button positioning
    microphoneButtonTop: isTablet ? height * 0.04 : height * 0.035,
    microphoneButtonLeft: isTablet ? width * 0.03 : width * 0.025,
    microphoneButtonSize: isTablet ? width * 0.05 : width * 0.04,

    // Keyboard input dimensions
    keyboardIconSize: isTablet
      ? {width: width * 0.3, height: width * 0.3}
      : {width: width * 0.25, height: width * 0.25},
    recordingIconSize: isTablet
      ? {width: shortSide * 0.4, height: shortSide * 0.4}
      : {
          width: Math.min(shortSide * 0.46, 170),
          height: Math.min(shortSide * 0.28, 104),
        },

    // Typography
    transcriptionFontSize: isTablet ? 22 : 18,
    retryFontSize: isTablet ? 18 : 16,
    keyboardTypingFontSize: isTablet ? 20 : 18,
    buttonFontSize: isTablet ? 18 : 16,
    errorFontSize: isTablet ? 20 : 18,
    cardTextFontSize: isTablet ? 18 : 16,

    // Button dimensions
    keyboardButtonPadding: isTablet
      ? {vertical: 14, horizontal: 35}
      : {vertical: 12, horizontal: 30},
    keyboardButtonMinWidth: isTablet ? 120 : 100,
    keyboardButtonBorderRadius: isTablet ? 28 : 25,

    // Spacing
    contentWidth: isTablet ? width * 0.9 : width * 0.95,
    contentPaddingBottom: isTablet ? 20 : 15,
    keyboardInputPadding: isTablet ? 25 : 20,
    typingDisplayPadding: isTablet ? 25 : 20,
    typingDisplayMinHeight: isTablet ? 70 : 60,

    // Navigation cards
    navigationCardWidth: isTablet ? width * 0.4 : width * 0.42,
    navigationCardMinHeight: isTablet ? 140 : 120,
    navigationCardBorderRadius: isTablet ? 15 : 12,
    navigationCardPadding: isTablet ? 18 : 15,
    navigationCardImageSize: isTablet
      ? {width: 70, height: 70}
      : {width: 60, height: 60},
    navigationCardImageBorderRadius: isTablet ? 35 : 30,
    navigationCardImageIconSize: isTablet
      ? {width: 50, height: 50}
      : {width: 40, height: 40},

    // Shadow and elevation
    shadowRadius: isTablet ? 5 : 3,
    shadowOffset: isTablet ? {width: 0, height: 3} : {width: 0, height: 2},
    elevation: isTablet ? 6 : 4,

    // Waiting for next conversation
    waitingContainerPadding: isTablet ? 30 : 20,
    waitingLabelMarginBottom: isTablet ? 30 : 20,
  };

  // Add context caching to improve performance
  const [cachedContextInfo, setCachedContextInfo] = useState<string>('');
  const [lastContextUpdate, setLastContextUpdate] = useState<number>(0);
  const CONTEXT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  // Cache context information to avoid repeated expensive calls
  const getCachedContextInfo = useCallback(() => {
    const now = Date.now();

    // If cache is still valid (less than 5 minutes old), use cached version
    if (cachedContextInfo && now - lastContextUpdate < CONTEXT_CACHE_DURATION) {
      return cachedContextInfo;
    }

    // Generate new context and cache it
    const contextInfo = getContextualInfo(weather, location);
    setCachedContextInfo(contextInfo);
    setLastContextUpdate(now);

    return contextInfo;
  }, [weather, location, cachedContextInfo, lastContextUpdate]);

  // Add keyboard input state
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputsRef = useRef<InputsRef>(null);
  const metering = useRef<number>(-100);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const navigation = useNavigation();
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceResults, setVoiceResults] = useState<string[]>([]);
  const [partialResult, setPartialResult] = useState<string>('');
  const voiceResultsRef = useRef<string[]>([]);
  const partialResultRef = useRef<string>('');
  const lastPartialUpdateTimeRef = useRef<number>(Date.now());
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SILENCE_TIMEOUT = 1500;
  // Timestamp (ms) when the current STT recording session started.
  // Used to drop wakeword-echo partials that arrive in the first ~400 ms.
  const sessionStartTimeRef = useRef<number>(0);
  const WAKEWORD_ECHO_GRACE_MS = 400; // drop early partials that are only the wakeword
  const WAKEWORD_PHRASES = [
    'hey verbi,',
    'hey verby,',
    'hey verbose,',
    'hey baby,',
    'hey verbi',
    'hey verby',
    'hey verbose',
    'hey baby',
    'more baby',
    'more baby,',
  ]; // normalised variants
  const isRecordingRef = useRef(false);
  const isNavigatingToOpenRef = useRef(false);
  // Separate guard that is true from the moment handleRecord is called until
  // startSpeechRecognition either resolves or throws.  Prevents the
  // onSpeechError handler from treating startup-phase errors (e.g. the
  // DaVoice.cancel() call inside startSpeechRecognition) as live-session
  // errors and resetting isRecordingRef prematurely.
  const isStartingRef = useRef(false);
  const [showImages, setShowImages] = useState(false);
  const [finishedTranscribing, setFinishedTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isUsingLocalWhisper, setIsUsingLocalWhisper] = useState(false);
  const [modelNotAvailable, setModelNotAvailable] = useState(false);
  const MAX_RETRIES = 3;

  useEffect(() => {
    sttTrace(
      `[STT TRACE][Home state] isRecording=${isRecording} isTranscribing=${isTranscribing} finished=${finishedTranscribing} partial="${partialResult}" transcribed="${transcribedText}"`,
    );
  }, [
    finishedTranscribing,
    isRecording,
    isTranscribing,
    partialResult,
    transcribedText,
  ]);

  const startRecordingGlow = useCallback(() => {
    recordingGlowLoop.current?.stop();
    recordingGlowAnim.setValue(0);
    recordingGlowLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingGlowAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(recordingGlowAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    recordingGlowLoop.current.start();
  }, [recordingGlowAnim]);

  const stopRecordingGlow = useCallback(() => {
    recordingGlowLoop.current?.stop();
    recordingGlowLoop.current = null;
    Animated.timing(recordingGlowAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [recordingGlowAnim]);

  useEffect(() => {
    if (isRecording) {
      startRecordingGlow();
    } else {
      stopRecordingGlow();
    }

    return () => {
      recordingGlowLoop.current?.stop();
    };
  }, [isRecording, startRecordingGlow, stopRecordingGlow]);

  let currentRecordingURI: string | null = null;

  const recordingGlowOpacity = recordingGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  // AI response timer state
  const [responseTimerStart, setResponseTimerStart] = useState<number | null>(
    null,
  );
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Function to start AI response timer
  const startResponseTimer = () => {
    const startTime = Date.now();
    setResponseTimerStart(startTime);
  };

  // Function to stop AI response timer and log the duration
  const stopResponseTimer = async (
    action: 'home' | 'card' | 'more_answers',
  ) => {
    if (responseTimerStart) {
      const duration = Date.now() - responseTimerStart;

      // Only log to database if it's a card selection (not home or more answers)
      if (action === 'card') {
        try {
          await addAIResponseTime({
            timetotap: duration,
            dateof: new Date(),
          });
        } catch (error) {}
      }

      setResponseTimerStart(null);
    }

    // Clear any existing timer
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  };

  // Removed settings loading useFocusEffect - now using reactive preferences

  useEffect(() => {
    const loadGobackAfterSelectionSetting = async () => {
      try {
        const setting = await getItem('gobackAfterSelection');
        setGobackAfterSelection(setting === '1');
      } catch (error) {}
    };

    // Load the setting
    loadGobackAfterSelectionSetting();

    // Track screen opening
    mixpanel.track('Conversation', {
      Opened: 'Conversation',
    });
    if (stateof === 'Attention') {
      sttTrace(
        `[Home] Entering Attention state. Current answersCount: ${preferences.answersCount}`,
      );
      // wakeWord.stopListening();
      mixpanel.track('Recording Restarted', {
        source: 'attention_state',
      });
      const startRecordingTimer = setTimeout(() => {
        playSound(wakewordPaused);
      }, 0);
      return () => clearTimeout(startRecordingTimer);
    }
    if (stateof === 'Keyboard') {
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.pauseDetection(false).catch(() => {});
    }
  }, [stateof, wakewordPaused, recordingPermissionsReady]); // Dependency on stateof ensures this runs when coming from Open.tsx

  useEffect(() => {
    // Clear any previous wakeword callback to prevent accidental triggers from Open.tsx
    try {
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.setCallback(() => {});
    } catch (error) {
      sttWarn('[Home] Error clearing wakeword callback on mount:', error);
    }

    sttTrace('[STT TRACE][Home] subscribing to speech events');
    const unsubscribe = subscribeToSpeechEvents(
      {
        onSpeechStart: (event: any) => {
          sttTrace(
            '[STT TRACE][Home] onSpeechStart',
            JSON.stringify(event),
            `isRecordingRef=${isRecordingRef.current}`,
          );
        },
        onSpeechEnd: (event: any) => {
          sttTrace(
            '[STT TRACE][Home] onSpeechEnd',
            JSON.stringify(event),
            `partialRef="${partialResultRef.current}"`,
            `resultsRef=${JSON.stringify(voiceResultsRef.current)}`,
          );
        },
        onSpeechError: (e: any) => {
          // Suppress 'already_started' noise while a session is live.
          if (e?.error?.code === 'already_started' && isRecordingRef.current) {
            sttTrace(
              '[STT TRACE][Home] already_started ignored while recording',
            );
            return;
          }
          // Suppress ALL errors that fire during the startup phase (e.g. the
          // DaVoice.cancel() call inside startSpeechRecognition that clears any
          // stale session).  Treating those as live-recording errors would reset
          // isRecordingRef before the session is open, silently dropping every
          // subsequent speech event.
          if (isStartingRef.current) {
            console.warn(
              '[STT TRACE][Home] onSpeechError during startup phase – suppressed',
              JSON.stringify(e),
            );
            return;
          }
          console.error(
            '[STT TRACE][Home] onSpeechError',
            JSON.stringify(e),
            `isRecordingRef=${isRecordingRef.current}`,
          );
          setIsRecording(false);
          isRecordingRef.current = false;
        },
        onSpeechResults: (event: any) => {
          sttTrace(
            '[STT TRACE][Home] onSpeechResults raw=',
            JSON.stringify(event),
            `isRecordingRef=${isRecordingRef.current}`,
          );
          // Android's SpeechRecognizer delivers the final result AFTER
          // Voice.stop() has resolved (and isRecordingRef is already false),
          // so late finals must be accepted there. iOS finals arrive in-session.
          if (!isRecordingRef.current && Platform.OS === 'ios') {
            sttTrace('[STT TRACE][Home] final result ignored: not recording');
            return;
          }
          if (event.value && event.value.length > 0) {
            setVoiceResults(event.value); // store full array, not just first string
            voiceResultsRef.current = event.value;
            sttTrace(
              '[STT TRACE][Home] final results stored',
              JSON.stringify(voiceResultsRef.current),
            );
          } else {
            sttWarn('[STT TRACE][Home] final result event had no value');
          }
        },
        onSpeechPartialResults: (event: any) => {
          sttTrace(
            '[STT TRACE][Home] onSpeechPartialResults raw=',
            JSON.stringify(event),
            `isRecordingRef=${isRecordingRef.current}`,
          );
          if (!isRecordingRef.current) {
            sttTrace('[STT TRACE][Home] partial ignored: not recording');
            return;
          }
          let partialText = '';
          if (event.value && event.value.length > 0) {
            partialText = event.value[0];
          }
          if (partialText) {
            // Drop wakeword-echo partials: if we are within the startup grace
            // window and the partial is solely the wakeword phrase, it is
            // audio-buffer bleed-through from the trigger utterance — not real
            // user speech. Discard it so the input box stays empty.
            const msSinceStart = Date.now() - sessionStartTimeRef.current;
            const normalised = partialText.trim().toLowerCase();
            const isWakewordEcho =
              msSinceStart < WAKEWORD_ECHO_GRACE_MS &&
              WAKEWORD_PHRASES.some(ww => {
                const wwLower = ww.toLowerCase();
                return (
                  normalised === wwLower ||
                  normalised.startsWith(wwLower + ' ') ||
                  normalised.endsWith(' ' + wwLower)
                );
              });
            if (isWakewordEcho) {
              sttTrace(
                `[STT TRACE][Home] partial dropped (wakeword echo, ${msSinceStart}ms into session): "${partialText}"`,
              );
              return;
            }
            sttTrace(
              `[STT TRACE][Home] partial extracted="${partialText}" inputRef=${!!inputsRef.current}`,
            );
            setPartialResult(partialText);
            partialResultRef.current = partialText;
            sttTrace(
              `[STT TRACE][Home] partial stored ref="${partialResultRef.current}"`,
            );
            // On-device AI: evaluate the words heard so far while the partner
            // is still talking, so the final question only pays for its last
            // words. Same context string as processVoiceResults sends, so the
            // two prompts share their prefix. A no-op when the option is off.
            prefillAnswers(partialText, {
              metadata: {contextInfo: getCachedContextInfo()},
              number: parseInt(preferences.answersCount as string) || 5,
            });
            if (inputsRef.current) {
              inputsRef.current.setInput(partialText);
              sttTrace('[STT TRACE][Home] partial pushed to Inputs ref');
            } else {
              sttWarn('[STT TRACE][Home] Inputs ref unavailable');
            }
            lastPartialUpdateTimeRef.current = Date.now();
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
            silenceTimerRef.current = setTimeout(async () => {
              sttTrace(
                `[STT TRACE][Home] silence timer fired partialRef="${partialResultRef.current}"`,
              );
              if (partialResultRef.current.trim().length > 0) {
                await stopRecording();
              }
            }, SILENCE_TIMEOUT);
            sttTrace(
              `[STT TRACE][Home] silence timer armed ms=${SILENCE_TIMEOUT}`,
            );
          } else {
            sttWarn('[STT TRACE][Home] partial event contained empty text');
          }
        },
        onSpeechVolumeChanged: (event: any) => {
          const value = Number(event?.value);
          if (Number.isFinite(value)) {
            metering.current = value;
          }
        },
      },
      {key: 'Home'},
    );

    return () => {
      sttTrace('[STT TRACE][Home] unsubscribing from speech events');
      unsubscribe();
      if (Platform.OS === 'android') {
        // Hand the mic back to the wakeword engine on the next screen.
        // Nothing is torn down — the old Voice.destroy() here also destroyed
        // the shared TTS bridge, leaving every later screen unable to speak.
        Promise.resolve(releaseMicrophone()).catch(() => {});
      } else {
        stopSpeechRecognition().catch(() => {});
      }
    };
  }, []);

  // On-device AI: the people list or personal memory may have changed since
  // the model was warmed up. Re-prime the cached prompt head on entering the
  // conversation screen; a no-op when nothing changed or the option is off.
  useEffect(() => {
    refreshLocalLlm();
  }, [refreshLocalLlm]);

  // Cleanup useEffect for wake word service and Voice timers
  useEffect(() => {
    return () => {
      if (!isNavigatingToOpenRef.current) {
        const wakeWordService = WakeWordService.getInstance();
        wakeWordService.pauseDetection(false).catch(() => {});
      }

      // Only cleanup Whisper service when component actually unmounts
      // Don't destroy it when just waiting for next conversation

      // Cleanup response timer
      if (responseTimerRef.current) {
        clearTimeout(responseTimerRef.current);
        responseTimerRef.current = null;
      }

      // Cleanup silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // Cleanup recording timer
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }
    };
  }, []);

  const playSound = async (skipWakewordPause: boolean = false) => {
    // COMMENTED OUT FOR TESTING
    // playAttention();
    sttTrace('[STT TRACE][Home] playSound -> handleRecord');
    handleRecord(skipWakewordPause);
  };
  // put this near your module top:

  const handleRecord = async (skipWakewordPause: boolean = false) => {
    sttTrace(
      `[STT TRACE][Home] handleRecord called isRecordingRef=${isRecordingRef.current} isStartingRef=${isStartingRef.current}`,
    );
    // Use isStartingRef as the re-entry guard during the async startup phase
    // so that onSpeechError can safely reset isRecordingRef without
    // accidentally blocking a future handleRecord call.
    if (isRecordingRef.current || isStartingRef.current) {
      sttWarn(
        '[STT TRACE][Home] handleRecord ignored: already recording or starting',
      );
      return;
    }
    isStartingRef.current = true; // ← startup-phase guard only
    sttTrace('[STT TRACE][Home] startup lock acquired');

    if (DEBUGWITHOUTTRANSCRIPTION) {
      // Dev-only: skip permissions, wakeword and the microphone entirely and
      // run the answer pipeline on DEBUGTRANSCRIPTION, so the result cards can
      // be screenshotted without having to speak.
      sttTrace(
        `[STT TRACE][Home] DEBUGWITHOUTTRANSCRIPTION: using "${DEBUGTRANSCRIPTION}"`,
      );
      isStartingRef.current = false;
      setVoiceResults([DEBUGTRANSCRIPTION]);
      setPartialResult(DEBUGTRANSCRIPTION);
      voiceResultsRef.current = [DEBUGTRANSCRIPTION];
      partialResultRef.current = DEBUGTRANSCRIPTION;
      if (inputsRef.current) {
        inputsRef.current.setInput(DEBUGTRANSCRIPTION);
      }
      setIsTranscribing(true);
      await processVoiceResults();
      return;
    }

    mixpanel.track('Microphone Pressed');

    try {
      if (!recordingPermissionsReady) {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Microphone Permission',
              message:
                'This app needs access to your microphone to record audio',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setFinishedTranscribing(true);
            setTranscribedText('Microphone permission is required');
            TTSService.speak(
              'Please allow microphone access in Settings',
              true,
            );
            isRecordingRef.current = false;
            isStartingRef.current = false;
            return;
          }
        } else {
          const micPermission = await check(PERMISSIONS.IOS.MICROPHONE);
          sttTrace(`[STT TRACE][Home] microphone permission=${micPermission}`);
          if (micPermission === RESULTS.DENIED) {
            const result = await request(PERMISSIONS.IOS.MICROPHONE);
            sttTrace(
              `[STT PERMISSIONS][Home] microphone request result=${result}`,
            );
            if (result !== RESULTS.GRANTED) {
              setFinishedTranscribing(true);
              setTranscribedText('Microphone permission is required');
              TTSService.speak(
                'Please allow microphone access in Settings',
                true,
              );
              isRecordingRef.current = false;
              isStartingRef.current = false;
              return;
            }
          } else if (micPermission === RESULTS.BLOCKED) {
            setFinishedTranscribing(true);
            setTranscribedText('Microphone permission is blocked');
            TTSService.speak(
              'Please enable microphone access in Settings',
              true,
            );
            isRecordingRef.current = false;
            isStartingRef.current = false;
            return;
          }

          // iOS also needs the separate speech-recognition permission; there
          // is no Android counterpart (RECORD_AUDIO covers it).
          const hasSpeechPermission =
            await Voice.hasIOSSpeechRecognitionPermissions();
          sttTrace(
            `[STT TRACE][Home] speech permission existing=${hasSpeechPermission}`,
          );
          const speechGranted = hasSpeechPermission
            ? true
            : await Voice.requestIOSSpeechRecognitionPermissions(10000);
          sttTrace(
            `[STT PERMISSIONS][Home] DaVoice speech recognition granted=${String(
              speechGranted,
            )}`,
          );
          if (!speechGranted) {
            setFinishedTranscribing(true);
            setTranscribedText('Speech recognition permission is required');
            TTSService.speak(
              'Please allow speech recognition access in Settings',
              true,
            );
            isRecordingRef.current = false;
            isStartingRef.current = false;
            return;
          }
          await logSpeechDiagnostics('home-permissions-complete');
        }
      }

      if (!skipWakewordPause) {
        try {
          const w = WakeWordService.getInstance();
          sttTrace('[STT TRACE][Home] wakeword pause begin');
          // iOS: stopMic=false keeps the shared audio session alive — no
          // re-init cost when WakeWord resumes on return to Open.tsx.
          // Android: stopMic=true is required — with false the wakeword's
          // AudioRecord keeps the mic and SpeechRecognizer fails to start
          // (error 5 "Client side error"). startListening() resumes it via
          // unPauseDetection(), which re-acquires the mic.
          await w.pauseDetection(Platform.OS === 'android');
          sttTrace('[STT TRACE][Home] wakeword paused (mic released)');
        } catch (error) {
          sttWarn('[STT TRACE][Home] wakeword pause failed:', error);
        }
      }

      lastSoundTimeRef.current = 0;
      metering.current = -100;

      setVoiceResults([]);
      setPartialResult('');
      voiceResultsRef.current = [];
      partialResultRef.current = '';
      sttTrace('[STT TRACE][Home] transcript state and refs cleared');
      lastPartialUpdateTimeRef.current = Date.now();
      sessionStartTimeRef.current = Date.now(); // mark session start for wakeword-echo filter

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      sttTrace('[STT TRACE][Home] STT session start requested');
      setIsUsingLocalWhisper(true);
      await startSpeechRecognition('en-US', {}, 'home');
      // startSpeechRecognition resolved — the native session is now live.
      // Only NOW arm isRecordingRef so the event handlers accept incoming
      // speech events, and clear the startup guard.
      isRecordingRef.current = true;
      isStartingRef.current = false;
      sttTrace('[STT TRACE][Home] STT session start resolved');
      setIsRecording(true);
      sttTrace(
        `[STT TRACE][Home] recording UI enabled isRecordingRef=${isRecordingRef.current}`,
      );

      recordingTimer.current = setTimeout(async () => {
        sttTrace('[STT TRACE][Home] 20s recording timer fired');
        await stopRecording();
      }, 20000);
      sttTrace('[STT TRACE][Home] 20s recording timer armed');
    } catch (error) {
      console.error('[STT TRACE][Home] handleRecord failed:', error);
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      isRecordingRef.current = false;
      isStartingRef.current = false; // always clear startup guard on failure
    }
  };

  const stopRecording = async () => {
    sttTrace(
      `[STT TRACE][Home] stopRecording called partialRef="${
        partialResultRef.current
      }" resultsRef=${JSON.stringify(voiceResultsRef.current)}`,
    );
    try {
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      sttTrace('[STT TRACE][Home] stopSpeechRecognition begin');
      await stopSpeechRecognition();
      sttTrace('[STT TRACE][Home] stopSpeechRecognition resolved');
      setIsRecording(false);
      isRecordingRef.current = false;

      setTimeout(() => {
        sttTrace('[STT TRACE][Home] processVoiceResults timer fired');
        processVoiceResults();
      }, 300);
    } catch (error) {
      console.error('[STT TRACE][Home] stopRecording failed:', error);
      setIsRecording(false);
      isRecordingRef.current = false;
      setIsTranscribing(false);
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
    }
  };

  const processVoiceResults = async () => {
    sttTrace(
      `[STT TRACE][Home] processVoiceResults begin partialRef="${
        partialResultRef.current
      }" resultsRef=${JSON.stringify(voiceResultsRef.current)}`,
    );
    try {
      const currentVoiceResults = voiceResultsRef.current;
      const currentPartialResult = partialResultRef.current;

      let transcribedText = '';
      if (currentVoiceResults.length > 0) {
        transcribedText = currentVoiceResults[0].trim();
        sttTrace(
          `[STT TRACE][Home] selected final result="${transcribedText}"`,
        );
      } else if (currentPartialResult.trim().length > 0) {
        transcribedText = currentPartialResult.trim();
        sttTrace(
          `[STT TRACE][Home] selected partial fallback="${transcribedText}"`,
        );
      } else {
        sttWarn('[STT TRACE][Home] no final or partial text available');
      }

      // Strip a leading wakeword if the entire transcription is just the
      // wakeword echo (audio bleed-through from the trigger utterance).
      // Only strip when the result is *solely* the wakeword, so we don't
      // accidentally remove a wakeword intentionally spoken as content.
      const normalisedResult = transcribedText.toLowerCase();
      const isJustWakeword = WAKEWORD_PHRASES.some(
        ww => normalisedResult === ww.toLowerCase(),
      );
      if (isJustWakeword) {
        sttTrace(
          `[STT TRACE][Home] final result is only wakeword echo — treating as empty`,
        );
        transcribedText = '';
      }

      if (
        transcribedText.length === 0 ||
        transcribedText === 'Thank you for watching!' ||
        transcribedText === 'Thank you for watching.' ||
        transcribedText === 'Thanks for watching!' ||
        transcribedText === 'Thanks for watching.' ||
        transcribedText === '. .' ||
        transcribedText === '.'
      ) {
        setFinishedTranscribing(true);
        setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
        TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        setIsTranscribing(false);
        return;
      }

      if (transcribedText.length > 0) {
        sttTrace(
          `[STT TRACE][Home] committing transcribedText to UI="${transcribedText}"`,
        );
        setFinishedTranscribing(true);
        setTranscribedText(transcribedText);
        setIsTranscribing(false);
        setIsProcessingAnswer(true);

        if (inputsRef.current) {
          inputsRef.current.setInput(transcribedText);
        }

        const contextInfo = getCachedContextInfo();
        const corePrompt = `User asked: "${transcribedText}"`;
        const contextPrompt = `Context: ${contextInfo}`;
        const messageWithContext = `${corePrompt}. ${contextPrompt}`;

        try {
          const currentAnswersCount =
            parseInt(preferences.answersCount as string) || 5;
          const answers = await generateAnswers(transcribedText, {
            mode: 'generate_answers',
            metadata: {contextInfo: contextInfo},
            number: currentAnswersCount,
            countMin: currentAnswersCount,
            countMax: currentAnswersCount,
          });

          if (answers && answers.length > 0) {
            const processedAnswers = await Promise.all(
              answers.map(async (answer: any) => {
                const pepesImageUrl = await resolvePepesImage(
                  answer.word,
                  answer.imageUrl,
                );
                return {...answer, imageUrl: pepesImageUrl || answer.imageUrl};
              }),
            );

            setDirectAnswers(processedAnswers);
            const answerWords = processedAnswers.map(
              (answer: any) => answer.word,
            );
            setAccumulatedPriors(answerWords);
            setIsProcessingAnswer(false);
            setShowImages(true);
            startResponseTimer();

            setCurrentAIRecord({
              question: transcribedText,
              round1Answers: answerWords,
              currentRound: 1,
            });

            const assistantResponse = `Suggested: ${processedAnswers
              .map((a: any) => a.word)
              .join(', ')}`;
            addToConversationHistory(transcribedText, assistantResponse);
          } else {
            setIsProcessingAnswer(false);
            TTSService.speak('I am having an issue, Tap Home to retry', true);
          }
        } catch (error) {
          setIsProcessingAnswer(false);
          TTSService.speak(
            'Failed to process your request. Please try again.',
            true,
          );
        }
      }

      setIsTranscribing(false);
    } catch (error) {
      console.error('[STT TRACE][Home] processVoiceResults failed:', error);
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsTranscribing(false);
    }
  };

  // Removed useEffect that depended on status and imageUrls since we're using direct answers now

  // Reset function for local states
  const resetLocalStates = () => {
    // Signal that we are navigating back to Open.tsx so the cleanup useEffect
    // does not re-pause the wakeword after Open has already resumed it.
    isNavigatingToOpenRef.current = true;

    // Stop response timer if running
    stopResponseTimer('home');

    setFinishedTranscribing(false);
    setTranscribedText('');
    setShowImages(false);
    setIsRetrying(false);
    setRetryCount(0);
    setIsProcessingAnswer(false); // Reset processing state
    setIsTranscribing(false); // Reset transcription state
    setIsRecording(false); // Reset recording state
    isRecordingRef.current = false;
    isStartingRef.current = false;
    setWaitingForNextConversation(false); // Reset waiting state
    setIsUsingLocalWhisper(false); // Reset transcription method indicator
    setModelNotAvailable(false); // Reset model availability indicator
    setDirectAnswers([]); // Reset direct answers
    setAccumulatedPriors([]); // Reset accumulated priors
    setCurrentAIRecord(null); // Clear AI Resolved record
    setPartialResult('');
    voiceResultsRef.current = [];
    partialResultRef.current = '';

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Clear the input in the Inputs component
    if (inputsRef.current) {
      inputsRef.current.clearInput();
    }

    // Clear debounce timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    // Clean up wake word service if waiting
    if (waitingForNextConversation) {
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.pauseDetection(false).catch(() => {});
    }
  };

  // Function to handle "Can't find it" button press
  const handleCantFindIt = async () => {
    if (!transcribedText || isRetrying || retryCount >= MAX_RETRIES) {
      if (retryCount >= MAX_RETRIES) {
        mixpanel.track('More Answers Pressed', {
          result: 'max_retries_reached',
        });
        TTSService.speak(
          'You have reached the maximum number of retry attempts. Please try a new question.',
          true,
        );
      }
      return;
    }

    mixpanel.track('More Answers Pressed', {
      retry_count: retryCount + 1,
    });

    // Stop current response timer
    stopResponseTimer('more_answers');

    try {
      setIsRetrying(true);
      setIsProcessingAnswer(true); // Show processing immediately
      setShowImages(false); // Hide current images while getting new ones

      // Use accumulated priors to pass to server
      const currentAccumulated = [...accumulatedPriors];

      // Clear old images immediately to prevent flickering
      setDirectAnswers([]);
      setRetryCount(prev => prev + 1);

      // Get contextual information (time, weather, location, special places)
      const contextInfo = getCachedContextInfo();

      // Create a retry message asking for more alternatives
      const retryMessage = `${contextInfo}. User said: "${transcribedText}". The user couldn't find what they were looking for in the previous answers. Please provide 5 different alternative answers or suggestions.`;

      const currentAnswersCount = parseInt(preferences.answersCount) || 5;
      // Use generateAnswers to get more answers
      const answers = await generateAnswers(transcribedText, {
        mode: 'generate_more_answers',
        metadata: {
          contextInfo: contextInfo || '', // Weather, time, and location context
        },
        prior: {
          answers: currentAccumulated || [], // Pass all accumulated previous answers
        },
        number: currentAnswersCount,
        countMin: currentAnswersCount,
        countMax: currentAnswersCount,
      });

      if (answers && answers.length > 0) {
        // Process answers to resolve pepes images
        const processedAnswers = await Promise.all(
          answers.map(async answer => {
            const pepesImageUrl = await resolvePepesImage(
              answer.word,
              answer.imageUrl,
            );
            return {
              ...answer,
              imageUrl: pepesImageUrl || answer.imageUrl,
            };
          }),
        );

        setDirectAnswers(processedAnswers);
        const newAnswerWords = processedAnswers.map(answer => answer.word);
        setAccumulatedPriors(prev => [...prev, ...newAnswerWords]);

        setIsProcessingAnswer(false);
        setIsRetrying(false);
        setShowImages(true);
        startResponseTimer();

        // Update AI Resolved record for next round
        if (currentAIRecord && currentAIRecord.currentRound < 3) {
          const nextRound = currentAIRecord.currentRound + 1;

          setCurrentAIRecord({
            ...currentAIRecord,
            currentRound: nextRound,
            [`round${nextRound}Answers`]: newAnswerWords,
          });
        }

        // Add to conversation history
        const assistantResponse = processedAnswers
          .map(answer => answer.word)
          .join(', ');
        addToConversationHistory(transcribedText, assistantResponse);
      } else {
        mixpanel.track('Error', {
          error_type: 'more_answers_failed',
          error_message:
            'generateAnswers returned empty array for more answers',
        });
        setIsProcessingAnswer(false);
        setIsRetrying(false);
        TTSService.speak('Failed to get more answers. Please try again.', true);
        setRetryCount(prev => prev - 1);
      }
    } catch (error) {
      mixpanel.track('Error', {
        error_type: 'more_answers_error',
        error_message: error instanceof Error ? error.message : String(error),
      });
      setIsProcessingAnswer(false);
      setIsRetrying(false);
      TTSService.speak('Failed to get more answers. Please try again.', true);
      setRetryCount(prev => prev - 1); // Revert retry count on error
    }
  };

  // Function to handle answer selection and logging
  const handleAnswerSelected = async (selectedAnswer: string) => {
    if (!transcribedText || !directAnswers || directAnswers.length === 0) {
      return;
    }

    if (selectedAnswer !== 'MoreAnswers') {
      mixpanel.track('Answer Selected', {
        selected_answer: selectedAnswer,
      });
    }

    // IEP session evidence: response time from question to tap, before the timer resets.
    // Unknown (timer not running) is recorded as null, never as an instant answer.
    const iepResponseTimeMs = responseTimerStart
      ? Date.now() - responseTimerStart
      : null;

    // Stop response timer if running
    stopResponseTimer('card');

    // Extract all possible answers from directAnswers
    const possibleAnswers = directAnswers
      .filter(item => item && item.word)
      .map(item => item.word);

    if (selectedAnswer === 'MoreAnswers') {
      iepCapture.qaMoreAnswersRequested();
    } else {
      iepCapture.qaAnswerSelected({
        question: currentAIRecord?.question ?? transcribedText,
        answer: selectedAnswer,
        options: possibleAnswers,
        answerRoundCount: currentAIRecord?.currentRound ?? 1,
        askedForMoreAnswers: (currentAIRecord?.currentRound ?? 1) > 1,
        responseTimeMs: iepResponseTimeMs,
      });
    }

    // Log the conversation
    logConversation({
      question: transcribedText,
      possibleAnswers: possibleAnswers,
      answerPicked: selectedAnswer,
    });

    // Log the selected word to database (only if it's not "MoreAnswers")
    if (selectedAnswer !== 'MoreAnswers') {
      await logWordSelection(selectedAnswer, 'Home');
      // Update history with the user's specific choice
      updateLastAssistantMessage(selectedAnswer);
      // Personal Memory: completed Q&A answer
      personalMemoryService.recordCompletedCommunication({
        eventId: makeMemoryEventId(),
        kind: 'answer',
        text: selectedAnswer,
        words: selectedAnswer.split(/\s+/).filter(Boolean),
        source: 'Home',
        occurredAt: new Date(),
        question: currentAIRecord?.question ?? transcribedText,
      });
    }

    // Update AI Resolved record with the selected answer
    if (currentAIRecord) {
      const updatedRecord = {...currentAIRecord};

      if (currentAIRecord.currentRound === 1) {
        updatedRecord.round1Picked = selectedAnswer;
      } else if (currentAIRecord.currentRound === 2) {
        updatedRecord.round2Picked = selectedAnswer;
      } else if (currentAIRecord.currentRound === 3) {
        updatedRecord.round3Picked = selectedAnswer;
      }

      // If it's a final answer (not "MoreAnswers"), save to database
      if (selectedAnswer !== 'MoreAnswers') {
        try {
          await addAIResolved({
            question: updatedRecord.question,
            dateof: new Date(),
            round1_answers: JSON.stringify(updatedRecord.round1Answers),
            round1_picked: updatedRecord.round1Picked,
            round2_answers: updatedRecord.round2Answers
              ? JSON.stringify(updatedRecord.round2Answers)
              : undefined,
            round2_picked: updatedRecord.round2Picked,
            round3_answers: updatedRecord.round3Answers
              ? JSON.stringify(updatedRecord.round3Answers)
              : undefined,
            round3_picked: updatedRecord.round3Picked,
          });
        } catch (error) {}

        // Clear the current AI record
        setCurrentAIRecord(null);
      } else {
        // Update the current record for next round
        setCurrentAIRecord(updatedRecord);
      }
    }

    // Only navigate back to Open if not currently retrying/getting more answers
    if (selectedAnswer !== 'MoreAnswers') {
      // Navigate to Open.tsx only if gobackAfterSelection is true
      setTimeout(async () => {
        setDirectAnswers([]);
        setAccumulatedPriors([]);
        if (gobackAfterSelection) {
          // Wait 1 second to allow user to hear the selected answer being spoken
          isNavigatingToOpenRef.current = true;
          resetLocalStates();
          navigation.navigate(views.OPEN as never);
        } else {
          // NEW: Set waiting state immediately so it shows right away
          // TTS has already finished by the time this function is called
          setShowImages(false);
          setWaitingForNextConversation(true);
          setDirectAnswers([]);
          setAccumulatedPriors([]);
          // Reset states but preserve waitingForNextConversation
          setFinishedTranscribing(false);
          setTranscribedText('');
          setIsRetrying(false);
          setRetryCount(0);
          setIsProcessingAnswer(false);
          setIsTranscribing(false);
          setIsRecording(false);
          setIsUsingLocalWhisper(false);
          setModelNotAvailable(false);

          // Clear the input in the Inputs component
          if (inputsRef.current) {
            inputsRef.current.clearInput();
          }

          // Clear debounce timer
          if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
          }

          // Activate wake word listening with callback
          try {
            if (Platform.OS === 'android') {
              // Hand the mic over before the wakeword engine re-acquires it.
              // Nothing is torn down, so the next word tap can still speak.
              await releaseMicrophone();
            }
            const wakeWordService = WakeWordService.getInstance();

            wakeWordService.setCallback(async (phrase: string) => {
              // When wake word detected, start new conversation
              mixpanel.track('Recording Restarted', {
                source: 'wake_word_detected',
              });
              setWaitingForNextConversation(false);
              await playSound(); // This will trigger handleRecord()
            });

            if (!wakeWordService.isCurrentlyListening()) {
              await wakeWordService.startListening();
            }
          } catch (error) {
            console.error('[Home] Error setting up wakeword callback:', error);
            // Fallback: allow manual trigger
            setWaitingForNextConversation(true);
          }
        }
      }, 1000);
    }
  };

  const handlePolish = () => {
    // Moved to KeyboardHome
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.container,
          Platform.OS === 'android' ? {paddingTop: width * 0.03} : {},
          {backgroundColor: '#FFF8E7'},
        ]}>
        {stateof === 'Keyboard' ? null : (
          <TouchableOpacity
            style={[
              styles.microphoneButton,
              {
                top: responsiveValues.microphoneButtonTop,
                left: responsiveValues.microphoneButtonLeft,
                width: responsiveValues.microphoneButtonSize,
                height: responsiveValues.microphoneButtonSize,
              },
            ]}
            onPress={() => {
              mixpanel.track('Contiuing the conversation Restarted', {
                source: 'microphone_button_home_screen',
              });

              // Reset states to clear previous images/results and show recording UI
              setShowImages(false);
              setFinishedTranscribing(false);
              setTranscribedText('');
              setIsRetrying(false);
              setRetryCount(0);
              setIsProcessingAnswer(false);
              setDirectAnswers([]);
              setAccumulatedPriors([]);
              setCurrentAIRecord(null);
              setPartialResult('');
              voiceResultsRef.current = [];
              partialResultRef.current = '';

              setWaitingForNextConversation(false); // Exit waiting state immediately
              playSound(); // This will trigger handleRecord()
            }}>
            <FastImage
              source={require('../assets/michrophone.gif')}
              style={[styles.iconSize, responsiveValues.microphoneSize]}
              resizeMode={FastImage.resizeMode.contain}
            />
          </TouchableOpacity>
        )}

        {/* Home Button */}
        <HomeButton
          navigation={navigation}
          onReset={resetLocalStates}
          disabled={
            isRecording ||
            isProcessingAnswer ||
            isRetrying ||
            (!finishedTranscribing && !waitingForNextConversation)
          }
        />

        {/* Matalk Icon */}
        <View style={[styles.matalkIcon, responsiveValues.matalkIconSize]}>
          <MatalkIcon />
        </View>

        <View
          style={[
            styles.inputNavigationContainer,
            stateof === 'Keyboard'
              ? {height: 0, opacity: 0}
              : {
                  height: responsiveValues.inputNavigationHeight,
                  marginTop: Math.max(insets.top, 10),
                },
          ]}>
          {stateof !== 'Keyboard' && <Inputs ref={inputsRef} mode={stateof} />}
        </View>

        <View style={{flex: 1, width: '100%'}}>
          <View
            style={[
              styles.contentContainer,
              {
                width: responsiveValues.contentWidth,
                marginTop: responsiveValues.contentMarginTop,
                paddingBottom: responsiveValues.contentPaddingBottom,
              },
            ]}>
            <View
              style={[
                styles.imageCardContainer,
                {zIndex: 10, marginTop: height * 0.02},
              ]}
              key={`gallery`}>
              {showImages ? (
                (() => {
                  // Use direct answers
                  const imagesToUse = directAnswers;

                  // If no images are available after filtering, show a message
                  const validImages = imagesToUse
                    .filter(item => {
                      if (!item) return false;
                      // Handle direct answers format
                      return item.imageUrl && item.imageUrl !== 'placeholder';
                    })
                    .map(item => {
                      try {
                        // Handle direct answers format
                        return {
                          url: {url: item.imageUrl || ''},
                          prompt: item.word || '',
                        };
                      } catch (err) {
                        return null;
                      }
                    })
                    .filter(
                      (item): item is {url: {url: string}; prompt: string} =>
                        item !== null,
                    );

                  if (validImages.length === 0) {
                    return (
                      <View style={styles.errorContainer}>
                        <Text
                          style={[
                            styles.errorText,
                            {fontSize: responsiveValues.errorFontSize},
                          ]}>
                          We have an issue. Please be patient.
                        </Text>
                        <View style={styles.navigationCardsContainer}>
                          <TouchableOpacity
                            style={[
                              styles.navigationCard,
                              {
                                width: responsiveValues.navigationCardWidth,
                                minHeight:
                                  responsiveValues.navigationCardMinHeight,
                                borderRadius:
                                  responsiveValues.navigationCardBorderRadius,
                                padding: responsiveValues.navigationCardPadding,
                                shadowRadius: responsiveValues.shadowRadius,
                                shadowOffset: responsiveValues.shadowOffset,
                                elevation: responsiveValues.elevation,
                              },
                            ]}
                            onPress={() => {
                              mixpanel.track('Shortcuts Tapped', {
                                context: 'more_answers_failed',
                              });
                              navigation.navigate('ShortCuts' as never);
                            }}>
                            <View
                              style={[
                                styles.cardImageContainer,
                                {
                                  width:
                                    responsiveValues.navigationCardImageSize
                                      .width,
                                  height:
                                    responsiveValues.navigationCardImageSize
                                      .height,
                                  borderRadius:
                                    responsiveValues.navigationCardImageBorderRadius,
                                },
                              ]}>
                              <FastImage
                                source={require('../assets/shortCuts.jpg')}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                }}
                                resizeMode={FastImage.resizeMode.contain}
                              />
                            </View>
                            <Text
                              style={[
                                styles.cardText,
                                {fontSize: responsiveValues.cardTextFontSize},
                              ]}>
                              ShortCuts
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.navigationCard,
                              {
                                width: responsiveValues.navigationCardWidth,
                                minHeight:
                                  responsiveValues.navigationCardMinHeight,
                                borderRadius:
                                  responsiveValues.navigationCardBorderRadius,
                                padding: responsiveValues.navigationCardPadding,
                                shadowRadius: responsiveValues.shadowRadius,
                                shadowOffset: responsiveValues.shadowOffset,
                                elevation: responsiveValues.elevation,
                              },
                            ]}
                            onPress={() =>
                              navigation.navigate('Feelings' as never)
                            }>
                            <View
                              style={[
                                styles.cardImageContainer,
                                {
                                  width:
                                    responsiveValues.navigationCardImageSize
                                      .width,
                                  height:
                                    responsiveValues.navigationCardImageSize
                                      .height,
                                  borderRadius:
                                    responsiveValues.navigationCardImageBorderRadius,
                                },
                              ]}>
                              <FastImage
                                source={require('../assets/feelings.jpg')}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                }}
                                resizeMode={FastImage.resizeMode.contain}
                              />
                            </View>
                            <Text
                              style={[
                                styles.cardText,
                                {fontSize: responsiveValues.cardTextFontSize},
                              ]}>
                              Feelings
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View
                      style={{
                        width: '100%',
                        flex: 1,
                      }}>
                      <ImageGallery
                        images={validImages}
                        onRefresh={handleCantFindIt}
                        retryCount={retryCount}
                        maxRetries={MAX_RETRIES}
                        onAnswerSelected={handleAnswerSelected}
                        ttsService={TTSService}
                        answersCount={parseInt(preferences.answersCount) || 5}
                      />
                    </View>
                  );
                })()
              ) : (
                <>
                  <View
                    style={{
                      width: '100%',
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                    {waitingForNextConversation ? (
                      <View
                        style={[
                          styles.waitingForNextContainer,
                          {padding: responsiveValues.waitingContainerPadding},
                        ]}>
                        <Text
                          style={[
                            styles.waitingLabel,
                            {
                              fontSize: responsiveValues.transcriptionFontSize,
                              marginBottom:
                                responsiveValues.waitingLabelMarginBottom,
                            },
                          ]}>
                          Say{' '}
                          <Text style={{fontWeight: 'bold', color: 'blue'}}>
                            Hey Verbi
                          </Text>{' '}
                          to continue the conversation or tap below
                        </Text>
                        <TouchableOpacity
                          style={{
                            borderWidth: 1,
                            borderColor: 'blue',
                            borderRadius: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 10,
                            ...Platform.select({
                              ios: {
                                elevation: 10,
                              },
                            }),
                          }}
                          onPress={() => {
                            mixpanel.track('Contiuing the conversation', {
                              source: 'waiting_state_button',
                            });
                            setWaitingForNextConversation(false); // Exit waiting state immediately
                            playSound(); // This will trigger handleRecord()
                          }}>
                          <FastImage
                            source={require('../assets/talk.jpg')}
                            style={[
                              styles.iconSize,
                              responsiveValues.fetchingSize,
                            ]}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : stateof === 'Keyboard' ? null : isTranscribing ? ( // Keyboard mode handled by KeyboardHome view
                      <View style={{alignItems: 'center'}}>
                        <FastImage
                          source={require('../assets/movie/output.gif')}
                          style={[
                            styles.iconSize,
                            responsiveValues.fetchingSize,
                          ]}
                          resizeMode={FastImage.resizeMode.contain}
                        />
                        <Text
                          style={{
                            fontSize: responsiveValues.transcriptionFontSize,
                            fontWeight: 'bold',
                            color: '#FF6B35',
                            marginTop: 10,
                          }}>
                          Transcribing...
                        </Text>
                      </View>
                    ) : isRecording ? (
                      <View
                        style={[
                          styles.recordingContainer,
                          {
                            width: recordingContainerSize,
                            height: recordingContainerSize,
                            marginTop: Math.min(viewportHeight * 0.08, 48),
                          },
                        ]}>
                        <FastImage
                          source={require('../assets/movie/recording.gif')}
                          style={responsiveValues.recordingIconSize}
                          resizeMode={
                            isTablet
                              ? FastImage.resizeMode.center
                              : FastImage.resizeMode.contain
                          }
                        />
                        <Text
                          style={{
                            fontSize: responsiveValues.transcriptionFontSize,
                            fontWeight: 'bold',
                            color: '#8A2BE2',
                            marginTop: 18,
                          }}>
                          Recording...
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={{
                          width: '100%',
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <View style={{alignItems: 'center', marginBottom: 20}}>
                          <Text
                            style={{
                              fontSize: responsiveValues.transcriptionFontSize,
                              fontWeight: 'bold',
                              marginBottom: 10,
                            }}>
                            {`${transcribedText}`}
                          </Text>
                          {transcribedText && (
                            <Text
                              style={{
                                fontSize:
                                  responsiveValues.transcriptionFontSize * 0.7,
                                color: isUsingLocalWhisper
                                  ? '#4CAF50'
                                  : modelNotAvailable
                                  ? '#FF9800'
                                  : '#2196F3',
                                fontWeight: '500',
                                fontStyle: 'italic',
                              }}>
                              {isUsingLocalWhisper
                                ? '🔒 Local Whisper'
                                : modelNotAvailable
                                ? '☁️ Cloud (Model not downloaded)'
                                : '☁️ Cloud'}
                            </Text>
                          )}
                        </View>

                        {/* Show different loading states based on processing phase */}
                        {isRetrying ? (
                          <View style={{alignItems: 'center'}}>
                            <FastImage
                              source={require('../assets/movie/output.gif')}
                              style={[
                                styles.iconSize,
                                responsiveValues.fetchingSize,
                              ]}
                              resizeMode={FastImage.resizeMode.contain}
                            />
                            <Text
                              style={[
                                styles.retryText,
                                {
                                  fontSize: responsiveValues.retryFontSize,
                                  marginTop: 10,
                                },
                              ]}>
                              Getting more answers... (Attempt {retryCount}/
                              {MAX_RETRIES})
                            </Text>
                          </View>
                        ) : isProcessingAnswer ? (
                          <View style={{alignItems: 'center'}}>
                            <FastImage
                              source={require('../assets/movie/output.gif')}
                              style={[
                                styles.iconSize,
                                responsiveValues.fetchingSize,
                              ]}
                              resizeMode={FastImage.resizeMode.contain}
                            />
                            <Text
                              style={[
                                styles.retryText,
                                {
                                  fontSize: responsiveValues.retryFontSize,
                                  marginTop: 10,
                                },
                              ]}>
                              {localLlm.status === 'loading'
                                ? 'Loading on-device AI...'
                                : 'Finding answers...'}
                            </Text>
                          </View>
                        ) : transcribedText.length === 0 ? (
                          <FastImage
                            source={require('../assets/movie/output.gif')}
                            style={[
                              styles.iconSize,
                              responsiveValues.fetchingSize,
                            ]}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        ) : null}
                        {finishedTranscribing &&
                        (transcribedText.length === 0 ||
                          transcribedText === TRANSCRIPTIONERRORMESSAGE) ? (
                          <HomeButton
                            navigation={navigation}
                            onReset={resetLocalStates}
                            disabled={false}
                            inScreen={true}
                          />
                        ) : null}
                      </View>
                    )}
                  </View>
                </>
              )}
            </View>
            {isRecording && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.recordingScreenGlow,
                  {
                    opacity: recordingGlowOpacity,
                  },
                ]}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  inputNavigationContainer: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10,
  },
  recordingScreenGlow: Platform.select({
    // Android can't render shadows, so pulse a full-screen border instead.
    android: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderWidth: 5,
      borderColor: '#CE93D8',
      elevation: 30,
      zIndex: 999,
    },
    default: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 5,
      backgroundColor: '#CE93D8',
      shadowColor: '#8E24AA',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 1,
      shadowRadius: 14,
      zIndex: 999,
    },
  }),
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 25,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  playIcon: {
    fontSize: 40,
  },
  inlineNavigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  smallNavIcon: {
    fontSize: 24,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    alignSelf: 'center',
  },
  transcriptionButton: {
    position: 'absolute',
    top: 50,
    right: 10,
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  imageCardContainer: {
    width: '100%',
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },

  microphoneButton: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  iconSize: {
    // width and height are now handled dynamically, resizeMode is applied directly to FastImage
  },

  noImagesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImagesText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  galleryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    alignSelf: 'center',
  },
  refreshButton: {
    backgroundColor: '#ff5722',
    padding: 10,
    borderRadius: 5,
    margin: 10,
    alignItems: 'center',
    alignSelf: 'center',
  },
  refreshButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  retryText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 10,
  },
  matalkIcon: {
    position: 'absolute',
    bottom: 10,
    left: 10,
  },
  keyboardInputContainer: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },

  keyboardTextInput: {
    width: '100%',
    minHeight: 100,
    maxHeight: 200,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#FFF',
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  keyboardButtonsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
  },
  keyboardButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#ff5722',
    borderWidth: 2,
    borderColor: '#ff5722',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  submitButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  typingPreview: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  typingPreviewText: {
    fontSize: 16,
    color: '#333',
    fontStyle: 'italic',
  },
  typingDisplay: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    justifyContent: 'center',
  },
  typingDisplayText: {
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff5722',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 30,
  },
  navigationCardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  navigationCard: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    alignItems: 'center',
  },
  cardImageContainer: {
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardText: {
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  waitingForNextContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingLabel: {
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
  },
});

export default HomeScreen;
