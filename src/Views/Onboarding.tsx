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
  ImageBackground,
  PermissionsAndroid,
  Permission,
  Linking,
  Alert,
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
import {Mixpanel} from 'mixpanel-react-native';

const {width, height} = Dimensions.get('window');

// Define onboarding steps
const onboardingSteps = [
  {
    id: 'welcome',
    question: 'Welcome to Matalk',
    additionalComponents: 'welcome',
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
    question: 'Choose your gender',
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
  const {setItem} = useAppSettings();
  const {completeOnboarding} = useContext(OnboardingContext);
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
  const [locationPermissionSuccess, setLocationPermissionSuccess] =
    useState(false);
  const [specialPlacesCompleted, setSpecialPlacesCompleted] = useState(false);
  const handleNext = async () => {
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

      // Use the context to complete onboarding
      completeOnboarding();
    }
  };

  const toggleRecording = () => {
    // In a real app, this would start/stop voice recording
    setIsRecording(!isRecording);
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
                  source={require('../assets/shortCuts/fun/game.png')}
                  style={styles.welcomeImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </View>
              <View style={styles.gridLabelContainer}>
                <Text style={styles.labelGrid}>Game</Text>
              </View>
            </View>

            <View style={styles.gridItem}>
              <View style={styles.gridImageContainer}>
                <FastImage
                  source={require('../assets/shortCuts/wantNeed/eat.png')}
                  style={styles.welcomeImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </View>
              <View style={styles.gridLabelContainer}>
                <Text style={styles.labelGrid}>Eat</Text>
              </View>
            </View>

            <View style={styles.gridItem}>
              <View style={styles.gridImageContainer}>
                <FastImage
                  source={require('../assets/shortCuts/fun/outside.png')}
                  style={styles.welcomeImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </View>
              <View style={styles.gridLabelContainer}>
                <Text style={styles.labelGrid}>Go Outside</Text>
              </View>
            </View>
          </View>
        );
      case 'name-input':
        return (
          <View style={styles.nameContainer}>
            <FastImage
              source={require('../assets/boy.png')}
              style={styles.sideImage}
              resizeMode={FastImage.resizeMode.contain}
            />
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
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
        );
      case 'gender-selection':
        return (
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
        );
      case 'admin-code-input':
        return (
          <View style={styles.adminCodeContainer}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Set a 4 digit code"
                placeholderTextColor="#888"
                value={adminCode}
                onChangeText={text => {
                  // Only allow numbers and limit to 4 digits
                  const numericText = text.replace(/[^0-9]/g, '');
                  if (numericText.length <= 4) {
                    setAdminCode(numericText);
                  }
                }}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry={true}
              />
            </View>
          </View>
        );
      case 'family-members':
        return (
          <View style={styles.familyMembersContainer}>
            <Text style={styles.familylabel}>
              Select pictures of family members that {heroName} will be able to
              start a conversation with.
            </Text>
            <Text style={[styles.familylabel, {color: '#8E24AA'}]}>
              You can skip this and do it later! Just tap next
            </Text>
            <FamilyPics onFamilyMemberSelect={handleFamilyMemberSelect} />
          </View>
        );
      case 'permissions':
        return (
          <View style={styles.permissionsContainer}>
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
                      Matalk needs the following permissions:
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
                      Hey {heroName}
                    </Text>
                    <Text style={styles.permissionsExplanation}>
                      Storage to save your app configurations.
                    </Text>
                    <Text style={styles.permissionsExplanation}>
                      These permissions are essential for the app to function
                      properly.
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
                      Please enable microphone and storage permissions manually
                      in your device settings to continue using Matalk.
                    </Text>
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
                      Without these permissions, Matalk won't be able to:
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
                        {color: '#FF6B6B', marginBottom: 10},
                      ]}>
                      • Save your preferences and settings
                    </Text>
                    <Text
                      style={[
                        styles.permissionsExplanation,
                        {color: '#FF6B6B', marginBottom: 20},
                      ]}>
                      • Provide the full Matalk experience
                    </Text>
                  </>
                )}

                {!permissionsGranted && (
                  <TouchableOpacity
                    style={styles.button}
                    onPress={
                      permissionsPermanentlyDenied
                        ? openSettings
                        : requestPermission
                    }>
                    <Text style={styles.buttonText}>
                      {permissionsPermanentlyDenied
                        ? 'Open Settings'
                        : permissionsDenied
                        ? 'Try Again'
                        : 'Grant Permissions'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
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
                  Location to help Matalk know where you are.
                </Text>
                <TouchableOpacity
                  style={styles.button}
                  onPress={requestLocationPermission}>
                  <Text style={styles.buttonText}>Enable Location</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        );
      case 'special-places':
        return (
          <View style={styles.specialPlacesContainer}>
            <SpecialPlaces onComplete={() => setSpecialPlacesCompleted(true)} />
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

  const currentStepData = onboardingSteps[currentStep];

  const requestPermission = async () => {
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setCurrentStep(currentStep - 1)}>
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
          <View style={styles.content}>
            <View style={styles.stepIndicator}>
              {onboardingSteps.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    currentStep === index && styles.activeDot,
                  ]}
                />
              ))}
            </View>

            <View style={styles.questionContainer}>
              <Text style={styles.question}>{currentStepData.question}</Text>
            </View>

            {renderAdditionalComponents()}

            <TouchableOpacity
              style={[
                styles.button,
                // Hide the done button if on permissions step and permissions not granted
                ((currentStepData.id === 'Permissions' &&
                  !permissionsGranted) ||
                  (currentStepData.id === 'Optional Permissions' &&
                    !locationPermissionAttempted &&
                    !locationPermissionSuccess)) &&
                  styles.hiddenButton,
              ]}
              onPress={handleNext}
              disabled={
                (currentStepData.id === 'name' && !heroName.trim().length) ||
                (currentStepData.id === 'admin-code' &&
                  adminCode.length !== 4) ||
                (currentStepData.id === 'gender' && !selectedGender) ||
                (currentStepData.id === 'Permissions' && !permissionsGranted) ||
                (currentStepData.id === 'Optional Permissions' &&
                  !locationPermissionAttempted &&
                  !locationPermissionSuccess) ||
                (currentStepData.id === 'Special Places' &&
                  !specialPlacesCompleted)
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
    height: height * 0.6,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    top: height * 0.05,
  },
  matalkIcon: {
    bottom: height * 0.02,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.01,
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
    height: height * 0.2,
    width: '80%',
  },
  question: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    lineHeight: 80,
  },
  inputContainer: {
    flex: 1,
    marginHorizontal: 10,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: 20,
    fontSize: 80,
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
    marginTop: 40,
    width: width * 0.8,
    alignItems: 'center',
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
  },
  genderOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 15,
    padding: 20,
    width: width * 0.25,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedGender: {
    borderColor: 'rgba(47, 183, 111, 0.25)',
    backgroundColor: 'rgba(47, 183, 111, 0.25)',
  },
  genderImage: {
    width: 60,
    height: 60,
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
    justifyContent: 'center',
    alignItems: 'center',
    width: '90%',
    marginVertical: 20,
  },
  permissionsExplanation: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '80%',
    flexDirection: 'row',
  },
  welcomeImage: {
    width: width * 0.2,
    height: width * 0.2,
  },
  nameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  sideImage: {
    width: width * 0.25,
    height: width * 0.25,
  },
  adminCodeContainer: {
    alignItems: 'center',
    width: '100%',
    height: height * 0.5,
    flexDirection: 'row',
  },
  adminCodeImage: {
    width: width * 0.05,
    height: width * 0.05,
  },
  permissionsImage: {
    width: width * 0.2,
    height: width * 0.2,
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
    marginBottom: 15,
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
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
    marginBottom: height * 0.01,
  },
  specialPlacesContainer: {
    width: '100%',
    height: height * 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default OnboardingScreen;
