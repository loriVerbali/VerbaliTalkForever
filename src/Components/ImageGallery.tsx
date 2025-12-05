import React from 'react';
import {View, StyleSheet, Text, Dimensions} from 'react-native';
import ImageCard from './ImageCard';
import {useAdmin} from '../contexts/adminContext';
import TTSService from '../utils/TTSService';
const {height, width} = Dimensions.get('window');

interface ImageGalleryProps {
  images: Array<{url: {url: string}; prompt: string}>;
  imageWidth?: number;
  imageHeight?: number;
  onRefresh?: () => void;
  retryCount?: number;
  maxRetries?: number;
  onAnswerSelected?: (answer: string) => void;
  ttsService: typeof TTSService;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  imageWidth = width * 0.1,
  imageHeight = width * 0.1,
  onRefresh,
  retryCount = 0,
  maxRetries = 3,
  onAnswerSelected,
  ttsService,
}) => {
  const {isTablet} = useAdmin();

  // Responsive values based on device type
  const responsiveValues = {
    // Container dimensions
    containerMinHeight: isTablet ? height * 0.4 : height * 0.35,

    // Row spacing - now calculated from screen dimensions
    rowMarginVertical: isTablet ? height * 0.015 : height * 0.008,
    rowPaddingHorizontal: isTablet ? width * 0.03 : width * 0.01,

    // Image dimensions
    imageWidth: isTablet ? width * 0.25 : width * 0.2,
    imageHeight: isTablet ? width * 0.2 : width * 0.14,

    // Typography - calculated from screen dimensions
    emptyTextFontSize: isTablet ? width * 0.045 : width * 0.04,

    // Spacing - calculated from screen dimensions
    emptyContainerPadding: isTablet ? width * 0.06 : width * 0.05,
  };

  // Check if images array is valid
  if (!images || images.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {padding: responsiveValues.emptyContainerPadding},
        ]}>
        <Text
          style={[
            styles.emptyText,
            {fontSize: responsiveValues.emptyTextFontSize},
          ]}>
          No images to display
        </Text>
      </View>
    );
  }

  // Create two rows: first row with 3 images, second row with 2 images + "More" button
  const firstRow = images.slice(0, 3);
  const secondRow = images.slice(3, 5);

  // Add a "More" item to complete the 3x2 grid
  const moreItem = {
    url: {url: 'more'},
    prompt: 'Get more answers',
    isMoreButton: true,
  };

  return (
    <View
      style={[
        styles.container,
        {minHeight: responsiveValues.containerMinHeight},
      ]}>
      {/* First row - 3 images */}
      <View
        style={[
          styles.row,
          {
            marginVertical: responsiveValues.rowMarginVertical,
            paddingHorizontal: responsiveValues.rowPaddingHorizontal,
          },
        ]}>
        <ImageCard
          images={firstRow}
          width={responsiveValues.imageWidth}
          height={responsiveValues.imageHeight}
          onRefresh={onRefresh}
          retryCount={retryCount}
          maxRetries={maxRetries}
          onAnswerSelected={onAnswerSelected}
          ttsService={ttsService}
        />
      </View>

      {/* Second row - 2 images + "More" button */}
      <View
        style={[
          styles.row,
          {
            marginVertical: responsiveValues.rowMarginVertical,
            paddingHorizontal: responsiveValues.rowPaddingHorizontal,
          },
        ]}>
        <ImageCard
          images={[...secondRow, moreItem]}
          width={responsiveValues.imageWidth}
          height={responsiveValues.imageHeight}
          onRefresh={onRefresh}
          retryCount={retryCount}
          maxRetries={maxRetries}
          onAnswerSelected={onAnswerSelected}
          ttsService={ttsService}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
});

export default ImageGallery;
