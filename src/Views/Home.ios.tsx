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
import AudioRecorderPlayer, {
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
  AVModeIOSOption,
  AudioSet,
} from 'react-native-audio-recorder-player';

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
import WhisperService from '../utils/WhisperService';

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

let audioRecorderPlayer: AudioRecorderPlayer | null = null;

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {
    sendMessage,
    runAssistant,
    threadId,
    imageUrls,
    status,
    resetAssistant,
    clearImages,
    createThreadIfNeeded,
  } = useAssistant();
  const {weather, location} = useChatContext();
  const {isTablet} = useAdmin();
  const {getItem, preferences} = useAppSettings();
  const stateof = route?.params?.stateof ?? '';
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const [gobackAfterSelection, setGobackAfterSelection] = useState(true);
  const [waitingForNextConversation, setWaitingForNextConversation] =
    useState(false);
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
  const [showImages, setShowImages] = useState(false);
  const [finishedTranscribing, setFinishedTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isUsingLocalWhisper, setIsUsingLocalWhisper] = useState(false);
  const [modelNotAvailable, setModelNotAvailable] = useState(false);
  const MAX_RETRIES = 3;
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);
  let currentRecordingURI: string | null = null;

  const initializeAudioRecording = async () => {
    try {
      let useLocal = false;
      // Get cached setting or fetch it once
      if (preferences?.useLocalWhisper) {
        useLocal = preferences?.useLocalWhisper === '1';
        setIsUsingLocalWhisper(useLocal);
      } else {
        useLocal = (await getItem('useLocalWhisper')) === '1';
        setIsUsingLocalWhisper(useLocal);
      }

      if (!audioRecorderPlayer) {
        audioRecorderPlayer = new AudioRecorderPlayer();
      }
    } catch (error) {
      console.error('Failed to initialize audio recording:', error);
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

    // Initialize audio recording based on current settings
    const setupAudioRecording = async () => {
      await initializeAudioRecording();
    };

    // Load the setting
    loadGobackAfterSelectionSetting();

    // Setup audio recording
    setupAudioRecording();

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

  // Cleanup useEffect for wake word service and Whisper
  useEffect(() => {
    return () => {
      // Always cleanup wake word service
      const wakeWordService = WakeWordService.getInstance();
      wakeWordService.stopListening();

      // Only cleanup Whisper service when component actually unmounts
      // Don't destroy it when just waiting for next conversation
      WhisperService.destroy().catch(error => {
        console.error('Error cleaning up Whisper service:', error);
      });

      // Cleanup AudioRecorderPlayer listeners if it was used
      if (audioRecorderPlayer) {
        try {
          audioRecorderPlayer.removeRecordBackListener();
        } catch (error) {
          console.error(
            'Error cleaning up AudioRecorderPlayer listener:',
            error,
          );
        }
      }
    };
  }, []);

  const playSound = async () => {
    playAttention();
    handleRecord();
  };
  // put this near your module top:

  const handleRecord = async () => {
    if (isRecording) return;

    try {
      // Kill any audio that might hold the session
      try {
        await TTSService.stop?.();
      } catch {}
      try {
        const w = WakeWordService.getInstance();
        w.stopListening();
      } catch {}
      try {
        await audioRecorderPlayer?.stopPlayer?.();
      } catch {}
      try {
        await audioRecorderPlayer?.stopRecorder?.();
      } catch {}

      if (!audioRecorderPlayer) audioRecorderPlayer = new AudioRecorderPlayer();
      let uri: string | undefined;
      if (preferences?.useLocalWhisper === '1') {
        const recordingOptions: AudioSet = {
          AVModeIOS: AVModeIOSOption.videochat,
          AVSampleRateKeyIOS: 16000,
          AVFormatIDKeyIOS: AVEncodingOption.wav,
          AVNumberOfChannelsKeyIOS: 1,
        };

        // IMPORTANT: pass undefined so the lib uses its own default path in Caches
        uri = await audioRecorderPlayer.startRecorder(
          undefined,
          recordingOptions,
          false,
        );
      } else {
        uri = await audioRecorderPlayer.startRecorder(
          undefined,
          undefined,
          false,
        );
      }
      currentRecordingURI = uri ?? null;

      // Add record back listener for iOS cloud Whisper (similar to Android)
      audioRecorderPlayer.addRecordBackListener((e: any) => {
        // iOS doesn't need metering logic like Android, but we need to handle the events
        // to prevent "no listeners registered" warning
        return true;
      });

      setIsRecording(true);

      // auto-stop after 4s (or wire to your UI)
      recordingTimer.current = setTimeout(stopRecording, 5000);
    } catch (error) {
      console.error('startIOSRecording failed:', error);

      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);

      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    let filePath: string | undefined;
    try {
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }

      filePath = await audioRecorderPlayer?.stopRecorder();
      currentRecordingURI = filePath ?? currentRecordingURI;
      console.log('🛑 iOS recording stopped. File:', currentRecordingURI);
      // Remove record back listener for iOS cloud Whisper
      audioRecorderPlayer?.removeRecordBackListener();
    } catch (e) {
      console.error('stopIOSRecording failed:', e);
      setIsRecording(false);
      setTranscribedText(ISSUEMESSAGE);
      setFinishedTranscribing(true);
    } finally {
      await transcribeAudio(currentRecordingURI!);
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
    // Get current Whisper setting to determine audio format
    const useLocal = preferences?.useLocalWhisper === '1';

    if (!audioPath) {
      console.error('transcribeAudio: No audio path provided');
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      audioRecordInitialized = false;

      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      setIsTranscribing(false);
      return;
    }

    try {
      let transcribeResponse: any;
      if (!DEBUGWITHOUTTRANSCRIPTION) {
        try {
          if (useLocal) {
            // Use local Whisper - no fallback to cloud
            transcribeResponse = await transcribeAudioWithWhisper(audioPath);
          } else {
            // Use cloud Whisper directly
            setIsUsingLocalWhisper(false);
            transcribeResponse = await transcribeAudioCloud(audioPath);
            (transcribeResponse as any).isLocal = false;
          }
        } catch (networkError) {
          // Check if it's a network/API key error
          if (
            networkError instanceof Error &&
            networkError.message.includes('Network request failed')
          ) {
            setFinishedTranscribing(true);
            setTranscribedText(
              'Network error: Please check your internet connection and OpenAI API key configuration',
            );
            TTSService.speak(
              'Network error, please check your internet connection',
              true,
            );
          } else {
            setFinishedTranscribing(true);
            setTranscribedText(ISSUEMESSAGE);
            TTSService.speak('I am having an issue, Tap Home to retry', true);
          }
          setIsRecording(false);
          setIsTranscribing(false);
          return;
        }
      } else {
        transcribeResponse = {text: DEBUGTRANSCRIPTION};
      }

      if (threadId.length < 1 && threadId === '') {
        await createThreadIfNeeded();
      }

      if (transcribeResponse?.text && threadId.length > 1 && threadId !== '') {
        const transcribedText = transcribeResponse.text.trim();

        if (
          transcribedText.length === 0 ||
          transcribedText === 'Thank you for watching!' ||
          transcribedText === 'Thank you for watching.' ||
          transcribedText === 'Thanks for watching!' ||
          transcribedText === 'Thanks for watching.' ||
          transcribedText === '. .' ||
          transcribedText === '.' ||
          transcribeResponse?.usage?.seconds === 0 ||
          transcribeResponse?.usage?.seconds === '0'
        ) {
          setFinishedTranscribing(true);
          setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
          TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        }

        if (
          threadId.length > 1 &&
          threadId !== '' &&
          transcribedText.length > 0 &&
          transcribedText !== 'null' &&
          transcribedText !== 'Thank you.' &&
          transcribedText !== 'Thank you for watching!' &&
          transcribedText !== 'Thank you for watching.' &&
          transcribedText !== 'Thanks for watching!' &&
          transcribedText !== 'Thanks for watching.' &&
          transcribedText !== '. .' &&
          transcribedText !== '.'
        ) {
          setFinishedTranscribing(true);
          setTranscribedText(transcribedText);
          setIsProcessingAnswer(true); // Show processing immediately

          // Set the transcribed text in the top input
          if (inputsRef.current) {
            inputsRef.current.setInput(transcribedText);
          }
          // OPTIMIZATION 2: Create optimized context message
          // Use simpler context to reduce message size and processing time
          const contextInfo = getCachedContextInfo();

          // Split into core prompt and context for better processing
          const corePrompt = `User asked: "${transcribedText}"`;
          const contextPrompt = `Context: ${contextInfo}`;
          const messageWithContext = `${corePrompt}. ${contextPrompt}`;

          try {
            const messagePromise = await sendMessage(
              messageWithContext,
              threadId,
              'generate_answers',
            );

            // Wait for message to be sent, then immediately start assistant
            const messageId = messagePromise;

            if (messageId) {
              // Start assistant run immediately without waiting
              runAssistant(threadId).catch(error => {
                console.error('Failed to run assistant:', error);
                setIsProcessingAnswer(false);
                setIsRecording(false);
                TTSService.speak(
                  'Failed to process your request. Please try again.',
                  true,
                );
              });
            } else {
              setIsProcessingAnswer(false);
              TTSService.speak('I am having an issue, Tap Home to retry', true);
              setIsRecording(false);
              return;
            }
          } catch (error) {
            console.error('Failed to send message:', error);
            setIsProcessingAnswer(false);
            TTSService.speak(
              'Failed to process your request. Please try again.',
              true,
            );
          }
        }

        setIsRecording(false);
        setIsTranscribing(false);
      } else {
        setFinishedTranscribing(true);
        setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
        TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        setIsRecording(false);
        setIsTranscribing(false);
      }
    } catch (error) {
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  useEffect(() => {
    if (status === 'completed') {
      // Count valid images (not placeholders)
      const validImageCount =
        imageUrls?.filter(item => {
          if (!item || !item.url) return false;
          const urlObj =
            typeof item.url === 'object' ? item.url : {url: item.url};
          return urlObj.url && urlObj.url !== 'placeholder';
        }).length || 0;

      if (validImageCount > 0) {
        // Add a small delay to ensure gif is visible during retry operations
        if (isRetrying) {
          setTimeout(() => {
            setIsRetrying(false);
            setIsProcessingAnswer(false);
            setShowImages(true);
          }, 300); // Show retry gif for at least 1 second
        } else {
          setIsRetrying(false);
          setIsProcessingAnswer(false);
          setShowImages(true);
        }
      } else {
        // No valid images returned - keep processing state but don't show images yet
        // Don't reset isRetrying here in case we're in the middle of a retry
        setIsProcessingAnswer(false);
        setShowImages(false);
      }
    }
  }, [imageUrls, status]);

  // Reset function for local states
  const resetLocalStates = () => {
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
    // Note: Don't reset cachedUseLocalWhisper as it won't change during session

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
    if (
      !transcribedText ||
      !threadId ||
      isRetrying ||
      retryCount >= MAX_RETRIES
    ) {
      if (retryCount >= MAX_RETRIES) {
        TTSService.speak(
          'You have reached the maximum number of retry attempts. Please try a new question.',
          true,
        );
      }
      return;
    }

    try {
      setIsRetrying(true);
      setIsProcessingAnswer(true); // Show processing immediately
      setShowImages(false); // Hide current images while getting new ones
      clearImages(); // Clear old images immediately to prevent flickering
      setRetryCount(prev => prev + 1);

      // Get contextual information (time, weather, location, special places)
      const contextInfo = getCachedContextInfo();

      // Create a retry message asking for more alternatives
      const retryMessage = `${contextInfo}. User said: "${transcribedText}". The user couldn't find what they were looking for in the previous answers. Please provide 5 different alternative answers or suggestions.`;

      const messageId = await sendMessage(
        retryMessage,
        threadId,
        'generate_more_answers',
      );

      if (messageId) {
        runAssistant(threadId).catch(error => {
          console.error('handleCantFindIt - Failed to retry:', error);
          setIsProcessingAnswer(false);
          setIsRetrying(false);
          TTSService.speak(
            'Failed to get more answers. Please try again.',
            true,
          );
          setRetryCount(prev => prev - 1); // Revert retry count on error
        });
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
    if (!transcribedText || !threadId || !imageUrls || imageUrls.length === 0) {
      return;
    }

    // Extract all possible answers from imageUrls
    const possibleAnswers = imageUrls
      .filter(item => item && item.prompt)
      .map(item => item.prompt);

    // Log the conversation
    logConversation({
      question: transcribedText,
      possibleAnswers: possibleAnswers,
      answerPicked: selectedAnswer,
    });

    // Send the selected answer back to the assistant for learning (without triggering response flow)
    try {
      const currentTime = new Date().toLocaleString();
      const learningMessage = `User selected answer: "${selectedAnswer}" for question: "${transcribedText}" from possible answers: [${possibleAnswers.join(
        ', ',
      )}]. Context - Time: ${currentTime}, Location: ${
        location || 'Unknown'
      }, Weather: ${weather || 'Unknown'}`;
      // await sendMessage(learningMessage, threadId, 'learning_feedback');
    } catch (error) {
      console.error('Failed to send learning feedback:', error);
      // Don't block the user flow if learning feedback fails
    }

    // Only navigate back to Open if not currently retrying/getting more answers
    if (selectedAnswer !== 'MoreAnswers') {
      // Wait 1 second to allow user to hear the selected answer being spoken
      setTimeout(async () => {
        resetAssistant();

        // Navigate to Open.tsx only if gobackAfterSelection is true
        if (gobackAfterSelection) {
          resetLocalStates();
          navigation.navigate(views.OPEN as never);
        } else {
          // NEW: Set waiting state and activate wake word
          setWaitingForNextConversation(true);
          clearImages();

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
                  // If no images are available after filtering, show a message
                  const validImages = imageUrls
                    .filter(item => {
                      if (!item || !item.url) return false;
                      const urlObj =
                        typeof item.url === 'object'
                          ? item.url
                          : {url: item.url};
                      return urlObj.url && urlObj.url !== 'placeholder';
                    })
                    .map(item => {
                      try {
                        const urlObj =
                          typeof item.url === 'object'
                            ? item.url
                            : {url: item.url};
                        return {url: urlObj, prompt: item.prompt || ''};
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
