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

type RootStackParamList = {
  MainTab: {
    screen: string;
    params: {stateof: string};
  };
  FEELINGS: undefined;
  SHORTCUTS: undefined;
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
      navigation.navigate('MainTab', {
        screen: views.HOME,
        params: {stateof: state},
      });
    });
  };

  const handKeyboard = async () => {
    // Use our optimized TTS service instead
    TTSService.speak('Keyboard selected');
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
                  // Start fade out before navigation
                  Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                  }).start(() => {
                    navigation.navigate(views.SHORTCUTS);
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
                  // Start fade out before navigation
                  Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                  }).start(() => {
                    navigation.navigate(views.FEELINGS);
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
});

export default OpenScreen;
function geminiGenerateImage(arg0: string) {
  throw new Error('Function not implemented.');
}
