import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Image,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Config from '../utils/config';
import {useAppSettings} from '../utils/persistance';
import {useNavigation} from '@react-navigation/native';
import {views} from '../utils/constants';
import {useAdmin} from '../contexts/adminContext';
import TTSService from '../utils/TTSService';

// Add interface for error event
interface ImageErrorEvent {
  nativeEvent: {
    error: string;
  };
}

export interface ImageCardProps {
  images: Array<{url: {url: string}; prompt: string; isMoreButton?: boolean}>;
  width?: number;
  height?: number;
  onRefresh?: () => void;
  retryCount?: number;
  maxRetries?: number;
  onAnswerSelected?: (answer: string) => void;
  ttsService: typeof TTSService;
}
const {width} = Dimensions.get('window');

const ImageCard: React.FC<ImageCardProps> = ({
  images,
  width = 200,
  height = 200,
  onRefresh,
  retryCount = 0,
  maxRetries = 3,
  onAnswerSelected,
  ttsService,
}) => {
  const {preferences} = useAppSettings();
  const navigation = useNavigation();
  const {isTablet} = useAdmin();

  // Responsive values based on device type - now calculated from screen dimensions
  const responsiveValues = {
    // Container dimensions and spacing - calculated from screen dimensions
    containerMarginBottom: isTablet ? height * 0.02 : height * 0.01,
    containerMarginVertical: isTablet ? height * 0.012 : height * 0.006,
    containerBorderRadius: isTablet ? width * 0.045 : width * 0.04,

    // Image border radius - calculated from screen dimensions
    imageBorderRadius: isTablet ? width * 0.045 : width * 0.04,

    // Label container - calculated from screen dimensions
    labelPaddingVertical: isTablet ? height * 0.012 : height * 0.007,
    labelBorderRadius: isTablet ? width * 0.045 : width * 0.04,

    // Typography - calculated from screen dimensions
    labelFontSize: isTablet ? width * 0.048 : width * 0.045,
    questionMarkFontSize: isTablet ? width * 0.085 : width * 0.075,
    centralQuestionMarkFontSize: isTablet ? width * 0.17 : width * 0.15,

    // Shadow properties - calculated from screen dimensions
    shadowRadius: isTablet ? width * 0.015 : width * 0.012,
    shadowOffset: isTablet
      ? {width: 0, height: height * 0.012}
      : {width: 0, height: height * 0.01},
    elevation: isTablet ? 10 : 8,

    // Question mark positioning - calculated from screen dimensions
    questionMarkTop: isTablet ? height * 0.015 : height * 0.012,
    questionMarkLeft: isTablet ? width * 0.045 : width * 0.037,
  };

  const sayAnswer = (prompt: string) => {
    ttsService.speak(prompt, true);
  };

  const handleRefresh = () => {
    if (retryCount >= maxRetries) {
      // Navigate to shortcuts view when max retries reached
      ttsService.speak('Let me show you some shortcuts instead', true);
      navigation.navigate(views.SHORTCUTS as never);
    } else if (onRefresh) {
      // Provide audio feedback to the user
      ttsService.speak('Getting more answers for you', true);
      onRefresh();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {marginVertical: responsiveValues.containerMarginVertical},
      ]}>
      {images.map((image, index) => {
        // Handle the "More" button specially
        if (image.isMoreButton) {
          const isMaxRetries = retryCount >= maxRetries;
          return (
            <Pressable
              key={index}
              style={[
                styles.imageContainer,
                {
                  borderRadius: responsiveValues.containerBorderRadius,
                  shadowRadius: responsiveValues.shadowRadius,
                  shadowOffset: responsiveValues.shadowOffset,
                  elevation: responsiveValues.elevation,
                  marginBottom: responsiveValues.containerMarginBottom,
                },
              ]}
              onPress={() => {
                handleRefresh();
                // Log the "More Answers" selection
                onAnswerSelected?.('MoreAnswers');
              }}
              disabled={image.url.url === 'placeholder'}>
              <View style={{flexDirection: 'column', alignItems: 'center'}}>
                <FastImage
                  source={
                    isMaxRetries
                      ? require('../assets/shortCuts.png')
                      : require('../assets/cantfindIt.png')
                  }
                  style={[
                    {
                      width: width,
                      height: height,
                      backgroundColor: '#f0f0f0',
                    },
                    {
                      borderTopLeftRadius: responsiveValues.imageBorderRadius,
                      borderTopRightRadius: responsiveValues.imageBorderRadius,
                    },
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
              </View>
              <View
                style={[
                  styles.labelContainer,
                  {
                    paddingVertical: responsiveValues.labelPaddingVertical,
                    borderBottomLeftRadius: responsiveValues.labelBorderRadius,
                    borderBottomRightRadius: responsiveValues.labelBorderRadius,
                  },
                ]}>
                <Text
                  style={[
                    styles.label,
                    {fontSize: responsiveValues.labelFontSize},
                  ]}>
                  {isMaxRetries ? 'Try shortcuts' : 'Get more answers'}
                </Text>
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={index}
            style={[
              styles.imageContainer,
              {
                borderRadius: responsiveValues.containerBorderRadius,
                shadowRadius: responsiveValues.shadowRadius,
                shadowOffset: responsiveValues.shadowOffset,
                elevation: responsiveValues.elevation,
                marginBottom: responsiveValues.containerMarginBottom,
              },
            ]}
            onPress={() => {
              sayAnswer(image.prompt);
              // Call the callback to log the conversation
              onAnswerSelected?.(image.prompt);
            }}>
            <View style={{flexDirection: 'column', alignItems: 'center'}}>
              {/* Check if the URL is a placeholder */}
              {image.url.url === 'placeholder' ? (
                <>
                  <Image
                    source={require('../assets/welcome.png')}
                    style={[
                      {
                        width: width,
                        height: height,
                        backgroundColor: '#f0f0f0',
                      },
                      {
                        borderTopLeftRadius: responsiveValues.imageBorderRadius,
                        borderTopRightRadius:
                          responsiveValues.imageBorderRadius,
                      },
                    ]}
                    resizeMode="cover"
                  />
                </>
              ) : (
                <FastImage
                  source={{
                    uri: typeof image.url.url === 'string' ? image.url.url : '',
                  }}
                  style={[
                    {
                      width: width,
                      height: height,
                      backgroundColor: '#f0f0f0',
                    },
                    {
                      borderTopLeftRadius: responsiveValues.imageBorderRadius,
                      borderTopRightRadius: responsiveValues.imageBorderRadius,
                    },
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
              )}
            </View>
            <View
              style={[
                styles.labelContainer,
                {
                  paddingVertical: responsiveValues.labelPaddingVertical,
                  borderBottomLeftRadius: responsiveValues.labelBorderRadius,
                  borderBottomRightRadius: responsiveValues.labelBorderRadius,
                },
              ]}>
              {image.url.url !== 'placeholder' ? (
                <Text
                  style={[
                    styles.label,
                    {fontSize: responsiveValues.labelFontSize},
                  ]}>
                  {image.prompt}
                </Text>
              ) : (
                <View
                  style={{
                    position: 'relative',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                  <ActivityIndicator size="large" color="#0000ff" />
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    width: '100%',
  },
  imageContainer: {
    flexDirection: 'column',
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    backgroundColor: 'white',
  },
  labelContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  moreButton: {
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    display: 'flex',
    position: 'relative',
  },
  questionMark: {
    color: '#3A89FF',
    fontWeight: 'bold',
    position: 'absolute',
  },
  centralQuestionMark: {
    color: '#3A89FF',
    fontWeight: 'bold',
  },
  boyImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    color: '#333',
    textAlign: 'center',
    fontWeight: '600',
    width: '100%',
  },
  disabledContainer: {
    backgroundColor: '#f0f0f0',
  },
  disabledImage: {
    opacity: 0.5,
  },
  disabledLabelContainer: {
    backgroundColor: '#f0f0f0',
  },
  disabledLabel: {
    color: '#999',
  },
});

export default ImageCard;
