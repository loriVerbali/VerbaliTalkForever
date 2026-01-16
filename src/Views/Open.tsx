import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import { views } from '../utils/constants';
import LinearGradient from 'react-native-linear-gradient';
import { useAppSettings } from '../utils/persistance';
import AppConfig from '../utils/config';
import { useConnection } from '../utils/connection';
import ShowAndTell from '../Components/ShowAndTell';
import { Mixpanel } from 'mixpanel-react-native';
import WakeWordService from '../utils/wakewordService';
import AudioSessionManager from '../utils/AudioSessionManager';
import { useAdmin } from '../contexts/adminContext';
import TTSService from '../utils/TTSService';
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import {
  parseMy8Words,
  My8WordsData,
  getDefaultMy8Words,
} from '../utils/my8wordsUtils';
import { getImageSource } from '../utils/imageDownloader';

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
  HOME: { stateof?: string };
  FEELINGS: undefined;
  SHORTCUTS: undefined;
  CONVO: undefined;
  SETTINGS: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { height, width } = Dimensions.get('window');

const OpenScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const isListening = useRef(false);
  const { isTablet } = useAdmin();
  const [recognizedText, setRecognizedText] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isError, setIsError] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showRecognitionStatus, setShowRecognitionStatus] = useState(false);
  const [startupModalVisible, setStartupModalVisible] = useState(false);
  const { isConnected } = useConnection();
  const [connectionState, setConnectionState] = useState(isConnected);
  const { preferences, getItem, setItem } = useAppSettings();
  const heroName = preferences?.heroName;
  const [settingsTappedOnce, setSettingsTappedOnce] = useState(false);
  const [microphoneTappedOnce, setMicrophoneTappedOnce] = useState(false);
  const [showAndTellModalShown, setShowAndTellModalShown] = useState(false);
  const [isHandshakeSpeaking, setIsHandshakeSpeaking] = useState(false);
  const [my8WordsData, setMy8WordsData] = useState<My8WordsData | null>(null);
  const mixpanel = useRef(
    new Mixpanel('f88f7a27585868c53b1e08c06f5226bd', true),
  ).current;
  const wakeWordService = WakeWordService.getInstance();
  const handScaleAnim = useRef(new Animated.Value(1)).current;
  const bubbleScaleAnim = useRef(new Animated.Value(1)).current;
  const settingsHandScaleAnim = useRef(new Animated.Value(1)).current;
  const settingsBubbleScaleAnim = useRef(new Animated.Value(1)).current;
  const handshakeTappedRef = useRef(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const loadingModalShownRef = useRef(false);
  const loadingModalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const loadingModalCheckIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);

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

        // Modal disabled - no longer showing video after onboarding
        setStartupModalVisible(false);
      } catch (e) { }
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

  const askForAdultHelp = async () => {
    // Prepare audio session for TTS to ensure consistent volume
    await AudioSessionManager.prepareForTTS();
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

    // Show loading modal on first load after onboarding
    const showLoadingModalIfNeeded = async () => {
      const wasOnboarded = await getItem('wasOnboarded');
      // Only show if onboarding is complete, hasn't been shown before, and wake word isn't already listening
      if (
        wasOnboarded === '1' &&
        !loadingModalShownRef.current &&
        !wakeWordService.isCurrentlyListening()
      ) {
        loadingModalShownRef.current = true;
        setShowLoadingModal(true);

        // Set 5 second max timeout
        loadingModalTimeoutRef.current = setTimeout(() => {
          setShowLoadingModal(false);
          if (loadingModalCheckIntervalRef.current) {
            clearInterval(loadingModalCheckIntervalRef.current);
            loadingModalCheckIntervalRef.current = null;
          }
        }, 5000);

        // Poll for wake word readiness
        loadingModalCheckIntervalRef.current = setInterval(() => {
          if (wakeWordService.isCurrentlyListening()) {
            setShowLoadingModal(false);
            if (loadingModalTimeoutRef.current) {
              clearTimeout(loadingModalTimeoutRef.current);
              loadingModalTimeoutRef.current = null;
            }
            if (loadingModalCheckIntervalRef.current) {
              clearInterval(loadingModalCheckIntervalRef.current);
              loadingModalCheckIntervalRef.current = null;
            }
          }
        }, 100); // Check every 100ms
      }
    };

    showLoadingModalIfNeeded();

    // Initialize wake word service with proper cleanup and restart
    // NOTE: LoggedNavigation also initializes wake word, so check if already initialized first
    const initializeWakeWord = async () => {
      // First check if onboarding is complete - don't start wakeword during onboarding
      const wasOnboarded = await getItem('wasOnboarded');
      if (wasOnboarded !== '1') {
        return;
      }

      // CRITICAL: Always set the callback, even if wake word is already listening
      // LoggedNavigation initializes wake word but doesn't set the callback
      // The callback must be set here in Open.tsx to handle wake word detections
      const wakeWordCallback = async (phrase: string) => {
        // Handle wake word detection
        if (handshakeTappedRef.current) {
          handshakeTappedRef.current = false;
          // If handshake was tapped, don't navigate - user will say "Hey Verby"
          return;
        }

        // This is a paid app - always allow navigation
        navigation.navigate('HOME' as any, {
          stateof: 'Attention',
        });
      };

      wakeWordService.setCallback(wakeWordCallback);

      // Check if wake word is already initialized/listening (LoggedNavigation may have already done this)
      if (wakeWordService.isCurrentlyListening()) {
        const status = wakeWordService.getStatus();
        return;
      }

      const MAX_RETRIES = 3;
      const INITIAL_DELAY_MS = 150; // Reduced delay for audio session to be ready (optimization: was 500ms + 1000ms)

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // Add small delay on first attempt to ensure audio session is ready
          if (attempt === 0) {
            await new Promise<void>(resolve =>
              setTimeout(resolve, INITIAL_DELAY_MS),
            );
            // Check again after delay - LoggedNavigation might have initialized it
            if (wakeWordService.isCurrentlyListening()) {
              return;
            }
          }

          // Check microphone permission before starting (iOS only)
          // Optimization: Skip if onboarding was completed (permission already granted during onboarding)
          if (Platform.OS === 'ios') {
            // Only check permission if onboarding might have been skipped
            // If wasOnboarded is '1', permission was already granted during onboarding
            const wasOnboarded = await getItem('wasOnboarded');
            if (wasOnboarded !== '1') {
              // Onboarding might have been skipped, check permission
              const micPermission = await check(PERMISSIONS.IOS.MICROPHONE);

              if (micPermission !== RESULTS.GRANTED) {
                if (micPermission === RESULTS.BLOCKED) {
                  // Don't retry if permission is blocked
                  return;
                }
                // If denied but not blocked, wait a bit and retry (permission might be processing)
                if (attempt < MAX_RETRIES - 1) {
                  const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt + 1);

                  await new Promise<void>(resolve =>
                    setTimeout(resolve, delayMs),
                  );
                  continue;
                } else {
                  return;
                }
              }
            }
          }

          // Callback is already set above, just start listening (this will handle initialization if needed)
          await wakeWordService.startListening();

          return; // Success - exit retry loop
        } catch (error) {
          // If this was the last attempt, give up
          if (attempt === MAX_RETRIES - 1) {
            return;
          }

          // Wait before retrying with exponential backoff
          const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt + 1);
          await new Promise<void>(resolve => setTimeout(resolve, delayMs));
        }
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
      if (loadingModalTimeoutRef.current) {
        clearTimeout(loadingModalTimeoutRef.current);
      }
      if (loadingModalCheckIntervalRef.current) {
        clearInterval(loadingModalCheckIntervalRef.current);
      }
      // Properly stop wake word service to prevent memory leaks
      wakeWordService.stopListening().catch(error => { });
    };
  }, []);

  // Ensure wake word service is properly initialized when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const ensureWakeWordActive = async () => {
        // First check if onboarding is complete - don't start wakeword during onboarding
        const wasOnboarded = await getItem('wasOnboarded');
        if (wasOnboarded !== '1') {
          return;
        }

        // CRITICAL: Always prepare audio session for wakeword when screen comes into focus
        // This ensures the audio session is properly configured even if it was changed
        // by other screens (e.g., Settings video playback)
        if (Platform.OS === 'ios') {
          await AudioSessionManager.prepareForWakeword();
          // Small delay to ensure audio session is ready
          await new Promise<void>(resolve => setTimeout(resolve, 100));
        }

        const MAX_RETRIES = 2;
        const INITIAL_DELAY_MS = 300;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            // Check if wake word service is listening, if not, start it
            if (!wakeWordService.isCurrentlyListening()) {
              // Add delay on first attempt
              if (attempt === 0) {
                await new Promise<void>(resolve =>
                  setTimeout(resolve, INITIAL_DELAY_MS),
                );
              }

              // Check microphone permission before starting (iOS only)
              if (Platform.OS === 'ios') {
                const micPermission = await check(PERMISSIONS.IOS.MICROPHONE);
                if (micPermission !== RESULTS.GRANTED) {
                  if (
                    micPermission === RESULTS.BLOCKED ||
                    attempt === MAX_RETRIES - 1
                  ) {
                    return; // Don't retry if blocked or last attempt
                  }
                  // Wait before retry
                  await new Promise<void>(resolve =>
                    setTimeout(
                      resolve,
                      INITIAL_DELAY_MS * Math.pow(2, attempt + 1),
                    ),
                  );
                  continue;
                }
              }

              await wakeWordService.startListening();

              return; // Success - exit retry loop
            } else {
              return; // Already listening
            }
          } catch (error) {
            // If this was the last attempt, give up
            if (attempt === MAX_RETRIES - 1) {
              return;
            }

            // Wait before retrying with exponential backoff
            const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt + 1);
            await new Promise<void>(resolve => setTimeout(resolve, delayMs));
          }
        }
      };

      // Small delay to ensure navigation is complete
      const timer = setTimeout(ensureWakeWordActive, 200);
      return () => clearTimeout(timer);
    }, []),
  );

  const startListening = async () => {


    // Mark microphone as tapped once
    if (!microphoneTappedOnce) {
      setMicrophoneTappedOnce(true);
      await setItem('microphoneTappedOnce', '1');
    }

    navigation.navigate('HOME' as any, {
      stateof: 'Attention',
    });
  };

  useEffect(() => { }, [modalVisible]);

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
    // Get current values from storage to ensure we have the latest

    // Start fade out before navigation
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
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
    // Get current values from storage to ensure we have the latest

    mixpanel.track('Keyboard Pressed');
    navigation.navigate(views.KEYBOARD_HOME as any, {
      stateof: 'Keyboard',
    });
    // TTSService.speak('Keyboard selected');
  };

  const handleSettingsPress = async () => {
    mixpanel.track('Settings Pressed');
    setModalVisible(true);
    // Mark settings as tapped once
    if (!settingsTappedOnce) {
      setSettingsTappedOnce(true);
      await setItem('settingsTappedOnce', '1');
    }
  };

  const handleHandshakePress = async () => {
    if (isHandshakeSpeaking) return; // Prevent multiple simultaneous TTS calls

    mixpanel.track('Handshake Pressed');
    setIsHandshakeSpeaking(true);
    handshakeTappedRef.current = true; // Set flag to prevent navigation on wake word

    // Stop wakeword before speaking to avoid conflicts
    try {
      if (wakeWordService.isCurrentlyListening()) {
        await wakeWordService.stopListening();

        // Small delay to ensure stop is fully complete
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      }
    } catch (error) { }

    // Prepare audio session for TTS (after stopping wakeword)
    await AudioSessionManager.prepareForTTS();

    // Speak the introduction message with completion callback
    const message = `${preferences?.handshakeMessage}`;
    await TTSService.speak(message, true, async () => {
      // Prepare audio session for wakeword (after TTS ends)
      await AudioSessionManager.prepareForWakeword();

      // Restart wakeword when TTS finishes (only if not already listening)
      try {
        const wasOnboarded = await getItem('wasOnboarded');
        if (wasOnboarded === '1') {
          // Check if already listening to avoid race conditions
          if (!wakeWordService.isCurrentlyListening()) {
            await wakeWordService.startListening();
          } else {
          }
        }
      } catch (error) {
        console.error(error);
      }
      // Reset flags
      handshakeTappedRef.current = false;
      setIsHandshakeSpeaking(false);
    });
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
      <Animated.View style={[{ flex: 1, opacity: fadeAnim }]}>
        <LinearGradient
          colors={['#FFF8E7', '#FFFFFF']}
          style={styles.container}>
          <View style={styles.headerContainer}>
            <Text style={styles.headerText}>Hi {heroName ? heroName : ''}</Text>
            <TouchableOpacity
              onPress={handleHandshakePress}
              activeOpacity={0.7}>
              <FastImage
                source={getAvatarImage(preferences?.gender || '')}
                style={styles.avatarImage}
                resizeMode={FastImage.resizeMode.cover}
              />
            </TouchableOpacity>
            <Pressable
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
                  isHandshakeSpeaking && { opacity: 0.7 },
                ]}
                resizeMode={FastImage.resizeMode.contain}
              />
            </Pressable>
          </View>

          <Pressable style={styles.microphoneButton} onPress={startListening}>
            <FastImage
              source={
                connectionState
                  ? require('../assets/michrophone.gif')
                  : require('../assets/noMic.png')
              }
              style={[styles.iconSize, isListening.current && { opacity: 0.5 }]}
              resizeMode={FastImage.resizeMode.contain}
            />
          </Pressable>

          {/* Pointing hand with text bubble - only show if microphone not tapped yet */}
          {!microphoneTappedOnce && (
            <TouchableOpacity
              style={styles.pointHandBubble}
              onPress={startListening}
              activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: handScaleAnim }] }}>
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
                    transform: [{ scale: bubbleScaleAnim }],
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
            </TouchableOpacity>
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
            <TouchableOpacity
              style={styles.settingsPointHandBubble}
              onPress={handleSettingsPress}
              activeOpacity={0.7}>
              <Animated.View
                style={[
                  styles.speechBubble,
                  {
                    transform: [{ scale: settingsBubbleScaleAnim }],
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
                style={{ transform: [{ scale: settingsHandScaleAnim }] }}>
                <FastImage
                  source={require('../assets/pointhandRight.png')}
                  style={styles.pointHandImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </Animated.View>
            </TouchableOpacity>
          )}

          <View style={styles.contentContainer}>
            {/* Left side - Main cards (50% width) */}
            <View style={styles.leftSideContainer}>
              <View style={styles.wrapper}>
                <View style={styles.rowContent}>
                  <TouchableOpacity
                    style={styles.tileWrapper}
                    onPress={() => handleNavigation('Talk')}>
                    <View style={styles.imageWrapper}>
                      <FastImage
                        key="connected-image"
                        source={require('../assets/talk.png')}
                        style={styles.image}
                        resizeMode={FastImage.resizeMode.contain}
                      />
                    </View>
                    <View
                      style={[
                        styles.labelContainer,
                        { backgroundColor: 'rgba(20, 108, 240, 0.25)' },
                      ]}>
                      <Text style={styles.kidText}>Start Talking</Text>
                    </View>
                  </TouchableOpacity>
                </View>
                <View style={styles.rowContent}>
                  <TouchableOpacity
                    style={styles.tileWrapper}
                    onPress={handKeyboard}>
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
                        { backgroundColor: 'rgba(47, 183, 111, 0.25)' },
                      ]}>
                      <Text style={styles.kidText}>Type Here</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.wrapper}>
                <View style={styles.rowContent}>
                  <Pressable
                    style={styles.tileWrapper}
                    onPress={async () => {
                      // Get current values from storage to ensure we have the latest


                      mixpanel.track('Feelings Pressed');
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
                        { backgroundColor: 'rgba(229, 72, 72, 0.25)' },
                      ]}>
                      <Text style={[styles.kidText]}>How I Feel</Text>
                    </View>
                  </Pressable>
                </View>
                <View style={styles.rowContent}>
                  <Pressable
                    style={styles.tileWrapper}
                    onPress={async () => {
                      // Get current values from storage to ensure we have the latest

                      mixpanel.track('Shortcuts Pressed');
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
                        { backgroundColor: 'rgba(124, 58, 237, 0.25)' },
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
                        onPress={async () => {
                          mixpanel.track('8 Words Pressed');
                          // Prepare audio session for TTS to ensure consistent volume
                          await AudioSessionManager.prepareForTTS();
                          TTSService.speak(card.word, true);
                        }}
                        activeOpacity={0.7}>
                        <View style={styles.cardImageContainer}>
                          <FastImage
                            source={getImageSource(card)}
                            style={styles.cardImage}
                            resizeMode={FastImage.resizeMode.cover}
                            onError={() => { }}
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
                        onPress={async () => {
                          mixpanel.track('8 Words Pressed');
                          // Prepare audio session for TTS to ensure consistent volume
                          await AudioSessionManager.prepareForTTS();
                          TTSService.speak(card.word, true);
                        }}
                        activeOpacity={0.7}>
                        <View style={styles.cardImageContainer}>
                          <FastImage
                            source={getImageSource(card)}
                            style={styles.cardImage}
                            resizeMode={FastImage.resizeMode.cover}
                            onError={() => { }}
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
              <Text style={styles.showAndTellTitle}>Welcome to Matalk!</Text>
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

      {/* Loading Modal - Shows on app launch after onboarding */}
      <Modal
        visible={showLoadingModal}
        transparent={true}
        animationType="fade"
        supportedOrientations={['landscape-left', 'landscape-right']}>
        <View style={styles.loadingModalOverlay} pointerEvents="auto">
          <View style={styles.loadingModalContent} pointerEvents="auto">
            <FastImage
              source={require('../assets/movie/recording.gif')}
              style={styles.loadingGif}
              resizeMode={FastImage.resizeMode.contain}
            />
            <ActivityIndicator
              size="large"
              color="#8B5CF6"
              style={styles.loadingActivityIndicator}
            />
            <Text style={styles.loadingText}>Hi, Loading up my magic</Text>
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
    height: height * 0.38,
    justifyContent: 'space-between',
    marginTop: height * 0.01,
    marginBottom: height * 0.01,
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
  },
  tileWrapper: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    borderRadius: 16,
    shadowColor: 'rgba(0, 0, 0, 0.50)',
    shadowOpacity: 8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 8 },
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
    shadowOffset: { width: 0, height: 8 },
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
  loadingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModalContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingGif: {
    width: width * 0.3,
    height: width * 0.3,
    marginBottom: height * 0.02,
  },
  loadingActivityIndicator: {
    marginBottom: height * 0.02,
  },
  loadingText: {
    fontSize: height * 0.03,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default OpenScreen;
