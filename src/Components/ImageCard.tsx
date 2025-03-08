import React from 'react';
import {View, Image, Text, StyleSheet} from 'react-native';

export interface ImageCardProps {
  images: Array<{url: string}>;
  width?: number;
  height?: number;
}

const ImageCard: React.FC<ImageCardProps> = ({
  images,
  width = 200,
  height = 200,
}) => {
  return (
    <View style={styles.container}>
      {images.map((image, index) => (
        <View key={index} style={styles.imageContainer}>
          <Image
            source={require('../assets/welcome.png')}
            style={[styles.image, {width, height}]}
            resizeMode="cover"
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
  },
  imageContainer: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  image: {
    borderRadius: 8,
  },
  label: {
    marginTop: 8,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
});

export default ImageCard;
