import React, {useRef, useEffect, useState} from 'react';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  StatusBar,
  Pressable,
} from 'react-native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import {views} from '../utils/constants';
import Voice from '@react-native-voice/voice';
import LinearGradient from 'react-native-linear-gradient';
import {useAssistant} from '../contexts/AssistantContext';

type RootStackParamList = {
  MainTab: {
    screen: string;
    params: {stateof: string};
  };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const {height} = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40; // fallback for iOS

const OpenScreen: React.FC = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const isListening = useRef(false);
  const [recognizedText, setRecognizedText] = useState('');
  const {geminiGenerateImage} = useAssistant();
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSilenceTimer = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
    }
    silenceTimer.current = setTimeout(() => {
      setRecognizedText('');
    }, 2000);
  };

  const handleNavigation = (state: string) => {
    navigation.navigate('MainTab', {
      screen: views.HOME,
      params: {stateof: state},
    });
  };

  const handKeyboard = async () => {
    debugger;
    const a = await geminiGenerateImage('I want pancakes');
  };
  useEffect(() => {
    Voice.onSpeechResults = async e => {
      const text = e.value?.[0]?.toLowerCase() || '';
      console.log(text);
      setRecognizedText(text);
      resetSilenceTimer();

      if (
        text.toLowerCase().includes('verbali') ||
        text.toLowerCase().includes('verbbali') ||
        text.toLowerCase().includes('verbally')
      ) {
        await Voice.stop();
        isListening.current = false;
        navigation.navigate('MainTab', {
          screen: views.HOME,
          params: {stateof: 'Attention'},
        });
      }
    };

    return () => {
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
      }
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startListening = async () => {
    if (!isListening.current) {
      isListening.current = true;
      try {
        await Voice.start('en-US');
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <LinearGradient colors={['#edeafd', '#f3f4fb']} style={{flex: 1}}>
      <View style={styles.container}>
        <Pressable style={styles.microphoneButton}>
          <FastImage
            source={require('../assets/microphone.png')}
            style={styles.microphoneImage}
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
              <Pressable style={styles.tileWrapper} onPress={startListening}>
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
              <Pressable style={styles.tileWrapper}>
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
      </View>
    </LinearGradient>
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
