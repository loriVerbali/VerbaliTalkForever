import React, {useState, useEffect, useRef} from 'react';
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
  const [transcribedText, setTranscribedText] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const metering = useRef<number>(-100);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const {playAttention} = useSound();
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const navigation = useNavigation();
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (stateof === 'Attention') {
      wakeWord.stopListening();
      playSound();
    }
  }, []);

  const playWrittenSentence = async () => {
    debugger;
    if (transcribedText.trim()) {
      TTSService.speak(transcribedText, true);
    }
  };

  const playSound = async () => {
    //console.log('playSound - Starting playSound function');

    // FORCE THE RECORDING INDICATOR ON
    setIsRecording(true);
    const res = await playAttention();
    //console.log('playSound - playAttention result:', res);
    if (stateof === 'Attention' && res) {
      //console.log('playSound - stateof is Attention, calling handleRecord');
      // Now handleRecord will start fresh with isRecording true
      handleRecord();
    }
  };

  const handleRecord = async () => {
    const currentTime = Date.now();
    setFetchingImages(false);

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

      // Now that recording has started, update the state and ref

      setAudioPath(path);

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
    //console.log('stopRecording - Starting stopRecording function');

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

    setIsTranscribing(true);

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

      const transcribeResponse = await fetchHelper(
        'transcribeAudio',
        {},
        formData,
      );

      if (transcribeResponse?.text) {
        const transcribedText = transcribeResponse.text.trim();
        setIsTranscribing(false);

        if (
          threadId &&
          transcribedText.length > 0 &&
          transcribedText !== 'null' &&
          transcribedText !== 'Thank you for watching!'
        ) {
          setFetchingImages(true);
          const messageId = await sendMessage(
            transcribedText,
            threadId,
            'generate_answers',
          );

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
    } finally {
      setIsTranscribing(false);
      setFetchingImages(false);
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
      console.log(
        'Setting showImages to true. Status:',
        status,
        'Image count:',
        imageUrls.length,
      );
      setShowImages(true);
    } else {
      console.log(
        'Not showing images. Status:',
        status,
        'Image count:',
        imageUrls?.length || 0,
      );
    }
  }, [imageUrls, status]);

  useEffect(() => {
    console.log('showImages changed:', showImages);
  }, [showImages]);

  // Add a function to force refresh
  const forceRefresh = () => {
    console.log('Forcing refresh');
    setRefreshKey(prevKey => prevKey + 1);
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

        <View style={{flex: 1, width: '100%'}}>
          <View style={styles.contentContainer}>
            {(isRecording || isTranscribing || fetchingImages) && (
              <View style={styles.recordingContainer}>
                <ActivityIndicator size="large" color="#ff0000" />
                <Text
                  style={{color: '#ff0000', fontWeight: 'bold', fontSize: 18}}>
                  {isRecording && 'Recording…'}
                  {isTranscribing && 'Processing…'}
                  {fetchingImages && 'Getting images…'}
                </Text>
              </View>
            )}

            <View
              style={[styles.imageCardContainer, {zIndex: 10}]}
              key={`gallery-${refreshKey}`}>
              {showImages
                ? (() => {
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
                        <View style={styles.noImagesContainer}>
                          <Text style={styles.noImagesText}>
                            No valid images to display
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View style={{width: '100%', flex: 1}}>
                        <ImageGallery images={validImages} />
                      </View>
                    );
                  })()
                : null}
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
    borderRadius: 10,
    padding: 10,
    marginTop: 20,
    minHeight: 300,
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
});

export default HomeScreen;
