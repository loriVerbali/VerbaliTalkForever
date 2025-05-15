import React, {useRef, useEffect, useState} from 'react';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  StatusBar,
  Pressable,
  ActivityIndicator,
  Animated,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import {SCREEN_WIDTH, views} from '../utils/constants';
import LinearGradient from 'react-native-linear-gradient';
import {useAssistant} from '../contexts/AssistantContext';
import VoiceService from '../utils/VoiceService';
import TTSService from '../utils/TTSService';
import {useAuth0} from 'react-native-auth0';
import {useAppSettings} from '../utils/persistance';

type RootStackParamList = {
  LOGIN: undefined;
  HOME: {stateof?: string};
  FEELINGS: undefined;
  SHORTCUTS: undefined;
  CONVO: undefined;
  SETTINGS: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const {height} = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40; // fallback for iOS

const OpenScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const isListening = useRef(false);
  const [recognizedText, setRecognizedText] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const {geminiGenerateImage} = useAssistant();
  const {clearSession} = useAuth0();
  const {setItem, getItem} = useAppSettings();
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isError, setIsError] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showRecognitionStatus, setShowRecognitionStatus] = useState(false);

  useEffect(() => {
    console.log('OpenScreen mounted');
    // Fade in when the screen mounts
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Initialize services
    const initializeServices = async () => {
      try {
        console.log('initializing voice service');
        console.log('isListening.current', isListening.current);

        // Initialize voice service
        await VoiceService.initialize();
        console.log('voice service initialized');

        // Set up callbacks
        VoiceService.setCallbacks(
          // Handle recognized text
          text => {
            console.log('setting recognized text', text);
            setRecognizedText(text);
            setShowRecognitionStatus(true);
            console.log('text', text);
            // Check for navigation keywords
            if (
              text.toLowerCase().includes('verbali') ||
              text.toLowerCase().includes('verbbali') ||
              text.toLowerCase().includes('verbally') ||
              text.toLowerCase().includes('verbbali') ||
              text.toLowerCase().includes('verb ali') ||
              text.toLowerCase().includes('verbali')
            ) {
              VoiceService.stopListening();
              isListening.current = false;
              navigation.navigate(views.HOME as never, {
                stateof: 'Attention',
              });
            }
          },
          // Handle status changes
          (status, error) => {
            if (status === 'error' && error) {
              console.error('Voice recognition error:', error);

              // If we're getting AF Assistant errors (code 1101), this is likely
              // a permissions or system issue on iOS
              if (
                error.includes('1101') ||
                error.includes('kAFAssistantErrorDomain')
              ) {
                setRecognizedText(
                  'Speech service error. Please check your permissions in Settings.',
                );

                // On iOS, show alert to help user understand the issue
                if (Platform.OS === 'ios') {
                  Alert.alert(
                    'Speech Recognition Error',
                    'Please ensure that Speech Recognition is enabled for this app in your device settings. Go to Settings > Privacy > Speech Recognition.',
                    [{text: 'OK'}],
                  );
                }
              } else {
                setRecognizedText(`Error: ${error}`);
              }

              setShowRecognitionStatus(true);
              isListening.current = false;
            } else if (status === 'stopped') {
              isListening.current = false;
              // Hide the recognition status after a delay
              setTimeout(() => {
                setShowRecognitionStatus(false);
              }, 2000);
            } else if (status === 'started') {
              setRecognizedText('Listening...');
              setShowRecognitionStatus(true);
            }
          },
        );
      } catch (error) {
        console.error('Error initializing services:', error);
      }
    };

    initializeServices();

    // Clean up on unmount
    return () => {
      // Reset voice and text state
      setRecognizedText('');
      if (isListening.current) {
        VoiceService.stopListening();
      }
      // Destroy the service to clean up resources
      VoiceService.destroy();
    };
  }, []);

  useEffect(() => {
    console.log('Modal visibility changed:', modalVisible);
  }, [modalVisible]);

  const handleNavigation = (state: string) => {
    // Start fade out before navigation
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      if (state === 'Talk') {
        navigation.navigate(views.CONVO as never);
      } else {
        navigation.navigate(views.HOME as never);
      }
    });
  };

  const handKeyboard = async () => {
    // Use our optimized TTS service instead
    navigation.navigate(views.HOME as never, {
      stateof: 'Keyboard',
    });
    // TTSService.speak('Keyboard selected');
  };

  const startListening = async () => {
    if (!isListening.current) {
      console.log('Starting listening');
      isListening.current = true;
      setRecognizedText('Initializing...');
      setShowRecognitionStatus(true);

      // Use longer timeouts for iOS to prevent premature stopping
      const silenceTimeout = Platform.OS === 'ios' ? 10000 : 2000;
      const maxDuration = Platform.OS === 'ios' ? 15000 : 8000;

      let success = false;
      let retries = 0;

      // Try up to 2 times on iOS, which can have intermittent issues
      while (!success && retries < (Platform.OS === 'ios' ? 2 : 1)) {
        try {
          success = await VoiceService.startListening(
            silenceTimeout,
            maxDuration,
          );

          if (success) {
            setRecognizedText('Listening...');
            break;
          }
        } catch (err) {
          console.error(
            `Voice recognition start attempt ${retries + 1} failed:`,
            err,
          );
        }

        // If failed, wait briefly before retrying
        if (!success && Platform.OS === 'ios') {
          await new Promise(resolve => setTimeout(resolve, 500));
          // Re-initialize
          await VoiceService.initialize();
        }

        retries++;
      }

      if (!success) {
        setRecognizedText(
          'Speech recognition unavailable. Please check app permissions in Settings.',
        );
        isListening.current = false;

        // Show a brief alert after a delay
        setTimeout(() => {
          setShowRecognitionStatus(false);
        }, 3000);
      }
    }
  };

  const handleSettingsPress = () => {
    console.log('Settings button pressed, current modal state:', modalVisible);
    setModalVisible(true);
    console.log('Setting modal visible to true');
  };

  const closeModal = () => {
    console.log('Closing modal');
    setModalVisible(false);
    setAdminCodeInput('');
    setIsError(false);
  };

  const handleAdminCodeSubmit = async () => {
    console.log('Submitting admin code:', adminCodeInput);
    const storedAdminCode = await getItem('adminCode');
    console.log('Stored admin code:', storedAdminCode);
    if (adminCodeInput === storedAdminCode) {
      closeModal();
      navigation.navigate(views.SETTINGS as never);
    } else {
      setIsError(true);
      setTimeout(closeModal, 1000);
    }
  };

  return (
    <>
      <Animated.View style={[{flex: 1, opacity: fadeAnim}]}>
        <LinearGradient
          colors={['#ffffff', '#f8f9fe']}
          style={styles.container}>
          <Pressable
            style={styles.microphoneButton}
            onPress={startListening}
            disabled={isListening.current}>
            <FastImage
              source={require('../assets/microphone.png')}
              style={[
                styles.microphoneImage,
                isListening.current && {opacity: 0.5},
              ]}
              resizeMode={FastImage.resizeMode.contain}
            />
          </Pressable>

          {showRecognitionStatus && (
            <View style={styles.recognitionStatusContainer}>
              <Text style={styles.recognitionStatusText}>{recognizedText}</Text>
            </View>
          )}

          <Pressable
            style={styles.settingsButton}
            onPress={handleSettingsPress}>
            <FastImage
              source={require('../assets/settings.png')}
              style={[styles.microphoneImage]}
              resizeMode={FastImage.resizeMode.contain}
            />
          </Pressable>

          <View style={styles.contentContainer}>
            <View
              style={{
                flexDirection: 'row',
                height: height / 2 - statusBarHeight,
              }}>
              <View style={styles.rowContent}>
                <Pressable
                  style={styles.tileWrapper}
                  onPress={() => handleNavigation('Talk')}>
                  <FastImage
                    source={require('../assets/talk.png')}
                    style={{width: '100%', height: '100%'}}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text style={styles.kidText}>Start Talking</Text>
                </Pressable>
              </View>
              <View style={styles.rowContent}>
                <Pressable
                  style={styles.tileWrapper}
                  onPress={() => {
                    Animated.timing(fadeAnim, {
                      toValue: 0,
                      duration: 500,
                      useNativeDriver: true,
                    }).start(() => {
                      navigation.navigate(views.SHORTCUTS as never);
                    });
                  }}>
                  <FastImage
                    source={require('../assets/shortCuts.png')}
                    style={{width: '100%', height: '100%'}}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text style={styles.kidText}>ShortCuts!</Text>
                </Pressable>
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                height: height / 2,
              }}>
              <View style={styles.rowContent}>
                <Pressable
                  style={styles.tileWrapper}
                  onPress={() => {
                    Animated.timing(fadeAnim, {
                      toValue: 0,
                      duration: 500,
                      useNativeDriver: true,
                    }).start(() => {
                      navigation.navigate(views.FEELINGS as never);
                    });
                  }}>
                  <FastImage
                    source={require('../assets/feelings.png')}
                    style={{width: '100%', height: '100%'}}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text style={styles.kidText}>How I Feel</Text>
                </Pressable>
              </View>

              <View style={styles.rowContent}>
                <Pressable style={styles.tileWrapper} onPress={handKeyboard}>
                  <FastImage
                    source={require('../assets/keyboard.png')}
                    style={{width: '100%', height: '100%'}}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text style={styles.kidText}>Type Here!</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Enter Admin Code</Text>
                <TextInput
                  style={[styles.codeInput, isError && styles.errorInput]}
                  value={adminCodeInput}
                  onChangeText={text => {
                    const numericText = text.replace(/[^0-9]/g, '');
                    if (numericText.length <= 4) {
                      setAdminCodeInput(numericText);
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry={true}
                  autoFocus={true}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={closeModal}>
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.submitButton,
                      adminCodeInput.length !== 4 && styles.disabledButton,
                    ]}
                    onPress={handleAdminCodeSubmit}
                    disabled={adminCodeInput.length !== 4}>
                    <Text style={styles.buttonText}>Submit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'column',
    width: '100%',
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  rowContent: {
    width: '50%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileWrapper: {
    width: '70%',
    borderRadius: 20,
    height: '90%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 7,
    borderWidth: 0.3,
    borderColor: 'purple',
  },
  microphoneButton: {
    position: 'absolute',
    top: height * 0.1,
    left: SCREEN_WIDTH * 0.01,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },

  settingsButton: {
    position: 'absolute',
    top: height * 0.2,
    left: SCREEN_WIDTH * 0.01,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3498db',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    zIndex: 10,
    elevation: 5,
  },
  microphoneImage: {
    width: '100%',
    height: '100%',
  },
  kidText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginTop: -10,
  },

  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  codeInput: {
    width: '100%',
    height: 60,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 20,
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  errorInput: {
    borderColor: '#ff3b30',
    backgroundColor: '#fff0f0',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#ff3b30',
  },
  submitButton: {
    backgroundColor: '#34c759',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  recognitionStatusContainer: {
    position: 'absolute',
    top: height * 0.05,
    left: 0,
    right: 0,
    alignSelf: 'center',
    width: '80%',
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 10,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recognitionStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});

export default OpenScreen;
function geminiGenerateImage(arg0: string) {
  throw new Error('Function not implemented.');
}
