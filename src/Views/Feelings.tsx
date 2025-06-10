import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Pressable,
  Image,
  Animated,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {useNavigation} from '@react-navigation/native';
import {views} from '../utils/constants';
import TTSService from '../utils/TTSService';
import HomeButton from '../Components/HomeButton';

const {width, height} = Dimensions.get('window');
//Good Feelings
import happyImg from '../assets/feelings/goodFeelings/happy.png';
import excitedImg from '../assets/feelings/goodFeelings/excited.png';
import lovedImg from '../assets/feelings/goodFeelings/loved.png';
import calmImg from '../assets/feelings/goodFeelings/calm.png';
import proudImg from '../assets/feelings/goodFeelings/proud.png';
import sillyImg from '../assets/feelings/goodFeelings/silly.png';
//Good Body
import comfortableImg from '../assets/feelings/goodBody/comfortable.png';
import relaxedImg from '../assets/feelings/goodBody/relaxed.png';
import okImg from '../assets/feelings/goodBody/ok.png';
import warmImg from '../assets/feelings/goodBody/warm.png';
import strongImg from '../assets/feelings/goodBody/strong.png';
import energeticImg from '../assets/feelings/goodBody/energetic.png';

// For simplicity, we'll use the same dog image for all feeling cards
// In a real app, you would have different images for each feeling
const dogImg = require('../assets/welcome.png'); // Replace with actual dog image
const micImg = require('../assets/microphone.png');
const boyImg = require('../assets/boy.png');
const matalkImg = require('../assets/matalk.png');

// Top category data with emoji representations (since we don't have the actual images)
const topCategories = [
  {
    label: 'My Body Feels Good',
    image: boyImg,
    backgroundColor: '#6CAD50',
    description: 'Feeling healthy and strong',
  },
  {
    label: 'My Feelings Are Good',
    image: boyImg,
    backgroundColor: '#4FC3F7',
    description: 'Feeling happy and loved',
  },
  {
    label: 'My Feelings Are Bad',
    image: boyImg,
    backgroundColor: '#FF9800',
    description: 'Feeling sad or upset',
  },
  {
    label: 'My Body Hurts',
    image: boyImg,
    backgroundColor: '#F44336',
    description: 'Feeling pain or discomfort',
  },
];

// Feeling grid data - using the same image for all cards as placeholder
const goodBody = [
  {label: 'Comfortable', image: comfortableImg, backgroundColor: '#FFE4E1'},
  {label: 'Relaxed', image: relaxedImg, backgroundColor: '#FFE4E1'},
  {label: "I'm OK", image: okImg, backgroundColor: '#FFE4E1'},
  {label: 'Warm', image: warmImg, backgroundColor: '#FFE4E1'},
  {label: 'Strong', image: strongImg, backgroundColor: '#FFE4E1'},
  {label: 'Energetic', image: energeticImg, backgroundColor: '#FFE4E1'},
];

const goodFeelings = [
  {label: 'Happy', image: happyImg, backgroundColor: '#FFE4E1'},
  {label: 'Excited', image: excitedImg, backgroundColor: '#FFE4E1'},
  {label: 'Loved', image: lovedImg, backgroundColor: '#FFE4E1'},
  {label: 'Calm', image: calmImg, backgroundColor: '#FFE4E1'},
  {label: 'Proud', image: proudImg, backgroundColor: '#FFE4E1'},
  {label: 'Silly', image: sillyImg, backgroundColor: '#FFE4E1'},
];

const badFeelings = [
  {label: 'Sad', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Bored', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Scared', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Worried', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Embarrassed', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Angry', image: dogImg, backgroundColor: '#FFE4E1'},
];

const badBody = [
  {label: 'Cold', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Hurt', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Sick', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Tired', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Dizzy', image: dogImg, backgroundColor: '#FFE4E1'},
  {label: 'Itchy', image: dogImg, backgroundColor: '#FFE4E1'},
];

const GRID_WIDTH = (width - 20) / 4;
const GRID_IMAGE_HEIGHT = height * 0.25;

const Feelings = () => {
  const navigation = useNavigation();
  type CategoryKey = 'goodBody' | 'goodFeelings' | 'badBody' | 'badFeelings';
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>('goodBody');

  // Use useRef to maintain animated values across renders
  const animatedValues = useRef({
    goodBody: new Animated.Value(1), // Start at 1 for initial selected category
    goodFeelings: new Animated.Value(0),
    badBody: new Animated.Value(0),
    badFeelings: new Animated.Value(0),
  }).current;

  useEffect(() => {
    // Initialize TTS when component mounts
    TTSService.initialize();

    // Clean up TTS when component unmounts
    return () => {
      TTSService.stop();
    };
  }, []);

  const handleCategoryPress = (categoryKey: CategoryKey) => {
    if (categoryKey !== selectedCategory) {
      // Create parallel animations
      Animated.parallel([
        // Animate previous selection down
        Animated.timing(animatedValues[selectedCategory], {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        // Animate new selection up
        Animated.timing(animatedValues[categoryKey], {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setSelectedCategory(categoryKey);
    }
  };

  const handleFeelingPress = (feeling: string) => {
    // Use TTSService to speak the feeling text
    TTSService.speak(feeling, true); // Use immediate=true to prioritize this speech
  };

  // Determine which feeling cards to display based on selected category
  const getFeelingsToDisplay = () => {
    switch (selectedCategory) {
      case 'goodBody':
        return goodBody;
      case 'goodFeelings':
        return goodFeelings;
      case 'badFeelings':
        return badFeelings;
      case 'badBody':
        return badBody;
      default:
        return goodBody;
    }
  };

  return (
    <View style={styles.screen}>
      {/* Microphone Button */}
      <View style={styles.micIcon}>
        <FastImage source={micImg} style={styles.iconSize} />
      </View>

      <View style={styles.matalkIcon}>
        <FastImage source={matalkImg} style={styles.iconSize} />
      </View>

      {/* Home Button */}
      <HomeButton zIndex={5} navigation={navigation} />

      <View style={styles.scrollContent}>
        <View style={styles.topRow}>
          <Animated.View
            style={[
              styles.topItemWrapper,
              {
                transform: [
                  {
                    translateY: animatedValues.goodBody.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('goodBody')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'goodBody' && styles.topItemSelected,
                pressed && styles.buttonPressed,
              ]}>
              <View style={styles.topImageContainer}>
                <FastImage
                  source={topCategories[0].image}
                  style={[
                    styles.imageTop,
                    {backgroundColor: topCategories[0].backgroundColor},
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={styles.labelTop}>{topCategories[0].label}</Text>
              </View>
            </Pressable>
          </Animated.View>

          <Animated.View
            style={[
              styles.topItemWrapper,
              {
                transform: [
                  {
                    translateY: animatedValues.goodFeelings.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('goodFeelings')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'goodFeelings' && styles.topItemSelected,
                pressed && styles.buttonPressed,
              ]}>
              <View style={styles.topImageContainer}>
                <FastImage
                  source={topCategories[1].image}
                  style={[
                    styles.imageTop,
                    {backgroundColor: topCategories[1].backgroundColor},
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={styles.labelTop}>{topCategories[1].label}</Text>
              </View>
            </Pressable>
          </Animated.View>

          <Animated.View
            style={[
              styles.topItemWrapper,
              {
                transform: [
                  {
                    translateY: animatedValues.badBody.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('badBody')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'badBody' && styles.topItemSelected,
                pressed && styles.buttonPressed,
              ]}>
              <View style={styles.topImageContainer}>
                <FastImage
                  source={topCategories[2].image}
                  style={[
                    styles.imageTop,
                    {backgroundColor: topCategories[2].backgroundColor},
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={styles.labelTop}>{topCategories[2].label}</Text>
              </View>
            </Pressable>
          </Animated.View>

          <Animated.View
            style={[
              styles.topItemWrapper,
              {
                transform: [
                  {
                    translateY: animatedValues.badFeelings.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('badFeelings')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'badFeelings' && styles.topItemSelected,
                pressed && styles.buttonPressed,
              ]}>
              <View style={styles.topImageContainer}>
                <FastImage
                  source={topCategories[3].image}
                  style={[
                    styles.imageTop,
                    {backgroundColor: topCategories[3].backgroundColor},
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={styles.labelTop}>{topCategories[3].label}</Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* Grid Items - Feelings */}
      <View style={styles.grid}>
        {getFeelingsToDisplay().map((feeling, i) => (
          <Pressable
            key={i}
            style={({pressed}) => [
              styles.gridItem,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => handleFeelingPress(feeling.label)}>
            <View
              style={[
                styles.gridImageContainer,
                {backgroundColor: feeling.backgroundColor},
              ]}>
              <Image
                source={feeling.image}
                style={styles.imageGrid}
                resizeMode="cover"
              />
            </View>
            <View style={styles.gridLabelContainer}>
              <Text style={styles.labelGrid}>{feeling.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
    width: width,
  },
  scrollContent: {
    width: width * 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.02,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    height: height * 0.22,
    width: '100%',
    gap: width * 0.03,
    alignContent: 'center',
    marginBottom: height * 0.05,
  },
  topItemWrapper: {
    width: width * 0.16,
    height: '100%',
    overflow: 'visible',
  },
  topItem: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
    backgroundColor: '6CAD50',
  },
  topItemSelected: {
    shadowOpacity: 0.8,
    shadowRadius: 15,
    shadowOffset: {width: 0, height: 12},
    elevation: 16,
    borderWidth: 2,
    borderColor: '#146CF0',
  },
  topImageContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
  },
  emojiIcon: {
    fontSize: 50,
  },
  topLabelContainer: {
    backgroundColor: 'white',
    width: '100%',
    borderBottomEndRadius: 16,
    borderBottomStartRadius: 16,
  },
  topImageContainerSelected: {
    borderTopWidth: 2,
    borderTopColor: '#146CF0',
    borderLeftWidth: 2,
    borderLeftColor: '#146CF0',
    borderRightWidth: 2,
    borderRightColor: '#146CF0',
  },
  topLabelContainerSelected: {
    borderLeftWidth: 2,
    borderLeftColor: '#146CF0',
    borderRightWidth: 2,
    borderRightColor: '#146CF0',
    borderBottomWidth: 2,
    borderBottomColor: '#146CF0',
  },
  imageTop: {
    width: '100%',
    height: '90%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelTop: {
    fontWeight: 'bold',
    fontSize: width * 0.014,
    textAlign: 'center',
    color: '#000',
    paddingBottom: height * 0.03,
    paddingTop: height * 0.01,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    width: '80%',
  },
  gridItem: {
    width: GRID_WIDTH,
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
    height: GRID_IMAGE_HEIGHT,
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
  imageGrid: {
    width: '100%',
    height: '100%',
  },
  labelGrid: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
  },
  iconSize: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
  },
  micIcon: {
    top: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.03,
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
  },
  matalkIcon: {
    bottom: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.03,
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{scale: 0.98}],
  },
});

export default Feelings;
