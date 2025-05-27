import React from 'react';
import {View, StyleSheet, Text, Dimensions} from 'react-native';
import ImageCard from './ImageCard';

const {height} = Dimensions.get('window');

interface ImageGalleryProps {
  images: Array<{url: {url: string}; prompt: string}>;
  imageWidth?: number;
  imageHeight?: number;
  onRefresh?: () => void;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  imageWidth = 200,
  imageHeight = 200,
  onRefresh,
}) => {
  console.log('ImageGallery rendering with images:', JSON.stringify(images));

  // Check if images array is valid
  if (!images || images.length === 0) {
    console.log('No images to display in ImageGallery');
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No images to display</Text>
      </View>
    );
  }

  // Group images into chunks of 3 for display
  const imageGroups = [];
  for (let i = 0; i < images.length; i += 3) {
    imageGroups.push(images.slice(i, i + 3));
  }

  console.log(`Created ${imageGroups.length} image groups`);

  return (
    <View style={styles.container}>
      {imageGroups.map((group, index) => (
        <View key={index} style={styles.row}>
          <ImageCard
            images={group}
            width={imageWidth}
            height={imageHeight}
            onRefresh={onRefresh}
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 10,
    minHeight: height * 0.4,
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginVertical: 5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});

export default ImageGallery;
