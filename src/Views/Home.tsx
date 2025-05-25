import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  TouchableOpacity,
  Platform,
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
import Inputs from '../Components/Inputs';
import Transcription from '../Components/Transcription';
import ImageGallery from '../Components/ImageGallery';
import {useAssistant} from '../contexts/AssistantContext';
import {useSound} from '../contexts/soundContext';
import TTSService from '../utils/TTSService';
import wakeWord from '../utils/wakewordService';
import LinearGradient from 'react-native-linear-gradient';
import FastImage from 'react-native-fast-image';
import HomeButton from '../Components/HomeButton';
import fetchHelper from '../utils/fetcher';
import LottieView from 'lottie-react-native';

const {width, height} = Dimensions.get('window');

type RootStackParamList = {
  Home: {stateof?: 'Attention' | 'Keyboard' | string};
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  route?: HomeScreenRouteProp;
}

const audioRecorderPlayer = new AudioRecorderPlayer();

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {sendMessage, runAssistant, resetHistory, threadId, imageUrls, status} =
    useAssistant();
  const stateof = route?.params?.stateof ?? '';
  const [showTranscription, setShowTranscription] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const metering = useRef<number>(-100);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const {playAttention} = useSound();
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const navigation = useNavigation();
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showSpinner, setShowSpinner] = useState(true);
  const [fetchingImages, setFetchingImages] = useState(false);
  useEffect(() => {
    if (stateof === 'Attention') {
      playSound();
      wakeWord.stopListening();
    }
  }, []);

  useEffect(() => {
    if (!isRecording) {
      setShowSpinner(true);
    } else {
      setShowSpinner(false);
    }
  }, [isRecording]);

  const playWrittenSentence = async () => {
    debugger;
    if (transcribedText.trim()) {
      TTSService.speak(transcribedText, true);
    }
  };

  const playSound = async () => {
    console.log('playSound - Starting playSound function');

    const res = await playAttention();
    console.log('playSound - playAttention result:', res);
    if (stateof === 'Attention' && res) {
      console.log(
        'playSound - stateof is Attention, calling handleRecord',
        res,
      );
      handleRecord();
    }
  };

  const handleRecord = async () => {
    console.log('handleRecord - Starting with isRecording:', isRecording);
    if (!isRecording) {
      const currentTime = Date.now();
      console.log('handleRecord - Starting new recording at:', currentTime);
      setFetchingImages(false);
      setIsRecording(true);
      isRecordingRef.current = true;

      lastSoundTimeRef.current = 0;
      metering.current = -100;

      try {
        const path = Platform.select({
          ios: `sound.m4a`,
          android: `${RNFS.CachesDirectoryPath}/sound.mp3`,
        })!;
        console.log('handleRecord - Selected audio path:', path);

        // Clear previous cached recording if it exists
        try {
          const exists = await RNFS.exists(path);
          console.log('handleRecord - Previous recording exists:', exists);
          if (exists) {
            await RNFS.unlink(path);
            console.log('handleRecord - Previous recording cleared');
          }
        } catch (e) {
          console.warn('handleRecord - Error clearing previous recording:', e);
        }

        // Start recording with configured options for better quality
        console.log('handleRecord - Starting recorder with path:', path);
        await audioRecorderPlayer.startRecorder(path, {
          AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
          AudioSourceAndroid: AudioSourceAndroidType.MIC,
          AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
          AVNumberOfChannelsKeyIOS: 1,
          AVFormatIDKeyIOS: AVEncodingOption.aac,
        });

        setAudioPath(path);
        console.log('handleRecord - Audio path set:', path);

        // Add meter listener to detect silence
        audioRecorderPlayer.addRecordBackListener(e => {
          if (lastSoundTimeRef.current === 0) {
            console.log('handleRecord - First sound detected at:', currentTime);
            lastSoundTimeRef.current = currentTime;
          }

          // Store current metering value
          if (e.currentMetering !== undefined) {
            metering.current = e.currentMetering;
            console.log('handleRecord - Current metering:', e.currentMetering);
          }

          // Check if there's actual sound (not silence)
          if (e.currentMetering !== undefined && e.currentMetering > -25) {
            console.log(
              'handleRecord - Sound detected, metering:',
              metering.current,
              'last sound time updated:',
              Date.now(),
            );
            lastSoundTimeRef.current = Date.now();
          } else {
            const silenceTime = Date.now() - lastSoundTimeRef.current;
            console.log(
              'handleRecord - Potential silence detected, metering:',
              metering.current,
              'silence duration:',
              silenceTime,
              'ms',
            );

            if (silenceTime > 2000 && lastSoundTimeRef.current > 0) {
              console.log(
                'handleRecord - Silence detected for 2 seconds, stopping recording',
              );
              stopRecording();
              return;
            }
          }

          return true;
        });

        console.log('handleRecord - Setting recording timeout for 8 seconds');
        recordingTimer.current = setTimeout(async () => {
          if (isRecordingRef.current) {
            console.log(
              'handleRecord - Maximum recording time reached (8s), stopping',
            );
            await stopRecording();
          }
        }, 8000);
      } catch (error) {
        console.error('handleRecord - Recording failed to start:', error);
        setIsRecording(false);
      }
    } else {
      console.log('handleRecord - Stopping existing recording');
      await stopRecording();
    }
  };

  const stopRecording = async () => {
    console.log('stopRecording - Starting stopRecording function');
    if (recordingTimer.current) {
      console.log('stopRecording - Clearing recording timer');
      clearTimeout(recordingTimer.current);
      recordingTimer.current = null;
    }

    try {
      console.log('stopRecording - Setting isRecording to false');
      setIsRecording(false);
      isRecordingRef.current = false;

      console.log('stopRecording - Stopping recorder');
      const filePath = await audioRecorderPlayer.stopRecorder();
      console.log('stopRecording - Recording stopped, file path:', filePath);
      audioRecorderPlayer.removeRecordBackListener();
      console.log('stopRecording - Record back listener removed');

      // Process audio file
      console.log('stopRecording - Final file path:', filePath);

      await transcribeAudio(filePath);
    } catch (error) {
      console.error('stopRecording - Failed to stop recording:', error);
    }
  };

  const transcribeAudio = async (audioPath: string) => {
    console.log('transcribeAudio - Starting with audio path:', audioPath);
    if (!audioPath) {
      console.log('transcribeAudio - No audio path provided, returning');
      return;
    }

    setIsTranscribing(true);
    console.log('transcribeAudio - Set isTranscribing to true');

    try {
      const formData = new FormData();
      const audioUri = audioPath.replace('file://', '');
      console.log('transcribeAudio - Processed audio URI:', audioUri);

      formData.append('file', {
        uri: audioUri,
        type: Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/mp3',
        name: Platform.OS === 'ios' ? 'recording.m4a' : 'recording.mp3',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      console.log('transcribeAudio - FormData created:', formData);
      console.log('transcribeAudio - Sending request to transcribe audio');

      const transcribeResponse = await fetchHelper(
        'transcribeAudio',
        {},
        formData,
      );
      console.log('transcribeAudio - Response received:', transcribeResponse);

      if (transcribeResponse?.text) {
        const transcribedText = transcribeResponse.text.trim();
        console.log('transcribeAudio - Transcribed text:', transcribedText);

        if (threadId) {
          setFetchingImages(true);
          console.log('transcribeAudio - Sending message to thread:', threadId);
          const messageId = await sendMessage(
            transcribedText,
            threadId,
            'generate_answers',
          );
          console.log('transcribeAudio - Message sent, ID:', messageId);

          if (messageId) {
            console.log(
              'transcribeAudio - Running assistant with thread:',
              threadId,
            );
            await runAssistant(threadId);
          }
        }
      } else {
        console.log('transcribeAudio - No speech detected');
        TTSService.speak('No speech detected. Please try again.', true);
      }
    } catch (error) {
      console.error('transcribeAudio - Processing failed:', error);
      TTSService.speak('Failed to process audio. Please try again.', true);
    } finally {
      console.log('transcribeAudio - Setting isTranscribing to false');
      setIsTranscribing(false);
    }
  };

  const toggleTranscription = () => {
    setShowTranscription(!showTranscription);
  };

  const handleTranscriptionUpdate = (text: string) => {
    setTranscribedText(text);
  };

  const toggleKeyboard = () => {
    setIsKeyboardVisible(!isKeyboardVisible);
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
        <HomeButton navigation={navigation} />

        {/* Input and Navigation Section */}
        <View style={styles.inputNavigationContainer}>
          <Inputs mode={stateof} />
        </View>

        <View style={styles.contentContainer}>
          {showSpinner ? (
            <View style={styles.recordingContainer}>
              <LottieView
                source={require('../assets/lottie/listening.json')}
                autoPlay
                loop
                style={{width: '100%', height: '100%'}}
              />
            </View>
          ) : (
            <>
              {fetchingImages || isTranscribing ? (
                <View style={styles.recordingContainer}>
                  <LottieView
                    source={require('../assets/lottie/creating.json')}
                    autoPlay
                    loop
                    style={{width: '100%', height: '100%'}}
                  />
                </View>
              ) : (
                <>
                  <Modal
                    visible={showTranscription}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setShowTranscription(false)}>
                    <View style={styles.modalOverlay}>
                      <View style={styles.transcriptionPopup}>
                        <View style={styles.popupHeader}>
                          <Text style={styles.popupTitle}>Transcription</Text>
                          <TouchableOpacity
                            onPress={() => setShowTranscription(false)}>
                            <Text style={styles.closeButton}>Close</Text>
                          </TouchableOpacity>
                        </View>
                        <Transcription text={transcribedText} />
                      </View>
                    </View>
                  </Modal>

                  <View style={styles.imageCardContainer}>
                    {status === 'completed' && imageUrls?.length > 0 ? (
                      <ImageGallery images={imageUrls} />
                    ) : null}
                  </View>
                </>
              )}
            </>
          )}
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
    width: '80%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  transcriptionPopup: {
    width: '80%',
    height: '70%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '500',
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
});

export default HomeScreen;
