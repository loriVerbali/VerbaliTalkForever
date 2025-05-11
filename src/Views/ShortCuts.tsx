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
    emotion: 'FINE',
    color: '#2E7D32',
    icon: '😌',
  },
];

const middleEmotions: EmotionLevel[] = [
  {
    emotion: 'BORED',
    color: '#6A1B9A',
    icon: '😑',
  },
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
    emotion: 'TIRED',
    color: '#455A64',
    icon: '😴',
  },
];

const rightEmotions: EmotionLevel[] = [
  {
    emotion: 'HUNGRY',
    color: '#F9A825',
    icon: '😋',
  },
  {
    emotion: 'THIRSTY',
    color: '#0288D1',
    icon: '🥤',
  },
  {
    emotion: 'SICK',
    color: '#4E342E',
    icon: '🤒',
  },
  {
    emotion: 'IN PAIN',
    color: '#C62828',
    icon: '🤕',
  },
];

const titleColors = [
  '#D32F2F', // S
  '#E65100', // h
  '#F57F17', // o
  '#0277BD', // r
  '#2E7D32', // t
  '#6A1B9A', // C
  '#00695C', // u
  '#E65100', // t
  '#C62828', // s
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

const ShortCutsScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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

  const renderEmotionColumn = (emotions: EmotionLevel[]) => (
    <View style={styles.column}>
      {emotions.map((emotion, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.emotionContainer, {backgroundColor: emotion.color}]}
          onPress={() => handleEmotionPress(emotion)}>
          <View style={styles.emotionContent}>
            <Text style={styles.emotionIcon}>{emotion.icon}</Text>
            <Text style={styles.emotionTitle}>{emotion.emotion}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
      <Animated.View style={[styles.content, {opacity: fadeAnim}]}>
        <ColorfulTitle text="ShortCuts" />
        <View style={styles.mainContainer}>
          {renderEmotionColumn(leftEmotions)}
          {renderEmotionColumn(middleEmotions)}
          {renderEmotionColumn(rightEmotions)}
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
    paddingHorizontal: 4,
    height: height * 0.44,
  },
  column: {
    flex: 1,
    marginHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emotionContainer: {
    height: height * 0.11,
    width: width * 0.3,
    borderRadius: 15,
    marginVertical: 8,
    padding: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  emotionIcon: {
    fontSize: 32,
    marginRight: 8,
  },
  emotionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.95)',
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

export default ShortCutsScreen;
