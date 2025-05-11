import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import TTSService from '../utils/TTSService';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {views} from '../utils/constants';
const {width, height} = Dimensions.get('window');

interface EmotionLevel {
  emotion: string;
  color: string;
  icon: string;
}

type RootStackParamList = {
  OPEN: undefined;
};

type NavigationProps = NativeStackNavigationProp<RootStackParamList>;

const leftEmotions: EmotionLevel[] = [
  {
    emotion: 'ANGRY',
    color: '#D32F2F',
    icon: '😠',
  },
  {
    emotion: 'FRUSTRATED',
    color: '#E65100',
    icon: '😤',
  },
  {
    emotion: 'SAD',
    color: '#0277BD',
    icon: '😢',
  },
  {
    emotion: 'WORRIED',
    color: '#F57F17',
    icon: '😟',
  },
  {
    emotion: 'BORED',
    color: '#6A1B9A',
    icon: '😑',
  },
];

const rightEmotions: EmotionLevel[] = [
  {emotion: 'FINE', color: '#2E7D32', icon: '😌'},
  {
    emotion: 'HAPPY',
    color: '#00695C',
    icon: '😊',
  },
  {
    emotion: 'EXCITED',
    color: '#E65100',
    icon: '🤩',
  },
  {
    emotion: 'IN PAIN',
    color: '#C62828',
    icon: '🤕',
  },
  {
    emotion: 'SICK',
    color: '#4E342E',
    icon: '🤒',
  },
];

const titleColors = [
  '#D32F2F',
  '#E65100',
  '#F57F17',
  '#0277BD',
  '#2E7D32',
  '#6A1B9A',
  '#00695C',
  '#E65100',
  '#C62828',
  '#4E342E',
  '#D32F2F',
  '#E65100',
  '#F57F17',
  '#0277BD',
  '#2E7D32',
  '#6A1B9A',
  '#00695C',
  '#E65100',
  '#C62828',
  '#4E342E',
];

const ColorfulTitle = ({text}: {text: string}) => {
  return (
    <View style={styles.titleContainer}>
      {text.split('').map((letter, index) => (
        <Text
          key={index}
          style={[
            styles.titleLetter,
            {color: titleColors[index % titleColors.length]},
          ]}>
          {letter}
        </Text>
      ))}
    </View>
  );
};

const FeelingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProps>();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleEmotionPress = (emotion: EmotionLevel) => {
    TTSService.speak(emotion.emotion, true);

    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        navigation.navigate(views.OPEN as never);
      });
    }, 700);
  };

  return (
    <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
      <Animated.View style={[styles.content, {opacity: fadeAnim}]}>
        <ColorfulTitle text="How are you feeling?" />
        <View style={styles.mainContainer}>
          <View style={styles.column}>
            {leftEmotions.map((emotion, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.emotionContainer,
                  {backgroundColor: emotion.color},
                ]}
                onPress={() => handleEmotionPress(emotion)}>
                <View style={styles.emotionContent}>
                  <Text style={styles.emotionIcon}>{emotion.icon}</Text>
                  <Text style={styles.emotionTitle}>{emotion.emotion}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.column}>
            {rightEmotions.map((emotion, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.emotionContainer,
                  {backgroundColor: emotion.color},
                ]}
                onPress={() => handleEmotionPress(emotion)}>
                <View style={styles.emotionContent}>
                  <Text style={styles.emotionIcon}>{emotion.icon}</Text>
                  <Text style={styles.emotionTitle}>{emotion.emotion}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
    height: height * 0.44,
  },
  column: {
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emotionContainer: {
    height: height * 0.13,
    width: width * 0.4,
    borderRadius: 20,
    marginVertical: 14,
    padding: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
  },
  emotionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionIcon: {
    fontSize: 64,
    marginBottom: 8,
  },
  emotionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 3,
    letterSpacing: 0.5,
  },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: height * 0.02,
    flexWrap: 'wrap',
  },
  titleLetter: {
    fontSize: 32,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
});

export default FeelingsScreen;
