import React, {useRef, useEffect, useState, useCallback} from 'react';
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
import AppConfig from '../utils/config';
import {useConnection} from '../utils/connection';
import NoInternetConnection from '../Components/NoInternetConnection';
import ShowAndTell from '../Components/ShowAndTell';
import {Mixpanel} from 'mixpanel-react-native';
import WakeWordService from '../utils/wakewordService';
import {useAdmin} from '../contexts/adminContext';
import TTSService from '../utils/TTSService';
import {
  parseMy8Words,
  My8WordsData,
  getDefaultMy8Words,
} from '../utils/my8wordsUtils';
import {getImageSource} from '../utils/imageDownloader';

// Function to get avatar image based on selected gender
const getAvatarImage = (gender: string) => {
  switch (gender) {
    case 'white boy':
      return require('../assets/gender/wboy.jpg');
    case 'black boy':
      return require('../assets/gender/bboy.jpg');
    case 'asian boy':
      return require('../assets/gender/aboy.jpg');
    case 'white girl':
      return require('../assets/gender/wgirl.jpg');
    case 'black girl':
      return require('../assets/gender/bgirl.jpg');
    case 'asian girl':
      return require('../assets/gender/agirl.jpg');
    default:
      // Default to hand icon if no gender is selected
      return require('../assets/hand.png');
  }
};

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
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isError, setIsError] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showRecognitionStatus, setShowRecognitionStatus] = useState(false);
  const [startupModalVisible, setStartupModalVisible] = useState(false);
  const {isConnected} = useConnection();
  const [connectionState, setConnectionState] = useState(isConnected);
  const {preferences, getItem, setItem} = useAppSettings();
  const heroName = preferences?.heroName;
  const [settingsTappedOnce, setSettingsTappedOnce] = useState(false);
  const [microphoneTappedOnce, setMicrophoneTappedOnce] = useState(false);
  const [showAndTellModalShown, setShowAndTellModalShown] = useState(false);
  const [isHandshakeSpeaking, setIsHandshakeSpeaking] = useState(false);
  const [my8WordsData, setMy8WordsData] = useState<My8WordsData | null>(null);
  const mixpanel = useRef(
    new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true),
  ).current;
  const wakeWordService = WakeWordService.getInstance();
  const handScaleAnim = useRef(new Animated.Value(1)).current;
  const bubbleScaleAnim = useRef(new Animated.Value(1)).current;
  const settingsHandScaleAnim = useRef(new Animated.Value(1)).current;
  const settingsBubbleScaleAnim = useRef(new Animated.Value(1)).current;
  const handshakeTappedRef = useRef(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track connection state changes
  useEffect(() => {
    setConnectionState(isConnected); // Force local state update
  }, [isConnected]);

  // Load tap status and modal status from persistence
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const settingsTapped = await getItem('settingsTappedOnce');
        setSettingsTappedOnce(settingsTapped === '1');

        const microphoneTapped = await getItem('microphoneTappedOnce');
        setMicrophoneTappedOnce(microphoneTapped === '1');

        const modalShown = await getItem('showAndTellModalShown');
        setShowAndTellModalShown(modalShown === '1');

        // Load my8words data
        const my8wordsJson = await getItem('my8words');
        const parsedData = parseMy8Words(my8wordsJson);
        setMy8WordsData(parsedData);

        // Show modal only on first launch (when it hasn't been shown before)
        setStartupModalVisible(modalShown !== '1');
      } catch (e) {}
    };
    loadStatus();
  }, [getItem]);

  // Hand and bubble pulsing animation
  useEffect(() => {
    // Only start animation if at least one pointing element should be visible
    if (microphoneTappedOnce && settingsTappedOnce) {
      return; // Both have been tapped, no need to animate
    }

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

    let animationTimeout: ReturnType<typeof setTimeout> | null = null;

    const startPulseAnimation = () => {
      // Check if both have been tapped before starting next animation
      if (microphoneTappedOnce && settingsTappedOnce) {
        return; // Stop animation if both have been tapped
      }

      createPulseAnimation().start(() => {
        // Only restart if at least one pointing element should still be visible
        if (!microphoneTappedOnce || !settingsTappedOnce) {
          animationTimeout = setTimeout(startPulseAnimation, 0);
        }
      });
    };

    startPulseAnimation();

    // Cleanup function to stop animation and clear timeout
    return () => {
      if (animationTimeout) {
        clearTimeout(animationTimeout);
      }
      // Stop any running animations
      handScaleAnim.stopAnimation();
      bubbleScaleAnim.stopAnimation();
      settingsHandScaleAnim.stopAnimation();
      settingsBubbleScaleAnim.stopAnimation();
    };
  }, [
    handScaleAnim,
    bubbleScaleAnim,
    settingsHandScaleAnim,
    settingsBubbleScaleAnim,
    microphoneTappedOnce,
    settingsTappedOnce,
  ]);

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
        wakeWordService.setCallback(async (phrase: string) => {
          // Handle wake word detection
          if (handshakeTappedRef.current) {
            handshakeTappedRef.current = false;
            // If handshake was tapped, don't navigate - user will say "Hey Verby"
            return;
          }

          // Track wake word detection
          mixpanel.track('Open Screen - Wake Word Detected', {
            screen: 'Open',
            action: 'wake_word_detected',
            phrase: phrase,
          });

          navigation.navigate('HOME' as any, {
            stateof: 'Attention',
            entryMethod: 'wake_word',
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
      // Clear any pending timeouts
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
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

  const startListening = async () => {
    // Track microphone button click
    mixpanel.track('Open Screen - Microphone Button Clicked', {
      screen: 'Open',
      action: 'microphone_button',
    });

    // Mark microphone as tapped once
    if (!microphoneTappedOnce) {
      setMicrophoneTappedOnce(true);
      await setItem('microphoneTappedOnce', '1');
    }

    navigation.navigate('HOME' as any, {
      stateof: 'Attention',
      entryMethod: 'microphone_button',
    });
  };

  useEffect(() => {}, [modalVisible]);

  // Handle Android back button when modal is visible
  const handleBackPress = useCallback(() => {
    if (modalVisible) {
      closeModal();
      return true; // Prevent default behavior
    }
    return false; // Let default behavior handle it
  }, [modalVisible]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress,
    );

    return () => backHandler.remove();
  }, [handleBackPress]);

  const handleNavigation = async (state: string) => {
    // Start fade out before navigation
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      if (state === 'Talk') {
        navigation.navigate(views.CONVO as any);
      } else {
        navigation.navigate(views.HOME as any);
      }
    });
  };

  const handKeyboard = async () => {
    navigation.navigate('HOME' as any, {
      stateof: 'Keyboard',
    });
  };

  const handleSettingsPress = async () => {
    // Track settings button click
    mixpanel.track('Open Screen - Settings Button Clicked', {
      screen: 'Open',
      action: 'settings_button',
    });

    setModalVisible(true);
    // Mark settings as tapped once
    if (!settingsTappedOnce) {
      setSettingsTappedOnce(true);
      await setItem('settingsTappedOnce', '1');
    }
  };

  const handleHandshakePress = async () => {
    if (isHandshakeSpeaking) return; // Prevent multiple simultaneous TTS calls

    // Track introduction button click
    mixpanel.track('Open Screen - Introduction Button Clicked', {
      screen: 'Open',
      action: 'introduction_button',
    });

    // setIsHandshakeSpeaking(true);
    handshakeTappedRef.current = true; // Set flag to prevent navigation on wake word

    // Speak the introduction message
    const message = `${preferences?.handshakeMessage}`;
    await TTSService.speak(message, true);
    // setIsHandshakeSpeaking(false);
  };

  const closeModal = () => {
    setModalVisible(false);
    setAdminCodeInput('');
    setIsError(false);
  };

  const handleAdminCodeSubmit = async () => {
    const storedAdminCode = await getItem('adminCode');
    if (
      adminCodeInput === storedAdminCode ||
      adminCodeInput === AppConfig.masterAdminCode
    ) {
      closeModal();
      navigation.navigate(views.SETTINGS as never);
    } else {
      setIsError(true);
      // Clear any existing timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(closeModal, 1000);
    }
  };

  const closeStartupModal = async () => {
    setStartupModalVisible(false);
    // Mark modal as shown
    if (!showAndTellModalShown) {
      setShowAndTellModalShown(true);
      await setItem('showAndTellModalShown', '1');
    }
  };

  return (
    <>
      <Animated.View style={[{flex: 1, opacity: fadeAnim}]}>
        <LinearGradient
          colors={['#FFF8E7', '#FFFFFF']}
          style={styles.container}>
          <View style={styles.headerContainer}>
            <Text style={styles.headerText}>Hi {heroName ? heroName : ''}</Text>
            <TouchableOpacity onPress={handleHandshakePress}>
              <FastImage
                source={getAvatarImage(preferences?.gender || '')}
                style={styles.avatarImage}
                resizeMode={FastImage.resizeMode.cover}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                isTablet ? styles.handshakeButton : styles.handshakeButtonPhone,
                isHandshakeSpeaking && styles.speakingButton,
              ]}
              onPress={handleHandshakePress}>
              <FastImage
                source={require('../assets/handshake.png')}
                style={[
                  isTablet
                    ? styles.microphoneImage
                    : styles.microphoneImagePhone,
                  isHandshakeSpeaking && {opacity: 0.7},
                ]}
                resizeMode={FastImage.resizeMode.contain}
              />
            </TouchableOpacity>
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

          {/* Pointing hand with text bubble - only show if microphone not tapped yet */}
          {!microphoneTappedOnce && (
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
                  },
                ]}>
                <Text style={styles.speechBubbleText}>
                  Tap here or Say Hey Verbi
                </Text>
              </Animated.View>
            </View>
          )}

          {showRecognitionStatus && (
            <View style={styles.recognitionStatusContainer}>
              <Text style={styles.recognitionStatusText}>{recognizedText}</Text>
            </View>
          )}

          <View style={styles.topButtonsContainer}>
            <Pressable
              style={
                isTablet ? styles.settingsButton : styles.settingsButtonPhone
              }
              onPress={handleSettingsPress}>
              <FastImage
                source={require('../assets/settings.png')}
                style={
                  isTablet
                    ? styles.microphoneImage
                    : styles.microphoneImagePhone
                }
                resizeMode={FastImage.resizeMode.contain}
              />
            </Pressable>
          </View>

          {/* Settings pointing hand with text bubble - only show if settings not tapped yet */}
          {!settingsTappedOnce && (
            <Pressable
              style={styles.settingsPointHandBubble}
              onPress={handleSettingsPress}>
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
            </Pressable>
          )}

          <View style={styles.contentContainer}>
            {/* Left side - Main cards (50% width) */}
            <View style={styles.leftSideContainer}>
              <View style={styles.wrapper}>
                <View style={styles.rowContent}>
                  <Pressable
                    style={styles.tileWrapper}
                    onPress={async () => {
                      // Track quick dial tile click
                      mixpanel.track('Open Screen - Quick Dial Tile Clicked', {
                        screen: 'Open',
                        action: 'quick_dial_tile',
                        tile_name: 'Start Talking',
                      });
                      await handleNavigation('Talk');
                    }}>
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
                  <Pressable
                    style={styles.tileWrapper}
                    onPress={() => {
                      // Track quick dial tile click
                      mixpanel.track('Open Screen - Quick Dial Tile Clicked', {
                        screen: 'Open',
                        action: 'quick_dial_tile',
                        tile_name: 'Type Here',
                      });
                      handKeyboard();
                    }}>
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
                    onPress={async () => {
                      // Track quick dial tile click
                      mixpanel.track('Open Screen - Quick Dial Tile Clicked', {
                        screen: 'Open',
                        action: 'quick_dial_tile',
                        tile_name: 'How I Feel',
                      });
                      Animated.timing(fadeAnim, {
                        toValue: 0,
                        duration: 500,
                        useNativeDriver: true,
                      }).start(() => {
                        navigation.navigate('FEELINGS' as any);
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
                    onPress={async () => {
                      // Track quick dial tile click
                      mixpanel.track('Open Screen - Quick Dial Tile Clicked', {
                        screen: 'Open',
                        action: 'quick_dial_tile',
                        tile_name: 'ShortCuts',
                      });
                      Animated.timing(fadeAnim, {
                        toValue: 0,
                        duration: 500,
                        useNativeDriver: true,
                      }).start(() => {
                        navigation.navigate('SHORTCUTS' as any);
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

            {/* Right side - YES/NO cards (50% width) */}
            <View style={styles.rightSideContainer}>
              <View style={styles.yesNoWrapper}>
                <View style={styles.yesNoColumn}>
                  {(my8WordsData || getDefaultMy8Words()).cards
                    .slice(0, 4)
                    .map((card, index) => (
                      <TouchableOpacity
                        key={`left-${index}`}
                        style={styles.yesNoCard}
                        onPress={() => {
                          // Track quick word button press
                          mixpanel.track('quickword', {
                            word: card.word,
                            screen: 'Open',
                          });
                          TTSService.speak(card.word, true);
                        }}>
                        <View style={styles.cardImageContainer}>
                          <FastImage
                            source={getImageSource(card)}
                            style={styles.cardImage}
                            resizeMode={FastImage.resizeMode.cover}
                            onError={() => {}}
                          />
                        </View>
                        <Text style={styles.yesNoTextSmall}>{card.word}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.yesNoColumn}>
                  {(my8WordsData || getDefaultMy8Words()).cards
                    .slice(4, 8)
                    .map((card, index) => (
                      <TouchableOpacity
                        key={`right-${index}`}
                        style={styles.yesNoCard}
                        onPress={() => {
                          // Track quick word button press
                          mixpanel.track('quickword', {
                            word: card.word,
                            screen: 'Open',
                          });
                          TTSService.speak(card.word, true);
                        }}>
                        <View style={styles.cardImageContainer}>
                          <FastImage
                            source={getImageSource(card)}
                            style={styles.cardImage}
                            resizeMode={FastImage.resizeMode.cover}
                            onError={() => {}}
                          />
                        </View>
                        <Text style={styles.yesNoTextSmall}>{card.word}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
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
                    // Clear any existing timeout
                    if (blurTimeoutRef.current) {
                      clearTimeout(blurTimeoutRef.current);
                    }
                    blurTimeoutRef.current = setTimeout(() => {
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

      {/* Startup Show-and-Tell Modal */}
      <Modal
        visible={startupModalVisible}
        transparent={true}
        animationType="fade"
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={closeStartupModal}>
        <View style={styles.startupModalOverlay}>
          <View style={styles.startupModalContent}>
            <View style={styles.showAndTellHeader}>
              <Text style={styles.showAndTellTitle}>Welcome to MatalkForever!</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeStartupModal}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.showAndTellVideoContainer}>
              <ShowAndTell />
            </View>

            <TouchableOpacity
              style={styles.getStartedButton}
              onPress={closeStartupModal}>
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
    fontSize: height * 0.06,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#FFF8E7',
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: width * 0.02,
  },
  leftSideContainer: {
    width: '50%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rightSideContainer: {
    width: '50%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: width * 0.01,
  },
  wrapper: {
    flexDirection: 'row',
    height: height * 0.42,
    justifyContent: 'center',
    marginTop: height * 0.01,
    width: '100%',
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
    width: '48%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: '100%',
    marginHorizontal: '1%',
  },
  tileWrapper: {
    width: '100%',
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
  yesNoWrapper: {
    flexDirection: 'row',
    height: height * 0.84, // Same height as both main card rows (0.42 * 2)
    justifyContent: 'space-between',
    width: '100%',
    marginTop: height * 0.01,
  },
  yesNoColumn: {
    flexDirection: 'column',
    width: '48%',
    height: '100%',
    justifyContent: 'flex-start',
  },
  yesNoCard: {
    width: '100%',
    height: height * 0.18, // Reduced height to prevent overflow
    marginBottom: height * 0.02, // Small gap between cards
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    shadowColor: 'rgba(0, 0, 0, 0.50)',
    shadowOpacity: 8,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
    backgroundColor: 'white',
  },
  yesNoText: {
    fontSize: height * 0.04,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  yesNoTextSmall: {
    fontSize: height * 0.025,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  cardImageContainer: {
    width: '60%',
    height: '60%',
    marginBottom: height * 0.01,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
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
  topButtonsContainer: {
    top: height * 0.04,
    right: width * 0.02,
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  handshakeButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: width * 0.01,
    elevation: 17,
    width: width * 0.04,
    height: width * 0.04,
    borderRadius: width * 0.04,
  },
  handshakeButtonPhone: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: width * 0.01,
    elevation: 17,
    width: width * 0.035,
    height: width * 0.035,
    borderRadius: width * 0.035,
  },
  settingsButton: {
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 17,
    width: width * 0.04,
    height: width * 0.04,
    borderRadius: width * 0.04,
  },
  settingsButtonPhone: {
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 17,
    width: width * 0.035,
    height: width * 0.035,
    borderRadius: width * 0.035,
  },
  speakingButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
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
  avatarImage: {
    width: width * 0.05,
    height: width * 0.05,
    borderRadius: width * 0.025,
    marginLeft: width * 0.015,
    borderWidth: 2,
    borderColor: '#8B5CF6',
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
    right: width * 0.04,
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
