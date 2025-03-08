import React from 'react';
import {View, StyleSheet, ScrollView} from 'react-native';
import ImageCard from './ImageCard';

interface ImageGalleryProps {
  images: Array<{url: string}>;
  imageWidth?: number;
  imageHeight?: number;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  imageWidth = 200,
  imageHeight = 200,
}) => {
  // Group images into chunks of 3 for display
  const imageGroups = [];
  for (let i = 0; i < images.length; i += 3) {
    imageGroups.push(images.slice(i, i + 3));
  }
  return (
    <ScrollView style={styles.container}>
      {imageGroups.map((group, index) => (
        <View key={index} style={styles.row}>
          <ImageCard images={group} width={imageWidth} height={imageHeight} />
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});

export default ImageGallery;
