import React from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import FastImage from 'react-native-fast-image';
import Config from '../utils/config';

export interface ImageCardProps {
  images: Array<{url: {url: string}; prompt: string}>;
  width?: number;
  height?: number;
}

const ImageCard: React.FC<ImageCardProps> = ({
  images,
  width = 200,
  height = 200,
}) => {
  debugger;

  return (
    <View style={styles.container}>
      {images.map((image, index) => {
        return (
          <View key={index} style={styles.imageContainer}>
            <View style={{flexDirection: 'column', alignItems: 'center'}}>
              {Config.picGeneration === 'Gemini' ? (
                <FastImage
                  source={{uri: image.url.url}}
                  style={[styles.image, {width, height}]}
                  resizeMode={FastImage.resizeMode.cover}
                  onLoadStart={() => (
                    <ActivityIndicator size="small" color="#0000ff" />
                  )}
                />
              ) : (
                <FastImage
                  source={{uri: image.url.url}}
                  style={[styles.image, {width, height}]}
                  resizeMode={FastImage.resizeMode.cover}
                  onLoadStart={() => (
                    <ActivityIndicator size="small" color="#0000ff" />
                  )}
                />
              )}
              <Text style={{fontWeight: '600'}}>{image.prompt}</Text>
            </View>
          </View>
        );
      })}
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
    backgroundColor: '#f0f0f0', // Light gray background while loading
  },
  label: {
    marginTop: 8,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
});

export default ImageCard;
