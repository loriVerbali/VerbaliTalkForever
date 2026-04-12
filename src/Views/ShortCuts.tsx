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
import { useAdmin } from '../contexts/adminContext';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useConnection } from '../utils/connection';

// General assets
import micImg from '../assets/microphone.png';
import boyImg from '../assets/boy.png';
import matalkImg from '../assets/matalk.png';
import dogImg from '../assets/welcome.png';

// Attention category images
import hiImg from '../assets/shortCuts/attention/hi.jpg';
import lookImg from '../assets/shortCuts/attention/look.jpg';
import listenImg from '../assets/shortCuts/attention/listen.jpg';
import myturnImg from '../assets/shortCuts/attention/myturn.jpg';
import questionImg from '../assets/shortCuts/attention/question.jpg';
import stopImg from '../assets/shortCuts/attention/stop.jpg';

// Want/Need category images
import eatImg from '../assets/shortCuts/wantNeed/eat.jpg';
import drinkImg from '../assets/shortCuts/wantNeed/drink.jpg';
import bathroomImg from '../assets/shortCuts/wantNeed/bathroom.jpg';
import sleepImg from '../assets/shortCuts/wantNeed/sleep.jpg';
import helpImg from '../assets/shortCuts/wantNeed/help.jpg';
import moreImg from '../assets/shortCuts/wantNeed/more.jpg';
import allDoneImg from '../assets/shortCuts/wantNeed/alldone.jpg';

// Fun category images
import playImg from '../assets/shortCuts/fun/play.jpg';
import outsideImg from '../assets/shortCuts/fun/outside.jpg';
import mineImg from '../assets/shortCuts/fun/mine.jpg';
import goImg from '../assets/shortCuts/fun/go.png';
import gameImg from '../assets/shortCuts/fun/game.jpg';
import bookImg from '../assets/shortCuts/fun/book.jpg';

// Positions category images
import upImg from '../assets/shortCuts/positions/up.jpg';
import downImg from '../assets/shortCuts/positions/down.jpg';
import inImg from '../assets/shortCuts/positions/in.jpg';
import outImg from '../assets/shortCuts/positions/out.jpg';
import onImg from '../assets/shortCuts/positions/on.jpg';
import underImg from '../assets/shortCuts/positions/under.jpg';

// Actions category images
import openImg from '../assets/shortCuts/actions/open.png';
import closeImg from '../assets/shortCuts/actions/close.png';
import turnOnImg from '../assets/shortCuts/actions/turnOn.png';
import turnOffImg from '../assets/shortCuts/actions/turnOff.png';
import giveImg from '../assets/shortCuts/actions/give.png';
import takeImg from '../assets/shortCuts/actions/take.png';
import mixpanel from '../utils/mixpanelInstance';

const { width, height } = Dimensions.get('window');
const attentionImg = require('../assets/shortCuts/attention.jpg');
const iWantNeedImg = require('../assets/shortCuts/IwantNeed.jpg');
const actionsImg = require('../assets/shortCuts/actions.jpg');
const funImg = require('../assets/shortCuts/fun.jpg');
const positionsImg = require('../assets/shortCuts/positions.jpg');

// Static data extracted outside component to prevent recreation on every render
const topCategories = [
  {
    label: 'Attention',
    image: attentionImg,
    backgroundColor: '#FFFFFF',
    description: 'Feeling healthy and strong',
  },
  {
    label: 'I want/need',
    image: iWantNeedImg,
    backgroundColor: '#FFFFFF',
    description: 'Feeling happy and loved',
  },
  {
    label: 'Actions',
    image: actionsImg,
    backgroundColor: '#FFFFFF',
    description: 'Feeling pain or discomfort',
  },
  {
    label: 'Fun',
    image: funImg,
    backgroundColor: '#FFFFFF',
    description: 'Feeling pain or discomfort',
  },
  {
    label: 'Positions',
    image: positionsImg,
    backgroundColor: '#FFFFFF',
    description: 'Feeling pain or discomfort',
  },
] as const;

// Shortcut grid data - static arrays extracted outside component
const attention = [
  { label: 'Hi', image: hiImg, backgroundColor: '#FFFFFF' },
  { label: 'Look', image: lookImg, backgroundColor: '#FFFFFF' },
  { label: 'Listen', image: listenImg, backgroundColor: '#FFFFFF' },
  { label: 'Come', image: myturnImg, backgroundColor: '#FFFFFF' },
  { label: 'My Turn', image: myturnImg, backgroundColor: '#FFFFFF' },
  { label: 'Stop', image: stopImg, backgroundColor: '#FFFFFF' },
  { label: 'I have a question', image: questionImg, backgroundColor: '#FFFFFF' },
] as const;

const iWantNeed = [
  { label: 'Eat', image: eatImg, backgroundColor: '#FFFFFF' },
  { label: 'Drink', image: drinkImg, backgroundColor: '#FFFFFF' },
  { label: 'Bathroom', image: bathroomImg, backgroundColor: '#FFFFFF' },
  { label: 'Sleep', image: sleepImg, backgroundColor: '#FFFFFF' },
  { label: 'Help', image: helpImg, backgroundColor: '#FFFFFF' },
  { label: 'More', image: moreImg, backgroundColor: '#FFFFFF' },
  { label: 'All done', image: allDoneImg, backgroundColor: '#FFFFFF' },
] as const;

const fun = [
  { label: 'Play', image: playImg, backgroundColor: '#FFFFFF' },
  { label: 'Outside', image: outsideImg, backgroundColor: '#FFFFFF' },
  { label: 'Mine', image: mineImg, backgroundColor: '#FFFFFF' },
  { label: 'Go', image: goImg, backgroundColor: '#FFFFFF' },
  { label: 'Game', image: gameImg, backgroundColor: '#FFFFFF' },
  { label: 'Book', image: bookImg, backgroundColor: '#FFFFFF' },
] as const;

const actions = [
  { label: 'Open', image: openImg, backgroundColor: '#FFFFFF' },
  { label: 'Close', image: closeImg, backgroundColor: '#FFFFFF' },
  { label: 'Turn On', image: turnOnImg, backgroundColor: '#FFFFFF' },
  { label: 'Turn Off', image: turnOffImg, backgroundColor: '#FFFFFF' },
  { label: 'Give', image: giveImg, backgroundColor: '#FFFFFF' },
  { label: 'Take', image: takeImg, backgroundColor: '#FFFFFF' },
] as const;

const positions = [
  { label: 'Up', image: upImg, backgroundColor: '#FFFFFF' },
  { label: 'Down', image: downImg, backgroundColor: '#FFFFFF' },
  { label: 'In', image: inImg, backgroundColor: '#FFFFFF' },
  { label: 'Out', image: outImg, backgroundColor: '#FFFFFF' },
  { label: 'On', image: onImg, backgroundColor: '#FFFFFF' },
  { label: 'Under', image: underImg, backgroundColor: '#FFFFFF' },
] as const;

// Static category mapping to prevent recreation
const SHORTCUTS_DATA = {
  attention,
  iWantNeed,
  fun,
  actions,
  positions,
} as const;

// Responsive values are now handled within the component

const ShortCuts = () => {
  const navigation = useNavigation();
  const { isTablet } = useAdmin();
  const { isConnected } = useConnection();
  const [connectionState, setConnectionState] = useState(isConnected);
  const isDebouncing = useRef(false);


  type CategoryKey =
    | 'attention'
    | 'iWantNeed'
    | 'actions'
    | 'fun'
    | 'positions';
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>('attention');

  // Define category order for swipe navigation (matches visual left-to-right order)
  const categoryOrder: CategoryKey[] = [
    'attention',
    'iWantNeed',
    'actions',
    'fun',
    'positions',
  ];

  // Use useRef to maintain animated values across renders
  const animatedValues = useRef({
    attention: new Animated.Value(1), // Start at 1 for initial selected category
    iWantNeed: new Animated.Value(0),
    actions: new Animated.Value(0),
    fun: new Animated.Value(0),
    positions: new Animated.Value(0),
  }).current;

  // Memoize responsive values to prevent recalculation on every render
  const responsiveValues = useMemo(
    () => ({
      iconSize: isTablet ? { width: 60, height: 60 } : { width: 40, height: 40 },
      topRowHeight: isTablet ? height * 0.22 : height * 0.22,
      topItemWidth: isTablet ? width * 0.11 : width * 0.15,
      topItemHeight: isTablet ? height * 0.22 * 0.8 : height * 0.22 * 0.8,
      topRowGap: isTablet ? width * 0.03 : width * 0.02,
      scrollContentWidth: isTablet ? width * 0.8 : width * 0.85,
      gridWidth: isTablet ? (width * 0.8) / 4 - 16 : (width * 0.85) / 4 - 15,
      gridImageHeight: isTablet ? height * 0.25 : height * 0.18,
      labelTopFontSize: isTablet ? width * 0.014 : width * 0.014,
      labelGridFontSize: isTablet ? 16 : 14,
      marginTop: isTablet ? height * 0.02 : height * 0.01,
      marginBottom: isTablet ? height * 0.01 : height * 0.005,
      gridItemMarginBottom: isTablet ? 15 : 10,
      gridLabelPadding: isTablet ? 8 : 6,
      borderRadius: isTablet ? 16 : 12,
      shadowRadius: isTablet ? 5 : 3,
      shadowOffset: isTablet ? { width: 0, height: 8 } : { width: 0, height: 4 },
      elevation: isTablet ? 8 : 5,
      rowGap: isTablet ? 20 : 10,
    }),
    [isTablet],
  );

  useEffect(() => {
    // Initialize TTS when component mounts
    mixpanel.track('Shortcuts', {
      Opened: 'Shortcuts',
    });
    TTSService.initialize();

    // Enforce speaker output on mount
    AudioSessionManager.prepareForTTS();

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
    mixpanel.track('Shortcuts Swipe', {
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

  // Memoize the shortcuts data to display based on selected category
  const feelingsToDisplay = useMemo(() => {
    return SHORTCUTS_DATA[selectedCategory] || SHORTCUTS_DATA.attention;
  }, [selectedCategory]);

  // Memoize rows calculation to prevent recalculation on every render
  const { rows, emptyPlaceholders } = useMemo(() => {
    const calculatedRows = [];
    for (let i = 0; i < feelingsToDisplay.length; i += 4) {
      calculatedRows.push(feelingsToDisplay.slice(i, i + 4));
    }

    const lastRow = calculatedRows[calculatedRows.length - 1];
    const placeholders = lastRow?.length < 4 ? 4 - lastRow.length : 0;

    return {
      rows: calculatedRows,
      emptyPlaceholders: placeholders,
    };
  }, [feelingsToDisplay]);

  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={styles.screen}>
        {/* Microphone Button */}
        <View style={styles.micIcon}>
          <FastImage
            source={
              connectionState
                ? require('../assets/micstatic.png')
                : require('../assets/noMic.png')
            }
            style={responsiveValues.iconSize}
          />
        </View>

        <View style={styles.matalkIcon}>
          <FastImage source={matalkImg} style={responsiveValues.iconSize} />
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
                {
                  width: responsiveValues.topItemWidth,
                  height: responsiveValues.topItemHeight,
                },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'attention' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <FastImage
                    source={topCategories[0].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[0].backgroundColor },
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
                {
                  width: responsiveValues.topItemWidth,
                  height: responsiveValues.topItemHeight,
                },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'iWantNeed' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <FastImage
                    source={topCategories[1].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[1].backgroundColor },
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
                {
                  width: responsiveValues.topItemWidth,
                  height: responsiveValues.topItemHeight,
                },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'actions' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <FastImage
                    source={topCategories[2].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[2].backgroundColor },
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
                      { fontSize: responsiveValues.labelTopFontSize },
                    ]}>
                    {topCategories[2].label}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            <Animated.View
              style={[
                styles.topItemWrapper,
                {
                  width: responsiveValues.topItemWidth,
                  height: responsiveValues.topItemHeight,
                },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'fun' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <FastImage
                    source={topCategories[3].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[3].backgroundColor },
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
                {
                  width: responsiveValues.topItemWidth,
                  height: responsiveValues.topItemHeight,
                },
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
                style={({ pressed }) => [
                  styles.topItem,
                  {
                    borderRadius: responsiveValues.borderRadius,
                    shadowRadius: responsiveValues.shadowRadius,
                    shadowOffset: responsiveValues.shadowOffset,
                    elevation: responsiveValues.elevation,
                  },
                  selectedCategory === 'positions' && styles.topItemSelected,
                  pressed && styles.buttonPressed,
                ]}>
                <View
                  style={[
                    styles.topImageContainer,
                    { borderRadius: responsiveValues.borderRadius },
                  ]}>
                  <FastImage
                    source={topCategories[4].image}
                    style={[
                      styles.imageTop,
                      { backgroundColor: topCategories[4].backgroundColor },
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
                      { fontSize: responsiveValues.labelTopFontSize },
                    ]}>
                    {topCategories[4].label}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        {/* Grid Items - Feelings with Gesture Handler */}
        <PanGestureHandler onHandlerStateChange={onPanGestureEvent}>
          <View
            style={[
              styles.grid,
              {
                width: isTablet ? '80%' : '85%',
                rowGap: responsiveValues.rowGap,
              },
            ]}>
            {rows.map((row, rowIndex) => (
              <React.Fragment key={`row-${rowIndex}`}>
                {row.map((feeling, colIndex) => (
                  <Pressable
                    key={`item-${rowIndex}-${colIndex}`}
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
                        resizeMode={isTablet ? 'cover' : 'contain'}
                      />
                    </View>
                    <View
                      style={[
                        styles.gridLabelContainer,
                        {
                          paddingVertical: responsiveValues.gridLabelPadding,
                          borderBottomLeftRadius: responsiveValues.borderRadius,
                          borderBottomRightRadius:
                            responsiveValues.borderRadius,
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

                {/* Add empty placeholders to complete the last row */}
                {rowIndex === rows.length - 1 &&
                  Array.from({ length: emptyPlaceholders }).map((_, index) => (
                    <View
                      key={`empty-${index}`}
                      style={[
                        styles.gridItem,
                        styles.emptyItem,
                        { width: responsiveValues.gridWidth },
                      ]}
                    />
                  ))}
              </React.Fragment>
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
    // width and height are now handled dynamically
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
    width: '80%',
    height: '80%',
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
    // width and rowGap are now handled dynamically
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
  emptyItem: {
    backgroundColor: 'transparent', // Make empty items invisible
    shadowOpacity: 0, // Remove shadow
    elevation: 0, // Remove elevation
  },
});

export default memo(ShortCuts);
