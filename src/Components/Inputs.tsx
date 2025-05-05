import React, {useState, forwardRef, useImperativeHandle, useRef} from 'react';
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
import {useAssistant} from '../contexts/AssistantContext';
import {useAdmin} from '../contexts/adminContext';
import fetchHelper from '../utils/fetcher';

const audioRecorderPlayer = new AudioRecorderPlayer();

interface InputsProps {
  mode: string;
}

export interface InputsRef {
  handleRecord: () => Promise<void>;
}

const Inputs = forwardRef<InputsRef, InputsProps>(({mode}, ref) => {
  const [recordedText, setRecordedText] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audoioAfterRecording, setAudoioAfterRecording] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const {createThread, sendMessage, runAssistant, resetHistory, threadId} =
    useAssistant();
  const {showLog, setShowLog} = useAdmin();
  const isRecordingRef = useRef(false);
  const lastSoundTimeRef = useRef(0);
  const threadIDRef = useRef('');

  useImperativeHandle(ref, () => ({
    handleRecord,
  }));

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
      threadIDRef.current = await createThread();
      const currentTime = Date.now();
      setIsRecording(true);
      isRecordingRef.current = true;
      lastSoundTimeRef.current = 0;

      setRecordedText('Recording in progress...');

      try {
        const path = Platform.select({
          ios: `sound.m4a`,
          android: `${RNFS.CachesDirectoryPath}/sound.mp3`,
        })!;

        await audioRecorderPlayer.startRecorder();
        audioRecorderPlayer.addRecordBackListener(e => {
          if (lastSoundTimeRef.current == 0)
            lastSoundTimeRef.current = currentTime;

          // Check if the current meter value indicates sound (you might need to adjust this threshold)
          if (e.currentMetering !== undefined && e.currentMetering > -60) {
            lastSoundTimeRef.current = Date.now();
          }
          if (
            lastSoundTimeRef.current - currentTime > 4000 &&
            lastSoundTimeRef.current > 0
          ) {
            lastSoundTimeRef.current = 0;
            isRecordingRef.current = false;
            stopRecording();
          }

          setRecordedText(`Recording: ${e.currentPosition}ms`);
          return true;
        });

        // Set timeout to stop recording after 8 seconds
        setTimeout(async () => {
          if (isRecordingRef.current) {
            await stopRecording();
          }
        }, 8000);
      } catch (error) {
        console.error('Recording failed to start:', error);
        setRecordedText('Failed to start recording');
        setIsRecording(false);
      }
    } else {
      await stopRecording();
    }
  };

  const stopRecording = async () => {
    // if (!isRecording) return;

    try {
      setIsRecording(false);
      isRecordingRef.current = false;
      const audio = await audioRecorderPlayer.stopRecorder();
      setAudoioAfterRecording(audio);
      audioRecorderPlayer.removeRecordBackListener();
      setRecordedText('Recording completed. Transcribing...');
      // Call handlePlay after stopping the recording
      await handlePlay(audio);
    } catch (error) {
      console.error('Recording failed to stop:', error);
      setRecordedText('Failed to stop recording');
      setIsRecording(true);
    }
  };

  const transcribeAudio = async (audioPath: string) => {
    if (!audioPath) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: audioPath.replace('file://', ''),
        type: Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/mp3',
        name: Platform.OS === 'ios' ? 'recording.m4a' : 'recording.mp3',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      const transcribeResponse = await fetchHelper(
        'transcribeAudio',
        {},
        formData,
      );

      console.log({transcribeResponse});
      console.log(transcribeResponse?.text);

      if (transcribeResponse.text) {
        setRecordedText(transcribeResponse.text);
        if (threadIDRef.current) {
          const messageId = await sendMessage(
            transcribeResponse.text,
            threadIDRef.current,
          );
          if (messageId) {
            await runAssistant(threadIDRef.current);
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

  const handlePlay = async (audioPath: string) => {
    try {
      //  await audioRecorderPlayer.startPlayer(audoioAfterRecording);
      await transcribeAudio(audioPath);
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
      {mode === 'Talk' || mode === 'Attention' ? (
        <View style={styles.buttonContainer}>
          {/* <TouchableOpacity
            onPress={handleShowLog}
            style={[styles.button, styles.playButton]}>
            <Text style={styles.buttonText}>Show Log</Text>
          </TouchableOpacity>
          {showLog ? (
            <>
              <TouchableOpacity
                onPress={handleRecord}
                style={[styles.button, isTranscribing && {opacity: 0.5}]}
                disabled={isTranscribing}>
                <Text style={styles.buttonText}>
                  {isRecording ? 'Stop' : 'Record'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handlePlay(audoioAfterRecording)}
                style={[styles.button, styles.playButton]}
                disabled={!audoioAfterRecording}>
                <Text style={styles.buttonText}>Play</Text>
              </TouchableOpacity>
            </>
          ) : null} */}
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
});

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
