import React, { useState } from 'react';
import { View, StyleSheet, Text, useWindowDimensions } from 'react-native';
import ImageCard from './ImageCard';
import { useAdmin } from '../contexts/adminContext';
import TTSService from '../utils/TTSService';
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
  const { width, height } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(width * 0.95);
  const [containerHeight, setContainerHeight] = useState(height * 0.7);

  // 5 and 7 answers use two rows; 11 answers uses three rows. The extra
  // slot is the "Get more answers" card.
  const rowSize = answersCount <= 5 ? 3 : 4;
  const rowCount = Math.ceil((answersCount + 1) / rowSize);
  const rowPaddingHorizontal = isTablet ? 16 : 6;
  const cardGap = isTablet ? 14 : 8;
  const rowMarginVertical = isTablet ? height * 0.01 : height * 0.005;
  const labelHeightAllowance = isTablet ? 38 : 30;
  const imageWidth =
    (containerWidth -
      rowPaddingHorizontal * 2 -
      cardGap * (rowSize - 1)) /
    rowSize;
  const heightAvailablePerRow =
    containerHeight / rowCount -
    labelHeightAllowance -
    rowMarginVertical * 2;
  const imageHeight = Math.max(
    1,
    Math.min(imageWidth * 0.78, heightAvailablePerRow),
  );

  // Combine images and the "More" button into a single list before chunking
  const moreItem = {
    url: { url: 'more' },
    prompt: 'Get more answers',
    isMoreButton: true as const,
  };

  const allItems: Array<{
    url: { url: string };
    prompt: string;
    isMoreButton?: boolean;
    isSpacer?: boolean;
  }> = [...images, moreItem];

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
    <View
      style={styles.container}
      onLayout={event => {
        const { width: measuredWidth, height: measuredHeight } =
          event.nativeEvent.layout;
        if (Math.abs(measuredWidth - containerWidth) > 1) {
          setContainerWidth(measuredWidth);
        }
        if (Math.abs(measuredHeight - containerHeight) > 1) {
          setContainerHeight(measuredHeight);
        }
      }}>
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
