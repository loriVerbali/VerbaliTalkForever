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

// General assets
import micImg from '../assets/microphone.png';
import boyImg from '../assets/boy.png';
import matalkImg from '../assets/matalk.png';
import dogImg from '../assets/welcome.png';

// Attention category images
import hiImg from '../assets/shortCuts/attention/hi.png';
import lookImg from '../assets/shortCuts/attention/look.png';
import listenImg from '../assets/shortCuts/attention/listen.png';
import myturnImg from '../assets/shortCuts/attention/myturn.png';
import questionImg from '../assets/shortCuts/attention/question.png';
import stopImg from '../assets/shortCuts/attention/Stop.png';

// Want/Need category images
import eatImg from '../assets/shortCuts/wantNeed/eat.png';
import drinkImg from '../assets/shortCuts/wantNeed/drink.png';
import bathroomImg from '../assets/shortCuts/wantNeed/bathroom.png';
import sleepImg from '../assets/shortCuts/wantNeed/sleep.png';
import helpImg from '../assets/shortCuts/wantNeed/help.png';
import moreImg from '../assets/shortCuts/wantNeed/more.png';
import allDoneImg from '../assets/shortCuts/wantNeed/alldone.png';

// Fun category images
import playImg from '../assets/shortCuts/fun/play.png';
import outsideImg from '../assets/shortCuts/fun/outside.png';
import mineImg from '../assets/shortCuts/fun/mine.png';
import goImg from '../assets/shortCuts/fun/go.png';
import gameImg from '../assets/shortCuts/fun/game.png';
import bookImg from '../assets/shortCuts/fun/book.png';

// Positions category images
import upImg from '../assets/shortCuts/positions/up.png';
import downImg from '../assets/shortCuts/positions/down.png';
import inImg from '../assets/shortCuts/positions/in.png';
import outImg from '../assets/shortCuts/positions/out.png';
import onImg from '../assets/shortCuts/positions/on.png';
import underImg from '../assets/shortCuts/positions/under.png';

// Actions category images
import openImg from '../assets/shortCuts/actions/open.png';
import closeImg from '../assets/shortCuts/actions/close.png';
import turnOnImg from '../assets/shortCuts/actions/turnOn.png';
import turnOffImg from '../assets/shortCuts/actions/turnOff.png';
import giveImg from '../assets/shortCuts/actions/give.png';
import takeImg from '../assets/shortCuts/actions/take.png';

const {width, height} = Dimensions.get('window');

// Top category data with emoji representations (since we don't have the actual images)
const topCategories = [
  {
    label: 'Attention',
    image: boyImg,
    backgroundColor: '#6CAD50',
    description: 'Feeling healthy and strong',
  },
  {
    label: 'I want/need',
    image: boyImg,
    backgroundColor: '#4FC3F7',
    description: 'Feeling happy and loved',
  },
  {
    label: 'Actions',
    image: boyImg,
    backgroundColor: '#F44336',
    description: 'Feeling pain or discomfort',
  },
  {
    label: 'Fun',
    image: boyImg,
    backgroundColor: '#F44336',
    description: 'Feeling pain or discomfort',
  },
  {
    label: 'Positions',
    image: boyImg,
    backgroundColor: '#F44336',
    description: 'Feeling pain or discomfort',
  },
];

// Feeling grid data - using the same image for all cards as placeholder
const attention = [
  {label: 'Hi', image: hiImg, backgroundColor: '#FFE4E1'},
  {label: 'Look', image: lookImg, backgroundColor: '#FFE4E1'},
  {label: 'Listen', image: listenImg, backgroundColor: '#FFE4E1'},
  {label: 'Come', image: myturnImg, backgroundColor: '#FFE4E1'},
  {label: 'My Turn', image: myturnImg, backgroundColor: '#FFE4E1'},
  {label: 'Stop', image: stopImg, backgroundColor: '#FFE4E1'},
  {label: 'I have a question', image: questionImg, backgroundColor: '#FFE4E1'},
];

const iWantNeed = [
  {label: 'Eat', image: eatImg, backgroundColor: '#FFE4E1'},
  {label: 'Drink', image: drinkImg, backgroundColor: '#FFE4E1'},
  {label: 'Bathroom', image: bathroomImg, backgroundColor: '#FFE4E1'},
  {label: 'Sleep', image: sleepImg, backgroundColor: '#FFE4E1'},
  {label: 'Help', image: helpImg, backgroundColor: '#FFE4E1'},
  {label: 'More', image: moreImg, backgroundColor: '#FFE4E1'},
  {label: 'All done', image: allDoneImg, backgroundColor: '#FFE4E1'},
];

const fun = [
  {label: 'Play', image: playImg, backgroundColor: '#FFE4E1'},
  {label: 'Outside', image: outsideImg, backgroundColor: '#FFE4E1'},
  {label: 'Mine', image: mineImg, backgroundColor: '#FFE4E1'},
  {label: 'Go', image: goImg, backgroundColor: '#FFE4E1'},
  {label: 'Game', image: gameImg, backgroundColor: '#FFE4E1'},
  {label: 'Book', image: bookImg, backgroundColor: '#FFE4E1'},
];

const actions = [
  {label: 'Open', image: openImg, backgroundColor: '#FFE4E1'},
  {label: 'Close', image: closeImg, backgroundColor: '#FFE4E1'},
  {label: 'Turn On', image: turnOnImg, backgroundColor: '#FFE4E1'},
  {label: 'Turn Off', image: turnOffImg, backgroundColor: '#FFE4E1'},
  {label: 'Give', image: giveImg, backgroundColor: '#FFE4E1'},
  {label: 'Take', image: takeImg, backgroundColor: '#FFE4E1'},
];

const positions = [
  {label: 'Up', image: upImg, backgroundColor: '#FFE4E1'},
  {label: 'Down', image: downImg, backgroundColor: '#FFE4E1'},
  {label: 'In', image: inImg, backgroundColor: '#FFE4E1'},
  {label: 'Out', image: outImg, backgroundColor: '#FFE4E1'},
  {label: 'On', image: onImg, backgroundColor: '#FFE4E1'},
  {label: 'Under', image: underImg, backgroundColor: '#FFE4E1'},
];

// Update the GRID_WIDTH constant to accommodate exactly 4 items per row
const GRID_WIDTH = (width * 0.8) / 4 - 16; // Explicitly calculate width for 4 items with margins
const GRID_IMAGE_HEIGHT = height * 0.2;

const ShortCuts = () => {
  const navigation = useNavigation();
  type CategoryKey =
    | 'attention'
    | 'iWantNeed'
    | 'actions'
    | 'fun'
    | 'positions';
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>('attention');

  // Use useRef to maintain animated values across renders
  const animatedValues = useRef({
    attention: new Animated.Value(1), // Start at 1 for initial selected category
    iWantNeed: new Animated.Value(0),
    actions: new Animated.Value(0),
    fun: new Animated.Value(0),
    positions: new Animated.Value(0),
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
      case 'attention':
        return attention;
      case 'iWantNeed':
        return iWantNeed;
      case 'fun':
        return fun;
      case 'actions':
        return actions;
      case 'positions':
        return positions;
      default:
        return attention;
    }
  };

  // Get the feelings to display
  const feelingsToDisplay = getFeelingsToDisplay();

  // Split feelings into rows of 4
  const rows = [];
  for (let i = 0; i < feelingsToDisplay.length; i += 4) {
    rows.push(feelingsToDisplay.slice(i, i + 4));
  }

  // Calculate how many empty placeholders we need to add for the last row
  const lastRow = rows[rows.length - 1];
  const emptyPlaceholders = lastRow.length < 4 ? 4 - lastRow.length : 0;

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
                    translateY: animatedValues.attention.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('attention')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'attention' && styles.topItemSelected,
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
                    translateY: animatedValues.iWantNeed.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('iWantNeed')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'iWantNeed' && styles.topItemSelected,
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
                    translateY: animatedValues.actions.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('actions')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'actions' && styles.topItemSelected,
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
                    translateY: animatedValues.fun.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('fun')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'fun' && styles.topItemSelected,
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
          <Animated.View
            style={[
              styles.topItemWrapper,
              {
                transform: [
                  {
                    translateY: animatedValues.positions.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -15],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              onPress={() => handleCategoryPress('positions')}
              style={({pressed}) => [
                styles.topItem,
                selectedCategory === 'positions' && styles.topItemSelected,
                pressed && styles.buttonPressed,
              ]}>
              <View style={styles.topImageContainer}>
                <FastImage
                  source={topCategories[4].image}
                  style={[
                    styles.imageTop,
                    {backgroundColor: topCategories[4].backgroundColor},
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={styles.labelTop}>{topCategories[4].label}</Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* Grid Items - Feelings */}
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <React.Fragment key={`row-${rowIndex}`}>
            {row.map((feeling, colIndex) => (
              <Pressable
                key={`item-${rowIndex}-${colIndex}`}
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

            {/* Add empty placeholders to complete the last row */}
            {rowIndex === rows.length - 1 &&
              Array.from({length: emptyPlaceholders}).map((_, index) => (
                <View
                  key={`empty-${index}`}
                  style={[styles.gridItem, styles.emptyItem]}
                />
              ))}
          </React.Fragment>
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
    marginBottom: height * 0.01,
  },
  topItemWrapper: {
    width: width * 0.11,
    height: '80%',
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
    width: '80%', // Set to exactly 80% of screen width
    rowGap: 20,
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
  emptyItem: {
    backgroundColor: 'transparent', // Make empty items invisible
    shadowOpacity: 0, // Remove shadow
    elevation: 0, // Remove elevation
  },
});

export default ShortCuts;
