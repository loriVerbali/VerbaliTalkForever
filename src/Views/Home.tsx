import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
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

const {width, height} = Dimensions.get('window');

type RootStackParamList = {
  Home: {stateof?: string};
};

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  route?: HomeScreenRouteProp;
}

const HomeScreen: React.FC<HomeScreenProps> = ({route}) => {
  const {imageUrls, status} = useAssistant();
  const {showLog} = useAdmin();
  const stateof = route?.params?.stateof ?? '';
  const [attentionSound, setAttentionSound] = useState<Sound | null>(null);
  const [showTranscription, setShowTranscription] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
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
    if (!inputsRef.current?.isRecording) {
      inputsRef.current?.handleRecord();
    }
  };

  const toggleTranscription = () => {
    setShowTranscription(!showTranscription);
  };

  const handleTranscriptionUpdate = (text: string) => {
    setTranscribedText(text);
  };

  return (
    <View style={styles.container}>
      {showLog && (
        <TouchableOpacity
          style={styles.transcriptionButton}
          onPress={toggleTranscription}>
          <Text style={styles.buttonText}>Show Transcript</Text>
        </TouchableOpacity>
      )}
      <Inputs
        ref={inputsRef}
        mode={stateof}
        onTranscriptionUpdate={handleTranscriptionUpdate}
      />
      <View style={styles.contentContainer}>
        <Modal
          visible={showTranscription}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowTranscription(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.transcriptionPopup}>
              <View style={styles.popupHeader}>
                <Text style={styles.popupTitle}>Transcription</Text>
                <TouchableOpacity onPress={() => setShowTranscription(false)}>
                  <Text style={styles.closeButton}>Close</Text>
                </TouchableOpacity>
              </View>
              <Transcription text={transcribedText} />
            </View>
          </View>
        </Modal>

        <View style={styles.imageCardContainer}>
          {status === 'completed' && imageUrls?.length > 0 ? (
            <ImageGallery images={imageUrls} />
          ) : status === 'in_progress' ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size={60} color="#007AFF" />
              <Text style={styles.loadingText}>Generating images...</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '',
  },
  contentContainer: {
    flex: 1,
    width: '90%',
    alignItems: 'center',
    alignSelf: 'center',
  },
  transcriptionButton: {
    position: 'absolute',
    top: 50,
    right: 10,
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    zIndex: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  transcriptionPopup: {
    width: '80%',
    height: '70%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '500',
  },
  imageCardContainer: {
    width: '100%',
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
});

export default HomeScreen;
