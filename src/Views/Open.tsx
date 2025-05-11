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
} from 'react-native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import {views} from '../utils/constants';
import LinearGradient from 'react-native-linear-gradient';
import {useAssistant} from '../contexts/AssistantContext';
import VoiceService from '../utils/VoiceService';
import TTSService from '../utils/TTSService';
import {useAuth0} from 'react-native-auth0';
import {useAppSettings} from '../utils/persistance';

type RootStackParamList = {
  MainTab: {
    screen: string;
    params: {stateof: string};
  };
  FEELINGS: undefined;
  SHORTCUTS: undefined;
  Convo: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const {height} = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40; // fallback for iOS

const OpenScreen: React.FC = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const isListening = useRef(false);
  const [recognizedText, setRecognizedText] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const {geminiGenerateImage} = useAssistant();
  const {clearSession} = useAuth0();
  const {setItem} = useAppSettings();

  useEffect(() => {
    // Fade in when the screen mounts
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    const initializeServices = async () => {
      // Initialize TTS service on component mount
      await TTSService.initialize();

      // Initialize Voice service and set up callbacks
      await VoiceService.initialize();
      VoiceService.setCallbacks(
        // Handle recognized text
        text => {
          setRecognizedText(text);

          // Check for navigation keywords
          if (
            text.toLowerCase().includes('verbali') ||
            text.toLowerCase().includes('verbbali') ||
            text.toLowerCase().includes('verbally')
          ) {
            VoiceService.stopListening();
            isListening.current = false;
            navigation.navigate('MainTab', {
              screen: views.HOME,
              params: {stateof: 'Attention'},
            });
          }
        },
        // Handle status changes
        (status, error) => {
          if (status === 'error' && error) {
            console.error('Voice recognition error:', error);
            isListening.current = false;
          } else if (status === 'stopped') {
            isListening.current = false;
          }
        },
      );
    };

    initializeServices();

    // Clean up on unmount
    return () => {
      // Reset voice and text state
      setRecognizedText('');
      if (isListening.current) {
        VoiceService.stopListening();
      }
    };
  }, []);

  const handleNavigation = (state: string) => {
    // Start fade out before navigation
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      if (state === 'Talk') {
        navigation.navigate('Convo');
      } else {
        navigation.navigate('MainTab', {
          screen: views.HOME,
          params: {stateof: state},
        });
      }
    });
  };

  const handleLogout = async () => {
    try {
      await clearSession();
      // Clear stored user data on logout
      await setItem('loggedIn', '0');
      await setItem('username', '');
      // Navigate to login screen
      navigation.navigate('MainTab', {
        screen: views.LOGIN,
        params: {stateof: ''},
      });
    } catch (e) {
      console.log('Log out cancelled', e);
    }
  };

  const handKeyboard = async () => {
    // Use our optimized TTS service instead
    console.log('Starting image generation');
    const options = {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization:
          'Bearer 87b780bc3a3781f203761cefffb755fb39d9f061b8840f066df0279b80f2647a',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell-Free',
        steps: 4,
        n: 1,
        height: 256,
        width: 256,
        guidance: 3.5,
        output_format: 'jpeg',
        prompt: 'create an image of a kid describing a feeling of sadness',
        image_url: 'string',
        seed: 0,
        negative_prompt: 'string',
        response_format: 'url',
      }),
    };

    fetch('https://api.together.xyz/v1/images/generations', options)
      .then(res => res.json())
      .then(res => console.log(res))
      .catch(err => console.error(err));
    // TTSService.speak('Keyboard selected');
  };

  const startListening = async () => {
    if (!isListening.current) {
      isListening.current = true;
      const success = await VoiceService.startListening(2000, 8000);
      if (success) {
        setRecognizedText('Listening...');
      } else {
        setRecognizedText('Failed to start listening');
        isListening.current = false;
      }
    }
  };

  return (
    <Animated.View style={[{flex: 1, opacity: fadeAnim}]}>
      <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
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

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <FastImage
            source={require('../assets/logout.png')}
            style={[styles.microphoneImage]}
            resizeMode={FastImage.resizeMode.contain}
          />
        </Pressable>

        <View style={styles.contentContainer}>
          <View
            style={{
              flexDirection: 'row',
              height: height / 2 - tabBarHeight / 2 - statusBarHeight,
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
                    navigation.navigate('SHORTCUTS');
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
              height: height / 2 - tabBarHeight / 2,
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
                    navigation.navigate('FEELINGS');
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
    top: 40,
    left: 10,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButton: {
    position: 'absolute',
    top: 120,
    left: 10,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
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
});

export default OpenScreen;
function geminiGenerateImage(arg0: string) {
  throw new Error('Function not implemented.');
}
