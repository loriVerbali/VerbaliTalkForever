import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from 'react-native';
import {
  useNavigation,
  NavigationProp,
  RouteProp,
} from '@react-navigation/native';
import Sound from 'react-native-sound';

// Add imports for the components
import Inputs, {InputsRef} from '../Components/Inputs';
import Transcription from '../Components/Transcription';
import ImageGallery from '../Components/ImageGallery';
import {useAssistant} from '../contexts/AssistantContext';
import {useAdmin} from '../contexts/adminContext';
import {showFiles} from '../utils/helpers';
import {useSound} from '../contexts/soundContext';

const {width} = Dimensions.get('window');

type RootStackParamList = {
  Home: {stateof: string};
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  route: HomeScreenRouteProp;
}

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {imageUrls} = useAssistant();
  const {showLog} = useAdmin();
  const stateof = route?.params?.stateof ?? '';
  const [attentionSound, setAttentionSound] = useState<Sound | null>(null);
  const inputsRef = useRef<InputsRef>(null);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const {playAttention} = useSound();

  useEffect(() => {
    if (stateof === 'Attention') {
      playSound();
    }
  }, [stateof]);

  const playSound = async () => {
    const res = await playAttention();
    if (res) {
      inputsRef.current?.handleRecord();
    } else inputsRef.current?.handleRecord();
  };
  return (
    <View style={styles.container}>
      <Inputs ref={inputsRef} mode={stateof} />
      <View style={styles.contentContainer}>
        {showLog ? (
          <View style={styles.transcriptionContainer}>
            <Transcription />
            <Pressable onPress={playSound}>
              <Text>Play Sound</Text>
            </Pressable>
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
