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
import {Mixpanel} from 'mixpanel-react-native';
import {logConversation} from '../utils/conversationLogger';
import {useAdmin} from '../contexts/adminContext';
import {views} from '../utils/constants';
import {useAppSettings} from '../utils/persistance';
import WakeWordService from '../utils/wakewordService';
import VoiceService from '../utils/VoiceService';
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
const DEBUGTRANSCRIPTION = 'How was school today?';

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
    } catch (error) {
      console.error('Error resolving pepes image:', error);
    }

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
      console.error('Error logging word selection:', error);
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
  const {playAttention} = useSound();
  const navigation = useNavigation();
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingTranscription = useRef<boolean>(false);
  const pendingFinalText = useRef<string | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [finishedTranscribing, setFinishedTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);

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
        } catch (error) {
          console.error('Error logging AI response time:', error);
        }
      }

      setResponseTimerStart(null);
    }

    // Clear any existing timer
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  };

  const initializeVoiceService = async () => {
    try {
      // Check if voice recognition is available
      const isAvailable = await VoiceService.isAvailable();
      if (!isAvailable) {
        console.warn('Voice recognition is not available on this device');
      }
    } catch (error) {
      console.error('Failed to initialize voice service:', error);
    }
  };

  useEffect(() => {
    // Send wakeup call to backend when entering Home screen

    // Load gobackAfterSelection setting
    const loadGobackAfterSelectionSetting = async () => {
      try {
        const setting = await getItem('gobackAfterSelection');
        setGobackAfterSelection(setting === '1');
      } catch (error) {
        console.error('Error loading gobackAfterSelection setting:', error);
      }
    };

    // Initialize voice service
    const setupVoiceService = async () => {
      await initializeVoiceService();
    };

    // Load the setting
    loadGobackAfterSelectionSetting();

    // Setup voice service
    setupVoiceService();

    // Track screen opening
    mixpanel.track('Conversation', {
      Opened: 'Conversation',
    });
    if (stateof === 'Attention') {
      // wakeWord.stopListening();
      playSound();
    }
    if (stateof === 'Keyboard') {
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.stopListening();
    }
  }, []);

  // Cleanup useEffect for wake word service and Voice service
  useEffect(() => {
    return () => {
      // Always cleanup wake word service
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.stopListening();

      // Cleanup Voice service
      VoiceService.destroy().catch(error => {
        console.error('Error cleaning up Voice service:', error);
      });

      // Cleanup response timer
      if (responseTimerRef.current) {
        clearTimeout(responseTimerRef.current);
        responseTimerRef.current = null;
      }
    };
  }, []);

  const playSound = async () => {
    // Play attention sound first, then start recording
    // Now optimized to start recording as soon as sound playback begins
    try {
      const soundStarted = await playAttention();
      // Start recording immediately after sound starts (not waiting for it to finish)
      if (soundStarted) {
        handleRecord();
      } else {
        // If sound failed, still start recording
        handleRecord();
      }
    } catch (error) {
      console.warn('Error in playSound:', error);
      // If sound fails, still start recording
      handleRecord();
    }
  };

  const handleRecord = async () => {
    // Prevent multiple simultaneous recordings
    if (isRecording) {
      return;
    }

    try {
      // CRITICAL: Stop wake word service before starting voice recognition
      // On Android 11+, if another service is binding to the microphone,
      // react-native-voice cannot bind to it and will return error 7/No match
      // On iOS, we need to ensure the audio session is fully released before starting voice recognition
      try {
        const wakeWordService = WakeWordService.getInstance();
        await wakeWordService.stopListening();
        console.log('✅ Wake word service stopped before voice recognition');
      } catch (wakeWordError) {
        console.warn('⚠️ Error stopping wake word service:', wakeWordError);
        // Continue anyway - might not be listening
      }

      setIsRecording(true);
      setTranscribedText('');
      setFinishedTranscribing(false);
      setIsTranscribing(true);

      // Start voice recognition with streaming callbacks
      const started = await VoiceService.startListening(
        'en-US',
        // Real-time streaming callback (partial results)
        (text, isFinal) => {
          if (!isFinal) {
            // Update UI with real-time transcription
            setTranscribedText(text);
            // Also update the input field with partial results
            if (inputsRef.current) {
              inputsRef.current.setInput(text);
            }
          }
        },
        // Final transcription callback
        finalText => {
          // Process the final transcription
          processTranscription(finalText);
        },
        // Error callback
        error => {
          console.error('Voice recognition error:', error);

          // Check for "No speech detected" errors
          // iOS: error code 'recognition_fail_ooo' or message includes 'No speech detected'
          // Also handle Android error code '7' for compatibility
          const isNoSpeechError =
            error.code === 'recognition_fail_ooo' ||
            error.code === '7' ||
            error.message.includes('No speech detected') ||
            error.message.includes('No match');

          if (isNoSpeechError) {
            // This is a common, non-fatal error - just means no speech was detecte
            // Immediately stop recording and clear timeout
            if (recordingTimer.current) {
              clearTimeout(recordingTimer.current);
              recordingTimer.current = null;
            }

            // Stop voice recognition immediately to prevent TTS from being transcribed
            VoiceService.stopListening().catch(err => {
              console.error(
                'Error stopping voice recognition on no speech error:',
                err,
              );
            });

            setIsRecording(false);
            setIsTranscribing(false);
            setFinishedTranscribing(true);
            setTranscribedText(TRANSCRIPTIONERRORMESSAGE);

            // For iOS, take immediate action (no delay)
            // Stop TTS before speaking to prevent cut-off
            TTSService.stop?.().then(() => {
              TTSService.speak("I couldn't hear you. Tap Home to retry", true);
            });
          } else {
            // Other errors - show error message
            setIsRecording(false);
            setIsTranscribing(false);
            setFinishedTranscribing(true);
            setTranscribedText(ISSUEMESSAGE);
            // Stop TTS before speaking to prevent cut-off
            TTSService.stop?.().then(() => {
              TTSService.speak('I am having an issue, Tap Home to retry', true);
            });
          }
        },
      );

      if (!started) {
        throw new Error('Failed to start voice recognition');
      }

      // Auto-stop after 20 seconds
      recordingTimer.current = setTimeout(async () => {
        await stopRecording();
      }, 20000);
    } catch (error) {
      console.error('handleRecord - Voice recognition failed to start:', error);
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  const stopRecording = async () => {
    try {
      // Clear timer first to prevent multiple calls
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }

      // Stop voice recognition
      await VoiceService.stopListening();
      setIsRecording(false);

      // Speech recognition has ended - now process the transcription
      // Get the final text (from pending or current)
      const finalText =
        pendingFinalText.current || VoiceService.getCurrentText();
      pendingFinalText.current = null;

      // If we're not processing, process the transcription now
      if (!isProcessingTranscription.current) {
        setIsTranscribing(false);

        if (finalText && finalText.trim().length > 0) {
          // Process the transcription now that speech recognition has ended
          console.log(
            '📝 Speech recognition ended, processing transcription:',
            finalText.trim(),
          );
          processTranscription(finalText.trim());
        } else {
          // No text received, show error
          setFinishedTranscribing(true);
          setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
          setIsTranscribing(false);
          // Stop TTS before speaking to prevent cut-off
          await TTSService.stop?.();
          TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        }
      } else {
        // Already processing, just make sure transcribing state is cleared
        setIsTranscribing(false);
      }
    } catch (error) {
      console.error('stopRecording - Failed to stop voice recognition:', error);
      setIsRecording(false);
      setIsTranscribing(false);
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
    }
  };

  // Process transcription text (replaces transcribeAudio)
  const processTranscription = async (transcribedText: string) => {
    // Prevent multiple simultaneous calls
    if (isProcessingTranscription.current) {
      console.log(
        '⚠️ processTranscription already in progress, skipping duplicate call',
      );
      return;
    }

    isProcessingTranscription.current = true;
    setIsTranscribing(false);

    if (!transcribedText || transcribedText.trim().length === 0) {
      isProcessingTranscription.current = false;
      setFinishedTranscribing(true);
      setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
      // Stop TTS before speaking to prevent cut-off
      await TTSService.stop?.();
      TTSService.speak("I couldn't hear you. Tap Home to retry", true);
      setIsRecording(false);
      return;
    }

    try {
      let finalText = transcribedText.trim();

      // Use debug transcription if enabled
      if (DEBUGWITHOUTTRANSCRIPTION) {
        finalText = DEBUGTRANSCRIPTION;
      }

      if (finalText) {
        // Check for invalid transcriptions
        if (
          finalText.length === 0 ||
          finalText === 'Thank you for watching!' ||
          finalText === 'Thank you for watching.' ||
          finalText === 'Thanks for watching!' ||
          finalText === 'Thanks for watching.' ||
          finalText === '. .' ||
          finalText === '.' ||
          finalText === 'null'
        ) {
          isProcessingTranscription.current = false;
          setFinishedTranscribing(true);
          setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
          // Stop TTS before speaking to prevent cut-off
          await TTSService.stop?.();
          TTSService.speak("I couldn't hear you. Tap Home to retry", true);
          setIsRecording(false);
          return;
        }

        // Process valid transcription
        if (
          finalText.length > 0 &&
          finalText !== 'null' &&
          finalText !== 'Thank you.' &&
          finalText !== 'Thank you for watching!' &&
          finalText !== 'Thank you for watching.' &&
          finalText !== 'Thanks for watching!' &&
          finalText !== 'Thanks for watching.' &&
          finalText !== '. .' &&
          finalText !== '.'
        ) {
          setFinishedTranscribing(true);
          setTranscribedText(finalText);
          setIsProcessingAnswer(true); // Show processing immediately

          // Set the transcribed text in the top input
          if (inputsRef.current) {
            inputsRef.current.setInput(finalText);
          }
          // OPTIMIZATION 2: Create optimized context message
          // Use simpler context to reduce message size and processing time
          const contextInfo = getCachedContextInfo();

          // Split into core prompt and context for better processing
          const corePrompt = `User asked: "${finalText}"`;
          const contextPrompt = `Context: ${contextInfo}`;
          const messageWithContext = `${corePrompt}. ${contextPrompt}`;

          try {
            // Get pepes data for context
            const pepesData = await getItem('pepes');
            const parsedPepes = pepesData ? JSON.parse(pepesData) : null;

            // Use the new generateAnswers function instead of OpenAI assistant
            const answers = await generateAnswers(finalText, {
              mode: 'generate_answers',
              metadata: {
                kidName: preferences?.heroName || 'I',
                speaker: 'anyone',
                audience: preferences?.heroName || 'my',
                pepes: parsedPepes, // Include pepes data for better context
                conversationHistory: conversationHistory, // Include conversation history
              },
              countMin: 5,
              countMax: 5,
              genderType: preferences?.gender || 'white boy',
            });

            if (answers && answers.length > 0) {
              // Process the answers and resolve pepes images

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
                question: finalText,
                round1Answers: answerWords,
                currentRound: 1,
              });

              // Defer conversation history update to prevent re-render after images are shown
              // Use setTimeout to batch this update after the current render cycle
              const assistantResponse = processedAnswers
                .map(answer => answer.word)
                .join(', ');
              setTimeout(() => {
                addToConversationHistory(finalText, assistantResponse);
              }, 0);
            } else {
              isProcessingTranscription.current = false;
              setIsProcessingAnswer(false);
              // Stop TTS before speaking to prevent cut-off
              await TTSService.stop?.();
              TTSService.speak('I am having an issue, Tap Home to retry', true);
              setIsRecording(false);
              return;
            }
          } catch (error) {
            console.error('Failed to generate answers:', error);
            isProcessingTranscription.current = false;
            setIsProcessingAnswer(false);
            // Stop TTS before speaking to prevent cut-off
            await TTSService.stop?.();
            TTSService.speak(
              'Failed to process your request. Please try again.',
              true,
            );
          }
        }

        setIsRecording(false);
        setIsTranscribing(false);
        isProcessingTranscription.current = false;
      } else {
        isProcessingTranscription.current = false;
        setFinishedTranscribing(true);
        setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
        // Stop TTS before speaking to prevent cut-off
        await TTSService.stop?.();
        TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        setIsRecording(false);
        setIsTranscribing(false);
      }
    } catch (error) {
      isProcessingTranscription.current = false;
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      // Stop TTS before speaking to prevent cut-off
      await TTSService.stop?.();
      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  // Removed useEffect that depended on status and imageUrls since we're using direct answers now

  // Reset function for local states
  const resetLocalStates = async () => {
    // Stop response timer if running
    stopResponseTimer('home');

    // Stop voice recognition if active
    try {
      await VoiceService.stopListening();
    } catch (error) {
      console.error('Error stopping voice recognition in reset:', error);
    }

    // Clear recording timer
    if (recordingTimer.current) {
      clearTimeout(recordingTimer.current);
      recordingTimer.current = null;
    }

    // Reset processing flag and clear pending transcription
    isProcessingTranscription.current = false;
    pendingFinalText.current = null;

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
        setIsProcessingAnswer(false);
        setIsRetrying(false);
        TTSService.speak('Failed to get more answers. Please try again.', true);
        setRetryCount(prev => prev - 1);
      }
    } catch (error) {
      console.error('handleCantFindIt - Failed to retry:', error);
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
        } catch (error) {
          console.error('Error saving AI Resolved record:', error);
        }

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
      console.error('Failed to send learning feedback:', error);
      // Don't block the user flow if learning feedback fails
    }

    // Only navigate back to Open if not currently retrying/getting more answers
    if (selectedAnswer !== 'MoreAnswers') {
      // Wait 1 second to allow user to hear the selected answer being spoken
      setTimeout(async () => {
        // Reset assistant state
        setDirectAnswers([]);

        // Navigate to Open.tsx only if gobackAfterSelection is true
        if (gobackAfterSelection) {
          resetLocalStates();
          navigation.navigate(views.OPEN as never);
        } else {
          // NEW: Set waiting state and activate wake word
          setWaitingForNextConversation(true);
          setDirectAnswers([]);

          // Reset states but preserve waitingForNextConversation
          setFinishedTranscribing(false);
          setTranscribedText('');
          setShowImages(false);
          setIsRetrying(false);
          setRetryCount(0);
          setIsProcessingAnswer(false);
          setIsTranscribing(false);
          setIsRecording(false);
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

          // Activate wake word listening
          try {
            const wakeWordService = WakeWordService.getInstance();

            wakeWordService.setCallback((phrase: string) => {
              // When wake word detected, start new conversation
              setWaitingForNextConversation(false);
              playSound(); // This will trigger handleRecord()
            });

            await wakeWordService.startListening();
          } catch (error) {
            console.error('Failed to start wake word service:', error);
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
      console.error('handleKeyboardSubmit - Processing failed:', error);
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
        <HomeButton
          navigation={navigation}
          onReset={resetLocalStates}
          disabled={false}
        />

        {/* Matalk Icon */}
        <View style={[styles.matalkIcon, responsiveValues.matalkIconSize]}>
          <MatalkIcon />
        </View>

        {/* Input and Navigation Section */}
        <View
          style={[
            styles.inputNavigationContainer,
            {minHeight: responsiveValues.inputNavigationHeight},
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
                        console.error('Error processing image:', err, item);
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
                                color: '#4CAF50',
                                fontWeight: '500',
                                fontStyle: 'italic',
                              }}>
                              🎤 Voice Recognition
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
