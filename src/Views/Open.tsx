import React, {useRef, useEffect, useState} from 'react';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  StatusBar,
  Pressable,
  Animated,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  BackHandler,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import {views} from '../utils/constants';
import LinearGradient from 'react-native-linear-gradient';
import {useAppSettings} from '../utils/persistance';
import {hasAppAccess} from '../utils/trialUtils';
import {useConnection} from '../utils/connection';
import NoInternetConnection from '../Components/NoInternetConnection';
import MatalkIcon from '../Components/MatalkIcon';
import ContextInfo from '../Components/ContextInfo';
import ShowAndTell from '../Components/ShowAndTell';
import {Mixpanel} from 'mixpanel-react-native';
import WakeWordService from '../utils/wakewordService';
import {useAdmin} from '../contexts/adminContext';
import TTSService from '../utils/TTSService';

type RootStackParamList = {
  LOGIN: undefined;
  HOME: {stateof?: string};
  FEELINGS: undefined;
  SHORTCUTS: undefined;
  CONVO: undefined;
  SETTINGS: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const {height, width} = Dimensions.get('window');

const OpenScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const isListening = useRef(false);
  const {isTablet} = useAdmin();
  const [recognizedText, setRecognizedText] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const {getItem} = useAppSettings();
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isError, setIsError] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showRecognitionStatus, setShowRecognitionStatus] = useState(false);
  const [contextInfoVisible, setContextInfoVisible] = useState(false);
  const [startupModalVisible, setStartupModalVisible] = useState(true);
  const {isConnected} = useConnection();
  const [connectionState, setConnectionState] = useState(isConnected);
  const {preferences} = useAppSettings();
  const heroName = preferences?.heroName;
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);
  const wakeWordService = WakeWordService.getInstance();
  const handScaleAnim = useRef(new Animated.Value(1)).current;
  const bubbleScaleAnim = useRef(new Animated.Value(1)).current;
  const settingsHandScaleAnim = useRef(new Animated.Value(1)).current;
  const settingsBubbleScaleAnim = useRef(new Animated.Value(1)).current;

  // Track connection state changes
  useEffect(() => {
    setConnectionState(isConnected); // Force local state update
  }, [isConnected]);

  // Hand and bubble pulsing animation
  useEffect(() => {
    const createPulseAnimation = () => {
      return Animated.sequence([
        Animated.parallel([
          Animated.timing(handScaleAnim, {
            toValue: 1.3,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(bubbleScaleAnim, {
            toValue: 1.1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(settingsHandScaleAnim, {
            toValue: 1.3,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(settingsBubbleScaleAnim, {
            toValue: 1.1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(handScaleAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(bubbleScaleAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(settingsHandScaleAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(settingsBubbleScaleAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      ]);
    };

    const startPulseAnimation = () => {
      createPulseAnimation().start(() => {
        // Restart the animation after completion
        setTimeout(startPulseAnimation, 0);
      });
    };

    startPulseAnimation();
  }, [
    handScaleAnim,
    bubbleScaleAnim,
    settingsHandScaleAnim,
    settingsBubbleScaleAnim,
  ]);

  const askForAdultHelp = () => {
    TTSService.speak(
      'There seems to be a problem , please ask an adult for help',
    );
    handleSettingsPress();
  };

  useEffect(() => {
    mixpanel.track('MainScreen', {
      Opened: 'MainScreen',
    });
    // Fade in when the screen mounts
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Initialize wake word service with proper cleanup and restart
    const initializeWakeWord = async () => {
      try {
        // Set up callback for when wake word is detected
        wakeWordService.setCallback((phrase: string) => {
          // Handle wake word detection
          !hasAppAccess(
            preferences?.isIOSActive || '0',
            preferences?.isInTrial || '0',
            preferences?.trialInstallationDate || 'init.NotSet',
          )
            ? askForAdultHelp()
            : navigation.navigate(views.HOME as never, {
                stateof: 'Attention',
              });
        });

        // Start listening (this will handle initialization if needed)
        await wakeWordService.startListening();
      } catch (error) {
        console.error(
          'Failed to initialize wake word service on Open screen:',
          error,
        );
      }
    };

    initializeWakeWord();

    // Clean up on unmount
    return () => {
      setRecognizedText('');
      // Properly stop wake word service to prevent memory leaks
      wakeWordService.stopListening().catch(error => {
        console.error(
          'Error stopping wake word service on Open screen unmount:',
          error,
        );
      });
    };
  }, []);

  // Ensure wake word service is properly initialized when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const ensureWakeWordActive = async () => {
        try {
          // Check if wake word service is listening, if not, start it
          if (!wakeWordService.isCurrentlyListening()) {
            await wakeWordService.startListening();
          }
        } catch (error) {
          console.error('Error ensuring wake word service is active:', error);
        }
      };

      // Small delay to ensure navigation is complete
      const timer = setTimeout(ensureWakeWordActive, 200);
      return () => clearTimeout(timer);
    }, []),
  );

  const startListening = () => {
    if (
      !hasAppAccess(
        preferences?.isIOSActive || '0',
        preferences?.isInTrial || '0',
        preferences?.trialInstallationDate || 'init.NotSet',
      )
    ) {
      askForAdultHelp();
      return;
    }
    navigation.navigate(views.HOME as never, {
      stateof: 'Attention',
    });
  };

  useEffect(() => {}, [modalVisible]);

  // Handle Android back button when modal is visible
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (modalVisible) {
          closeModal();
          return true; // Prevent default behavior
        }
        return false; // Let default behavior handle it
      },
    );

    return () => backHandler.remove();
  }, [modalVisible]);

  const handleNavigation = (state: string) => {
    if (
      !hasAppAccess(
        preferences?.isIOSActive || '0',
        preferences?.isInTrial || '0',
        preferences?.trialInstallationDate || 'init.NotSet',
      )
    ) {
      askForAdultHelp();
      return;
    }
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
    if (
      !hasAppAccess(
        preferences?.isIOSActive || '0',
        preferences?.isInTrial || '0',
        preferences?.trialInstallationDate || 'init.NotSet',
      )
    ) {
      askForAdultHelp();
      return;
    }
    navigation.navigate(views.HOME as never, {
      stateof: 'Keyboard',
    });
    // TTSService.speak('Keyboard selected');
  };

  const handleSettingsPress = () => {
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setAdminCodeInput('');
    setIsError(false);
  };

  const handleAdminCodeSubmit = async () => {
    const storedAdminCode = await getItem('adminCode');
    if (adminCodeInput === storedAdminCode) {
      closeModal();
      navigation.navigate(views.SETTINGS as never);
    } else {
      setIsError(true);
      setTimeout(closeModal, 1000);
    }
  };

  const toggleContextInfo = () => {
    setContextInfoVisible(!contextInfoVisible);
  };

  return (
    <>
      <Animated.View style={[{flex: 1, opacity: fadeAnim}]}>
        <LinearGradient
          colors={['#FFF8E7', '#FFFFFF']}
          style={styles.container}>
          <View style={styles.headerContainer}>
            <Text style={styles.headerText}>Hi {heroName ? heroName : ''}</Text>
            <FastImage
              source={require('../assets/hand.png')}
              style={styles.matanImage}
              resizeMode={FastImage.resizeMode.contain}
            />
          </View>

          <Pressable style={styles.microphoneButton} onPress={startListening}>
            <FastImage
              source={
                connectionState
                  ? require('../assets/michrophone.gif')
                  : require('../assets/noMic.png')
              }
              style={[styles.iconSize, isListening.current && {opacity: 0.5}]}
              resizeMode={FastImage.resizeMode.contain}
            />
          </Pressable>

          {/* Pointing hand with text bubble */}
          <View style={styles.pointHandBubble}>
            <Animated.View style={{transform: [{scale: handScaleAnim}]}}>
              <FastImage
                source={require('../assets/pointhand.png')}
                style={styles.pointHandImage}
                resizeMode={FastImage.resizeMode.contain}
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.speechBubble,
                {
                  transform: [{scale: bubbleScaleAnim}],
                  borderColor: bubbleScaleAnim.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: ['rgba(0, 0, 0, 0.1)', '#8B5CF6'],
                    extrapolate: 'clamp',
                  }),
                  borderWidth: bubbleScaleAnim.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: [1, 3],
                    extrapolate: 'clamp',
                  }),
                },
              ]}>
              <Text style={styles.speechBubbleText}>
                Tap here or Say Hey Verbi
              </Text>
            </Animated.View>
          </View>

          {showRecognitionStatus && (
            <View style={styles.recognitionStatusContainer}>
              <Text style={styles.recognitionStatusText}>{recognizedText}</Text>
            </View>
          )}

          <Pressable
            style={
              isTablet ? styles.settingsButton : styles.settingsButtonPhone
            }
            onPress={handleSettingsPress}>
            <FastImage
              source={require('../assets/settings.png')}
              style={
                isTablet ? styles.microphoneImage : styles.microphoneImagePhone
              }
              resizeMode={FastImage.resizeMode.contain}
            />
          </Pressable>

          {/* Settings pointing hand with text bubble */}
          <View style={styles.settingsPointHandBubble}>
            <Animated.View
              style={[
                styles.speechBubble,
                {
                  transform: [{scale: settingsBubbleScaleAnim}],
                  borderColor: settingsBubbleScaleAnim.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: ['rgba(0, 0, 0, 0.1)', '#8B5CF6'],
                    extrapolate: 'clamp',
                  }),
                  borderWidth: settingsBubbleScaleAnim.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: [1, 3],
                    extrapolate: 'clamp',
                  }),
                  marginRight: width * 0.03,
                },
              ]}>
              <Text style={styles.speechBubbleText}>Personalization!!</Text>
            </Animated.View>
            <Animated.View
              style={{transform: [{scale: settingsHandScaleAnim}]}}>
              <FastImage
                source={require('../assets/pointhandRight.png')}
                style={styles.pointHandImage}
                resizeMode={FastImage.resizeMode.contain}
              />
            </Animated.View>
          </View>

          <Pressable
            style={isTablet ? styles.infoButton : styles.infoButtonPhone}
            onPress={toggleContextInfo}>
            <Text style={styles.infoIcon}>ℹ️</Text>
          </Pressable>

          <View style={isTablet ? styles.matalkIcon : styles.matalkIconPhone}>
            <MatalkIcon size={isTablet ? width * 0.05 : width * 0.04} />
          </View>

          <View style={styles.contentContainer}>
            <View style={styles.wrapper}>
              <View style={styles.rowContent}>
                <Pressable
                  style={styles.tileWrapper}
                  onPress={() =>
                    connectionState ? handleNavigation('Talk') : null
                  }>
                  <View style={styles.imageWrapper}>
                    {connectionState ? (
                      <FastImage
                        key="connected-image"
                        source={require('../assets/talk.png')}
                        style={styles.image}
                        resizeMode={FastImage.resizeMode.contain}
                      />
                    ) : (
                      <NoInternetConnection
                        key="no-connection"
                        height={'30%'}
                      />
                    )}
                  </View>
                  <View
                    style={[
                      styles.labelContainer,
                      {backgroundColor: 'rgba(20, 108, 240, 0.25)'},
                    ]}>
                    <Text style={styles.kidText}>Start Talking</Text>
                  </View>
                </Pressable>
              </View>
              <View style={styles.rowContent}>
                <Pressable style={styles.tileWrapper} onPress={handKeyboard}>
                  <View style={styles.imageWrapper}>
                    <View style={styles.imageWrapper}>
                      <FastImage
                        source={require('../assets/keyboard.png')}
                        style={styles.image}
                        resizeMode={FastImage.resizeMode.contain}
                      />
                    </View>
                  </View>
                  <View
                    style={[
                      styles.labelContainer,
                      {backgroundColor: 'rgba(47, 183, 111, 0.25)'},
                    ]}>
                    <Text style={styles.kidText}>Type Here</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            <View style={styles.wrapper}>
              <View style={styles.rowContent}>
                <Pressable
                  style={styles.tileWrapper}
                  onPress={() => {
                    if (
                      !hasAppAccess(
                        preferences?.isIOSActive || '0',
                        preferences?.isInTrial || '0',
                        preferences?.trialInstallationDate || 'init.NotSet',
                      )
                    ) {
                      askForAdultHelp();
                      return;
                    }
                    Animated.timing(fadeAnim, {
                      toValue: 0,
                      duration: 500,
                      useNativeDriver: true,
                    }).start(() => {
                      navigation.navigate(views.FEELINGS as never);
                    });
                  }}>
                  <View style={styles.imageWrapper}>
                    <FastImage
                      source={require('../assets/feelings.png')}
                      style={styles.image}
                      resizeMode={FastImage.resizeMode.contain}
                    />
                  </View>
                  <View
                    style={[
                      styles.labelContainer,
                      {backgroundColor: 'rgba(229, 72, 72, 0.25)'},
                    ]}>
                    <Text style={[styles.kidText]}>How I Feel</Text>
                  </View>
                </Pressable>
              </View>
              <View style={styles.rowContent}>
                <Pressable
                  style={styles.tileWrapper}
                  onPress={() => {
                    if (
                      !hasAppAccess(
                        preferences?.isIOSActive || '0',
                        preferences?.isInTrial || '0',
                        preferences?.trialInstallationDate || 'init.NotSet',
                      )
                    ) {
                      askForAdultHelp();
                      return;
                    }
                    Animated.timing(fadeAnim, {
                      toValue: 0,
                      duration: 500,
                      useNativeDriver: true,
                    }).start(() => {
                      navigation.navigate(views.SHORTCUTS as never);
                    });
                  }}>
                  <View style={styles.imageWrapper}>
                    <FastImage
                      source={require('../assets/shortCuts.png')}
                      style={styles.image}
                      resizeMode={FastImage.resizeMode.contain}
                    />
                  </View>
                  <View
                    style={[
                      styles.labelContainer,
                      {backgroundColor: 'rgba(124, 58, 237, 0.25)'},
                    ]}>
                    <Text style={styles.kidText}>ShortCuts</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      <Modal
        visible={modalVisible}
        transparent={true}
        supportedOrientations={['landscape-left', 'landscape-right']}
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
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (adminCodeInput.length === 4) {
                      handleAdminCodeSubmit();
                    }
                  }}
                  onBlur={() => {
                    // Auto-cancel when user dismisses keyboard by tapping away
                    setTimeout(() => {
                      // Small delay to allow for done button press if that was the intent
                      if (modalVisible && adminCodeInput.length !== 4) {
                        closeModal();
                      }
                    }, 100);
                  }}
                  blurOnSubmit={true}
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

      <ContextInfo
        visible={contextInfoVisible}
        onClose={() => setContextInfoVisible(false)}
      />

      {/* Startup Show-and-Tell Modal */}
      <Modal
        visible={startupModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setStartupModalVisible(false)}>
        <View style={styles.startupModalOverlay}>
          <View style={styles.startupModalContent}>
            <View style={styles.showAndTellHeader}>
              <Text style={styles.showAndTellTitle}>Welcome to Matalk!</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setStartupModalVisible(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.showAndTellVideoContainer}>
              <ShowAndTell />
            </View>

            <TouchableOpacity
              style={styles.getStartedButton}
              onPress={() => setStartupModalVisible(false)}>
              <Text style={styles.getStartedButtonText}>Get Started!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    width: '100%',
    flexDirection: 'row',
    paddingTop:
      Platform.OS === 'android'
        ? height * 0.03
        : StatusBar.currentHeight || height * 0.03,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: height * 0.08,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#FFF8E7',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  wrapper: {
    flexDirection: 'row',
    height: height * 0.42,
    justifyContent: 'flex-start',
    marginTop: height * 0.01,
  },
  imageWrapper: {
    width: '90%',
    height: '90%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '85%',
    height: '85%',
  },
  rowContent: {
    width: '44%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: '100%',
  },
  tileWrapper: {
    width: '95%',
    height: '92%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    borderRadius: 16,
    shadowColor: 'rgba(0, 0, 0, 0.50)',
    shadowOpacity: 8,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
    backgroundColor: 'white',
  },
  microphoneButton: {
    top: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.015,
    position: 'absolute',
    width: width * 0.05,
    height: width * 0.05,
    zIndex: 2,
  },
  settingsButton: {
    top: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    right: width * 0.02,
    elevation: 17,
    position: 'absolute',
    width: width * 0.04,
    height: width * 0.04,
    borderRadius: width * 0.04,
    zIndex: 2,
  },
  settingsButtonPhone: {
    top: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    right: width * 0.02,
    elevation: 17,
    position: 'absolute',
    width: width * 0.035,
    height: width * 0.035,
    borderRadius: width * 0.035,
    zIndex: 2,
  },
  matalkIcon: {
    bottom: height * 0.02,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.015,
    position: 'absolute',
    zIndex: 3,
  },
  matalkIconPhone: {
    bottom: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.015,
    position: 'absolute',
    zIndex: 3,
  },
  infoButton: {
    bottom: height * 0.02,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 3,
    right: width * 0.015,
    elevation: 15,
    width: width * 0.035,
    height: width * 0.035,
    borderRadius: width * 0.035,
    backgroundColor: 'white',
  },
  infoButtonPhone: {
    bottom: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 3,
    right: width * 0.02,
    elevation: 15,
    width: width * 0.035,
    height: width * 0.035,
    borderRadius: width * 0.035,
    backgroundColor: 'white',
  },
  iconSize: {
    width: width * 0.04,
    height: width * 0.04,
    resizeMode: 'contain',
  },
  microphoneImage: {
    width: width * 0.04,
    height: width * 0.04,
  },
  microphoneImagePhone: {
    width: width * 0.035,
    height: width * 0.035,
  },
  kidText: {
    fontSize: height * 0.032,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },

  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: height * 0.1,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: width * 0.05,
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
    fontSize: height * 0.03,
    fontWeight: 'bold',
    marginBottom: height * 0.02,
    color: '#333',
  },
  codeInput: {
    width: '100%',
    height: height * 0.08,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: width * 0.05,
    fontSize: height * 0.03,
    textAlign: 'center',
    marginBottom: height * 0.02,
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
    paddingVertical: height * 0.02,
    borderRadius: 10,
    marginHorizontal: width * 0.01,
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
    fontSize: height * 0.02,
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
    padding: height * 0.01,
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
    fontSize: height * 0.02,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  labelContainer: {
    width: '100%',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  matanImage: {
    width: width * 0.03,
    height: width * 0.03,
    resizeMode: 'contain',
    marginLeft: width * 0.015,
  },
  infoIcon: {
    fontSize: height * 0.03,
    fontWeight: 'bold',
    color: '#333',
  },
  pointHandBubble: {
    position: 'absolute',
    top: height * 0.04,
    left: width * 0.08,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  pointHandImage: {
    width: width * 0.04,
    height: width * 0.04,
    marginRight: width * 0.03,
  },
  speechBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    paddingHorizontal: width * 0.02,
    paddingVertical: height * 0.008,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  speechBubbleText: {
    fontSize: height * 0.018,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  settingsPointHandBubble: {
    position: 'absolute',
    top: height * 0.04,
    right: width * 0.06,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  startupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.05,
  },
  startupModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '95%',
    height: '90%',
    padding: width * 0.05,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  showAndTellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: height * 0.02,
  },
  showAndTellTitle: {
    fontSize: height * 0.04,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    width: width * 0.08,
    height: width * 0.08,
    borderRadius: width * 0.04,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: height * 0.025,
    color: '#666',
    fontWeight: 'bold',
  },
  showAndTellVideoContainer: {
    flex: 1,
    marginBottom: height * 0.02,
  },
  getStartedButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: height * 0.02,
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  getStartedButtonText: {
    color: 'white',
    fontSize: height * 0.025,
    fontWeight: 'bold',
  },
});

export default OpenScreen;
