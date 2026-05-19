import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Pressable,
  Image,
  Animated,
  Platform,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import { useNavigation } from '@react-navigation/native';
import { views } from '../utils/constants';
import TTSService from '../utils/TTSService';
import AudioSessionManager from '../utils/AudioSessionManager';
import HomeButton from '../Components/HomeButton';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useConnection } from '../utils/connection';

const { width, height } = Dimensions.get('window');
//Good Feelings
import happyImg from '../assets/feelings/goodFeelings/happy.jpg';
import excitedImg from '../assets/feelings/goodFeelings/excited.jpg';
import lovedImg from '../assets/feelings/goodFeelings/loved.jpg';
import calmImg from '../assets/feelings/goodFeelings/calm.jpg';
import proudImg from '../assets/feelings/goodFeelings/proud.jpg';
import sillyImg from '../assets/feelings/goodFeelings/silly.jpg';
//Good Body
import comfortableImg from '../assets/feelings/goodBody/comfortable.jpg';
import relaxedImg from '../assets/feelings/goodBody/relaxed.jpg';
import okImg from '../assets/feelings/goodBody/ok.jpg';
import warmImg from '../assets/feelings/goodBody/warm.jpg';
import strongImg from '../assets/feelings/goodBody/strong.jpg';
import energeticImg from '../assets/feelings/goodBody/energetic.jpg';
//Bad Feelings
import sadImg from '../assets/feelings/badFeeling/sad.jpg';
import boredImg from '../assets/feelings/badFeeling/bored.jpg';
import scaredImg from '../assets/feelings/badFeeling/scared.jpg';
import worriedImg from '../assets/feelings/badFeeling/worried.jpg';
import embarrassedImg from '../assets/feelings/badFeeling/embarrassed.jpg';
import angryImg from '../assets/feelings/badFeeling/angry.jpg';
//Bad Body
import coldImg from '../assets/feelings/badBody/cold.jpg';
import hurtImg from '../assets/feelings/badBody/hurt.jpg';
import sickImg from '../assets/feelings/badBody/sick.jpg';
import tiredImg from '../assets/feelings/badBody/tired.jpg';
import dizzyImg from '../assets/feelings/badBody/dizzy.jpg';
import itchyImg from '../assets/feelings/badBody/itchy.jpg';

import mixpanel from '../utils/mixpanelInstance';
import { useAdmin } from '../contexts/adminContext';
// For simplicity, we'll use the same dog image for all feeling cards
// In a real app, you would have different images for each feeling
const dogImg = require('../assets/welcome.png'); // Replace with actual dog image
const micImg = require('../assets/microphone.png');
const badEmotionImg = require('../assets/feelings/badEmotional.jpg');
const goodEmotionImg = require('../assets/feelings/goodEmotional.jpg');
const badBodyImg = require('../assets/feelings/badPhysical.jpg');
const goodBodyImg = require('../assets/feelings/goodPhysical.jpg');
const matalkImg = require('../assets/matalk.png');

// Static data extracted outside component to prevent recreation on every render
const topCategories = [
  {
    label: 'My Body Feels Good',
    image: goodBodyImg,
    backgroundColor: '#6CAD50',
    description: 'Feeling healthy and strong',
  },
  {
    label: 'My Feelings Are Good',
    image: goodEmotionImg,
    backgroundColor: '#4FC3F7',
    description: 'Feeling happy and loved',
  },
  {
    label: 'My Feelings Are Bad',
    image: badEmotionImg,
    backgroundColor: '#FF9800',
    description: 'Feeling sad or upset',
  },
  {
    label: 'My Body Hurts',
    image: badBodyImg,
    backgroundColor: '#F44336',
    description: 'Feeling pain or discomfort',
  },
] as const;

// Feeling grid data - static arrays extracted outside component
const goodBody = [
  { label: 'Comfortable', image: comfortableImg, backgroundColor: '#FFFFFF' },
  { label: 'Relaxed', image: relaxedImg, backgroundColor: '#FFFFFF' },
  { label: "I'm OK", image: okImg, backgroundColor: '#FFFFFF' },
  { label: 'Warm', image: warmImg, backgroundColor: '#FFFFFF' },
  { label: 'Strong', image: strongImg, backgroundColor: '#FFFFFF' },
  { label: 'Energetic', image: energeticImg, backgroundColor: '#FFFFFF' },
] as const;

const goodFeelings = [
  { label: 'Happy', image: happyImg, backgroundColor: '#FFFFFF' },
  { label: 'Excited', image: excitedImg, backgroundColor: '#FFFFFF' },
  { label: 'Loved', image: lovedImg, backgroundColor: '#FFFFFF' },
  { label: 'Calm', image: calmImg, backgroundColor: '#FFFFFF' },
  { label: 'Proud', image: proudImg, backgroundColor: '#FFFFFF' },
  { label: 'Silly', image: sillyImg, backgroundColor: '#FFFFFF' },
] as const;

const badFeelings = [
  { label: 'Sad', image: sadImg, backgroundColor: '#FFFFFF' },
  { label: 'Bored', image: boredImg, backgroundColor: '#FFFFFF' },
  { label: 'Scared', image: scaredImg, backgroundColor: '#FFFFFF' },
  { label: 'Worried', image: worriedImg, backgroundColor: '#FFFFFF' },
  { label: 'Embarrassed', image: embarrassedImg, backgroundColor: '#FFFFFF' },
  { label: 'Angry', image: angryImg, backgroundColor: '#FFFFFF' },
] as const;

const badBody = [
  { label: 'Cold', image: coldImg, backgroundColor: '#FFFFFF' },
  { label: 'Hurt', image: hurtImg, backgroundColor: '#FFFFFF' },
  { label: 'Sick', image: sickImg, backgroundColor: '#FFFFFF' },
  { label: 'Tired', image: tiredImg, backgroundColor: '#FFFFFF' },
  { label: 'Dizzy', image: dizzyImg, backgroundColor: '#FFFFFF' },
  { label: 'Itchy', image: itchyImg, backgroundColor: '#FFFFFF' },
] as const;

// Static category mapping to prevent recreation
const FEELINGS_DATA = {
  goodBody,
  goodFeelings,
  badFeelings,
  badBody,
} as const;

// Responsive values are now handled within the component

const Feelings = () => {
  const navigation = useNavigation();
  const { isTablet } = useAdmin();
  const { isConnected } = useConnection();
  const [connectionState, setConnectionState] = useState(isConnected);
  const isDebouncing = useRef(false);
  type CategoryKey = 'goodBody' | 'goodFeelings' | 'badBody' | 'badFeelings';
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>('goodBody');

  // Define category order for swipe navigation (matches visual left-to-right order)
  const categoryOrder: CategoryKey[] = [
    'goodBody',
    'goodFeelings',
    'badBody',
    'badFeelings',
  ];

  // Use useRef to maintain animated values across renders
  const animatedValues = useRef({
    goodBody: new Animated.Value(1), // Start at 1 for initial selected category
    goodFeelings: new Animated.Value(0),
    badBody: new Animated.Value(0),
    badFeelings: new Animated.Value(0),
  }).current;

  // Memoize responsive values to prevent recalculation on every render
  const responsiveValues = useMemo(
    () => ({
      iconSize: isTablet ? { width: 60, height: 60 } : { width: 30, height: 30 },
      topRowHeight: isTablet ? height * 0.22 : height * 0.18,
      topItemWidth: isTablet ? width * 0.16 : width * 0.2,
      topRowGap: isTablet ? width * 0.03 : width * 0.02,
      scrollContentWidth: isTablet ? width * 0.8 : width * 0.9,
      gridWidth: isTablet ? (width - 20) / 4 : (width - 40) / 4, // Back to 4 columns
      gridImageHeight: isTablet ? height * 0.25 : height * 0.16, // Slight height increase
      labelTopFontSize: isTablet ? width * 0.014 : width * 0.014,
      labelGridFontSize: isTablet ? 16 : 14,
      marginTop: isTablet ? height * 0.02 : height * 0.01,
      marginBottom: isTablet ? height * 0.05 : height * 0.03,
      gridItemMarginBottom: isTablet ? 15 : 10,
      gridLabelPadding: isTablet ? 8 : 3, // Reduced padding on mobile to give more space to image
      borderRadius: isTablet ? 16 : 12,
      shadowRadius: isTablet ? 5 : 3,
      shadowOffset: isTablet ? { width: 0, height: 8 } : { width: 0, height: 4 },
      elevation: isTablet ? 8 : 5,
    }),
    [isTablet],
  );

  useEffect(() => {
    // Initialize TTS when component mounts
    mixpanel.track('Feelings', {
      Opened: 'Feelings',
    });
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

  const handleFeelingPress = async (feeling: string) => {
    if (isDebouncing.current) return;
    isDebouncing.current = true;
    setTimeout(() => {
      isDebouncing.current = false;
    }, 1000);

    // Prepare audio session for TTS to ensure consistent volume
    await AudioSessionManager.prepareForTTS();

    // Use TTSService to speak the feeling text
    TTSService.speak(feeling, true); // Use immediate=true to prioritize this speech
  };

  // Handle swipe gestures
  const handleSwipe = (direction: 'left' | 'right') => {
    const currentIndex = categoryOrder.indexOf(selectedCategory);
    let nextIndex;

    if (direction === 'right') {
      // Swipe right - go to next category
      nextIndex = (currentIndex + 1) % categoryOrder.length;
    } else {
      // Swipe left - go to previous category
      nextIndex =
        (currentIndex - 1 + categoryOrder.length) % categoryOrder.length;
    }

    const nextCategory = categoryOrder[nextIndex];

    // Track swipe event
    mixpanel.track('Feelings Swipe', {
      Direction: direction,
      FromCategory: selectedCategory,
      ToCategory: nextCategory,
    });

    handleCategoryPress(nextCategory);
  };

  const onPanGestureEvent = (event: any) => {
    const { translationX, velocityX, state } = event.nativeEvent;

    if (state === State.END) {
      // Determine swipe direction based on translation and velocity
      const threshold = 50; // Minimum distance for swipe
      const velocityThreshold = 500; // Minimum velocity for swipe

      if (
        Math.abs(translationX) > threshold ||
        Math.abs(velocityX) > velocityThreshold
      ) {
        if (translationX > 0 || velocityX > 0) {
          // Swiped right
          handleSwipe('right');
        } else {
          // Swiped left
          handleSwipe('left');
        }
      }
    }
  };

  // Memoize the feelings data to display based on selected category
  const feelingsToDisplay = useMemo(() => {
    return FEELINGS_DATA[selectedCategory] || FEELINGS_DATA.goodBody;
  }, [selectedCategory]);

  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={styles.screen}>
        {/* Microphone Button */}
        <View style={styles.micIcon}>
          <Image
            source={
              connectionState
                ? require('../assets/micstatic.png')
                : require('../assets/noMic.png')
            }
            style={responsiveValues.iconSize}
          />
        </View>

        <View style={styles.matalkIcon}>
          <Image source={matalkImg} style={responsiveValues.iconSize} />
        </View>

        {/* Home Button */}
        <HomeButton zIndex={5} navigation={navigation} />

        <View
          style={[
            styles.scrollContent,
            {
              width: responsiveValues.scrollContentWidth,
              marginTop: responsiveValues.marginTop,
            },
          ]}>
          <View
            style={[
              styles.topRow,
              {
                height: responsiveValues.topRowHeight,
                gap: responsiveValues.topRowGap,
                marginBottom: responsiveValues.marginBottom,
              },
            ]}>
            <Animated.View
              style={[
                styles.topItemWrapper,
                { width: responsiveValues.topItemWidth },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'goodBody' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <Image
                    source={topCategories[0].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[0].backgroundColor },
                    ]}
                    resizeMode={isTablet ? 'cover' : 'contain'}
                  />
                  <Text
                    style={[
                      styles.labelTop,
                      { fontSize: responsiveValues.labelTopFontSize },
                    ]}>
                    {topCategories[0].label}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            <Animated.View
              style={[
                styles.topItemWrapper,
                { width: responsiveValues.topItemWidth },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'goodFeelings' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <Image
                    source={topCategories[1].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[1].backgroundColor },
                    ]}
                    resizeMode={isTablet ? 'cover' : 'contain'}
                  />
                  <Text
                    style={[
                      styles.labelTop,
                      { fontSize: responsiveValues.labelTopFontSize },
                    ]}>
                    {topCategories[1].label}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            <Animated.View
              style={[
                styles.topItemWrapper,
                { width: responsiveValues.topItemWidth },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'badBody' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <Image
                    source={topCategories[3].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[3].backgroundColor },
                    ]}
                    resizeMode={isTablet ? 'cover' : 'contain'}
                  />
                  <Text
                    style={[
                      styles.labelTop,
                      { fontSize: responsiveValues.labelTopFontSize },
                    ]}>
                    {topCategories[3].label}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            <Animated.View
              style={[
                styles.topItemWrapper,
                { width: responsiveValues.topItemWidth },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'badFeelings' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <Image
                    source={topCategories[2].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[2].backgroundColor },
                    ]}
                    resizeMode={isTablet ? 'cover' : 'contain'}
                  />
                  <Text
                    style={[
                      styles.labelTop,
                      { fontSize: responsiveValues.labelTopFontSize },
                    ]}>
                    {topCategories[2].label}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        {/* Grid Items - Feelings with Gesture Handler */}
        <PanGestureHandler onHandlerStateChange={onPanGestureEvent}>
          <View style={styles.grid}>
            {feelingsToDisplay.map((feeling, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.gridItem,
                  {
                    width: responsiveValues.gridWidth,
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                    marginBottom: responsiveValues.gridItemMarginBottom,
                  },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => handleFeelingPress(feeling.label)}>
                <View
                  style={[
                    styles.gridImageContainer,
                    {
                      backgroundColor: feeling.backgroundColor,
                      height: responsiveValues.gridImageHeight,
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                    },
                  ]}>
                  <Image
                    source={feeling.image}
                    style={styles.imageGrid}
                    resizeMode="contain"
                  />
                </View>
                <View
                  style={[
                    styles.gridLabelContainer,
                    {
                      paddingVertical: responsiveValues.gridLabelPadding,
                      borderBottomLeftRadius: responsiveValues.borderRadius,
                      borderBottomRightRadius: responsiveValues.borderRadius,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.labelGrid,
                      { fontSize: responsiveValues.labelGridFontSize },
                    ]}>
                    {feeling.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
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
    justifyContent: 'center',
    width: width,
  },
  scrollContent: {
    // width and marginTop are now handled dynamically
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    // height, gap, and marginBottom are now handled dynamically
    width: '100%',
    alignContent: 'center',
  },
  topItemWrapper: {
    // width is now handled dynamically
    height: '100%',
    overflow: 'visible',
  },
  topItem: {
    width: '100%',
    height: '100%',
    // borderRadius, shadowRadius, shadowOffset, elevation are now handled dynamically
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    backgroundColor: '6CAD50',
  },
  topItemSelected: {
    shadowOpacity: 0.8,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 },
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
    // borderRadius is now handled dynamically
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
    // fontSize is now handled dynamically
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
    width: '80%', // Back to original width
  },
  gridItem: {
    // width, borderRadius, shadowRadius, shadowOffset, elevation, marginBottom are now handled dynamically
    overflow: 'visible',
    backgroundColor: 'white',
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: 'gray',
        shadowOpacity: 0.8,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  gridImageContainer: {
    width: '100%',
    // height, borderTopLeftRadius, borderTopRightRadius are now handled dynamically
    backgroundColor: '#FFFFFF',
  },
  gridLabelContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    // paddingVertical, borderBottomLeftRadius, borderBottomRightRadius are now handled dynamically
  },
  imageGrid: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  labelGrid: {
    fontWeight: 'bold',
    // fontSize is now handled dynamically
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
    position: 'absolute',
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  matalkIcon: {
    bottom: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.03,
    position: 'absolute',
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});

export default memo(Feelings);
