import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';

import {useNavigation, RouteProp} from '@react-navigation/native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

import Inputs, {InputsRef} from '../Components/Inputs';
import ImageGallery from '../Components/ImageGallery';
import MatalkIcon from '../Components/MatalkIcon';
import {useAssistant} from '../contexts/AssistantContext';
import {useSound} from '../contexts/soundContext';
import {
  useChatContext,
  getContextualInfo,
} from '../contexts/ChatContextProvider';
import TTSService from '../utils/TTSService';
import LinearGradient from 'react-native-linear-gradient';
import FastImage from 'react-native-fast-image';
import HomeButton from '../Components/HomeButton';
import fetchHelper from '../utils/fetcher';
import {Mixpanel} from 'mixpanel-react-native';
import {logConversation} from '../utils/conversationLogger';
import {useAdmin} from '../contexts/adminContext';
import {views} from '../utils/constants';
import {useAppSettings} from '../utils/persistance';
import WakeWordService from '../utils/wakewordService';
import AudioSessionManager from '../utils/AudioSessionManager';
import WhisperService from '../utils/WhisperService';
import {useDatabase} from '../contexts/DatabaseContext';

const {width, height} = Dimensions.get('window');

type RootStackParamList = {
  Home: {stateof?: 'Attention' | 'Keyboard' | string};
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  route?: HomeScreenRouteProp;
}
const DEBUGWITHOUTTRANSCRIPTION = false;
const TRANSCRIPTIONERRORMESSAGE = "Verbi couldn't hear you. Tap Home to retry.";
const ISSUEMESSAGE = 'I am having an issue, Tap Home to retry';
const DEBUGTRANSCRIPTION = 'How was your practice today?';

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {generateAnswers} = useAssistant();
  const {weather, location} = useChatContext();
  const {isTablet} = useAdmin();
  const {getItem, preferences} = useAppSettings();
  const {addUtterance, addAIResponseTime, addAIResolved} = useDatabase();
  const stateof = route?.params?.stateof ?? '';
  const [isRecording, setIsRecording] = useState(false);

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

  // Function to manage conversation history with sliding window
  const addToConversationHistory = (
    userMessage: string,
    assistantResponse: string,
    maxHistoryLength: number = 20, // Keep last 20 exchanges
  ) => {
    setConversationHistory(prev => {
      const newHistory = [
        ...prev,
        {role: 'user' as const, content: userMessage, timestamp: Date.now()},
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

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const [gobackAfterSelection, setGobackAfterSelection] = useState(true);
  const [waitingForNextConversation, setWaitingForNextConversation] =
    useState(false);
  const [directAnswers, setDirectAnswers] = useState<
    Array<{word: string; imageUrl?: string}>
  >([]);

  // Conversation history state
  const [conversationHistory, setConversationHistory] = useState<
    Array<{role: 'user' | 'assistant'; content: string; timestamp: number}>
  >([]);

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
      : {width: 150, height: 150},
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
      ? {width: width * 0.4, height: width * 0.4}
      : {width: width * 0.35, height: width * 0.2},

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
  const [keyboardInput, setKeyboardInput] = useState('');
  const [debouncedKeyboardInput, setDebouncedKeyboardInput] = useState('');
  const [isSubmittingKeyboard, setIsSubmittingKeyboard] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputsRef = useRef<InputsRef>(null);
  const metering = useRef<number>(-100);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const {playAttention} = useSound();
  const navigation = useNavigation();
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialResultsTimer = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const lastPartialUpdateTime = useRef<number | null>(null);
  const lastPartialResult = useRef<string>('');
  const recordingStartTime = useRef<number | null>(null);
  const silenceDetectionTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [showImages, setShowImages] = useState(false);
  const [finishedTranscribing, setFinishedTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isUsingLocalWhisper, setIsUsingLocalWhisper] = useState(false);
  const [modelNotAvailable, setModelNotAvailable] = useState(false);
  const MAX_RETRIES = 3;
  const mixpanel = new Mixpanel('f88f7a27585868c53b1e08c06f5226bd', true);
  let currentRecordingURI: string | null = null;

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

  useEffect(() => {
    // Load gobackAfterSelection setting
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
      // wakeWord.stopListening();
      mixpanel.track('Recording Restarted', {
        source: 'attention_state',
      });
      playSound();
    }
    if (stateof === 'Keyboard') {
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.stopListening();
    }
  }, []);

  // Cleanup useEffect for wake word service and Whisper
  useEffect(() => {
    return () => {
      // Always cleanup wake word service
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.stopListening();

      // Only cleanup Whisper service when component actually unmounts
      // Don't destroy it when just waiting for next conversation
      WhisperService.destroy().catch(error => {});

      // Cleanup response timer
      if (responseTimerRef.current) {
        clearTimeout(responseTimerRef.current);
        responseTimerRef.current = null;
      }

      // Cleanup partial results timer
      if (partialResultsTimer.current) {
        clearInterval(partialResultsTimer.current);
        partialResultsTimer.current = null;
      }

      // Cleanup silence detection timer
      if (silenceDetectionTimer.current) {
        clearTimeout(silenceDetectionTimer.current);
        silenceDetectionTimer.current = null;
      }

      // Cleanup recording timer
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }
    };
  }, []);

  const playSound = async () => {
    // COMMENTED OUT FOR TESTING
    // playAttention();
    handleRecord();
  };
  // put this near your module top:

  const handleRecord = async () => {
    if (isRecording) return;

    // Track microphone press
    mixpanel.track('Microphone Pressed');

    try {
      // Check and request microphone permission
      const micPermission = await check(PERMISSIONS.IOS.MICROPHONE);

      if (micPermission === RESULTS.DENIED) {
        const result = await request(PERMISSIONS.IOS.MICROPHONE);
        if (result !== RESULTS.GRANTED) {
          mixpanel.track('Error', {
            error_type: 'microphone_permission_denied',
            error_message: 'Microphone permission denied by user',
          });
          setFinishedTranscribing(true);
          setTranscribedText('Microphone permission is required');
          TTSService.speak('Please allow microphone access in Settings', true);
          return;
        }
      } else if (micPermission === RESULTS.BLOCKED) {
        mixpanel.track('Error', {
          error_type: 'microphone_permission_blocked',
          error_message: 'Microphone permission blocked',
        });
        setFinishedTranscribing(true);
        setTranscribedText('Microphone permission is blocked');
        TTSService.speak('Please enable microphone access in Settings', true);
        return;
      }

      // Kill any audio that might hold the session
      try {
        await TTSService.stop?.();
      } catch {}
      try {
        const w = WakeWordService.getInstance();
        w.stopListening();
      } catch {}

      // Prepare audio session for Whisper (after stopping wakeword)
      await AudioSessionManager.prepareForWhisper();

      // Add a small delay to ensure audio session is released
      await new Promise<void>(resolve => setTimeout(resolve, 200));

      // Start real-time transcription with WhisperService

      const started = await WhisperService.startRealTimeTranscription();

      if (!started) {
        mixpanel.track('Error', {
          error_type: 'whisper_start_failed',
          error_message:
            'WhisperService.startRealTimeTranscription returned false',
        });
        setFinishedTranscribing(true);
        setTranscribedText(ISSUEMESSAGE);
        setIsRecording(false);
        TTSService.speak('I am having an issue, Tap Home to retry', true);
        return;
      }

      setIsRecording(true);
      setIsUsingLocalWhisper(true); // Real-time transcription uses local Whisper

      // Reset silence detection
      recordingStartTime.current = Date.now();
      lastPartialUpdateTime.current = Date.now();
      lastPartialResult.current = '';
      if (silenceDetectionTimer.current) {
        clearTimeout(silenceDetectionTimer.current);
        silenceDetectionTimer.current = null;
      }

      // Start polling for partial results to display in input
      partialResultsTimer.current = setInterval(() => {
        const partialResult = WhisperService.getRealTimeResult();
        if (partialResult && partialResult.trim().length > 0) {
          // Update input field with partial result
          if (inputsRef.current) {
            inputsRef.current.setInput(partialResult);
          }

          // If the result changed, update the timestamp and reset silence timer
          if (partialResult !== lastPartialResult.current) {
            lastPartialUpdateTime.current = Date.now();
            lastPartialResult.current = partialResult;

            // Clear any existing silence detection timer
            if (silenceDetectionTimer.current) {
              clearTimeout(silenceDetectionTimer.current);
              silenceDetectionTimer.current = null;
            }

            // Set a new timer: if no update for 2 seconds, auto-stop
            silenceDetectionTimer.current = setTimeout(() => {
              // Double-check: if still no change after 2 seconds, stop recording
              const currentResult = WhisperService.getRealTimeResult();
              const timeSinceRecordingStart = recordingStartTime.current
                ? Date.now() - recordingStartTime.current
                : 0;

              // Only auto-stop if:
              // 1. We have text
              // 2. The text hasn't changed (still silence)
              // 3. We've been recording for at least 1 second (safety check)
              if (
                currentResult === lastPartialResult.current &&
                currentResult.trim().length > 0 &&
                timeSinceRecordingStart >= 1000
              ) {
                stopRecording();
              }
            }, 2000);
          }
        } else if (lastPartialResult.current.trim().length > 0) {
          // If we had text before but now it's empty, still track silence
          // This handles edge cases where transcription might clear temporarily
          if (!silenceDetectionTimer.current) {
            silenceDetectionTimer.current = setTimeout(() => {
              const currentResult = WhisperService.getRealTimeResult();
              const timeSinceRecordingStart = recordingStartTime.current
                ? Date.now() - recordingStartTime.current
                : 0;

              if (
                currentResult.trim().length > 0 &&
                timeSinceRecordingStart >= 1000
              ) {
                stopRecording();
              }
            }, 2000);
          }
        }
      }, 500); // Poll every 500ms for smooth updates

      // Auto-stop after 8 seconds (real-time will handle up to 300 seconds based on config)
      recordingTimer.current = setTimeout(stopRecording, 8000);
    } catch (error) {
      // Clear partial results polling timer on error
      if (partialResultsTimer.current) {
        clearInterval(partialResultsTimer.current);
        partialResultsTimer.current = null;
      }

      mixpanel.track('Error', {
        error_type: 'handle_record_error',
        error_message: error instanceof Error ? error.message : String(error),
      });
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      setIsRecording(false);
      TTSService.speak('I am having an issue, Tap Home to retry', true);
    }
  };

  const stopRecording = async () => {
    try {
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }

      // Clear silence detection timer
      if (silenceDetectionTimer.current) {
        clearTimeout(silenceDetectionTimer.current);
        silenceDetectionTimer.current = null;
      }

      // Clear partial results polling timer
      if (partialResultsTimer.current) {
        clearInterval(partialResultsTimer.current);
        partialResultsTimer.current = null;
      }

      // Reset recording start time
      recordingStartTime.current = null;

      setIsRecording(false);
      setIsTranscribing(true);

      // Stop real-time transcription and get the result
      const transcribedText = await WhisperService.stopRealTimeTranscription();

      if (!transcribedText || transcribedText.trim().length === 0) {
        mixpanel.track('Error', {
          error_type: 'empty_transcription',
          error_message: 'No transcription result from WhisperService',
        });
        setFinishedTranscribing(true);
        setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
        setIsTranscribing(false);
        // Prepare for TTS before speaking
        await AudioSessionManager.prepareForTTS();
        TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        return;
      }

      // Prepare audio session for TTS (after stopping Whisper)
      await AudioSessionManager.prepareForTTS();

      // Process the transcription result directly
      await processTranscriptionResult(transcribedText.trim());
    } catch (e) {
      mixpanel.track('Error', {
        error_type: 'stop_recording_error',
        error_message: e instanceof Error ? e.message : String(e),
      });
      setIsRecording(false);
      setIsTranscribing(false);
      setTranscribedText(ISSUEMESSAGE);
      setFinishedTranscribing(true);
      TTSService.speak('I am having an issue, Tap Home to retry', true);
    }
  };

  // Process transcription result (extracted from transcribeAudio for reuse)
  const processTranscriptionResult = async (transcribedText: string) => {
    try {
      // Filter out common false positives from Whisper
      const falsePositives = [
        'Thank you for watching!',
        'Thank you for watching.',
        'Thanks for watching!',
        'Thanks for watching.',
        'Thank you.',
        '. .',
        '.',
      ];

      if (
        transcribedText.length === 0 ||
        falsePositives.includes(transcribedText)
      ) {
        mixpanel.track('Error', {
          error_type: 'invalid_transcription',
          error_message: 'Empty transcription or false positive detected',
        });
        setFinishedTranscribing(true);
        setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
        setIsTranscribing(false);
        TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        return;
      }

      // Valid transcription - process it
      mixpanel.track('Question Asked');
      setFinishedTranscribing(true);
      setTranscribedText(transcribedText);
      setIsProcessingAnswer(true);
      setIsTranscribing(false);

      // Set the transcribed text in the top input
      if (inputsRef.current) {
        inputsRef.current.setInput(transcribedText);
      }

      // Get cached context info
      const contextInfo = getCachedContextInfo();
      const corePrompt = `User asked: "${transcribedText}"`;
      const contextPrompt = `Context: ${contextInfo}`;
      const messageWithContext = `${corePrompt}. ${contextPrompt}`;

      // Get pepes data for context
      const pepesData = await getItem('pepes');
      const parsedPepes = pepesData ? JSON.parse(pepesData) : null;

      // Generate answers
      const answers = await generateAnswers(transcribedText, {
        mode: 'generate_answers',
        metadata: {
          kidName: preferences?.heroName || 'I',
          speaker: 'anyone',
          audience: preferences?.heroName || 'my',
          pepes: parsedPepes,
          conversationHistory: conversationHistory,
        },
        countMin: 5,
        countMax: 5,
        genderType: preferences?.gender || 'white boy',
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
        setIsProcessingAnswer(false);
        setShowImages(true);
        startResponseTimer();

        // Initialize AI Resolved record for Round 1
        const answerWords = processedAnswers.map(answer => answer.word);
        setCurrentAIRecord({
          question: transcribedText,
          round1Answers: answerWords,
          currentRound: 1,
        });

        // Add to conversation history
        const assistantResponse = processedAnswers
          .map(answer => answer.word)
          .join(', ');
        addToConversationHistory(transcribedText, assistantResponse);
      } else {
        mixpanel.track('Error', {
          error_type: 'no_answers_generated',
          error_message: 'generateAnswers returned empty array',
        });
        setIsProcessingAnswer(false);
        TTSService.speak('I am having an issue, Tap Home to retry', true);
      }
    } catch (error) {
      mixpanel.track('Error', {
        error_type: 'process_transcription_error',
        error_message: error instanceof Error ? error.message : String(error),
      });
      setIsProcessingAnswer(false);
      setIsTranscribing(false);
      TTSService.speak(
        'Failed to process your request. Please try again.',
        true,
      );
    }
  };

  // Local Whisper transcription - no fallback to cloud
  const transcribeAudioWithWhisper = async (audioPath: string) => {
    const audioUri = audioPath.replace('file://', '');

    try {
      setIsUsingLocalWhisper(true);
      const whisperResult = await WhisperService.transcribeAudio(audioUri);

      if (whisperResult.success && whisperResult.text.trim().length > 0) {
        return {text: whisperResult.text.trim(), isLocal: true};
      } else {
        // No fallback to cloud - throw error if local fails
        setIsUsingLocalWhisper(false);
        throw new Error(
          whisperResult.error || 'Local Whisper transcription failed',
        );
      }
    } catch (error) {
      setIsUsingLocalWhisper(false);
      throw error;
    }
  };
  // Cloud-based transcription (original method)
  const transcribeAudioCloud = async (audioPath: string) => {
    if (!audioPath) {
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);

      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      return;
    }

    const formData = new FormData();
    // Fix the file URI handling - ensure proper format for React Native FormData
    let audioUri = audioPath;

    // For Android, ensure the URI starts with 'file://' for FormData
    if (Platform.OS === 'android') {
      // Add file:// prefix for Android FormData
      audioUri = `file://${audioPath}`;
    } else {
      // For iOS, the path should be used as-is from the recorder
      audioUri = audioPath.replace('file://', '');
    }

    const fileObj =
      Platform.OS === 'android'
        ? {
            uri: audioUri,
            type: 'audio/mp3',
            name: 'sound.mp3',
            filename: 'sound.mp3', // Add filename for Android
          }
        : {
            uri: audioUri,
            type: 'audio/x-m4a',
            name: 'recording.m4a',
          };

    formData.append('file', fileObj);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const transcribeResponse = await fetchHelper(
      'transcribeAudio',
      {},
      formData,
    );
    return transcribeResponse;
  };

  const transcribeAudio = async (audioPath: string) => {
    setIsTranscribing(true);
    // Always use local Whisper - cloud disabled
    setIsUsingLocalWhisper(true);

    if (!audioPath) {
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      // Reset audio recording state

      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      setIsTranscribing(false);
      return;
    }

    try {
      let transcribeResponse: any;
      if (!DEBUGWITHOUTTRANSCRIPTION) {
        try {
          // Always use local Whisper - no cloud fallback
          transcribeResponse = await transcribeAudioWithWhisper(audioPath);
        } catch (whisperError) {
          mixpanel.track('Error', {
            error_type: 'whisper_transcription_error',
            error_message:
              whisperError instanceof Error
                ? whisperError.message
                : String(whisperError),
          });
          setFinishedTranscribing(true);
          setTranscribedText(ISSUEMESSAGE);
          TTSService.speak('I am having an issue, Tap Home to retry', true);
          setIsRecording(false);
          setIsTranscribing(false);
          return;
        }
      } else {
        transcribeResponse = {text: DEBUGTRANSCRIPTION};
      }

      if (transcribeResponse?.text) {
        const transcribedText = transcribeResponse.text.trim();

        // Use the new processTranscriptionResult function
        await processTranscriptionResult(transcribedText);
        setIsRecording(false);
      } else {
        setFinishedTranscribing(true);
        setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
        TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        setIsRecording(false);
        setIsTranscribing(false);
      }
    } catch (error) {
      mixpanel.track('Error', {
        error_type: 'transcribe_audio_error',
        error_message: error instanceof Error ? error.message : String(error),
      });
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  // Removed useEffect that depended on status and imageUrls since we're using direct answers now

  // Reset function for local states
  const resetLocalStates = () => {
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
    setKeyboardInput(''); // Reset keyboard input
    setDebouncedKeyboardInput('');
    setIsSubmittingKeyboard(false);
    setWaitingForNextConversation(false); // Reset waiting state
    setIsUsingLocalWhisper(false); // Reset transcription method indicator
    setModelNotAvailable(false); // Reset model availability indicator
    setDirectAnswers([]); // Reset direct answers
    setConversationHistory([]); // Clear conversation history
    setCurrentAIRecord(null); // Clear AI Resolved record

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

      // Capture current answers before clearing to pass as prior
      const priorAnswers = directAnswers
        .map(answer => answer.word)
        .filter(word => word); // Get the 5 words that were shown

      // Clear old images immediately to prevent flickering
      setDirectAnswers([]);
      setRetryCount(prev => prev + 1);

      // Get contextual information (time, weather, location, special places)
      const contextInfo = getCachedContextInfo();

      // Create a retry message asking for more alternatives
      const retryMessage = `${contextInfo}. User said: "${transcribedText}". The user couldn't find what they were looking for in the previous answers. Please provide 5 different alternative answers or suggestions.`;

      // Get pepes data for context
      const pepesData = await getItem('pepes');
      const parsedPepes = pepesData ? JSON.parse(pepesData) : null;

      // Use generateAnswers to get more answers
      const answers = await generateAnswers(transcribedText, {
        mode: 'generate_more_answers',
        metadata: {
          kidName: preferences?.heroName || 'I',
          speaker: 'anyone',
          audience: preferences?.heroName || 'my',
          pepes: parsedPepes, // Include pepes data for better context
          conversationHistory: conversationHistory, // Include conversation history
        },
        prior: {
          answers: priorAnswers || [], // Pass the 5 current answers so they aren't shown again
        },
        countMin: 5,
        countMax: 5,
        genderType: preferences?.gender || 'white boy',
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
        setIsProcessingAnswer(false);
        setIsRetrying(false);
        setShowImages(true);
        startResponseTimer();

        // Update AI Resolved record for next round
        if (currentAIRecord && currentAIRecord.currentRound < 3) {
          const answerWords = processedAnswers.map(answer => answer.word);
          const nextRound = currentAIRecord.currentRound + 1;

          setCurrentAIRecord({
            ...currentAIRecord,
            currentRound: nextRound,
            [`round${nextRound}Answers`]: answerWords,
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

    // Send the selected answer back for learning feedback
    try {
      await generateAnswers(transcribedText, {
        mode: 'learning_feedback',
        metadata: {
          kidName: preferences?.heroName || 'I',
          speaker: 'anyone',
          audience: preferences?.heroName || 'my',
        },
      });
    } catch (error) {
      // Don't block the user flow if learning feedback fails
    }

    // Only navigate back to Open if not currently retrying/getting more answers
    if (selectedAnswer !== 'MoreAnswers') {
      // Navigate to Open.tsx only if gobackAfterSelection is true
      setTimeout(async () => {
        setDirectAnswers([]);
        if (gobackAfterSelection) {
          // Wait 1 second to allow user to hear the selected answer being spoken
          resetLocalStates();
          navigation.navigate(views.OPEN as never);
        } else {
          // NEW: Set waiting state immediately so it shows right away
          // TTS has already finished by the time this function is called
          setShowImages(false);
          setWaitingForNextConversation(true);
          setDirectAnswers([]);
          // Reset states but preserve waitingForNextConversation
          setFinishedTranscribing(false);
          setTranscribedText('');
          setIsRetrying(false);
          setRetryCount(0);
          setIsProcessingAnswer(false);
          setIsTranscribing(false);
          setIsRecording(false);
          setKeyboardInput('');
          setDebouncedKeyboardInput('');
          setIsSubmittingKeyboard(false);
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

  // Function to handle keyboard input submission
  const handleKeyboardSubmit = async () => {
    const inputText = keyboardInput.trim();

    if (!inputText || isSubmittingKeyboard) {
      return;
    }

    try {
      setIsSubmittingKeyboard(true);

      // Simply display what was written without making API calls
      TTSService.speak(inputText, true);
    } catch (error) {
    } finally {
      setIsSubmittingKeyboard(false);
    }
  };

  // Debounced input handler
  const handleKeyboardInputChange = useCallback((text: string) => {
    setKeyboardInput(text);

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new timer for debounced update
    debounceTimer.current = setTimeout(() => {
      setDebouncedKeyboardInput(text);
    }, 300); // 300ms debounce
  }, []);

  // Function to handle keyboard input cancellation
  const handleKeyboardCancel = () => {
    setKeyboardInput('');
    setDebouncedKeyboardInput('');
    setIsSubmittingKeyboard(false);

    // Clear the input in the Inputs component
    if (inputsRef.current) {
      inputsRef.current.clearInput();
    }

    // Clear debounce timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  };

  // Child component for keyboard input
  const KeyboardInputComponent = () => {
    const hasText = debouncedKeyboardInput.trim().length > 0;

    return (
      <View
        style={[
          styles.keyboardInputContainer,
          {padding: responsiveValues.keyboardInputPadding},
        ]}>
        {/* Show waiting message or what's being typed */}
        {keyboardInput.length === 0 ? (
          <FastImage
            source={require('../assets/waitforKB.png')}
            style={responsiveValues.keyboardIconSize}
            resizeMode={FastImage.resizeMode.contain}
          />
        ) : (
          <View
            style={[
              styles.typingDisplay,
              {
                padding: responsiveValues.typingDisplayPadding,
                minHeight: responsiveValues.typingDisplayMinHeight,
              },
            ]}>
            <Text
              style={[
                styles.typingDisplayText,
                {fontSize: responsiveValues.keyboardTypingFontSize},
              ]}>
              {keyboardInput}
            </Text>
          </View>
        )}

        {/* Show buttons only when there's debounced text */}
        {hasText && (
          <View style={styles.keyboardButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.keyboardButton,
                styles.cancelButton,
                {
                  paddingVertical:
                    responsiveValues.keyboardButtonPadding.vertical,
                  paddingHorizontal:
                    responsiveValues.keyboardButtonPadding.horizontal,
                  minWidth: responsiveValues.keyboardButtonMinWidth,
                  borderRadius: responsiveValues.keyboardButtonBorderRadius,
                },
              ]}
              onPress={handleKeyboardCancel}
              disabled={isSubmittingKeyboard}>
              <Text
                style={[
                  styles.cancelButtonText,
                  {fontSize: responsiveValues.buttonFontSize},
                ]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.keyboardButton,
                styles.submitButton,
                {
                  paddingVertical:
                    responsiveValues.keyboardButtonPadding.vertical,
                  paddingHorizontal:
                    responsiveValues.keyboardButtonPadding.horizontal,
                  minWidth: responsiveValues.keyboardButtonMinWidth,
                  borderRadius: responsiveValues.keyboardButtonBorderRadius,
                },
              ]}
              onPress={handleKeyboardSubmit}
              disabled={
                isSubmittingKeyboard ||
                debouncedKeyboardInput.trim().length === 0
              }>
              {isSubmittingKeyboard ? (
                <FastImage
                  source={require('../assets/movie/output.gif')}
                  style={[styles.iconSize, responsiveValues.fetchingSize]}
                  resizeMode={FastImage.resizeMode.contain}
                />
              ) : (
                <Text
                  style={[
                    styles.submitButtonText,
                    {fontSize: responsiveValues.buttonFontSize},
                  ]}>
                  Submit
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8E7', '#FFFFFF']}
        style={[
          styles.container,
          Platform.OS === 'android' ? {paddingTop: width * 0.03} : {},
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
            stateof === 'Keyboard'
              ? false
              : isRecording ||
                isProcessingAnswer ||
                isRetrying ||
                isSubmittingKeyboard ||
                (!finishedTranscribing && !waitingForNextConversation)
          }
        />

        {/* Matalk Icon */}
        <View style={[styles.matalkIcon, responsiveValues.matalkIconSize]}>
          <MatalkIcon />
        </View>

        {/* Input and Navigation Section */}
        <View
          style={[
            styles.inputNavigationContainer,
            {height: responsiveValues.inputNavigationHeight},
          ]}>
          <Inputs
            ref={inputsRef}
            mode={stateof}
            onInputChange={handleKeyboardInputChange}
          />
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
              style={[styles.imageCardContainer, {zIndex: 10}]}
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
                      <KeyboardInputComponent />
                    ) : isTranscribing ? (
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
                      <View style={{alignItems: 'center'}}>
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
      </LinearGradient>
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
