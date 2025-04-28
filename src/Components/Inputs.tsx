import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  ScrollView,
  TextInput,
} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import fetchHelper from '../utils/fetcher';
import {useAssistant} from '../contexts/AssistantContext';
import {useAdmin} from '../contexts/adminContext';

const audioRecorderPlayer = new AudioRecorderPlayer();

interface InputsProps {
  mode: string;
}

const Inputs: React.FC<InputsProps> = ({mode}) => {
  const [recordedText, setRecordedText] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioPath, setAudioPath] = useState<string>('');
  const [audoioAfterRecording, setAudoioAfterRecording] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const {createThread, sendMessage, runAssistant, resetHistory, threadId} =
    useAssistant();
  const {showLog, setShowLog} = useAdmin();
  const requestPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        if (
          grants['android.permission.WRITE_EXTERNAL_STORAGE'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          grants['android.permission.RECORD_AUDIO'] ===
            PermissionsAndroid.RESULTS.GRANTED
        ) {
          return true;
        } else {
          return false;
        }
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true; // iOS doesn't need these permissions
  };

  const handleRecord = async () => {
    if (!isRecording) {
      resetHistory();
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setRecordedText('Permission denied');
        return;
      }

      setIsRecording(true);
      createThread();
      setRecordedText('Recording in progress...');

      try {
        const path = Platform.select({
          ios: `sound.m4a`,
          android: `${RNFS.CachesDirectoryPath}/sound.mp3`,
        })!;

        await audioRecorderPlayer.startRecorder();

        audioRecorderPlayer.addRecordBackListener(e => {
          setRecordedText(`Recording: ${e.currentPosition}ms`);
          return true;
        });
        setAudioPath(path);
      } catch (error) {
        console.error('Recording failed to start:', error);
        setRecordedText('Failed to start recording');
        setIsRecording(false);
      }
    } else {
      try {
        setIsRecording(false);
        const audio = await audioRecorderPlayer.stopRecorder();
        audioRecorderPlayer.removeRecordBackListener();
        setAudoioAfterRecording(audio);
        setRecordedText('Recording completed. Transcribing...');
      } catch (error) {
        console.error('Recording failed to stop:', error);
        setRecordedText('Failed to stop recording');
        setIsRecording(true);
      }
    }
  };

  const transcribeAudio = async () => {
    if (!audioPath) return;

    setIsTranscribing(true);
    try {
      //   const formData = new FormData();
      //   formData.append('file', {
      //     uri: audioPath.replace('file://', ''),
      //     type: Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/mp3',
      //     name: Platform.OS === 'ios' ? 'recording.m4a' : 'recording.mp3',
      //   });
      //   formData.append('model', 'whisper-1');
      //   formData.append('language', 'en');

      //   const transcribeResponse = await fetchHelper(
      //     'transcribeAudio',
      //     {},
      //     formData,
      //   );

      //   if (transcribeResponse.text) {
      //     setRecordedText(transcribeResponse.text);
      if (1 == 1) {
        if (threadId) {
          const messageId = await sendMessage('How was school today');
          if (messageId) {
            await runAssistant();
          }
        }
      }
    } catch (error) {
      console.error('Processing failed:', error);
      setRecordedText('Failed to process audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleShowLog = async () => {
    setShowLog(!showLog);
  };

  const handlePlay = async () => {
    try {
      await audioRecorderPlayer.startPlayer(audioPath);
      await transcribeAudio();
    } catch (error) {
      console.error('Failed to play recording:', error);
    }
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;

    resetHistory();
    createThread();
    const messageId = await sendMessage(inputText);
    if (messageId) {
      await runAssistant();
    }
    setInputText('');
  };

  return (
    <View style={styles.container}>
      {mode === 'Talk' ? (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={handleRecord}
            style={[styles.button, isTranscribing && {opacity: 0.5}]}
            disabled={isTranscribing}>
            <Text style={styles.buttonText}>
              {isRecording ? 'Stop' : 'Record'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePlay}
            style={[styles.button, styles.playButton]}
            disabled={!audioPath}>
            <Text style={styles.buttonText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShowLog}
            style={[styles.button, styles.playButton]}>
            <Text style={styles.buttonText}>Show Log</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message here..."
            multiline
            autoFocus={true}
          />
          <TouchableOpacity
            onPress={handleSendText}
            style={[styles.button, styles.sendButton]}>
            <Text style={styles.buttonText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    minHeight: 40,
    maxHeight: 100,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  playButton: {
    backgroundColor: '#34C759',
  },
  sendButton: {
    backgroundColor: '#007AFF',
  },
  recordedText: {
    fontSize: 16,
    color: '#333',
  },
  historyItem: {
    padding: 8,
    marginVertical: 4,
    borderRadius: 8,
  },
  userMessage: {
    backgroundColor: '#E3F2FD',
    alignSelf: 'flex-end',
  },
  assistantMessage: {
    backgroundColor: '#F5F5F5',
    alignSelf: 'flex-start',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
  },
  errorText: {
    color: 'red',
  },
  statusText: {
    color: '#666',
    fontStyle: 'italic',
  },
});

export default Inputs;
