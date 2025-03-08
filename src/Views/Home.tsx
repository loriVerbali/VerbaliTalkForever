import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, Dimensions} from 'react-native';

import {useNavigation, NavigationProp} from '@react-navigation/native';

// Add imports for the components
import Inputs from '../Components/Inputs';
import Transcription from '../Components/Transcription';
import ImageGallery from '../Components/ImageGallery';

const {width} = Dimensions.get('window');

type RootStackParamList = {
  Home: undefined;
};

const HomeScreen: React.FC = () => {
  const images = Array(9).fill({url: require('../assets/welcome.png')});
  return (
    <View style={styles.container}>
      <Inputs />
      <View style={styles.contentContainer}>
        <View style={styles.transcriptionContainer}>
          <Transcription />
        </View>
        <View style={styles.imageCardContainer}>
          <ImageGallery images={images} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    width: '90%',
    alignItems: 'center',
    alignSelf: 'center',
  },
  transcriptionContainer: {
    width: '30%',
  },
  imageCardContainer: {
    width: '70%',
    flex: 1, // Takes remaining space
  },
});

export default HomeScreen;
