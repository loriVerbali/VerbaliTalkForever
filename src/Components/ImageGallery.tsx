import React from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
import ImageCard from './ImageCard';
import { useAdmin } from '../contexts/adminContext';
import TTSService from '../utils/TTSService';
const { height, width } = Dimensions.get('window');

interface ImageGalleryProps {
  images: Array<{ url: { url: string }; prompt: string }>;
  imageWidth?: number;
  imageHeight?: number;
  onRefresh?: () => void;
  retryCount?: number;
  maxRetries?: number;
  onAnswerSelected?: (answer: string) => void;
  ttsService: typeof TTSService;
  answersCount?: number;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  onRefresh,
  retryCount = 0,
  maxRetries = 3,
  onAnswerSelected,
  ttsService,
  answersCount = 5,
}) => {
  const { isTablet } = useAdmin();

  // ----- Rigid layout and sizing: 2 rows for 5, 7, 11 -----
  const layout = (() => {
    if (answersCount <= 5) {
      return {
        imageWidth: isTablet ? width * 0.25 : width * 0.28,
        imageHeight: isTablet ? width * 0.20 : width * 0.22,
        rowSize: 3,
      };
    } else if (answersCount <= 7) {
      return {
        imageWidth: isTablet ? width * 0.18 : width * 0.20,
        imageHeight: isTablet ? width * 0.14 : width * 0.16,
        rowSize: 4,
      };
    } else {
      // 11 (3 rows of 4)
      return {
        imageWidth: isTablet ? width * 0.18 : width * 0.20,
        imageHeight: isTablet ? width * 0.14 : width * 0.16,
        rowSize: 4,
      };
    }
  })();

  const { imageWidth, imageHeight, rowSize } = layout;

  // Combine images and the "More" button into a single list before chunking
  const moreItem = {
    url: { url: 'more' },
    prompt: 'Get more answers',
    isMoreButton: true as const,
  };

  const allItems = [...images, moreItem];

  const rows: Array<
    Array<{
      url: { url: string };
      prompt: string;
      isMoreButton?: boolean;
      isSpacer?: boolean;
    }>
  > = [];

  for (let i = 0; i < allItems.length; i += rowSize) {
    const row = allItems.slice(i, i + rowSize);
    // Fill the row with spacers to maintain grid alignment (e.g. for justifyContent: 'space-evenly')
    while (row.length < rowSize) {
      row.push({ url: { url: 'spacer' }, prompt: '', isSpacer: true });
    }
    rows.push(row);
  }

  // Responsive spacing
  const rowMarginVertical = isTablet ? height * 0.015 : height * 0.008;
  const rowPaddingHorizontal = isTablet ? width * 0.03 : width * 0.01;
  const containerMinHeight = isTablet ? height * 0.4 : height * 0.35;
  const emptyContainerPadding = isTablet ? width * 0.06 : width * 0.05;
  const emptyTextFontSize = isTablet ? width * 0.045 : width * 0.04;

  // Check if images array is valid
  if (!images || images.length === 0) {
    return (
      <View style={[styles.emptyContainer, { padding: emptyContainerPadding }]}>
        <Text style={[styles.emptyText, { fontSize: emptyTextFontSize }]}>
          No images to display
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { minHeight: containerMinHeight }]}>
      {rows.map((rowImages, rowIndex) => (
        <View
          key={rowIndex}
          style={[
            styles.row,
            {
              marginVertical: rowMarginVertical,
              paddingHorizontal: rowPaddingHorizontal,
            },
          ]}>
          <ImageCard
            images={rowImages}
            width={imageWidth}
            height={imageHeight}
            onRefresh={onRefresh}
            retryCount={retryCount}
            maxRetries={maxRetries}
            onAnswerSelected={onAnswerSelected}
            ttsService={ttsService}
          />
        </View>
      ))}
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
