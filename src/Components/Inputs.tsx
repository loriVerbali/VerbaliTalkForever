import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
} from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import {useAssistant} from '../contexts/AssistantContext';
import {useAdmin} from '../contexts/adminContext';
import fetchHelper from '../utils/fetcher';
import TTSService from '../utils/TTSService';

// Create a singleton instance for better memory management and reuse
const audioRecorderPlayer = new AudioRecorderPlayer();

interface InputsProps {
  mode: string;
  onTranscriptionUpdate?: (text: string) => void;
}

export interface InputsRef {
  handleRecord: () => Promise<void>;
  isRecording: boolean;
}

const Inputs = forwardRef<InputsRef, InputsProps>(
  ({mode, onTranscriptionUpdate}, ref) => {
    const [recordedText, setRecordedText] = useState<string>('');
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [audioPath, setAudioPath] = useState<string>('');
    const [inputText, setInputText] = useState<string>('');
    const {sendMessage, runAssistant, resetHistory, threadId} = useAssistant();
    const {showLog, setShowLog} = useAdmin();
    const isRecordingRef = useRef(false);
    const lastSoundTimeRef = useRef(0);
    const threadIDRef = useRef('');
    const metering = useRef<number>(-100);
    const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initialize TTSService once when component mounts
    useEffect(() => {
      const initTTS = async () => {
        await TTSService.initialize();
      };
      initTTS();

      // Configure AudioRecorderPlayer for better performance
      audioRecorderPlayer.setSubscriptionDuration(0.1); // Shorter intervals for more responsive silence detection

      return () => {
        if (isRecording) {
          stopRecording();
        }
        if (recordingTimer.current) {
          clearTimeout(recordingTimer.current);
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      handleRecord,
      isRecording,
    }));

    useEffect(() => {
      threadIDRef.current = threadId;
    }, [threadId]);

    const requestPermission = async () => {
      if (Platform.OS === 'android') {
        try {
          const grants = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);

          return (
            grants['android.permission.WRITE_EXTERNAL_STORAGE'] ===
              PermissionsAndroid.RESULTS.GRANTED &&
            grants['android.permission.RECORD_AUDIO'] ===
              PermissionsAndroid.RESULTS.GRANTED
          );
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

        const currentTime = Date.now();
        setIsRecording(true);
        isRecordingRef.current = true;
        lastSoundTimeRef.current = 0;
        metering.current = -100;

        setRecordedText('Recording in progress...');

        try {
          const path = Platform.select({
            ios: `sound.m4a`,
            android: `${RNFS.CachesDirectoryPath}/sound.mp3`,
          })!;

          // Clear previous cached recording if it exists
          try {
            const exists = await RNFS.exists(path);
            if (exists) {
              await RNFS.unlink(path);
            }
          } catch (e) {
            console.warn('Error clearing previous recording:', e);
          }

          // Start recording with configured options for better quality
          await audioRecorderPlayer.startRecorder(path, {
            AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
            AudioSourceAndroid: AudioSourceAndroidType.MIC,
            AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
            AVNumberOfChannelsKeyIOS: 1,
            AVFormatIDKeyIOS: AVEncodingOption.aac,
          });

          setAudioPath(path);

          // Add meter listener to detect silence
          audioRecorderPlayer.addRecordBackListener(e => {
            if (lastSoundTimeRef.current === 0) {
              lastSoundTimeRef.current = currentTime;
            }

            // Store current metering value
            if (e.currentMetering !== undefined) {
              metering.current = e.currentMetering;
            }

            // Check if there's actual sound (not silence)
            // This threshold may need adjustment based on testing
            if (metering.current > -50) {
              lastSoundTimeRef.current = Date.now();
            } else if (
              Date.now() - lastSoundTimeRef.current > 2000 &&
              lastSoundTimeRef.current > 0
            ) {
              // If silence for 2 seconds, stop recording
              lastSoundTimeRef.current = 0;
              isRecordingRef.current = false;
              stopRecording();
              return;
            }

            setRecordedText(
              `Recording: ${(e.currentPosition / 1000).toFixed(1)}s`,
            );
            return true;
          });

          // Set timeout to limit recording to max 8 seconds
          recordingTimer.current = setTimeout(async () => {
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
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }

      try {
        setIsRecording(false);
        isRecordingRef.current = false;
        const filePath = await audioRecorderPlayer.stopRecorder();
        audioRecorderPlayer.removeRecordBackListener();
        setRecordedText('Recording completed. Transcribing...');

        // Process audio file
        await transcribeAudio(filePath);
      } catch (error) {
        console.error('Recording failed to stop:', error);
        setRecordedText('Failed to stop recording');
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

        if (transcribeResponse?.text) {
          const transcribedText = transcribeResponse.text.trim();
          setRecordedText(transcribedText);

          if (threadIDRef.current) {
            // Provide audio feedback that we heard the input

            const messageId = await sendMessage(
              transcribedText,
              threadIDRef.current,
              'generate_answers',
            );
            if (messageId) {
              await runAssistant(threadIDRef.current);
            }
          }
        } else {
          setRecordedText('No speech detected. Please try again.');
          TTSService.speak('No speech detected. Please try again.', true);
        }
      } catch (error) {
        console.error('Processing failed:', error);
        setRecordedText('Failed to process audio');
        TTSService.speak('Failed to process audio. Please try again.', true);
      } finally {
        setIsTranscribing(false);
      }
    };

    const handleShowLog = async () => {
      setShowLog(!showLog);
    };

    const handleSendText = async () => {
      if (!inputText.trim()) return;

      resetHistory();
      const messageId = await sendMessage(
        inputText,
        undefined,
        'generate_answers',
      );
      if (messageId) {
        await runAssistant();
      }
      setInputText('');
    };

    useEffect(() => {
      if (onTranscriptionUpdate) {
        onTranscriptionUpdate(recordedText);
      }
    }, [recordedText, onTranscriptionUpdate]);

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
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendText}
              disabled={!inputText.trim()}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView style={styles.transcriptionContainer}>
          {isRecording || isTranscribing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>
                {isRecording ? 'Recording...' : 'Transcribing...'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  },
);

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
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptionContainer: {
    flex: 1,
    marginTop: 16,
  },
  transcriptionText: {
    fontSize: 16,
    color: '#333',
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

export default Inputs;
