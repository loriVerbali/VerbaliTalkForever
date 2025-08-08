import React, {useState, useContext, useEffect} from 'react';
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
  PermissionsAndroid,
  Permission,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useAppSettings} from '../utils/persistance';
import FastImage from 'react-native-fast-image';
import {OnboardingContext} from '../Navigation/RootControllerView';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import matalkImg from '../assets/matalk.png';
import LinearGradient from 'react-native-linear-gradient';
import FamilyPics, {FamilyMember} from '../Components/FamilyPics';
import SpecialPlaces from '../Components/SpecialPlaces';
import TermsAndConditions from '../Components/TermsAndConditions';
import Subscription, {SubscriptionPlan} from '../Components/Subscription';
import {Mixpanel} from 'mixpanel-react-native';
import {useAdmin} from '../contexts/adminContext';
import auth0, {useAuth0} from 'react-native-auth0';
import fetchHelper from '../utils/fetcher';
import TTSService from '../utils/TTSService';

const {width, height} = Dimensions.get('window');

// Define onboarding steps
const onboardingSteps = [
  {
    id: 'welcome',
    question: 'Welcome to Ma-Talk AI',
    additionalComponents: 'welcome',
    buttonText: 'Next',
  },
  {
    id: 'login',
    question: 'Sign In to Continue',
    additionalComponents: 'login',
    buttonText: 'Next',
  },
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
    id: 'subscription',
    question: 'Choose Your Plan',
    additionalComponents: 'subscription-selection',
    buttonText: 'Next',
  },
  {
    id: 'gender',
    question: 'Choose your gender (optional)',
    additionalComponents: 'gender-selection',
    buttonText: 'Next',
  },
  {
    id: 'Family Members',
    question: 'Family Members',
    additionalComponents: 'family-members',
    buttonText: 'Next',
  },
  {
    id: 'admin-code',
    question: 'Set Admin Code',
    additionalComponents: 'admin-code-input',
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
  {
    id: 'Special Places',
    question: 'Special Places',
    additionalComponents: 'special-places',
    buttonText: 'Done',
  },
];

const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation();
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);
  const {setItem, getItem} = useAppSettings();
  const {isTablet} = useAdmin();
  const {completeOnboarding} = useContext(OnboardingContext);
  const {
    authorize,
    user,
    isLoading: authLoading,
    clearSession,
    getCredentials,
  } = useAuth0();
  const [currentStep, setCurrentStep] = useState(0);
  const [heroName, setHeroName] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [isRecording, setIsRecording] = useState(false);
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [gotSubscription, setGotSubscription] = useState(false);
  const [gotAssistant, setGotAssistant] = useState(false);
  // Load conversation mode setting
  useEffect(() => {
    const loadConversationMode = async () => {
      try {
        const savedConversationMode = await getItem('conversationMode');
        setConversationMode(
          (savedConversationMode as 'easy' | 'advanced') || 'easy',
        );
      } catch (error) {
        console.error('Error loading conversation mode:', error);
      }
    };
    loadConversationMode();
  }, []);

  // Check login status when on login step
  useEffect(() => {
    if (onboardingSteps[currentStep].id === 'login' && user) {
      setIsLoggedIn(true);
      getCredentials().then(credentials => {
        if (credentials?.accessToken) {
          setItem('token', credentials?.accessToken);
          // Stop persisting refresh tokens; let the Auth0 Credentials Manager manage rotation
        } else {
          clearSession();
          setItem('loggedIn', '0');
          setItem('username', '');
        }
      });
    }
  }, [user, currentStep]);

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

  // Helper function to get assistant ID for the user
  const getAssistantId = async (userId: string): Promise<void> => {
    try {
      const response = await fetchHelper(
        'getAssistantId',
        {},
        {
          userId: userId,
        },
      );

      if (response && response.assistantId) {
        await setItem('assistantId', response.assistantId);
      } else {
        await makeAssistantId(userId);
      }
    } catch (error) {
      setGotAssistant(true);
      console.log('Error getting assistant ID:', error);
    }
  };

  const makeAssistantId = async (userId: string) => {
    const response = await fetchHelper(
      'makeAssistantId',
      {},
      {kidname: heroName, userId: userId},
    );
    if (response && response.assistantId) {
      await setItem('assistantId', response.assistantId);
    }
  };
  const handleLogin = async () => {
    try {
      const result = await authorize({
        scope: 'openid profile email offline_access',
        audience: 'https://matalkapi-production.up.railway.app/',
      });

      if (result?.accessToken) {
        await setItem('token', result.accessToken);
      }

      // Do not persist refresh tokens; rely on Auth0 Credentials Manager

      console.log('Authorization result:', result);
    } catch (e) {
      console.log('Authorization error:', e);
    }
  };

  const handleBack = () => {
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
        setCurrentStep(genderIndex);
        return;
      }
    }

    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = async () => {
    // Handle login step
    if (onboardingSteps[currentStep].id === 'login') {
      if (!isLoggedIn) {
        // Don't proceed if not logged in
        return;
      }

      // Save user data when login is successful
      if (user) {
        const userId = user.sub?.toString() || '';

        await setItem('auth0Id', userId);
        await setItem('loggedIn', '1');
        await setItem('username', user.name || '');
      }
    }

    if (onboardingSteps[currentStep].id === 'name') {
      setGotAssistant(true);
      await getAssistantId(user?.sub?.toString() || '');
      setGotAssistant(false);
    }
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
    const {additionalComponents} = onboardingSteps[currentStep];

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
      case 'login':
        return (
          <View style={styles.loginContainer}>
            <View style={styles.loginContent}>
              {!isLoggedIn ? (
                <>
                  <TouchableOpacity
                    style={styles.loginButton}
                    onPress={handleLogin}
                    disabled={authLoading}>
                    <Text style={styles.loginButtonText}>
                      {authLoading ? 'Signing In...' : 'Sign In'}
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={[
                      styles.permissionsExplanation,
                      {width: '80%', marginTop: 4, fontStyle: 'italic'},
                    ]}>
                    In order to use the app you must login. The next button will
                    be disabled until you are logged in.
                  </Text>
                </>
              ) : (
                <View style={styles.loggedInContainer}>
                  <Text style={styles.loggedInText}>
                    Welcome, {user?.name || 'User'}!
                  </Text>
                  <Text style={styles.loggedInSubtext}>
                    You're successfully signed in
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      case 'subscription-selection':
        return (
          <>
            {gotSubscription ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  padding: 32,
                  zIndex: 5000,
                }}>
                <Text
                  style={{
                    fontSize: 26,
                    fontWeight: 'bold',
                    color: '#47B76F',
                    marginBottom: 16,
                    textAlign: 'center',
                  }}>
                  We are so happy you joined!
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    color: '#333',
                    marginBottom: 24,
                    textAlign: 'center',
                  }}>
                  Welcome to the Ma-Talk community.
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontStyle: 'italic',
                    color: '#8E24AA',
                    textAlign: 'center',
                  }}>
                  'Because the most meaningful conversation is a natural one'
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontStyle: 'italic',
                    color: '#8E24AA',
                    textAlign: 'center',
                  }}>
                  Shay Cohen Verbali CEO 2025
                </Text>
              </View>
            ) : (
              <View style={styles.questionContainer}>
                <Subscription
                  key="onboarding-subscription"
                  setGotSubscription={setGotSubscription}
                />
              </View>
            )}
          </>
        );
      case 'terms-and-conditions':
        return (
          <View style={styles.termsContainer}>
            <TermsAndConditions onAgree={handleTermsAgreement} />
          </View>
        );
      case 'name-input':
        return (
          <>
            {gotAssistant ? (
              <ActivityIndicator size="large" color="#0000ff" />
            ) : (
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
            )}
          </>
        );
      case 'gender-selection':
        return (
          <>
            <View>
              <Text style={styles.permissionsSuccess}>
                Gender selection is optional and is used for personalization Tap
                Next to continue
              </Text>
            </View>
            <View style={styles.genderContainer}>
              <TouchableOpacity
                style={[
                  styles.genderOption,
                  selectedGender === 'boy' && styles.selectedGender,
                ]}
                onPress={() => setSelectedGender('boy')}>
                <FastImage
                  source={require('../assets/boy.png')}
                  style={styles.genderImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
                <Text
                  style={[
                    styles.genderText,
                    selectedGender === 'boy' && styles.selectedGenderText,
                  ]}>
                  Boy
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.genderOption,
                  selectedGender === 'girl' && styles.selectedGender,
                ]}
                onPress={() => setSelectedGender('girl')}>
                <FastImage
                  source={require('../assets/girl.png')}
                  style={styles.genderImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
                <Text
                  style={[
                    styles.genderText,
                    selectedGender === 'girl' && styles.selectedGenderText,
                  ]}>
                  Girl
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.genderOption,
                  selectedGender === 'other' && styles.selectedGender,
                ]}
                onPress={() => setSelectedGender('other')}>
                <FastImage
                  source={require('../assets/person.png')}
                  style={styles.genderImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
                <Text
                  style={[
                    styles.genderText,
                    selectedGender === 'other' && styles.selectedGenderText,
                  ]}>
                  Other
                </Text>
              </TouchableOpacity>
            </View>
          </>
        );
      case 'admin-code-input':
        return (
          <View style={styles.adminCodeContainer}>
            <View style={styles.inputContainer}>
              <TextInput
                style={isTablet ? styles.input : styles.inputPhone}
                placeholder="Set a 4 digit code"
                placeholderTextColor="#888"
                value={adminCode}
                inputMode="numeric"
                onChangeText={text => {
                  // Only allow numbers and limit to 4 digits
                  const numericText = text.replace(/[^0-9]/g, '');
                  if (numericText.length <= 4) {
                    setAdminCode(numericText);
                  }
                }}
                keyboardType={isTablet ? 'numeric' : 'default'}
                maxLength={4}
                secureTextEntry={true}
              />
            </View>
          </View>
        );
      case 'family-members':
        return isTablet ? (
          <View style={styles.familyMembersContainer}>
            <Text style={styles.familylabel}>
              Select pictures of family members that {heroName} will be able to
              start a conversation with.
            </Text>
            <Text style={[styles.familylabel, {color: '#8E24AA'}]}>
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
            <Text style={[styles.familylabel, {color: '#8E24AA'}]}>
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
            style={styles.permissionsContainer}
            contentContainerStyle={styles.permissionsScrollView}>
            <FastImage
              source={require('../assets/boyAsk.png')}
              style={styles.permissionsImage}
              resizeMode={FastImage.resizeMode.contain}
            />
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
                        {fontSize: 24, fontWeight: '900'},
                      ]}>
                      Ma-Talk AI needs the following permissions:
                    </Text>
                    <Text
                      style={[styles.permissionsExplanation, {width: '80%'}]}>
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
                        {fontSize: 24, fontWeight: '900', color: '#FF6B6B'},
                      ]}>
                      Manual Permission Required
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        {color: '#FF6B6B'},
                      ]}>
                      Please enable microphone manually in your device settings
                      to continue using Ma-Talk AI fully or tap next and do this
                      via the settings later
                    </Text>
                    <TouchableOpacity
                      style={styles.settingsButton}
                      onPress={openSettings}>
                      <Text style={styles.buttonText}>Open Settings</Text>
                    </TouchableOpacity>
                  </>
                )}

                {permissionsDenied && !permissionsPermanentlyDenied && (
                  <>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        {color: '#FF6B6B', fontWeight: 'bold', marginTop: 20},
                      ]}>
                      Are you sure?
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        {color: '#FF6B6B'},
                      ]}>
                      Without these permissions, Ma-Talk won't be able to:
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        {color: '#FF6B6B', marginBottom: 10},
                      ]}>
                      • Listen for your voice commands
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        {color: '#FF6B6B', marginBottom: 20},
                      ]}>
                      • Provide the full Ma-Talk experience
                    </Text>
                  </>
                )}

                {!permissionsAttempted && (
                  <TouchableOpacity
                    style={styles.button}
                    onPress={requestPermission}>
                    <Text style={styles.buttonText}>
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
                  Location to help Ma-Talk know where you are.
                </Text>
                {!locationPermissionAttempted && (
                  <TouchableOpacity
                    style={styles.button}
                    onPress={requestLocationPermission}>
                    <Text style={styles.buttonText}>Continue</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        );
      case 'special-places':
        return (
          <ScrollView
            style={styles.specialPlacesContainer}
            contentContainerStyle={styles.specialPlacesScrollView}>
            <SpecialPlaces onComplete={() => setSpecialPlacesCompleted(true)} />
          </ScrollView>
        );
      default:
        return null;
    }
  };

  const handleFamilyMemberSelect = (member: FamilyMember) => {
    let m = member;
    Alert.alert(
      'Family Member Selected',
      `You selected: ${member.name}${
        member.imageUri ? ' (with photo)' : ' (no photo)'
      }`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Here you can use the selected family member in your conversation
            console.log('Selected family member for conversation:', member);
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
        const micStatus = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        const storageStatus = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );

        if (micStatus && storageStatus) {
          setPermissionsGranted(true);
          setPermissionsDenied(false);
          setPermissionsPermanentlyDenied(false);
          return true;
        }

        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        const granted =
          grants['android.permission.WRITE_EXTERNAL_STORAGE'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          grants['android.permission.RECORD_AUDIO'] ===
            PermissionsAndroid.RESULTS.GRANTED;

        const permanentlyDenied =
          grants['android.permission.WRITE_EXTERNAL_STORAGE'] ===
            PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
          grants['android.permission.RECORD_AUDIO'] ===
            PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

        setPermissionsGranted(granted);
        setPermissionsDenied(!granted);
        setPermissionsPermanentlyDenied(permanentlyDenied);
        return granted;
      } catch (err) {
        console.warn(err);
        setPermissionsGranted(false);
        setPermissionsDenied(true);
        setPermissionsPermanentlyDenied(false);
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
      return {mic, speech};
    }

    setPermissionsGranted(true);
    setPermissionsDenied(false);
    setPermissionsPermanentlyDenied(false);
    return true;
  };

  const requestLocationPermission = async () => {
    setLocationPermissionAttempted(true);
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        setLocationGranted(isGranted);
        setLocationPermissionSuccess(isGranted);
        if (isGranted) {
          setItem('wasLocationOnboarded', '1');
        }
      } catch (err) {
        console.warn('Location permission error:', err);
        setLocationGranted(false);
        setLocationPermissionSuccess(false);
      }
    }
    if (Platform.OS === 'ios') {
      try {
        const granted = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        const isGranted = granted === RESULTS.GRANTED;
        setLocationGranted(isGranted);
        setLocationPermissionSuccess(isGranted);
        if (isGranted) {
          setItem('wasLocationOnboarded', '1');
        } else {
          setLocationPermissionSuccess(false);
        }
      } catch (err) {
        console.warn('Location permission error:', err);
        setLocationGranted(false);
        setLocationPermissionSuccess(false);
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
    mixpanel.track('Onboarding', {
      Opened: 'Onboarding',
      Step: currentStep,
    });
  }, [currentStep]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {currentStep > 0 && (
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      )}
      <View style={styles.matalkIcon}>
        <FastImage source={matalkImg} style={styles.iconSize} />
      </View>
      <LinearGradient colors={['#FFF8E7', '#FFFFFF']} style={styles.container}>
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
                // Hide the done button if on permissions step and permissions not granted
                ((currentStepData.id === 'Permissions' &&
                  !permissionsAttempted) ||
                  (currentStepData.id === 'name' && !heroName.trim().length) ||
                  (currentStepData.id === 'subscription' && !gotSubscription) ||
                  (currentStepData.id === 'Optional Permissions' &&
                    !locationPermissionAttempted)) &&
                  styles.hiddenButton,
              ]}
              onPress={handleNext}
              disabled={
                (currentStepData.id === 'login' && !isLoggedIn) ||
                (currentStepData.id === 'terms' && !termsAgreed) ||
                (currentStepData.id === 'name' && !heroName.trim().length) ||
                (currentStepData.id === 'admin-code' && adminCode.length !== 4)
              }>
              <Text style={styles.buttonText}>
                {currentStepData.buttonText}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  genderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginVertical: 20,
    flexWrap: 'wrap',
  },
  genderOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 15,
    padding: 15,
    width: width * 0.25,
    minWidth: 100,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 10,
  },
  selectedGender: {
    borderColor: 'rgba(47, 183, 111, 0.25)',
    backgroundColor: 'rgba(47, 183, 111, 0.25)',
  },
  genderImage: {
    width: Math.min(60, width * 0.15),
    height: Math.min(60, width * 0.15),
    marginBottom: 10,
  },
  genderText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  selectedGenderText: {
    color: 'black',
    fontWeight: '900',
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
    marginTop: 20,
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
  sideImage: {
    width: Math.min(width * 0.22, 100),
    height: Math.min(width * 0.22, 100),
  },
  adminCodeContainer: {
    alignItems: 'center',
    width: '100%',
    maxHeight: height * 0.4,
    flexDirection: 'row',
    flex: 1,
  },
  adminCodeImage: {
    width: width * 0.05,
    height: width * 0.05,
  },
  permissionsImage: {
    width: Math.min(width * 0.2, 80),
    height: Math.min(width * 0.2, 80),
    marginBottom: 20,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 20,
    zIndex: 10,
    padding: 12,
    backgroundColor: 'rgba(20, 108, 240, 0.75)',
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  gridItem: {
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: {width: 0, height: 8},
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
});

export default OnboardingScreen;
