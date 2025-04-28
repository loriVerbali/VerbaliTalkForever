import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, Dimensions} from 'react-native';
import {
  useNavigation,
  NavigationProp,
  RouteProp,
} from '@react-navigation/native';

// Add imports for the components
import Inputs from '../Components/Inputs';
import Transcription from '../Components/Transcription';
import ImageGallery from '../Components/ImageGallery';
import {useAssistant} from '../contexts/AssistantContext';
import {useAdmin} from '../contexts/adminContext';

const {width} = Dimensions.get('window');

type RootStackParamList = {
  Home: {stateof: string};
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'view.HOME'>;

interface HomeScreenProps {
  route: HomeScreenRouteProp;
}

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {imageUrls} = useAssistant();
  const {showLog} = useAdmin();
  const {stateof} = route.params;

  return (
    <View style={styles.container}>
      <Inputs mode={stateof} />
      <View style={styles.contentContainer}>
        {showLog ? (
          <View style={styles.transcriptionContainer}>
            <Transcription />
          </View>
        ) : null}

        <View style={styles.imageCardContainer}>
          {imageUrls?.length > 0 ? <ImageGallery images={imageUrls} /> : null}
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
