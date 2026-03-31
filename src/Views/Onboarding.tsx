import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
  Image,
  Keyboard,
} from 'react-native';
import { useAppSettings } from '../utils/persistance';
import FastImage from 'react-native-fast-image';
import { OnboardingContext } from '../Navigation/RootControllerView';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  requestMultiple,
} from 'react-native-permissions';
import matalkImg from '../assets/matalk.png';
import FamilyPics, { FamilyMember } from '../Components/FamilyPics';
import TermsAndConditions from '../Components/TermsAndConditions';
import ShowAndTell from '../Components/ShowAndTell';
import WhisperDownload from '../Components/WhisperDownload';
import { Mixpanel } from 'mixpanel-react-native';
import { useAdmin } from '../contexts/adminContext';
// Removed Auth0 - using guest sessions
import WhisperModelManager from '../utils/WhisperModelManager';

const { width, height } = Dimensions.get('window');

// Define onboarding steps
const onboardingSteps = [
  {
    id: 'welcome',
    question: 'Welcome to MaTalk AI',
    additionalComponents: 'welcome',
    buttonText: 'Next',
  },
  // Removed login step - guest sessions don't need login
  {
    id: 'terms',
    question: 'Terms and Conditions',
    additionalComponents: 'terms-and-conditions',
    buttonText: 'Next',
  },
  {
    id: 'name',
    question: "What is our Hero's name?",
    additionalComponents: 'name-input',
    buttonText: 'Next',
  },
  {
    id: 'gender',
    question: "Choose your Hero's Avatar or Skip (optional)",
    additionalComponents: 'gender-selection',
    buttonText: 'Next',
  },
  {
    id: 'admin-code',
    question: '',
    additionalComponents: 'admin-code-input',
    buttonText: 'Next',
  },
  {
    id: 'on-device-whisper',
    question: 'Give us a minute to setup the magic in your app',
    additionalComponents: 'on-device-whisper',
    buttonText: 'Next',
  },
  {
    id: 'Permissions',
    question: 'Permissions',
    additionalComponents: 'permissions',
    buttonText: 'Next',
  },
  {
    id: 'Optional Permissions',
    question: 'Optional Permissions',
    additionalComponents: 'optional-permissions',
    buttonText: 'Next',
  },
];

const OnboardingScreen: React.FC = () => {
  const mixpanel = new Mixpanel('f88f7a27585868c53b1e08c06f5226bd', true);
  const { setItem, getItem } = useAppSettings();
  const { isTablet } = useAdmin();
  const { completeOnboarding } = useContext(OnboardingContext);
  // Removed Auth0 - using guest sessions
  const [currentStep, setCurrentStep] = useState(0);
  const [heroName, setHeroName] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [showAdminCode, setShowAdminCode] = useState(false);
  const pinInputRef = useRef<TextInput | null>(null);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [selectedGender, setSelectedGender] = useState('');
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionsDenied, setPermissionsDenied] = useState(false);
  const [permissionsPermanentlyDenied, setPermissionsPermanentlyDenied] =
    useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [locationPermissionAttempted, setLocationPermissionAttempted] =
    useState(false);
  const [permissionsAttempted, setPermissionsAttempted] = useState(false);
  const [locationPermissionSuccess, setLocationPermissionSuccess] =
    useState(false);
  const [specialPlacesCompleted, setSpecialPlacesCompleted] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [conversationMode, setConversationMode] = useState<'easy' | 'advanced'>(
    'easy',
  );
  // Removed isLoggedIn state - guest sessions are always "authenticated"
  const [whisperDownloadComplete, setWhisperDownloadComplete] = useState(false);
  const [whisperModelInvoked, setWhisperModelInvoked] = useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const genderWrapperStyle = [
    styles.genderImageWrapper,
    { transform: [{ scale: isTablet ? 0.68 : 0.6 }] },
  ];
  const isSmallPhone = height <= 400;
  const tileWidth = isTablet ? '33.33%' : isSmallPhone ? '16.66%' : '33.33%';
  const containerFlexWrap = isSmallPhone ? 'nowrap' : 'wrap';
  const nextButtonTextFontSize = isTablet ? 20 : 14;
  // Load conversation mode setting
  useEffect(() => {
    const loadConversationMode = async () => {
      try {
        const savedConversationMode = await getItem('conversationMode');
        setConversationMode(
          (savedConversationMode as 'easy' | 'advanced') || 'easy',
        );
      } catch (error) { }
    };
    loadConversationMode();
  }, []);

  // Removed login status check - guest sessions don't need login

  // Helper function to extract user ID from Auth0 user.sub
  const extractUserId = (userSub: string): string => {
    if (userSub.startsWith('auth0|')) {
      return userSub.replace('auth0|', '');
    } else if (userSub.startsWith('google-oauth2|')) {
      return userSub.replace('google-oauth2|', '');
    } else if (userSub.startsWith('apple|')) {
      return userSub.replace('apple|', '');
    }
    return userSub;
  };

  // Removed handleLogin - guest sessions don't need login

  // Removed handleLogout - guest sessions don't need logout

  const handleBack = () => {
    const fromScreen = onboardingSteps[currentStep]?.id || 'unknown';

    // Handle going back while skipping family members in easy mode
    const shouldSkipBackFromAdminCode =
      conversationMode === 'easy' &&
      onboardingSteps[currentStep].id === 'admin-code';

    if (shouldSkipBackFromAdminCode) {
      // Go back to gender step instead of family members
      const genderIndex = onboardingSteps.findIndex(
        step => step.id === 'gender',
      );
      if (genderIndex !== -1) {
        mixpanel.track('Onboarding Back Navigation', {
          from_screen: fromScreen,
        });
        setCurrentStep(genderIndex);
        return;
      }
    }

    if (currentStep > 0) {
      mixpanel.track('Onboarding Back Navigation', {
        from_screen: fromScreen,
      });
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = async () => {
    // Removed login step logic - guest sessions don't need login

    // Skip family members step if in easy mode
    const shouldSkipFamilyMembers =
      conversationMode === 'easy' &&
      onboardingSteps[currentStep].id === 'gender' &&
      currentStep < onboardingSteps.length - 1;

    const shouldSkipFromFamilyMembers =
      conversationMode === 'easy' &&
      onboardingSteps[currentStep].id === 'Family Members';

    if (shouldSkipFamilyMembers) {
      // Skip directly to admin-code step
      const adminCodeIndex = onboardingSteps.findIndex(
        step => step.id === 'admin-code',
      );
      if (adminCodeIndex !== -1) {
        setCurrentStep(adminCodeIndex);
        return;
      }
    }

    if (shouldSkipFromFamilyMembers) {
      // Skip to next step after family members
      setCurrentStep(currentStep + 1);
      return;
    }

    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete onboarding
      await setItem('wasOnboarded', '1');
      if (heroName) {
        await setItem('heroName', heroName);
      }
      if (adminCode) {
        await setItem('adminCode', adminCode);
      }
      if (selectedGender) {
        await setItem('gender', selectedGender);
      }
      if (permissionsDenied || permissionsPermanentlyDenied) {
        setCurrentStep(currentStep + 1);
      }

      // Use the context to complete onboarding
      completeOnboarding();
    }
  };

  const renderAdditionalComponents = () => {
    const { additionalComponents } = onboardingSteps[currentStep];

    switch (additionalComponents) {
      case 'welcome':
        return (
          <View style={styles.welcomeContainer}>
            <View style={styles.gridItem}>
              <View style={styles.gridImageContainer}>
                <FastImage
                  source={require('../assets/shortCuts/fun/game.jpg')}
                  style={styles.welcomeImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </View>
            </View>

            <View style={styles.gridItem}>
              <View style={styles.gridImageContainer}>
                <FastImage
                  source={require('../assets/shortCuts/wantNeed/eat.jpg')}
                  style={styles.welcomeImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </View>
            </View>

            <View style={styles.gridItem}>
              <View style={styles.gridImageContainer}>
                <FastImage
                  source={require('../assets/shortCuts/fun/outside.jpg')}
                  style={styles.welcomeImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </View>
            </View>
          </View>
        );
      // Removed login case - guest sessions don't need login
      // Removed subscription case - this is a paid app
      case 'show-and-tell':
        return (
          <View style={{ width: '100%', alignItems: 'center' }}>
            <ShowAndTell />
          </View>
        );
      case 'terms-and-conditions':
        return (
          <View style={styles.termsContainer}>
            <TermsAndConditions onAgree={handleTermsAgreement} />
          </View>
        );
      case 'name-input':
        return (
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={styles.nameScrollContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
            showsVerticalScrollIndicator={false}>
            <View style={styles.nameContainer}>
              <FastImage
                source={require('../assets/boy.png')}
                style={styles.sideImage}
                resizeMode={FastImage.resizeMode.contain}
              />
              <View style={styles.inputContainer}>
                <TextInput
                  style={isTablet ? styles.input : styles.inputPhone}
                  placeholder="First name"
                  placeholderTextColor="#888"
                  value={heroName}
                  onChangeText={setHeroName}
                  autoCapitalize="words"
                  autoComplete="name-given"
                  maxLength={20}
                />
              </View>
              <FastImage
                source={require('../assets/girl.png')}
                style={styles.sideImage}
                resizeMode={FastImage.resizeMode.contain}
              />
            </View>
          </ScrollView>
        );
      case 'gender-selection':
        return (
          <>
            <View>
              <Text style={styles.genderExplanation}>
                Pick the picture that looks most like your hero. You can skip
                this step now and change it later. This is for a more
                personalized experience -{' '}
                <Text style={{ color: '#8E24AA', fontWeight: '600' }}>
                  Totally optional
                </Text>
              </Text>
            </View>
            <ScrollView
              horizontal={isSmallPhone}
              showsHorizontalScrollIndicator={false}
              style={{ width: '100%' }}
              contentContainerStyle={[
                styles.genderContainer,
                { flexWrap: containerFlexWrap as any },
              ]}>
              <TouchableOpacity
                style={[
                  styles.genderOption,
                  {
                    width: isTablet ? '33.33%' : (tileWidth as any),
                  },
                  selectedGender === 'white boy' && styles.selectedGender,
                ]}
                onPress={() => {
                  if (!selectedGender) {
                    mixpanel.track('Onboarding Gender Selected', {
                      screen_label: 'gender',
                    });
                  }
                  setSelectedGender('white boy');
                }}>
                <View style={genderWrapperStyle}>
                  {selectedGender === 'white boy' && (
                    <Text style={styles.heartOverlay}>♥</Text>
                  )}
                  <FastImage
                    source={require('../assets/gender/wboy.jpg')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.genderOption,
                  {
                    width: isTablet ? '33.33%' : (tileWidth as any),
                  },
                  selectedGender === 'black boy' && styles.selectedGender,
                ]}
                onPress={() => {
                  if (!selectedGender) {
                    mixpanel.track('Onboarding Gender Selected', {
                      screen_label: 'gender',
                    });
                  }
                  setSelectedGender('black boy');
                }}>
                <View style={genderWrapperStyle}>
                  {selectedGender === 'black boy' && (
                    <Text style={styles.heartOverlay}>♥</Text>
                  )}
                  <FastImage
                    source={require('../assets/gender/bboy.jpg')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.genderOption,
                  {
                    width: isTablet ? '33.33%' : (tileWidth as any),
                  },
                  selectedGender === 'asian boy' && styles.selectedGender,
                ]}
                onPress={() => {
                  if (!selectedGender) {
                    mixpanel.track('Onboarding Gender Selected', {
                      screen_label: 'gender',
                    });
                  }
                  setSelectedGender('asian boy');
                }}>
                <View style={genderWrapperStyle}>
                  {selectedGender === 'asian boy' && (
                    <Text style={styles.heartOverlay}>♥</Text>
                  )}
                  <FastImage
                    source={require('../assets/gender/aboy.jpg')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.genderOption,
                  {
                    width: isTablet ? '33.33%' : (tileWidth as any),
                  },
                  selectedGender === 'white girl' && styles.selectedGender,
                ]}
                onPress={() => {
                  if (!selectedGender) {
                    mixpanel.track('Onboarding Gender Selected', {
                      screen_label: 'gender',
                    });
                  }
                  setSelectedGender('white girl');
                }}>
                <View style={genderWrapperStyle}>
                  {selectedGender === 'white girl' && (
                    <Text style={styles.heartOverlay}>♥</Text>
                  )}
                  <FastImage
                    source={require('../assets/gender/wgirl.jpg')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.genderOption,
                  {
                    width: isTablet ? '33.33%' : (tileWidth as any),
                  },
                  selectedGender === 'black girl' && styles.selectedGender,
                ]}
                onPress={() => {
                  if (!selectedGender) {
                    mixpanel.track('Onboarding Gender Selected', {
                      screen_label: 'gender',
                    });
                  }
                  setSelectedGender('black girl');
                }}>
                <View style={genderWrapperStyle}>
                  {selectedGender === 'black girl' && (
                    <Text style={styles.heartOverlay}>♥</Text>
                  )}
                  <FastImage
                    source={require('../assets/gender/bgirl.jpg')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.genderOption,
                  {
                    width: isTablet ? '33.33%' : (tileWidth as any),
                  },
                  selectedGender === 'asian girl' && styles.selectedGender,
                ]}
                onPress={() => {
                  if (!selectedGender) {
                    mixpanel.track('Onboarding Gender Selected', {
                      screen_label: 'gender',
                    });
                  }
                  setSelectedGender('asian girl');
                }}>
                <View style={genderWrapperStyle}>
                  {selectedGender === 'asian girl' && (
                    <Text style={styles.heartOverlay}>♥</Text>
                  )}
                  <FastImage
                    source={require('../assets/gender/agirl.jpg')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                </View>
              </TouchableOpacity>
            </ScrollView>
          </>
        );
      case 'admin-code-input': {
        const pinBoxSize = isTablet ? Math.min(width * 0.14, 100) : Math.min(width * 0.18, 80);

        return (
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={styles.adminCodeContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}>
            <View style={styles.parentCodeWrapper}>
              {/* Lock Icon */}
              <Text style={styles.parentCodeLockIcon}>🔒</Text>

              {/* Title */}
              <Text style={[
                styles.parentCodeTitle,
                { fontSize: isTablet ? 28 : 22 },
              ]}>
                Set Parent Code
              </Text>

              {/* Description */}
              <Text style={[
                styles.parentCodeDescription,
                { fontSize: isTablet ? 16 : 13 },
              ]}>
                A parent code will be used to access the Settings page.
              </Text>

              {/* PIN Input Row */}
              <TouchableOpacity activeOpacity={1} style={styles.parentCodePinRow} onPress={() => pinInputRef.current?.focus()}>
                <TextInput
                  ref={pinInputRef}
                  value={adminCode}
                  onChangeText={text => {
                    const numericText = text.replace(/[^0-9]/g, '');
                    if (numericText.length <= 4) {
                      setAdminCode(numericText);
                      const newDigits = ['', '', '', ''];
                      for (let i = 0; i < numericText.length; i++) {
                        newDigits[i] = numericText[i];
                      }
                      setPinDigits(newDigits);
                      if (numericText.length === 4) {
                        Keyboard.dismiss();
                      }
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
                  autoFocus={true}
                  caretHidden={true}
                />
                {pinDigits.map((digit, index) => (
                  <View
                    key={index}
                    style={[
                      styles.parentCodePinBox,
                      {
                        width: pinBoxSize,
                        height: pinBoxSize,
                        borderRadius: pinBoxSize * 0.18,
                      },
                      digit !== '' && styles.parentCodePinBoxFilled,
                    ]}>
                    <Text
                      style={[
                        styles.parentCodePinInput,
                        {
                          fontSize: showAdminCode
                            ? (isTablet ? 36 : 28)
                            : (isTablet ? 48 : 36),
                          lineHeight: pinBoxSize,
                        },
                      ]}>
                      {showAdminCode ? digit : (digit ? '●' : '')}
                    </Text>
                  </View>
                ))}

                {/* Eye Toggle */}
                <TouchableOpacity
                  style={styles.parentCodeEyeButton}
                  onPress={() => setShowAdminCode(!showAdminCode)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[
                    styles.parentCodeEyeIcon,
                    { fontSize: isTablet ? 24 : 18 },
                  ]}>
                    {showAdminCode ? '👁️' : '👁️‍🗨️'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          </ScrollView>
        );
      }
      case 'family-members':
        return isTablet ? (
          <View style={styles.familyMembersContainer}>
            <Text style={styles.familylabel}>
              Select pictures of family members that {heroName} will be able to
              start a conversation with.
            </Text>
            <Text style={[styles.familylabel, { color: '#8E24AA' }]}>
              You can skip this and do it later! Just tap next
            </Text>
            <View style={styles.familyPicsWrapper}>
              <FamilyPics onFamilyMemberSelect={handleFamilyMemberSelect} />
            </View>
          </View>
        ) : (
          <ScrollView
            style={styles.familyMembersContainerPhone}
            contentContainerStyle={{
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}>
            <Text style={styles.familylabel}>
              Select pictures of family members that {heroName} will be able to
              start a conversation with.
            </Text>
            <Text style={[styles.familylabel, { color: '#8E24AA' }]}>
              You can skip this and do it later! Just tap next
            </Text>
            <View style={styles.familyPicsWrapper}>
              <FamilyPics onFamilyMemberSelect={handleFamilyMemberSelect} />
            </View>
          </ScrollView>
        );
      case 'permissions':
        return (
          <ScrollView
            ref={scrollViewRef}
            style={styles.permissionsContainer}
            contentContainerStyle={styles.permissionsScrollView}>
            <View style={styles.permissionsImageContainer}>
              <FastImage
                source={require('../assets/boyAsk.png')}
                style={styles.permissionsImage}
                resizeMode={FastImage.resizeMode.contain}
              />
              <TouchableOpacity
                style={styles.scrollIndicatorContainer}
                onPress={() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }}>
                <Text style={styles.scrollIndicator}>⬇️</Text>
              </TouchableOpacity>
            </View>
            {permissionsGranted ? (
              <Text style={styles.permissionsSuccess}>
                ✅ Permissions granted successfully!
              </Text>
            ) : (
              <>
                {!permissionsPermanentlyDenied ? (
                  <>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        { fontSize: 24, fontWeight: '900' },
                      ]}>
                      MaTalk AI needs the following permissions:
                    </Text>
                    <Text
                      style={[styles.permissionsExplanation, { width: '80%' }]}>
                      Access to your microphone to listen for a wake word
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        {
                          fontWeight: '800',
                          color: '#8E24AA',
                          marginTop: 10,
                          marginBottom: 20,
                        },
                      ]}>
                      Hey Verbi
                    </Text>
                    <Text style={styles.permissionsExplanation}>
                      These permissions are essential for the app to function
                      properly and for you to use the app fully.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        { fontSize: 24, fontWeight: '900', color: '#FF6B6B' },
                      ]}>
                      Manual Permission Required
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        { color: '#FF6B6B' },
                      ]}>
                      Please enable microphone manually in your device settings
                      to continue using MaTalk AI fully or tap next and do this
                      via the settings later
                    </Text>
                    <TouchableOpacity
                      style={styles.settingsButton}
                      onPress={openSettings}>
                      <Text
                        style={[
                          styles.buttonText,
                          { fontSize: nextButtonTextFontSize },
                        ]}>
                        Open Settings
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {permissionsDenied && !permissionsPermanentlyDenied && (
                  <>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        { color: '#FF6B6B', fontWeight: 'bold', marginTop: 20 },
                      ]}>
                      Are you sure?
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        { color: '#FF6B6B' },
                      ]}>
                      Without these permissions, MaTalk won't be able to:
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        { color: '#FF6B6B', marginBottom: 10 },
                      ]}>
                      • Listen for your voice commands
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        { color: '#FF6B6B', marginBottom: 20 },
                      ]}>
                      • Provide the full MaTalk experience
                    </Text>
                  </>
                )}

                {!permissionsAttempted && (
                  <TouchableOpacity
                    style={styles.button}
                    onPress={requestPermission}>
                    <Text
                      style={[
                        styles.buttonText,
                        { fontSize: nextButtonTextFontSize },
                      ]}>
                      {permissionsPermanentlyDenied
                        ? 'Continue'
                        : permissionsDenied
                          ? 'Try Again'
                          : 'Continue'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        );
      case 'optional-permissions':
        return (
          <View style={styles.permissionsContainer}>
            <FastImage
              source={require('../assets/boyAsk.png')}
              style={styles.permissionsImage}
              resizeMode={FastImage.resizeMode.contain}
            />
            {locationPermissionSuccess ? (
              <Text style={styles.permissionsSuccess}>
                ✅ Location permission granted successfully!
              </Text>
            ) : (
              <>
                <Text style={styles.permissionsExplanation}>
                  Location to help MaTalk know where you are.
                </Text>
                {!locationPermissionAttempted && (
                  <TouchableOpacity
                    style={styles.button}
                    onPress={requestLocationPermission}>
                    <Text
                      style={[
                        styles.buttonText,
                        { fontSize: nextButtonTextFontSize },
                      ]}>
                      Continue
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        );
      case 'on-device-whisper':
        return (
          <View style={{ width: '100%', flex: 1 }}>
            <WhisperDownload
              isModelInvoked={whisperModelInvoked}
              onComplete={async (modelName?: string) => {
                // Track which whisper model was given to the user
                if (modelName) {
                  mixpanel.track('Onboarding Whisper Model Assigned', {
                    screen_label: 'on-device-whisper',
                    whisper_model: modelName,
                  });
                }

                // Check if model is available after download and adjust settings accordingly
                try {
                  await WhisperModelManager.checkModelAvailabilityAndAdjustSettings(
                    setItem,
                    getItem,
                  );
                } catch (error) { }

                // CRITICAL: Do NOT initialize WhisperService during onboarding
                // Whisper initialization will happen in LoggedNavigation AFTER wake word is initialized
                // This ensures wake word gets access to ONNX Runtime/CoreML resources first
                try {
                  await setItem('useLocalWhisper', '1');
                  setWhisperModelInvoked(true);
                  // Show "magic ready" message, then reveal the Next button
                  setTimeout(() => {
                    setWhisperDownloadComplete(true);
                  }, 1500);
                } catch (error) {
                  // Still mark as complete even if there was an error
                  setWhisperDownloadComplete(true);
                }
              }}
            />
          </View>
        );
      default:
        return null;
    }
  };

  const handleFamilyMemberSelect = (member: FamilyMember) => {
    let m = member;
    Alert.alert(
      'Family Member Selected',
      `You selected: ${member.name}${member.imageUri ? ' (with photo)' : ' (no photo)'
      }`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Here you can use the selected family member in your conversation
          },
        },
      ],
    );
  };

  const handleTermsAgreement = (agreed: boolean) => {
    setTermsAgreed(agreed);
  };

  const currentStepData = onboardingSteps[currentStep];

  const requestPermission = async () => {
    setPermissionsAttempted(true);
    if (Platform.OS === 'android') {
      try {
        // First check current permission status
        const micStatus = await check(PERMISSIONS.ANDROID.RECORD_AUDIO);
        const writeStorageStatus = await check(
          PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
        );
        const readStorageStatus = await check(
          PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
        );

        if (
          micStatus === RESULTS.GRANTED &&
          writeStorageStatus === RESULTS.GRANTED &&
          readStorageStatus === RESULTS.GRANTED
        ) {
          setPermissionsGranted(true);
          setPermissionsDenied(false);
          setPermissionsPermanentlyDenied(false);
          mixpanel.track('Onboarding Permissions Requested', {
            screen_label: 'Permissions',
            permission_granted: 'yes',
          });
          return true;
        }

        const grants = await requestMultiple([
          PERMISSIONS.ANDROID.RECORD_AUDIO,
          PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
          PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
        ]);

        const granted =
          grants['android.permission.RECORD_AUDIO'] === RESULTS.GRANTED;
        const permanentlyDenied =
          grants['android.permission.RECORD_AUDIO'] === RESULTS.BLOCKED;

        setPermissionsGranted(granted);
        setPermissionsDenied(!granted);
        setPermissionsPermanentlyDenied(permanentlyDenied);
        mixpanel.track('Onboarding Permissions Requested', {
          screen_label: 'Permissions',
          permission_granted: granted ? 'yes' : 'no',
        });
        return granted;
      } catch (err) {
        setPermissionsGranted(false);
        setPermissionsDenied(true);
        setPermissionsPermanentlyDenied(false);
        mixpanel.track('Onboarding Permissions Requested', {
          screen_label: 'Permissions',
          permission_granted: 'no',
        });
        return false;
      }
    }

    if (Platform.OS === 'ios') {
      // Check current status first
      const micStatus = await check(PERMISSIONS.IOS.MICROPHONE);
      const speechStatus = await check(PERMISSIONS.IOS.SPEECH_RECOGNITION);

      if (micStatus === RESULTS.GRANTED && speechStatus === RESULTS.GRANTED) {
        setPermissionsGranted(true);
        setPermissionsDenied(false);
        setPermissionsPermanentlyDenied(false);
        mixpanel.track('Onboarding Permissions Requested', {
          screen_label: 'Permissions',
          permission_granted: 'yes',
        });
        return true;
      }

      const mic = await request(PERMISSIONS.IOS.MICROPHONE);
      const speech = await request(PERMISSIONS.IOS.SPEECH_RECOGNITION);
      const granted = mic === RESULTS.GRANTED && speech === RESULTS.GRANTED;
      const permanentlyDenied =
        mic === RESULTS.BLOCKED || speech === RESULTS.BLOCKED;

      setPermissionsGranted(granted);
      setPermissionsDenied(!granted);
      setPermissionsPermanentlyDenied(permanentlyDenied);
      mixpanel.track('Onboarding Permissions Requested', {
        screen_label: 'Permissions',
        permission_granted: granted ? 'yes' : 'no',
      });
      return { mic, speech };
    }

    setPermissionsGranted(true);
    setPermissionsDenied(false);
    setPermissionsPermanentlyDenied(false);
    mixpanel.track('Onboarding Permissions Requested', {
      screen_label: 'Permissions',
      permission_granted: 'yes',
    });
    return true;
  };

  const requestLocationPermission = async () => {
    setLocationPermissionAttempted(true);
    if (Platform.OS === 'android') {
      try {
        const locationStatus = await check(
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
        );
        if (locationStatus === RESULTS.GRANTED) {
          setLocationGranted(true);
          setLocationPermissionSuccess(true);
          mixpanel.track('Onboarding Permissions Requested', {
            screen_label: 'Optional Permissions',
            permission_granted: 'yes',
          });
          return true;
        }

        const granted = await requestMultiple([
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
        ]);

        const isGranted =
          granted['android.permission.ACCESS_FINE_LOCATION'] ===
          RESULTS.GRANTED &&
          granted['android.permission.ACCESS_COARSE_LOCATION'] ===
          RESULTS.GRANTED;
        setLocationGranted(isGranted);
        setLocationPermissionSuccess(isGranted);
        mixpanel.track('Onboarding Permissions Requested', {
          screen_label: 'Optional Permissions',
          permission_granted: isGranted ? 'yes' : 'no',
        });
        if (isGranted) {
          setItem('wasLocationOnboarded', '1');
        }
      } catch (err) {
        setLocationGranted(false);
        setLocationPermissionSuccess(false);
        mixpanel.track('Onboarding Permissions Requested', {
          screen_label: 'Optional Permissions',
          permission_granted: 'no',
        });
      }
    }
    if (Platform.OS === 'ios') {
      try {
        const granted = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        const isGranted = granted === RESULTS.GRANTED;
        setLocationGranted(isGranted);
        setLocationPermissionSuccess(isGranted);
        mixpanel.track('Onboarding Permissions Requested', {
          screen_label: 'Optional Permissions',
          permission_granted: isGranted ? 'yes' : 'no',
        });
        if (isGranted) {
          setItem('wasLocationOnboarded', '1');
        } else {
          setLocationPermissionSuccess(false);
        }
      } catch (err) {
        setLocationGranted(false);
        setLocationPermissionSuccess(false);
        mixpanel.track('Onboarding Permissions Requested', {
          screen_label: 'Optional Permissions',
          permission_granted: 'no',
        });
      }
    }
  };

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  useEffect(() => {
    const screenLabel = onboardingSteps[currentStep]?.id || 'unknown';
    mixpanel.track('Onboarding Screen View', {
      screen_label: screenLabel,
    });
  }, [currentStep]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {currentStep > 0 && (
        <TouchableOpacity
          style={[
            styles.backButton,
            {
              flexDirection: 'row-reverse',
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
          onPress={handleBack}>
          <Text
            style={[styles.backButtonText, { fontSize: nextButtonTextFontSize }]}>
            Back
          </Text>
          <Image
            source={require('../assets/leftArrow.png')}
            style={{
              width: nextButtonTextFontSize,
              height: nextButtonTextFontSize,
              marginRight: 4,
            }}
          />
        </TouchableOpacity>
      )}
      <View style={styles.matalkIcon}>
        <FastImage source={matalkImg} style={styles.iconSize} />
      </View>
      <View style={[styles.container, { backgroundColor: '#f8f9fe' }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}>
          <View style={styles.stepIndicator}>
            {onboardingSteps.map((step, index) => {
              // Hide family members step indicator in easy mode
              if (conversationMode === 'easy' && step.id === 'Family Members') {
                return null;
              }

              return (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    currentStep === index && styles.activeDot,
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.content}>
            <View style={styles.contentSection}>
              <View style={styles.questionContainer}>
                {currentStepData?.id === 'Special Places' ? (
                  <View style={styles.specialPlacesHeader}>
                    <Text style={styles.question}>
                      {currentStepData.question}
                    </Text>
                    <TouchableOpacity
                      style={styles.skipButton}
                      onPress={handleNext}>
                      <Text style={styles.skipButtonText}>Skip for now</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text
                    style={isTablet ? styles.questionTablet : styles.question}>
                    {currentStepData.question}
                  </Text>
                )}
              </View>

              {renderAdditionalComponents()}
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                // Hide the button until step requirements are met
                ((currentStepData.id === 'terms' && !termsAgreed) || (currentStepData.id === 'Permissions' &&
                  !permissionsAttempted) ||
                  (currentStepData.id === 'name' && !heroName.trim().length) ||
                  (currentStepData.id === 'Optional Permissions' &&
                    !locationPermissionAttempted) ||
                  (currentStepData.id === 'on-device-whisper' &&
                    !whisperDownloadComplete)) &&
                styles.hiddenButton,
              ]}
              onPress={() => {
                handleNext();
              }}
              disabled={
                (currentStepData.id === 'terms' && !termsAgreed) ||
                (currentStepData.id === 'name' && !heroName.trim().length) ||
                (currentStepData.id === 'admin-code' &&
                  adminCode.length !== 4) ||
                (currentStepData.id === 'on-device-whisper' &&
                  !whisperDownloadComplete)
              }>
              <Text
                style={[styles.buttonText, { fontSize: nextButtonTextFontSize }]}>
                {currentStepData.id === 'on-device-whisper'
                  ? whisperDownloadComplete
                    ? 'Continue'
                    : 'Getting Magic Ready'
                  : currentStepData.buttonText}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  container: {
    flex: 1,
  },
  familyMembersContainer: {
    maxHeight: height * 0.4,
    minHeight: height * 0.25,
    justifyContent: 'flex-start',
    alignItems: 'center',
    flex: 1,
  },
  familyMembersContainerPhone: {
    maxHeight: height * 0.4,
    minHeight: height * 0.25,
    flex: 1,
  },
  familyPicsWrapper: {
    flex: 1,
    width: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 10,
  },
  contentSection: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '100%',
    paddingTop: height * 0.12,
    minHeight: height * 0.7,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    position: 'absolute',
    top: height * 0.05,
    zIndex: 2,
  },
  matalkIcon: {
    bottom: height * 0.02,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.03,
    position: 'absolute',
    zIndex: 3,
  },
  iconSize: {
    width: 45,
    height: 45,
    resizeMode: 'contain',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(20, 108, 240, 0.25)',
    marginHorizontal: 5,
  },
  activeDot: {
    backgroundColor: 'rgba(20, 108, 240, 0.75)',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  questionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: height * 0.12,
    maxHeight: height * 0.18,
    width: '90%',
    marginBottom: 20,
    zIndex: 1000,
  },
  question: {
    fontSize: Math.min(22, width * 0.05),
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    lineHeight: Math.min(40, width * 0.1),
  },
  questionTablet: {
    fontSize: Math.min(32, width * 0.08),
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    lineHeight: Math.min(40, width * 0.1),
  },
  inputContainer: {
    flex: 1,
    marginHorizontal: 10,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: Math.min(20, width * 0.05),
    fontSize: Math.min(80, width * 0.2),
    textAlign: 'center',
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  inputPhone: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: Math.min(20, width * 0.02),
    fontSize: Math.min(80, width * 0.04),
    textAlign: 'center',
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  microphoneContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 40,
    borderWidth: 1,
    borderColor: '#8E24AA',
  },
  microphoneContainerActive: {
    backgroundColor: '#8E24AA',
  },
  microphoneImage: {
    width: 80,
    height: 80,
  },
  button: {
    backgroundColor: 'rgba(20, 108, 240, 0.75)',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    marginTop: 20,
    marginBottom: 10,
    width: width * 0.8,
    alignItems: 'center',
    alignSelf: 'center',
  },
  settingsButton: {
    backgroundColor: 'red',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    marginTop: 10,
    marginBottom: 10,
    width: width * 0.2,
    alignItems: 'center',
    alignSelf: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  genderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: 20,
    flexWrap: 'wrap',
  },
  genderOption: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 0,
    width: '33.33%',
    marginBottom: 6,
  },
  genderImageWrapper: {
    width: '100%',
    aspectRatio: 1.43,
    borderRadius: 16,
    overflow: 'visible',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  selectedGender: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  genderImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  heartOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
    fontSize: Math.min(26.4, width * 0.048),
    color: '#FF3B30',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    pointerEvents: 'none',
  },
  genderText: {
    display: 'none',
  },
  selectedGenderText: {
    display: 'none',
  },
  permissionsContainer: {
    width: '90%',
    marginVertical: 10,
    flex: 1,
  },
  permissionsScrollView: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionsExplanation: {
    fontSize: Math.min(18, width * 0.045),
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: Math.min(24, width * 0.06),
    fontWeight: '500',
  },
  permissionsSuccess: {
    fontSize: 18,
    color: '#4CAF50',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: 'bold',
  },
  genderExplanation: {
    fontSize: Math.min(18, height * 0.03),
    color: '#4CAF50',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: 'bold',
  },
  hiddenButton: {
    opacity: 0,
    pointerEvents: 'none',
    height: 0,
    marginTop: 0,
  },
  welcomeContainer: {
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '90%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  welcomeImage: {
    width: width * 0.15,
    height: width * 0.15,
    borderRadius: 16,
  },
  nameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  nameScrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100, // Extra padding for keyboard
    paddingTop: 20,
  },
  sideImage: {
    width: Math.min(width * 0.22, 100),
    height: Math.min(width * 0.22, 100),
  },
  adminCodeContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
    maxHeight: height * 0.4,
    flexDirection: 'row',
    flex: 1
  },
  adminCodeImage: {
    width: width * 0.05,
    height: width * 0.05,
  },
  parentCodeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  parentCodeLockIcon: {
    fontSize: Math.min(36, width * 0.09),
    marginBottom: 12,
  },
  parentCodeTitle: {
    fontWeight: '800',
    color: '#222',
    textAlign: 'center',
    marginBottom: 8,
  },
  parentCodeDescription: {
    color: '#888',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  parentCodePinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  parentCodePinBox: {
    backgroundColor: '#F5F0EB',
    borderWidth: 2,
    borderColor: '#D6CFC8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  parentCodePinBoxFilled: {
    borderColor: '#B0A89F',
    backgroundColor: '#EDE8E3',
  },
  parentCodePinInput: {
    textAlign: 'center',
    color: '#555',
    width: '100%',
    height: '100%',
    padding: 0,
  },
  parentCodeEyeButton: {
    marginLeft: 4,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentCodeEyeIcon: {
    opacity: 0.6,
  },
  permissionsImage: {
    width: Math.min(width * 0.2, 80),
    height: Math.min(width * 0.2, 80),
    marginBottom: 20,
  },
  permissionsImageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  scrollIndicator: {
    fontSize: 24,
    marginLeft: 10,
    color: '#146CF0',
  },
  scrollIndicatorContainer: {
    padding: 5,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 20,
    zIndex: 10,
    padding: 12,
    backgroundColor: 'rgba(20, 108, 240, 0.75)',
    borderRadius: 25,
    alignContent: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
      }
      : {
        elevation: 15,
      }),
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    justifyContent: 'center',
  },
  gridItem: {
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    backgroundColor: 'white',
    marginBottom: height * 0.02,
  },
  gridImageContainer: {
    width: '100%',
    backgroundColor: '#FFE4E1',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  gridLabelContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  labelGrid: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
  },
  familylabel: {
    fontWeight: 'bold',
    fontSize: Math.min(16, width * 0.04),
    textAlign: 'center',
    color: '#000',
    marginBottom: 10,
  },
  specialPlacesContainer: {
    width: '100%',
    flexGrow: 1,
  },
  specialPlacesScrollView: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specialPlacesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10,
  },
  skipButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(20, 108, 240, 0.75)',
    marginLeft: 10,
  },
  skipButtonText: {
    color: 'rgba(20, 108, 240, 0.75)',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  termsContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  loginButton: {
    backgroundColor: '#3498db',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginVertical: 20,
    minWidth: 200,
    alignItems: 'center',
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loggedInContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loggedInText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 10,
  },
  loggedInSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 15,
    minWidth: 120,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OnboardingScreen;
