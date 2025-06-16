import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import {useNavigation, RouteProp} from '@react-navigation/native';
import RNFS from 'react-native-fs';
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
} from 'react-native-audio-recorder-player';

// Add imports for the components
import Inputs, {InputsRef} from '../Components/Inputs';
import Transcription from '../Components/Transcription';
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

const {width, height} = Dimensions.get('window');

type RootStackParamList = {
  Home: {stateof?: 'Attention' | 'Keyboard' | string};
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  route?: HomeScreenRouteProp;
}
const DEBUGWITHOUTTRANSCRIPTION = true;
const audioRecorderPlayer = new AudioRecorderPlayer();

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {sendMessage, runAssistant, threadId, imageUrls, status} =
    useAssistant();
  const {weather, location} = useChatContext();
  const stateof = route?.params?.stateof ?? '';
  const [isRecording, setIsRecording] = useState(false);

  // Add keyboard input state
  const [keyboardInput, setKeyboardInput] = useState('');
  const [debouncedKeyboardInput, setDebouncedKeyboardInput] = useState('');
  const [isSubmittingKeyboard, setIsSubmittingKeyboard] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputsRef = useRef<InputsRef>(null);

  const metering = useRef<number>(-100);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const {playAttention, playThisSound} = useSound();
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
    mixpanel.track('Conversation', {
      Opened: 'Conversation',
    });

    if (stateof === 'Attention') {
      // wakeWord.stopListening();
      playSound();
    }
    if (stateof === 'Keyboard') {
    }
  }, []);

  const playSound = async () => {
    //console.log('playSound - Starting playSound function');

    // FORCE THE RECORDING INDICATOR ON
    setIsRecording(true);
    const res = await playAttention();
    //console.log('playSound - playAttention result:', res);
    if (stateof === 'Attention' && res) {
      handleRecord();
    }
  };

  const handleRecord = async () => {
    const currentTime = Date.now();

    lastSoundTimeRef.current = 0;
    metering.current = -100;

    // Add a minimum recording time variable
    const minRecordingTime = 3000; // 3 seconds minimum recording time
    const recordingStartTime = Date.now();

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
    console.log('stopRecording - Starting stopRecording function');

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
      return;
    }

    try {
      const formData = new FormData();
      const audioUri = audioPath.replace('file://', '');

      formData.append('file', {
        uri: audioUri,
        type: Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/mp3',
        name: Platform.OS === 'ios' ? 'recording.m4a' : 'recording.mp3',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      //const res = await playThisSound(audioPath);

      let transcribeResponse: any;
      if (!DEBUGWITHOUTTRANSCRIPTION) {
        transcribeResponse = await fetchHelper('transcribeAudio', {}, formData);
      } else {
        transcribeResponse = {text: 'How was school?'};
      }

      if (transcribeResponse?.text) {
        const transcribedText = transcribeResponse.text.trim();

        if (
          threadId &&
          transcribedText.length > 0 &&
          transcribedText !== 'null' &&
          transcribedText !== 'Thank you for watching!'
        ) {
          // Get contextual information (time, weather, location, special places)
          const contextInfo = getContextualInfo(weather, location);

          // Combine the transcribed text with context information
          const messageWithContext = `${contextInfo}. User said: "${transcribedText}"`;

          console.log('📍 Sending message with context:', messageWithContext);

          const messageId = await sendMessage(
            messageWithContext,
            threadId,
            'generate_answers',
          );
          setFinishedTranscribing(true);
          setTranscribedText(transcribedText);
          if (messageId) {
            await runAssistant(threadId);
          }
        }
      } else {
        TTSService.speak('No speech detected. Please try again.', true);
      }
    } catch (error) {
      console.error('transcribeAudio - Processing failed:', error);
      TTSService.speak('Failed to process audio. Please try again.', true);
    }
  };

  useEffect(() => {
    // Add detailed logging to inspect the structure
    if (imageUrls && imageUrls.length > 0) {
      console.log('First image URL structure:', JSON.stringify(imageUrls[0]));

      // Log all image URLs for debugging
      imageUrls.forEach((img, idx) => {
        console.log(
          `Image ${idx} URL:`,
          typeof img.url === 'string' ? img.url : JSON.stringify(img.url),
        );
      });
    }
    if (status === 'completed' && imageUrls?.length > 0) {
      debugger;
      setShowImages(true);
      setIsRetrying(false); // Reset retry state when new images are ready
    } else {
      console.log(
        'Not showing images. Status:',
        status,
        'Image count:',
        imageUrls?.length || 0,
      );
    }
  }, [imageUrls, status]);

  // Create placeholder images - make sure we have 5 animal placeholders
  const placeholderImages = [
    {url: {url: 'placeholder'}, prompt: 'Waiting'},
    {url: {url: 'placeholder'}, prompt: 'Waiting'},
    {url: {url: 'placeholder'}, prompt: 'Waiting'},
    {url: {url: 'placeholder'}, prompt: 'Waiting'},
    {url: {url: 'placeholder'}, prompt: 'Waiting'},
  ];

  // Reset function for local states
  const resetLocalStates = () => {
    setFinishedTranscribing(false);
    setTranscribedText('');
    setShowImages(false);
    setIsRetrying(false);
    setRetryCount(0);
    setKeyboardInput(''); // Reset keyboard input
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
      setShowImages(false); // Hide current images while getting new ones
      setRetryCount(prev => prev + 1);

      // Get contextual information (time, weather, location, special places)
      const contextInfo = getContextualInfo(weather, location);

      // Create a retry message asking for more alternatives
      const retryMessage = `${contextInfo}. User said: "${transcribedText}". The user couldn't find what they were looking for in the previous answers. Please provide 5 different alternative answers or suggestions.`;

      console.log('🔄 Retrying with message:', retryMessage);
      console.log('🔄 Retry count:', retryCount + 1);

      const messageId = await sendMessage(
        retryMessage,
        threadId,
        'generate_answers',
      );

      if (messageId) {
        await runAssistant(threadId);
      }
    } catch (error) {
      console.error('handleCantFindIt - Failed to retry:', error);
      TTSService.speak('Failed to get more answers. Please try again.', true);
      setRetryCount(prev => prev - 1); // Revert retry count on error
    } finally {
      setIsRetrying(false);
    }
  };

  // Function to handle answer selection and logging
  const handleAnswerSelected = async (selectedAnswer: string) => {
    if (!transcribedText || !threadId || !imageUrls || imageUrls.length === 0) {
      return;
    }

    try {
      // Extract all possible answers from imageUrls
      const possibleAnswers = imageUrls
        .filter(item => item && item.prompt)
        .map(item => item.prompt);

      // Log the conversation
      await logConversation({
        question: transcribedText,
        possibleAnswers: possibleAnswers,
        answerPicked: selectedAnswer,
        threadId: threadId,
      });
    } catch (error) {
      console.error('Failed to log conversation:', error);
      // Don't show error to user as this is background logging
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

      console.log('📝 Displaying keyboard input:', inputText);
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
      <View style={styles.keyboardInputContainer}>
        {/* Show waiting message or what's being typed */}
        {keyboardInput.length === 0 ? (
          <FastImage
            source={require('../assets/waitforKB.png')}
            style={styles.keyboardIcon}
            resizeMode={FastImage.resizeMode.contain}
          />
        ) : (
          <View style={styles.typingDisplay}>
            <Text style={styles.typingDisplayText}>{keyboardInput}</Text>
          </View>
        )}

        {/* Show buttons only when there's debounced text */}
        {hasText && (
          <View style={styles.keyboardButtonsContainer}>
            <TouchableOpacity
              style={[styles.keyboardButton, styles.cancelButton]}
              onPress={handleKeyboardCancel}
              disabled={isSubmittingKeyboard}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.keyboardButton, styles.submitButton]}
              onPress={handleKeyboardSubmit}
              disabled={
                isSubmittingKeyboard ||
                debouncedKeyboardInput.trim().length === 0
              }>
              {isSubmittingKeyboard ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF8E7', '#FFFFFF']} style={styles.container}>
        <View style={styles.microphoneButton}>
          <FastImage
            source={require('../assets/michrophone.gif')}
            style={styles.iconSize}
            resizeMode={FastImage.resizeMode.contain}
          />
        </View>

        {/* Home Button */}
        <HomeButton navigation={navigation} onReset={resetLocalStates} />

        {/* Matalk Icon */}
        <View style={styles.matalkIcon}>
          <MatalkIcon />
        </View>

        {/* Input and Navigation Section */}
        <View style={styles.inputNavigationContainer}>
          <Inputs
            ref={inputsRef}
            mode={stateof}
            onInputChange={handleKeyboardInputChange}
          />
        </View>

        <View style={{flex: 1, width: '100%'}}>
          <View style={styles.contentContainer}>
            <View
              style={[styles.imageCardContainer, {zIndex: 10}]}
              key={`gallery`}>
              {showImages ? (
                (() => {
                  // If no images are available after filtering, show a message
                  const validImages = imageUrls
                    .filter(item => item && item.url)
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
                        <Text style={styles.errorText}>
                          We have an issue. Please be patient.
                        </Text>
                        <View style={styles.navigationCardsContainer}>
                          <TouchableOpacity
                            style={styles.navigationCard}
                            onPress={() =>
                              navigation.navigate('ShortCuts' as never)
                            }>
                            <View style={styles.cardImageContainer}>
                              <FastImage
                                source={require('../assets/shortCuts.png')}
                                style={styles.cardImage}
                                resizeMode={FastImage.resizeMode.contain}
                              />
                            </View>
                            <Text style={styles.cardText}>ShortCuts</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.navigationCard}
                            onPress={() =>
                              navigation.navigate('Feelings' as never)
                            }>
                            <View style={styles.cardImageContainer}>
                              <FastImage
                                source={require('../assets/feelings.png')}
                                style={styles.cardImage}
                                resizeMode={FastImage.resizeMode.contain}
                              />
                            </View>
                            <Text style={styles.cardText}>Feelings</Text>
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
                    {stateof === 'Keyboard' ? (
                      <KeyboardInputComponent />
                    ) : isRecording ? (
                      <FastImage
                        source={require('../assets/recording.gif')}
                        style={styles.recordingIcon}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    ) : (
                      <View
                        style={{
                          width: '100%',
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Text style={{fontSize: 20, fontWeight: 'bold'}}>
                          {`${transcribedText}`}
                        </Text>
                        {transcribedText.length === 0 || isRetrying ? (
                          <ActivityIndicator size="large" color="#0000ff" />
                        ) : null}
                        {isRetrying && (
                          <Text style={styles.retryText}>
                            Getting more answers... (Attempt {retryCount}/
                            {MAX_RETRIES})
                          </Text>
                        )}
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
    height: height * 0.11,
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
    width: '90%',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 10,
    paddingBottom: 20,
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
    top: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.03,
    position: 'absolute',
    width: width * 0.05,
    height: width * 0.05,
  },
  iconSize: {
    width: 45,
    height: 45,
    resizeMode: 'contain',
  },
  keyboardIcon: {
    width: width * 0.3,
    height: width * 0.3,
    resizeMode: 'contain',
  },
  recordingIcon: {
    width: width * 0.4,
    height: width * 0.4,
    resizeMode: 'contain',
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
    padding: 20,
  },
  waitingLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
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
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 100,
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
    fontSize: 16,
  },
  submitButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
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
    padding: 20,
    marginVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    minHeight: 60,
    justifyContent: 'center',
  },
  typingDisplayText: {
    fontSize: 18,
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
    fontSize: 18,
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
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
    width: '40%',
    minHeight: 120,
  },
  cardImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardImage: {
    width: 40,
    height: 40,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});

export default HomeScreen;
