import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import {useNavigation, RouteProp} from '@react-navigation/native';
import RNFS from 'react-native-fs';
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
} from 'react-native-audio-recorder-player';
import {NativeModules} from 'react-native';
// Add imports for the components
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
const audioRecorderPlayer = new AudioRecorderPlayer();
const DEBUGTRANSCRIPTION = 'How was school today?';

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
  const {getItem} = useAppSettings();
  const stateof = route?.params?.stateof ?? '';
  const [isRecording, setIsRecording] = useState(false);
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
      ? {width: '100%', height: '100%'}
      : {width: '100%', height: '100%'},

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
  const MAX_RETRIES = 3;
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);
  useEffect(() => {
    // Send wakeup call to backend when entering Home screen
    const sendWakeupCall = async () => {
      try {
        await fetchHelper('wakeup', {}, {});
      } catch (error) {
        console.error('Error sending wakeup call from Home screen:', error);
      }
    };

    // Load gobackAfterSelection setting
    const loadGobackAfterSelectionSetting = async () => {
      try {
        const setting = await getItem('gobackAfterSelection');
        setGobackAfterSelection(setting === '1');
      } catch (error) {
        console.error('Error loading gobackAfterSelection setting:', error);
      }
    };

    // Send wakeup call
    sendWakeupCall();

    // Load the setting
    loadGobackAfterSelectionSetting();

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

  // Cleanup useEffect for wake word service
  useEffect(() => {
    return () => {
      if (waitingForNextConversation) {
        const wakeWordService = WakeWordService.getInstance();
        wakeWordService.stopListening();
      }
    };
  }, [waitingForNextConversation]);

  const playSound = async () => {
    // FORCE THE RECORDING INDICATOR ON
    setIsRecording(true);
    const res = await playAttention();
    if (stateof === 'Attention' && res) {
      handleRecord();
    }
  };

  const checkAudioPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Audio Recording Permission',
            message:
              'This app needs access to your microphone to record audio.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          return true;
        } else {
          return false;
        }
      } catch (err) {
        console.warn('Permission request error:', err);
        return false;
      }
    }
    return true; // iOS permissions are handled differently
  };

  const handleRecord = async () => {
    // Check for audio permission before recording
    const hasPermission = await checkAudioPermission();
    if (!hasPermission) {
      console.log('Audio recording permission not granted');
      return;
    }

    const currentTime = Date.now();

    lastSoundTimeRef.current = 0;
    metering.current = -100;

    NativeModules.AudioSession?.enableVoiceProcessingSession?.();

    // Add a minimum recording time variable

    try {
      const path = Platform.select({
        ios: `sound.m4a`,
        android: `${RNFS.CachesDirectoryPath}/sound.mp3`,
      })!;

      // Clear previous cached recording if it exists
      try {
        const exists = await RNFS.exists(path);
        if (exists) {
          await RNFS.unlink(path);
        }
      } catch (e) {
        console.warn('handleRecord - Error clearing previous recording:', e);
      }

      // Start recording with configured options for better quality
      await audioRecorderPlayer.startRecorder(path, {
        AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
        AudioSourceAndroid: AudioSourceAndroidType.MIC,
        AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
        AVNumberOfChannelsKeyIOS: 1,
        AVFormatIDKeyIOS: AVEncodingOption.aac,
      });

      // Add meter listener to detect silence
      audioRecorderPlayer.addRecordBackListener(e => {
        if (lastSoundTimeRef.current === 0) {
          lastSoundTimeRef.current = currentTime;
        }

        // Store current metering value
        if (e.currentMetering !== undefined) {
          metering.current = e.currentMetering;
        }

        // Check if there's actual sound (not silence)
        if (e.currentMetering !== undefined && e.currentMetering > -35) {
          if (Date.now() % 1000 < 100) {
          }
          lastSoundTimeRef.current = Date.now();
        } else {
          const silenceTime = Date.now() - lastSoundTimeRef.current;
          if (silenceTime % 500 < 100) {
          }

          // Increase silence detection time to 3 seconds (was 2 seconds)
          if (silenceTime > 3000 && lastSoundTimeRef.current > 0) {
            stopRecording();
            return;
          }
        }

        return true;
      });

      recordingTimer.current = setTimeout(async () => {
        requestAnimationFrame(() => {
          setIsRecording(false);
          //console.log('stopRecording - isRecording set to false');
        });
        await stopRecording();
      }, 6000);
    } catch (error) {
      console.error('handleRecord - Recording failed to start:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (recordingTimer.current) {
      //console.log('stopRecording - Clearing recording timer');
      clearTimeout(recordingTimer.current);
      recordingTimer.current = null;
    }

    try {
      const filePath = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      await transcribeAudio(filePath);
    } catch (error) {
      console.error('stopRecording - Failed to stop recording:', error);
    }
  };

  const transcribeAudio = async (audioPath: string) => {
    if (!audioPath) {
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);

      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
      return;
    }

    try {
      const formData = new FormData();
      // Fix the file URI handling - ensure proper format for React Native FormData
      let audioUri = audioPath;

      // For Android, ensure the URI starts with 'file://' for FormData
      if (Platform.OS === 'android') {
        // Remove any existing file:// prefix first to avoid double prefixing
        audioUri = audioPath;
      } else {
        // For iOS, the path should be used as-is from the recorder
        audioUri = audioPath.replace('file://', '');
      }

      // Check if file exists before proceeding

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

      // Debug: Check if OpenAI API key is available

      let transcribeResponse: any;
      if (!DEBUGWITHOUTTRANSCRIPTION) {
        try {
          transcribeResponse = await fetchHelper(
            'transcribeAudio',
            {},
            formData,
          );
        } catch (networkError) {
          setFinishedTranscribing(true);
          setTranscribedText(ISSUEMESSAGE);
          console.log('transcribeAudio - Error:', networkError);
          TTSService.speak('I am having an issue, Tap Home to retry', true);
          setIsRecording(false);
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

          // OPTIMIZATION 3: Start both API calls and don't wait for sendMessage to complete

          try {
            const messagePromise = sendMessage(
              messageWithContext,
              threadId,
              'generate_answers',
            );

            // Wait for message to be sent, then immediately start assistant
            const messageId = await messagePromise;

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
              console.log('transcribeAudio - Error:', 'messageId', messageId);
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
      } else {
        setFinishedTranscribing(true);
        setTranscribedText(TRANSCRIPTIONERRORMESSAGE);
        TTSService.speak("I couldn't hear you. Tap Home to retry", true);
        setIsRecording(false);
      }
    } catch (error) {
      setFinishedTranscribing(true);
      setTranscribedText(ISSUEMESSAGE);
      console.log('transcribeAudio - Error:', 'error');
      TTSService.speak('I am having an issue, Tap Home to retry', true);
      setIsRecording(false);
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
          }, 1000); // Show retry gif for at least 1 second
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
    setFinishedTranscribing(false);
    setTranscribedText('');
    setShowImages(false);
    setIsRetrying(false);
    setRetryCount(0);
    setIsProcessingAnswer(false); // Reset processing state
    setKeyboardInput(''); // Reset keyboard input
    setDebouncedKeyboardInput('');
    setIsSubmittingKeyboard(false);
    setWaitingForNextConversation(false); // Reset waiting state

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
        // Clear old images immediately to prevent flickering
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
      setTimeout(() => {
        resetAssistant();
        resetLocalStates();
        // Navigate to Open.tsx only if gobackAfterSelection is true
        if (gobackAfterSelection) {
          navigation.navigate(views.OPEN as never);
        } else {
          // NEW: Set waiting state and activate wake word
          setWaitingForNextConversation(true);

          // Activate wake word listening (safe - no current conflict)
          const wakeWordService = WakeWordService.getInstance();
          wakeWordService.setCallback((phrase: string) => {
            // When wake word detected, start new conversation
            setWaitingForNextConversation(false);
            playSound(); // This will trigger handleRecord()
          });
          wakeWordService.startListening();
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
            isRecording ||
            isProcessingAnswer ||
            isRetrying ||
            isSubmittingKeyboard ||
            !finishedTranscribing
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
                          Waiting to continue the conversation
                        </Text>
                        <FastImage
                          source={require('../assets/movie/output.gif')}
                          style={[
                            styles.iconSize,
                            responsiveValues.fetchingSize,
                          ]}
                          resizeMode={FastImage.resizeMode.contain}
                        />
                      </View>
                    ) : stateof === 'Keyboard' ? (
                      <KeyboardInputComponent />
                    ) : isRecording ? (
                      <FastImage
                        source={require('../assets/movie/recording.gif')}
                        style={responsiveValues.recordingIconSize}
                        resizeMode={
                          isTablet
                            ? FastImage.resizeMode.center
                            : FastImage.resizeMode.contain
                        }
                      />
                    ) : (
                      <View
                        style={{
                          width: '100%',
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Text
                          style={{
                            fontSize: responsiveValues.transcriptionFontSize,
                            fontWeight: 'bold',
                            marginBottom: 20,
                          }}>
                          {`${transcribedText}`}
                        </Text>

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
                        {status === 'failed' && (
                          <Text
                            style={[
                              styles.retryText,
                              {
                                fontSize: responsiveValues.retryFontSize,
                                marginTop: 10,
                              },
                            ]}>
                            Something went wrong. Please press Home to retry.
                          </Text>
                        )}
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
