import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Image,
  Animated,
  ScrollView,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {useAdmin} from '../contexts/adminContext';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';

// Topic images
import beachImg from '../assets/topics/beach_topic_other.jpg';
import poolImg from '../assets/topics/pool_topic_other.jpg';
import parkImg from '../assets/topics/park_topic_other.jpg';
import playgroundImg from '../assets/topics/playground_topic_other.jpg';
import museumImg from '../assets/topics/museum_topic_other.jpg';
import backyardImg from '../assets/topics/backyard_topic_other.jpg';
import zooImg from '../assets/topics/zoo_topic_other.jpg';
import schoolImg from '../assets/topics/school_topic_other.jpg';
import libraryImg from '../assets/topics/library_topic_other.jpg';
import groceryStoreImg from '../assets/topics/grocery_store_topic_other.jpg';

import hideAndSeekImg from '../assets/topics/hide_and_seek_topic_other.jpg';
import dancingImg from '../assets/topics/dancing_topic_other.jpg';
import buildingImg from '../assets/topics/building_topic_other.jpg';
import ridesImg from '../assets/topics/rides_topic_other.jpg';
import fortImg from '../assets/topics/fort_topic_other.jpg';
import sandcastleImg from '../assets/topics/sandcastle_topic_other.jpg';
import toyImg from '../assets/topics/toy_topic_other.jpg';
import dinosaurImg from '../assets/topics/dinosaur_topic_other.jpg';
import trainImg from '../assets/topics/train_topic_other.jpg';
import airplanesImg from '../assets/topics/airplanes_topic_other.jpg';

import pancakesImg from '../assets/topics/pancakes_topic_other.jpg';
import iceCreamImg from '../assets/topics/ice_cream_topic_other.jpg';
import cookiesImg from '../assets/topics/cookies_topic_other.jpg';
import snackImg from '../assets/topics/snack_topic_other.jpg';
import popcornImg from '../assets/topics/popcorn_topic_other.jpg';
import hotChocolateImg from '../assets/topics/hot_chocolate_topic_other.jpg';
import lemonadeImg from '../assets/topics/lemonade_topic_other.jpg';
import dinnerImg from '../assets/topics/dinner_topic_other.jpg';

import rainImg from '../assets/topics/rain_topic_other.jpg';
import snowflakesImg from '../assets/topics/snowflakes_topic_other.jpg';
import snowmanImg from '../assets/topics/snowman_topic_other.jpg';
import puddlesImg from '../assets/topics/puddles_topic_other.jpg';
import windImg from '../assets/topics/wind_topic_other.jpg';
import cloudsImg from '../assets/topics/clouds_topic_other.jpg';
import sunImg from '../assets/topics/sun_topic_other.jpg';
import sunsetImg from '../assets/topics/sunset_topic_other.jpg';

import birthdayPartyImg from '../assets/topics/birthday_party_topic_other.jpg';
import weekendImg from '../assets/topics/weekend_topic_other.jpg';
import movieImg from '../assets/topics/movie_topic_other.jpg';
import partyImg from '../assets/topics/party_topic_other.jpg';

// Placeholder image for category headers
import welcomeImg from '../assets/welcome.png';
import placesImg from '../assets/topics/places_topiccats_other.jpg';
import extraFunImg from '../assets/topics/extra_fun_topiccats_other.jpg';
import foodTreatsImg from '../assets/topics/food_treats_topiccats_other.jpg';
import weatherNatureImg from '../assets/topics/weathe_nature_topiccats_other.jpg';
import eventsSpecialImg from '../assets/topics/event_special_topiccats_other.jpg';

const {width, height} = Dimensions.get('window');
const isLandscape = width > height;

// Top category data with placeholder images
const topCategories = [
  {
    label: 'Places',
    image: placesImg,
    backgroundColor: '#FFFFFF',
    description: 'Places to go and visit',
  },
  {
    label: 'Extra Fun',
    image: extraFunImg,
    backgroundColor: '#FFFFFF',
    description: 'Fun activities and games',
  },
  {
    label: 'Food & Treats',
    image: foodTreatsImg,
    backgroundColor: '#FFFFFF',
    description: 'Delicious food and drinks',
  },
  {
    label: 'Weather & Nature',
    image: weatherNatureImg,
    backgroundColor: '#FFFFFF',
    description: 'Weather and natural things',
  },
  {
    label: 'Events & Special',
    image: eventsSpecialImg,
    backgroundColor: '#FFFFFF',
    description: 'Special events and occasions',
  },
];

// Topic grid data organized by category
const places = [
  {label: 'Beach', image: beachImg, backgroundColor: '#FFFFFF'},
  {label: 'Pool', image: poolImg, backgroundColor: '#FFFFFF'},
  {label: 'Park', image: parkImg, backgroundColor: '#FFFFFF'},
  {label: 'Playground', image: playgroundImg, backgroundColor: '#FFFFFF'},
  {label: 'Museum', image: museumImg, backgroundColor: '#FFFFFF'},
  {label: 'Backyard', image: backyardImg, backgroundColor: '#FFFFFF'},
  {label: 'Zoo', image: zooImg, backgroundColor: '#FFFFFF'},
  {label: 'School', image: schoolImg, backgroundColor: '#FFFFFF'},
  {label: 'Library', image: libraryImg, backgroundColor: '#FFFFFF'},
  {label: 'Grocery store', image: groceryStoreImg, backgroundColor: '#FFFFFF'},
];

const extraFun = [
  {label: 'Hide and Seek', image: hideAndSeekImg, backgroundColor: '#FFFFFF'},
  {label: 'Dancing', image: dancingImg, backgroundColor: '#FFFFFF'},
  {label: 'Building', image: buildingImg, backgroundColor: '#FFFFFF'},
  {label: 'Rides', image: ridesImg, backgroundColor: '#FFFFFF'},
  {label: 'Fort', image: fortImg, backgroundColor: '#FFFFFF'},
  {label: 'Sandcastle', image: sandcastleImg, backgroundColor: '#FFFFFF'},
  {label: 'Toy', image: toyImg, backgroundColor: '#FFFFFF'},
  {label: 'Dinosaur', image: dinosaurImg, backgroundColor: '#FFFFFF'},
  {label: 'Train', image: trainImg, backgroundColor: '#FFFFFF'},
  {label: 'Airplanes', image: airplanesImg, backgroundColor: '#FFFFFF'},
];

const foodTreats = [
  {label: 'Pancakes', image: pancakesImg, backgroundColor: '#FFFFFF'},
  {label: 'Ice cream', image: iceCreamImg, backgroundColor: '#FFFFFF'},
  {label: 'Cookies', image: cookiesImg, backgroundColor: '#FFFFFF'},
  {label: 'Snack', image: snackImg, backgroundColor: '#FFFFFF'},
  {label: 'Popcorn', image: popcornImg, backgroundColor: '#FFFFFF'},
  {label: 'Hot chocolate', image: hotChocolateImg, backgroundColor: '#FFFFFF'},
  {label: 'Lemonade', image: lemonadeImg, backgroundColor: '#FFFFFF'},
  {label: 'Dinner', image: dinnerImg, backgroundColor: '#FFFFFF'},
];

const weatherNature = [
  {label: 'Rain', image: rainImg, backgroundColor: '#FFFFFF'},
  {label: 'Snowflakes', image: snowflakesImg, backgroundColor: '#FFFFFF'},
  {label: 'Snowman', image: snowmanImg, backgroundColor: '#FFFFFF'},
  {label: 'Puddles', image: puddlesImg, backgroundColor: '#FFFFFF'},
  {label: 'Wind', image: windImg, backgroundColor: '#FFFFFF'},
  {label: 'Clouds', image: cloudsImg, backgroundColor: '#FFFFFF'},
  {label: 'Sun', image: sunImg, backgroundColor: '#FFFFFF'},
  {label: 'Sunset', image: sunsetImg, backgroundColor: '#FFFFFF'},
];

const eventsSpecial = [
  {
    label: 'Birthday party',
    image: birthdayPartyImg,
    backgroundColor: '#FFFFFF',
  },
  {label: 'Weekend', image: weekendImg, backgroundColor: '#FFFFFF'},
  {label: 'Movie', image: movieImg, backgroundColor: '#FFFFFF'},
  {label: 'Party', image: partyImg, backgroundColor: '#FFFFFF'},
];

interface TopicData {
  label: string;
  image: any;
  backgroundColor: string;
}

interface TopicsProps {
  onSelectTopic: (topicData: TopicData) => void;
}

const Topics: React.FC<TopicsProps> = ({onSelectTopic}) => {
  const {isTablet} = useAdmin();

  type CategoryKey =
    | 'places'
    | 'extraFun'
    | 'foodTreats'
    | 'weatherNature'
    | 'eventsSpecial';
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>('places');

  // Define category order for swipe navigation
  const categoryOrder: CategoryKey[] = [
    'places',
    'extraFun',
    'foodTreats',
    'weatherNature',
    'eventsSpecial',
  ];

  // Use useRef to maintain animated values across renders
  const animatedValues = useRef({
    places: new Animated.Value(1), // Start at 1 for initial selected category
    extraFun: new Animated.Value(0),
    foodTreats: new Animated.Value(0),
    weatherNature: new Animated.Value(0),
    eventsSpecial: new Animated.Value(0),
  }).current;

  // Calculate proper sizing based on available space
  const gridPadding = 40; // Total horizontal padding (20px each side)
  const cardSpacing = 10; // Space between cards
  const cardsPerRow = isTablet ? 5 : isLandscape ? 5 : 3; // Fewer cards per row on phones to make them larger

  // Calculate card width based on modal content width and spacing
  const modalContentWidth = width * 0.9; // Matches modal container width in Convo
  const calculatedCardWidth = Math.floor(
    (modalContentWidth - gridPadding - cardSpacing * (cardsPerRow - 1)) /
      cardsPerRow,
  );

  const responsiveValues = {
    topRowHeight: isTablet ? height * 0.168 : height * 0.168, // +20%
    topItemWidth: isTablet ? width * 0.1 : width * 0.105,
    topItemHeight: isTablet ? height * 0.15 : height * 0.144, // +20%
    topRowGap: isTablet ? width * 0.012 : width * 0.01,
    scrollContentWidth: width,
    gridWidth: calculatedCardWidth, // Calculated based on actual modal space
    gridImageHeight: calculatedCardWidth * (isTablet ? 0.56 : 0.576), // -20%
    labelTopFontSize: isTablet ? width * 0.008 : width * 0.009,
    labelGridFontSize: isTablet ? 12 : 12,
    marginTop: isTablet ? height * 0.02 : height * 0.008,
    marginBottom: isTablet ? height * 0.02 : height * 0.01,
    gridItemMarginBottom: isTablet ? 15 : 10,
    gridLabelPadding: isTablet ? 5 : 4,
    borderRadius: isTablet ? 10 : 8,
    shadowRadius: isTablet ? 3 : 2,
    shadowOffset: isTablet ? {width: 0, height: 4} : {width: 0, height: 2},
    elevation: isTablet ? 4 : 3,
    rowGap: isTablet ? 15 : 12,
    cardSpacing: cardSpacing,
  };

  const handleCategoryPress = (categoryKey: CategoryKey) => {
    if (categoryKey !== selectedCategory) {
      // Create parallel animations
      Animated.parallel([
        // Animate previous selection down
        Animated.timing(animatedValues[selectedCategory], {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
        // Animate new selection up
        Animated.timing(animatedValues[categoryKey], {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();

      setSelectedCategory(categoryKey);
    }
  };

  const handleTopicPress = (topic: TopicData) => {
    onSelectTopic(topic);
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    const currentIndex = categoryOrder.indexOf(selectedCategory);
    let nextIndex;

    if (direction === 'left' && currentIndex < categoryOrder.length - 1) {
      nextIndex = currentIndex + 1;
    } else if (direction === 'right' && currentIndex > 0) {
      nextIndex = currentIndex - 1;
    } else {
      return; // No change needed
    }

    handleCategoryPress(categoryOrder[nextIndex]);
  };

  const onPanGestureEvent = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const {translationX, velocityX} = event.nativeEvent;

      // Determine swipe direction based on translation and velocity
      if (Math.abs(translationX) > 50 || Math.abs(velocityX) > 500) {
        if (translationX > 0 || velocityX > 0) {
          handleSwipe('right'); // Swipe right (previous category)
        } else {
          handleSwipe('left'); // Swipe left (next category)
        }
      }
    }
  };

  // Determine which topics to display based on selected category
  const getTopicsToDisplay = () => {
    switch (selectedCategory) {
      case 'places':
        return places;
      case 'extraFun':
        return extraFun;
      case 'foodTreats':
        return foodTreats;
      case 'weatherNature':
        return weatherNature;
      case 'eventsSpecial':
        return eventsSpecial;
      default:
        return places;
    }
  };

  // Get the topics to display
  const topicsToDisplay = getTopicsToDisplay();

  // Split topics into rows based on cardsPerRow
  const rows = [];
  for (let i = 0; i < topicsToDisplay.length; i += cardsPerRow) {
    rows.push(topicsToDisplay.slice(i, i + cardsPerRow));
  }

  // Calculate how many empty placeholders we need to add for the last row
  const lastRow = rows[rows.length - 1];
  const emptyPlaceholders =
    lastRow.length < cardsPerRow ? cardsPerRow - lastRow.length : 0;

  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={styles.screen}>
        <View
          style={[
            styles.scrollContent,
            {
              width: '100%',
              marginTop: responsiveValues.marginTop,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}>
          <View
            style={[
              styles.topRow,
              {
                height: responsiveValues.topRowHeight,
                marginBottom: responsiveValues.marginBottom,
                gap: responsiveValues.topRowGap,
              },
            ]}>
            {topCategories.map((category, index) => {
              const categoryKey = categoryOrder[index];
              return (
                <Animated.View
                  key={categoryKey}
                  style={[
                    styles.topItemWrapper,
                    {
                      width: responsiveValues.topItemWidth,
                      height: responsiveValues.topItemHeight,
                    },
                    {
                      transform: [
                        {
                          translateY: animatedValues[categoryKey].interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -7.5],
                          }),
                        },
                      ],
                    },
                  ]}>
                  <Pressable
                    onPress={() => handleCategoryPress(categoryKey)}
                    style={({pressed}) => [
                      styles.topItem,
                      {
                        borderRadius: responsiveValues.borderRadius,
                        shadowRadius: responsiveValues.shadowRadius,
                        shadowOffset: responsiveValues.shadowOffset,
                        elevation: responsiveValues.elevation,
                      },
                      selectedCategory === categoryKey &&
                        styles.topItemSelected,
                      pressed && styles.buttonPressed,
                    ]}>
                    <View
                      style={[
                        styles.topImageContainer,
                        {borderRadius: responsiveValues.borderRadius},
                      ]}>
                      <FastImage
                        source={category.image}
                        style={[
                          styles.imageTop,
                          {backgroundColor: category.backgroundColor},
                        ]}
                        resizeMode={
                          isTablet
                            ? FastImage.resizeMode.cover
                            : FastImage.resizeMode.contain
                        }
                      />
                      <Text
                        style={[
                          styles.labelTop,
                          {fontSize: responsiveValues.labelTopFontSize},
                        ]}>
                        {category.label}
                      </Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>

        {/* Grid Items - Topics with Gesture Handler */}
        <PanGestureHandler onHandlerStateChange={onPanGestureEvent}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: 30,
            }}
            style={{flex: 1, width: '100%'}}>
            <View
              style={[
                styles.gridContainer,
                {
                  width: '100%',
                  paddingHorizontal: 20,
                },
              ]}>
              {rows.map((row, rowIndex) => (
                <View
                  key={`row-${rowIndex}`}
                  style={[
                    styles.gridRow,
                    {
                      marginBottom: responsiveValues.rowGap,
                      justifyContent: 'center',
                    },
                  ]}>
                  {row.map((topic, colIndex) => (
                    <Pressable
                      key={`item-${rowIndex}-${colIndex}`}
                      style={({pressed}) => [
                        styles.gridItem,
                        {
                          width: responsiveValues.gridWidth,
                          borderRadius: responsiveValues.borderRadius,
                          shadowRadius: responsiveValues.shadowRadius,
                          shadowOffset: responsiveValues.shadowOffset,
                          elevation: responsiveValues.elevation,
                          marginRight:
                            colIndex < row.length - 1
                              ? responsiveValues.cardSpacing
                              : 0,
                        },
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => handleTopicPress(topic)}>
                      <View
                        style={[
                          styles.gridImageContainer,
                          {
                            backgroundColor: topic.backgroundColor,
                            height: responsiveValues.gridImageHeight,
                            borderTopLeftRadius: responsiveValues.borderRadius,
                            borderTopRightRadius: responsiveValues.borderRadius,
                          },
                        ]}>
                        <Image
                          source={topic.image}
                          style={styles.imageGrid}
                          resizeMode={isTablet ? 'cover' : 'contain'}
                        />
                      </View>
                      <View
                        style={[
                          styles.gridLabelContainer,
                          {
                            paddingVertical: responsiveValues.gridLabelPadding,
                            borderBottomLeftRadius:
                              responsiveValues.borderRadius,
                            borderBottomRightRadius:
                              responsiveValues.borderRadius,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.labelGrid,
                            {fontSize: responsiveValues.labelGridFontSize},
                          ]}>
                          {topic.label}
                        </Text>
                      </View>
                    </Pressable>
                  ))}

                  {/* Add empty placeholders to complete the last row */}
                  {rowIndex === rows.length - 1 &&
                    Array.from({length: emptyPlaceholders}).map((_, index) => (
                      <View
                        key={`empty-${index}`}
                        style={[
                          styles.gridItem,
                          styles.emptyItem,
                          {width: responsiveValues.gridWidth},
                        ]}
                      />
                    ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </PanGestureHandler>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
  },
  scrollContent: {
    alignContent: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    alignContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  topItemWrapper: {
    overflow: 'visible',
  },
  topItem: {
    width: '100%',
    height: '100%',
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    backgroundColor: '#6CAD50',
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
    overflow: 'hidden',
  },
  imageTop: {
    width: '80%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelTop: {
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
    paddingBottom: height * 0.03,
    paddingTop: height * 0.01,
  },
  gridContainer: {
    paddingBottom: 20,
  },
  gridRow: {
    flexDirection: 'row',
    width: '100%',
  },
  gridItem: {
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    backgroundColor: 'white',
  },
  gridImageContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  gridLabelContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  imageGrid: {
    width: '100%',
    height: '100%',
  },
  labelGrid: {
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{scale: 0.98}],
  },
  emptyItem: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
});

export default Topics;
