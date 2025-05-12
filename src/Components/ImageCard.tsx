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
import Tts from 'react-native-tts';
import {useAppSettings} from '../utils/persistance';

export interface ImageCardProps {
  images: Array<{url: {url: string}; prompt: string}>;
  width?: number;
  height?: number;
  onRefresh?: () => void;
}
const {width} = Dimensions.get('window');

const ImageCard: React.FC<ImageCardProps> = ({
  images,
  width = 200,
  height = 200,
  onRefresh,
}) => {
  const {preferences} = useAppSettings();
  const sayAnswer = (prompt: string) => {
    Tts.speak(prompt, {
      iosVoiceId: 'com.apple.voice.compact.en-US.Samantha',
      rate: 0.46,
      androidParams: {
        KEY_PARAM_PAN: 0,
        KEY_PARAM_VOLUME: 1,
        KEY_PARAM_STREAM: 'STREAM_MUSIC',
      },
    });
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      console.log('Refreshing content...');
    }
  };

  // Create a 6th card for refresh if we're at the end of a set
  const shouldShowRefreshCard =
    images.length === parseInt(preferences.returnedMessages) / 5;

  return (
    <View style={styles.container}>
      {images.map((image, index) => {
        return (
          <Pressable
            key={index}
            style={styles.imageContainer}
            onPress={() => {
              sayAnswer(image.prompt);
            }}>
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
              <Text style={styles.label}>{image.prompt}</Text>
            </View>
          </Pressable>
        );
      })}

      {shouldShowRefreshCard && (
        <Pressable style={styles.imageContainer} onPress={handleRefresh}>
          <View style={{flexDirection: 'column', alignItems: 'center'}}>
            <Image
              source={require('../assets/refresh.png')}
              style={[styles.image, {width: 200, height: 200}]}
              resizeMode="contain"
            />
            <Text style={styles.label}>More</Text>
          </View>
        </Pressable>
      )}
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
    flexDirection: 'row',
    margin: width * 0.03,
  },
  image: {
    borderRadius: 8,
    backgroundColor: '#f0f0f0', // Light gray background while loading
  },
  label: {
    marginTop: 15,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default ImageCard;
