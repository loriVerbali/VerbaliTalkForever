import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useNavigation,
  RouteProp,
} from '@react-navigation/native';

// Add imports for the components
import Inputs, { InputsRef } from '../Components/Inputs';
import ImageGallery from '../Components/ImageGallery';
import MatalkIcon from '../Components/MatalkIcon';
import { useAssistant } from '../contexts/AssistantContext';
import {
  useChatContext,
  getContextualInfo,
} from '../contexts/ChatContextProvider';
import TTSService from '../utils/TTSService';
import FastImage from 'react-native-fast-image';
import HomeButton from '../Components/HomeButton';
import fetchHelper from '../utils/fetcher';
import mixpanel from '../utils/mixpanelInstance';
import { logConversation } from '../utils/conversationLogger';
import { useAdmin } from '../contexts/adminContext';
import { views } from '../utils/constants';
import { useAppSettings } from '../utils/persistance';
import WakeWordService from '../utils/wakewordService';
import Voice from '@dev-amirzubair/react-native-voice';
import { useDatabase } from '../contexts/DatabaseContext';

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  Home: { stateof?: 'Attention' | 'Keyboard' | string };
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  route?: HomeScreenRouteProp;
}
const DEBUGWITHOUTTRANSCRIPTION = false;
const TRANSCRIPTIONERRORMESSAGE = "Verbi couldn't hear you. Tap Home to retry.";
const ISSUEMESSAGE = 'I am having an issue, Tap Home to retry';
const DEBUGTRANSCRIPTION = 'How was school today?';

const HomeScreen: React.FC<HomeScreenProps> = ({ route }) => {
  const {
    generateAnswers,
    conversationHistory,
    addToConversationHistory,
    updateLastAssistantMessage,
  } = useAssistant();
  const { weather, location } = useChatContext();
  const { isTablet } = useAdmin();
  const insets = useSafeAreaInsets();
  const { getItem, preferences } = useAppSettings();
  const { addUtterance, addAIResponseTime, addAIResolved } = useDatabase();
  const stateof = route?.params?.stateof ?? '';
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false); // Ref for sync guard against duplicate starts

  // Function to resolve pepes images for answer words
  const resolvePepesImage = async (word: string, fallbackUrl: string = '') => {
    try {
      const pepesData = await getItem('pepes');
      if (!pepesData) return fallbackUrl;

      const parsed = JSON.parse(pepesData);
      const allCategories = [
        'People',
        'Toys',
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
    } catch (error) { }

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
    Array<{ word: string; imageUrl?: string }>
  >([]);
  const [accumulatedPriors, setAccumulatedPriors] = useState<string[]>([]);
  // Removed local answersCount state - using preferences.answersCount

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
      ? { width: 45, height: 45 }
      : { width: 35, height: 35 },
    fetchingSize: isTablet
      ? { width: 200, height: 200 }
      : { width: 150, height: 150 },
    matalkIconSize: isTablet ? undefined : { transform: [{ scale: 0.8 }] },

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
      ? { width: width * 0.3, height: width * 0.3 }
      : { width: width * 0.25, height: width * 0.25 },
    recordingIconSize: isTablet
      ? { width: width * 0.4, height: width * 0.4 }
      : { width: width * 0.35, height: width * 0.2 },

    // Typography
    transcriptionFontSize: isTablet ? 22 : 18,
    retryFontSize: isTablet ? 18 : 16,
    keyboardTypingFontSize: isTablet ? 20 : 18,
    buttonFontSize: isTablet ? 18 : 16,
    errorFontSize: isTablet ? 20 : 18,
    cardTextFontSize: isTablet ? 18 : 16,

    // Button dimensions
    keyboardButtonPadding: isTablet
      ? { vertical: 14, horizontal: 35 }
      : { vertical: 12, horizontal: 30 },
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
      ? { width: 70, height: 70 }
      : { width: 60, height: 60 },
    navigationCardImageBorderRadius: isTablet ? 35 : 30,
    navigationCardImageIconSize: isTablet
      ? { width: '100%', height: '100%' }
      : { width: '100%', height: '100%' },

    // Shadow and elevation
    shadowRadius: isTablet ? 5 : 3,
    shadowOffset: isTablet ? { width: 0, height: 3 } : { width: 0, height: 2 },
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
  const [showImages, setShowImages] = useState(false);
  const [finishedTranscribing, setFinishedTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isUsingLocalWhisper, setIsUsingLocalWhisper] = useState(false);
  const [modelNotAvailable, setModelNotAvailable] = useState(false);
  const [voiceResults, setVoiceResults] = useState<string[]>([]);
  const [partialResult, setPartialResult] = useState<string>('');
  // Refs to capture the latest values (state is async, refs are sync)
  const voiceResultsRef = useRef<string[]>([]);
  const partialResultRef = useRef<string>('');
  const lastPartialUpdateTimeRef = useRef<number>(Date.now());
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SILENCE_TIMEOUT = 2000; // Stop recording if no new partial results for 2 seconds
  const MAX_RETRIES = 3;


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
        } catch (error) { }
      }

      setResponseTimerStart(null);
    }

    // Clear any existing timer
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  };

  // Flag to disable metering for performance
  const DISABLE_METERING = false;

  // Cache the useLocalWhisper setting to avoid repeated async calls
  const [cachedUseLocalWhisper, setCachedUseLocalWhisper] = useState<
    string | null
  >(null);

  // Removed settings loading useFocusEffect - now using reactive preferences

  useEffect(() => {
    try {
      // Always use Voice recognition
      setCachedUseLocalWhisper('1');

      // Request RECORD_AUDIO permission for Android before initializing Voice
      const granted = PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'This app needs access to your microphone to record audio',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
    } catch (error) { }

    Voice.onSpeechStart = () => {
      console.log('Voice: onSpeechStart');
    };

    // Set up speech end handler
    Voice.onSpeechEnd = () => {
      console.log('Voice: onSpeechEnd');
    };

    Voice.onSpeechError = (e: any) => {
      // Log detailed error info - error codes:
      // 1=NETWORK_TIMEOUT, 2=NETWORK, 3=AUDIO, 4=SERVER, 5=CLIENT,
      // 6=SPEECH_TIMEOUT, 7=NO_MATCH, 8=RECOGNIZER_BUSY, 9=INSUFFICIENT_PERMISSIONS
      console.error('Speech error:', JSON.stringify(e));
      console.error('Speech error code:', e?.error?.code);
      console.error('Speech error message:', e?.error?.message);
      setIsRecording(false);
      isRecordingRef.current = false;
    };
    // Set up final results handler
    // Note: event.value is an array of recognized text strings
    Voice.onSpeechResults = (event: any) => {
      if (event.value && event.value.length > 0) {
        // event.value is already an array of results
        setVoiceResults(event.value[0]);
        voiceResultsRef.current = event.value;
      }
    };

    // Set up partial results handler for streaming text
    Voice.onSpeechPartialResults = (event: any) => {
      let partialText = '';

      // event.value is an array of partial results
      if (event.value && event.value.length > 0) {
        partialText = event.value[0];
      }

      if (partialText) {
        // Update state for UI
        setPartialResult(partialText);
        // Update ref for sync access in processVoiceResults
        partialResultRef.current = partialText;

        // Update input field with partial result (streaming to input like iOS)
        if (inputsRef.current) {
          inputsRef.current.setInput(partialText);
        }

        // Reset silence timer - we got new input
        lastPartialUpdateTimeRef.current = Date.now();

        // Clear existing silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        // Set new silence timer - if no new partial results for 2 seconds, stop recording
        silenceTimerRef.current = setTimeout(async () => {
          // Only stop if we have some text and are still recording
          if (partialResultRef.current.trim().length > 0) {
            await stopRecording();
          }
        }, SILENCE_TIMEOUT);
      }
    };

    const loadGobackAfterSelectionSetting = async () => {
      try {
        const setting = await getItem('gobackAfterSelection');
        setGobackAfterSelection(setting === '1');
      } catch (error) { }
    };

    // Load the setting
    loadGobackAfterSelectionSetting();

    // Setup audio recording

    // Track screen opening
    mixpanel.track('Conversation', {
      Opened: 'Conversation',
    });
    if (stateof === 'Attention') {
      console.log(
        `[Home] Entering Attention state (Android). Current answersCount: ${preferences.answersCount}`,
      );
      // wakeWord.stopListening();
      handleRecord();
    }
    if (stateof === 'Keyboard') {
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.stopListening();
    }

    // Cleanup function
    return () => {
      Voice.destroy();
    };
  }, [stateof]);

  // Cleanup useEffect for wake word service and timers
  useEffect(() => {
    return () => {
      // Always cleanup wake word service
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.stopListening();

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

  const playSound = async () => {
    handleRecord();
  };

  const handleRecord = async () => {
    // Prevent multiple simultaneous recordings using ref (sync check)
    if (isRecordingRef.current) {
      return;
    }

    // Set ref immediately to prevent race conditions
    isRecordingRef.current = true;

    // CRITICAL: Stop WakeWordService before starting Voice recognition
    // WakeWordService uses the microphone and must release it for Voice to work
    // IMPORTANT: On first launch, WakeWordService might be INITIALIZING (not yet listening)
    // but the native ONNX module could still be grabbing audio resources
    // cleanup() waits for pending initialization AND releases all resources
    try {
      const wakeWordService = WakeWordService.getInstance();
      const status = wakeWordService.getStatus();

      // Use cleanup() which:
      // 1. Waits for any pending startingPromise
      // 2. Waits for any pending initializingPromise (CRITICAL for first launch!)
      // 3. Calls stopListening()
      // 4. Releases all native resources

      await wakeWordService.cleanup();

      // Longer delay on Android to ensure microphone is fully released
      // Android audio system can take time to release resources
      await new Promise<void>(resolve => setTimeout(resolve, 800));
    } catch (error) {
      // Even if there's an error, wait longer before trying Voice
      await new Promise<void>(resolve => setTimeout(resolve, 500));
    }

    // Track microphone press
    mixpanel.track('Microphone Pressed');

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'This app needs access to your microphone to record audio',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Microphone permission denied');
    }
    lastSoundTimeRef.current = 0;
    metering.current = -100;

    try {
      // Clear previous voice results and partial results (both state and refs)
      setVoiceResults([]);
      setPartialResult('');
      voiceResultsRef.current = [];
      partialResultRef.current = '';
      lastPartialUpdateTimeRef.current = Date.now();

      // Clear any existing silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      setIsRecording(true);
      setIsUsingLocalWhisper(true); // Voice uses device recognition

      // Start Voice recognition with locale
      // NOTE: Don't force RECOGNIZER_ENGINE - let Android choose the best available
      // Using 'en-US' format (with hyphen) which is more widely supported
      await Voice.start('en-US', {
        EXTRA_PARTIAL_RESULTS: true,
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 5000,
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
      });

      // Set timer to stop recording after 20 seconds
      recordingTimer.current = setTimeout(async () => {
        await stopRecording();
      }, 20000);
    } catch (error) {
      setFinishedTranscribing(true);
      const errorMessage = (error as Error).message || 'Unknown error';
      setTranscribedText(
        errorMessage.includes('not available')
          ? 'Voice recognition is not available. Please check your device settings.'
          : ISSUEMESSAGE + errorMessage,
      );
      TTSService.speak(
        'Voice recognition failed. Please check your microphone settings.',
        true,
      );
      setIsRecording(false);
      isRecordingRef.current = false; // Reset ref on error
    }
  };

  const stopRecording = async () => {
    try {
      // Clear timer first to prevent multiple calls
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }

      // Clear silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // Stop Voice recognition
      await Voice.stop();
      console.log('stopRecording: Voice.stop() called');

      setIsRecording(false);
      isRecordingRef.current = false; // Reset ref
      setIsTranscribing(true);

      // Process the voice results using refs (which are captured synchronously)
      // Small delay to allow any final onResults event to fire
      setTimeout(() => {
        processVoiceResults();
      }, 300); // Small delay to ensure results are captured
    } catch (error) {
      console.log('stopRecording: Error', error);
      setIsRecording(false);
      isRecordingRef.current = false; // Reset ref on error
      setIsTranscribing(false);
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
    }
  };

  // Process Voice recognition results
  const processVoiceResults = async () => {
    try {
      setIsTranscribing(true);

      // Use refs instead of state to get the latest values (refs are synchronous)
      const currentVoiceResults = voiceResultsRef.current;
      const currentPartialResult = partialResultRef.current;

      // Get the best result from voiceResults, fallback to partialResult if voiceResults is empty
      let transcribedText = '';
      if (currentVoiceResults.length > 0) {
        transcribedText = currentVoiceResults[0].trim();
      } else if (currentPartialResult.trim().length > 0) {
        // If we have partial results but no final results, use the partial
        transcribedText = currentPartialResult.trim();
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
        setFinishedTranscribing(true);
        setTranscribedText(transcribedText);
        setIsProcessingAnswer(true);

        // Set the transcribed text in the top input
        if (inputsRef.current) {
          inputsRef.current.setInput(transcribedText);
        }

        // Get context info
        const contextInfo = getCachedContextInfo();
        const corePrompt = `User asked: "${transcribedText}"`;
        const contextPrompt = `Context: ${contextInfo}`;
        const messageWithContext = `${corePrompt}. ${contextPrompt}`;

        try {
          // Use the new generateAnswers function
          const currentAnswersCount = parseInt(preferences.answersCount) || 5;
          console.log(
            `[Home] Requesting AI answers (Android). Count: ${currentAnswersCount} (from preference: "${preferences.answersCount}")`,
          );
          const answers = await generateAnswers(transcribedText, {
            mode: 'generate_answers',
            metadata: {
              contextInfo: contextInfo, // Weather, time, and location context
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
            const answerWords = processedAnswers.map(answer => answer.word);
            setAccumulatedPriors(answerWords);
            setIsProcessingAnswer(false);
            setShowImages(true);
            startResponseTimer();

            setCurrentAIRecord({
              question: transcribedText,
              round1Answers: answerWords,
              currentRound: 1,
            });

            // Add to conversation history with "Suggested" prefix
            const assistantResponse = `Suggested: ${processedAnswers
              .map(answer => answer.word)
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
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsTranscribing(false);
    }
  };

  // Removed useEffect that depended on status and imageUrls since we're using direct answers now

  // Handle assistant failure status
  // useEffect(() => {
  //   if (status === 'failed') {
  //     setIsProcessingAnswer(false);
  //     setIsRetrying(false);
  //     setShowImages(false);
  //     TTSService.speak(
  //       'We had a problem processing that. Please try again.',
  //       true,
  //     );
  //   }
  // }, [status]);

  // Reset function for local states
  const resetLocalStates = () => {
    // Stop response timer if running
    stopResponseTimer('home');

    setFinishedTranscribing(false);
    setTranscribedText('');
    setShowImages(false);
    setIsTranscribing(false); // Reset transcription state
    setIsRecording(false); // Reset recording state
    setWaitingForNextConversation(false); // Reset waiting state
    setIsUsingLocalWhisper(false); // Reset transcription method indicator
    setModelNotAvailable(false); // Reset model availability indicator
    setDirectAnswers([]); // Reset direct answers
    setAccumulatedPriors([]); // Reset accumulated priors
    setCurrentAIRecord(null); // Clear AI Resolved record
    setPartialResult(''); // Clear partial results
    voiceResultsRef.current = []; // Clear refs too
    partialResultRef.current = '';
    // Note: Don't reset cachedUseLocalWhisper as it won't change during session

    // Clear silence timer
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
      wakeWordService.stopListening();
    }
  };

  // Function to handle "Can't find it" button press
  const handleCantFindIt = async () => {
    if (!transcribedText || isRetrying || retryCount >= MAX_RETRIES) {
      if (retryCount >= MAX_RETRIES) {
        TTSService.speak(
          'You have reached the maximum number of retry attempts. Please try a new question.',
          true,
        );
      }
      return;
    }

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

        // Add to conversation history with "Suggested" prefix
        const assistantResponse = `Suggested: ${processedAnswers
          .map(answer => answer.word)
          .join(', ')}`;
        addToConversationHistory(transcribedText, assistantResponse);
      } else {
        setIsProcessingAnswer(false);
        setIsRetrying(false);
        TTSService.speak('Failed to get more answers. Please try again.', true);
        setRetryCount(prev => prev - 1);
      }
    } catch (error) {
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

    // Stop response timer if running
    stopResponseTimer('card');

    // Extract all possible answers from directAnswers
    const possibleAnswers = directAnswers
      .filter(item => item && item.word)
      .map(item => item.word);

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
      setAccumulatedPriors([]); // Reset accumulated priors on selection
    }

    // Update AI Resolved record with the selected answer
    if (currentAIRecord) {
      const updatedRecord = { ...currentAIRecord };

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
        } catch (error) { }

        // Clear the current AI record
        setCurrentAIRecord(null);
      } else {
        // Update the current record for next round
        setCurrentAIRecord(updatedRecord);
      }
    }

    // Send the selected answer back for learning feedback
    try {
      await generateAnswers(transcribedText, {
        mode: 'learning_feedback',
      });
    } catch (error) {
      // Don't block the user flow if learning feedback fails
    }

    // Only navigate back to Open if not currently retrying/getting more answers
    if (selectedAnswer !== 'MoreAnswers') {
      // Wait 1 second to allow user to hear the selected answer being spoken
      setTimeout(async () => {
        // Reset assistant state
        setDirectAnswers([]);
        setAccumulatedPriors([]); // Clear accumulated priors

        // Navigate to Open.tsx only if gobackAfterSelection is true
        if (gobackAfterSelection) {
          resetLocalStates();
          navigation.navigate(views.OPEN as never);
        } else {
          // NEW: Set waiting state and activate wake word
          setWaitingForNextConversation(true);
          setDirectAnswers([]);
          setAccumulatedPriors([]); // Reset accumulated priors

          // Reset states but preserve waitingForNextConversation
          setFinishedTranscribing(false);
          setTranscribedText('');
          setShowImages(false);
          setIsRetrying(false);
          setRetryCount(0);
          setIsProcessingAnswer(false);
          setIsTranscribing(false);
          setIsRecording(false);
          isRecordingRef.current = false; // Reset ref too
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

          // Activate wake word listening
          // NOTE: handleRecord() called cleanup() earlier, so WakeWordService needs to reinitialize
          try {
            // IMPORTANT: Destroy Voice to fully release the microphone before starting wake word

            await Voice.destroy();

            // Longer delay to ensure Android has fully released the microphone
            await new Promise<void>(resolve => setTimeout(resolve, 800));

            const wakeWordService = WakeWordService.getInstance();


            // Set callback first
            wakeWordService.setCallback((phrase: string) => {
              // When wake word detected, start new conversation
              setWaitingForNextConversation(false);
              playSound(); // This will trigger handleRecord()
            });

            // Start listening - this will reinitialize the service since cleanup() was called
            await wakeWordService.startListening();

            const statusAfter = wakeWordService.getStatus();


            // Verify it's actually listening
            if (!wakeWordService.isCurrentlyListening()) {
              console.error(
                'handleAnswerSelected: WakeWordService failed to start listening!',
              );
            }
          } catch (error) {
            console.error(
              'handleAnswerSelected: Error starting WakeWordService:',
              error,
            );
            // Fallback: allow manual trigger
            setWaitingForNextConversation(true);
          }
        }
      }, 1000);
    }
  };

  // handleKeyboardSubmit, handleKeyboardInputChange, handleKeyboardCancel moved to KeyboardHome
  const handlePolish = () => {
    // Moved to KeyboardHome
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.container,
          Platform.OS === 'android' ? { paddingTop: width * 0.03 } : {},
          { backgroundColor: '#FFF8E7' }
        ]}>
        {stateof === 'Keyboard' ? null : (
          <View
            style={[
              styles.microphoneButton,
              {
                top: responsiveValues.microphoneButtonTop,
                left: responsiveValues.microphoneButtonLeft,
                width: responsiveValues.microphoneButtonSize,
                height: responsiveValues.microphoneButtonSize,
              },
            ]}>
            <FastImage
              source={require('../assets/michrophone.gif')}
              style={[styles.iconSize, responsiveValues.microphoneSize]}
              resizeMode={FastImage.resizeMode.contain}
            />
          </View>
        )}

        {/* Home Button */}
        <HomeButton navigation={navigation} onReset={resetLocalStates} />



        {/* Matalk Icon */}
        <View style={[styles.matalkIcon, responsiveValues.matalkIconSize]}>
          <MatalkIcon />
        </View>

        {/* Input and Navigation Section */}
        <View
          style={[
            styles.inputNavigationContainer,
            stateof === 'Keyboard'
              ? { height: 0, opacity: 0 }
              : {
                height: responsiveValues.inputNavigationHeight,
                marginTop: Math.max(insets.top, 10)
              },
          ]}>
          {stateof !== 'Keyboard' && (
            <Inputs
              ref={inputsRef}
              mode={stateof}
            />
          )}
        </View>

        <View style={{ flex: 1, width: '100%' }}>
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
              style={[styles.imageCardContainer, { zIndex: 10 }]}
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
                          url: { url: item.imageUrl || '' },
                          prompt: item.word || '',
                        };
                      } catch (err) {
                        return null;
                      }
                    })
                    .filter(
                      (item): item is { url: { url: string }; prompt: string } =>
                        item !== null,
                    );

                  if (validImages.length === 0) {
                    return (
                      <View style={styles.errorContainer}>
                        <Text
                          style={[
                            styles.errorText,
                            { fontSize: responsiveValues.errorFontSize },
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
                            onPress={() =>
                              navigation.navigate('ShortCuts' as never)
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
                                source={require('../assets/shortCuts.png')}
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
                                { fontSize: responsiveValues.cardTextFontSize },
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
                                source={require('../assets/feelings.png')}
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
                                { fontSize: responsiveValues.cardTextFontSize },
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
                          { padding: responsiveValues.waitingContainerPadding },
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
                          <Text style={{ fontWeight: 'bold', color: 'blue' }}>
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
                            setWaitingForNextConversation(false); // Exit waiting state immediately
                            playSound(); // This will trigger handleRecord()
                          }}>
                          <FastImage
                            source={require('../assets/talk.png')}
                            style={[
                              styles.iconSize,
                              responsiveValues.fetchingSize,
                            ]}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : stateof === 'Keyboard' ? (
                      null // Keyboard mode handled by KeyboardHome view
                    ) : isTranscribing ? (
                      <View style={{ alignItems: 'center' }}>
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
                      <View style={{ alignItems: 'center' }}>
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
                            color: '#FF0000',
                            marginTop: 10,
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
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
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
                          <View style={{ alignItems: 'center' }}>
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
                          <View style={{ alignItems: 'center' }}>
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
                              Finding answers...
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
    width: height * 0.4,
    height: height * 0.4,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderRadius: height * 0.2,
    backgroundColor: 'rgba(255,0,0,0.1)',
    borderWidth: 2,
    borderColor: '#ff0000',
    marginTop: height * 0.2,
    zIndex: 10,
  },
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
  input: {
    flex: 1,
    height: height * 0.15,
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: height * 0.07,
    marginHorizontal: 10,
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
    marginTop: height * 0.02,
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
    justifyContent: 'center',
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
