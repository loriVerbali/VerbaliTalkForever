import React, {useState, useContext} from 'react';
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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useAppSettings} from '../utils/persistance';
import FastImage from 'react-native-fast-image';
import {OnboardingContext} from '../Navigation/RootControllerView';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

const {width, height} = Dimensions.get('window');

// Define onboarding steps
const onboardingSteps = [
  {
    id: 'welcome',
    question: 'Welcome to Matalk',
    additionalComponents: null,
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
    id: 'admin-code',
    question: 'Set Admin Code',
    additionalComponents: 'admin-code-input',
    buttonText: 'Next',
  },
  {
    id: 'wake-word',
    question: "Let's set your Wake word",
    additionalComponents: 'microphone',
    buttonText: 'Done',
  },
  {
    id: 'Permissions',
    question: 'Lets get some permissions',
    additionalComponents: 'permissions',
    buttonText: 'Done',
  },
];

const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation();
  const {setItem} = useAppSettings();
  const {completeOnboarding} = useContext(OnboardingContext);
  const [currentStep, setCurrentStep] = useState(0);
  const [heroName, setHeroName] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [selectedGender, setSelectedGender] = useState('');

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
      case 'name-input':
        return (
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
        );
      case 'microphone':
        return (
          <TouchableOpacity
            style={[
              styles.microphoneContainer,
              isRecording && styles.microphoneContainerActive,
            ]}
            onPress={toggleRecording}
            activeOpacity={0.7}>
            <FastImage
              source={require('../assets/microphone.png')}
              style={styles.microphoneImage}
              resizeMode={FastImage.resizeMode.contain}
            />
          </TouchableOpacity>
        );
      case 'permissions':
        return (
          <View style={styles.genderContainer}>
            <TouchableOpacity style={styles.button} onPress={requestPermission}>
              <Text>Grant Permissions</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  const currentStepData = onboardingSteps[currentStep];

  const requestPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        return (
          grants['android.permission.WRITE_EXTERNAL_STORAGE'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          grants['android.permission.RECORD_AUDIO'] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        console.warn(err);
        return false;
      }
    }

    if (Platform.OS === 'ios') {
      const mic = await request(PERMISSIONS.IOS.MICROPHONE);
      const speech = await request(PERMISSIONS.IOS.SPEECH_RECOGNITION);
      return {mic, speech};
    }

    return true;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ImageBackground
        source={require('../assets/welcome.png')}
        style={styles.backgroundImage}>
        <View style={styles.overlay}>
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
                style={styles.button}
                onPress={handleNext}
                disabled={
                  (currentStepData.id === 'name' && !heroName.trim().length) ||
                  (currentStepData.id === 'admin-code' &&
                    adminCode.length !== 4) ||
                  (currentStepData.id === 'gender' && !selectedGender)
                }>
                <Text style={styles.buttonText}>
                  {currentStepData.buttonText}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </ImageBackground>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    top: 40,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D8D8D8',
    marginHorizontal: 5,
  },
  activeDot: {
    backgroundColor: '#8E24AA',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  questionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  question: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    lineHeight: 80,
  },
  inputContainer: {
    width: '100%',
    marginVertical: 30,
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
    backgroundColor: '#8E24AA',
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
    borderColor: '#8E24AA',
    backgroundColor: 'rgba(142, 36, 170, 0.1)',
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
    color: '#8E24AA',
    fontWeight: 'bold',
  },
});

export default OnboardingScreen;
