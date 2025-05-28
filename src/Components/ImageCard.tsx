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

  return (
    <View style={styles.container}>
      {images.map((image, index) => {
        // Handle the "More" button specially
        if (image.isMoreButton) {
          return (
            <Pressable
              key={index}
              style={styles.imageContainer}
              onPress={handleRefresh}
              disabled={image.url.url === 'placeholder'}>
              <View style={{flexDirection: 'column', alignItems: 'center'}}>
                <FastImage
                  source={require('../assets/cantfindIt.png')}
                  style={[
                    styles.image,
                    {borderTopLeftRadius: 16, borderTopRightRadius: 16},
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
              </View>
              <View style={styles.labelContainer}>
                <Text style={styles.label}>Cant find it</Text>
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={index}
            style={styles.imageContainer}
            onPress={() => {
              sayAnswer(image.prompt);
            }}>
            <View style={{flexDirection: 'column', alignItems: 'center'}}>
              {/* Check if the URL is a placeholder */}
              {image.url.url === 'placeholder' ? (
                <>
                  <Image
                    source={require('../assets/welcome.png')}
                    style={[
                      styles.image,
                      {borderTopLeftRadius: 16, borderTopRightRadius: 16},
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
                    styles.image,
                    {borderTopLeftRadius: 16, borderTopRightRadius: 16},
                  ]}
                  resizeMode={FastImage.resizeMode.cover}
                />
              )}
            </View>
            <View style={styles.labelContainer}>
              {image.url.url !== 'placeholder' ? (
                <Text style={styles.label}>{image.prompt}</Text>
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
    marginVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    width: '100%',
  },
  imageContainer: {
    flexDirection: 'column',
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
    backgroundColor: 'white',
    marginBottom: 15,
  },
  image: {
    width: width * 0.25,
    height: width * 0.2,
    backgroundColor: '#f0f0f0',
  },
  labelContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  moreButton: {
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    display: 'flex',
    position: 'relative',
  },
  questionMark: {
    fontSize: 30,
    color: '#3A89FF',
    fontWeight: 'bold',
    position: 'absolute',
    top: 10,
    left: 15,
  },
  centralQuestionMark: {
    fontSize: 60,
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
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    fontWeight: '600',
    width: '100%',
  },
});

export default ImageCard;
