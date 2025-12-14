import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
import {MODEL_CONFIG} from '../utils/constants';
import {useAdmin} from '../contexts/adminContext';
import WhisperModelManager from '../utils/WhisperModelManager';
import {useAppSettings} from '../utils/persistance';
import {detectDeviceCapabilities} from '../utils/deviceDetection';

const {width, height} = Dimensions.get('window');

// Array of 100 friendly feel-good phrases (3 words max)
const feelGoodPhrases = [
  'You are amazing!',
  'Keep shining bright!',
  'You got this!',
  'Stay positive!',
  'You are loved!',
  'Dream big dreams!',
  'You are strong!',
  'Believe in yourself!',
  'You are capable!',
  'Stay awesome!',
  'You are wonderful!',
  'Keep going strong!',
  'You are special!',
  'Stay happy!',
  'You are brave!',
  'You are talented!',
  'Keep smiling!',
  'You are unique!',
  'Stay confident!',
  'You are inspiring!',
  'You are beautiful!',
  'Keep believing!',
  'You are smart!',
  'Stay motivated!',
  'You are kind!',
  'You are helpful!',
  'Keep learning!',
  'You are creative!',
  'Stay curious!',
  'You are friendly!',
  'You are patient!',
  'Keep growing!',
  'You are caring!',
  'Stay hopeful!',
  'You are generous!',
  'You are thoughtful!',
  'Keep trying!',
  'You are respectful!',
  'Stay grateful!',
  'You are honest!',
  'You are reliable!',
  'Keep improving!',
  'You are supportive!',
  'Stay focused!',
  'You are determined!',
  'You are resilient!',
  'Keep pushing!',
  'You are adaptable!',
  'Stay positive!',
  'You are optimistic!',
  'You are enthusiastic!',
  'Keep exploring!',
  'You are adventurous!',
  'Stay excited!',
  'You are energetic!',
  'You are passionate!',
  'Keep discovering!',
  'You are innovative!',
  'Stay creative!',
  'You are artistic!',
  'You are musical!',
  'Keep dancing!',
  'You are athletic!',
  'Stay active!',
  'You are healthy!',
  'You are balanced!',
  'Keep breathing!',
  'You are peaceful!',
  'Stay calm!',
  'You are centered!',
  'You are mindful!',
  'Keep meditating!',
  'You are spiritual!',
  'Stay connected!',
  'You are grounded!',
  'You are present!',
  'Keep living!',
  'You are alive!',
  'Stay awake!',
  'You are aware!',
  'You are conscious!',
  'Keep growing!',
  'You are evolving!',
  'Stay learning!',
  'You are expanding!',
  'You are limitless!',
  'Keep dreaming!',
  'You are infinite!',
  'Stay boundless!',
  'You are powerful!',
  'You are unstoppable!',
  'Keep moving!',
  'You are unstoppable!',
  'Stay determined!',
  'You are focused!',
  'You are committed!',
  'Keep working!',
  'You are dedicated!',
  'Stay persistent!',
  'You are consistent!',
  'You are reliable!',
  'Keep showing!',
  'You are trustworthy!',
  'Stay honest!',
  'You are authentic!',
  'You are genuine!',
  'Keep being!',
  'You are real!',
  'Stay true!',
  'You are perfect!',
];

// Array of accessible colors that work well on light backgrounds
const accessibleColors = [
  '#2E86AB', // Blue
  '#A23B72', // Purple
  '#F18F01', // Orange
  '#C73E1D', // Red
  '#3A7D44', // Green
  '#8B4513', // Brown
  '#4A90E2', // Light Blue
  '#9B59B6', // Light Purple
  '#E67E22', // Light Orange
  '#E74C3C', // Light Red
  '#27AE60', // Light Green
  '#8E44AD', // Dark Purple
  '#2980B9', // Dark Blue
  '#D35400', // Dark Orange
  '#C0392B', // Dark Red
  '#16A085', // Teal
  '#F39C12', // Yellow
  '#E74C3C', // Bright Red
  '#3498DB', // Bright Blue
  '#2ECC71', // Bright Green
];

interface WhisperDownloadProps {
  onComplete?: (modelName?: string) => void;
  isModelInvoked?: boolean;
}

const WhisperDownload: React.FC<WhisperDownloadProps> = ({
  onComplete,
  isModelInvoked,
}) => {
  const {isTablet} = useAdmin();
  const {setItem, getItem} = useAppSettings();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [currentColor, setCurrentColor] = useState('#333');
  const [isCellular, setIsCellular] = useState(false);
  const [isLowEndDevice, setIsLowEndDevice] = useState<boolean | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const lastProgressUpdate = useRef(0);
  const hasStarted = useRef(false);

  const nextButtonTextFontSize = isTablet ? 20 : 14;

  // Rotate phrases and colors every 3 seconds
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    // Always rotate phrases, even before download starts
    interval = setInterval(() => {
      setCurrentPhraseIndex(prev => (prev + 1) % feelGoodPhrases.length);
      setCurrentColor(
        accessibleColors[Math.floor(Math.random() * accessibleColors.length)],
      );
    }, 3000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  // Check network type
  useEffect(() => {
    const checkNetworkType = async () => {
      const state = await NetInfo.fetch();
      setIsCellular(state.type === 'cellular');
    };

    checkNetworkType();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsCellular(state.type === 'cellular');
    });

    return () => unsubscribe();
  }, []);

  // Detect device capabilities on mount
  useEffect(() => {
    const detectDevice = async () => {
      try {
        const capabilities = await detectDeviceCapabilities();
        setIsLowEndDevice(capabilities.isLowEndDevice);
        console.log(
          `📱 Device detected as ${
            capabilities.isLowEndDevice ? 'low-end' : 'standard'
          }. Will download ${
            capabilities.isLowEndDevice ? 'WHISPER_TINY' : 'WHISPER'
          } model.`,
        );
      } catch (error) {
        console.error('Error detecting device capabilities:', error);
        // Default to low-end on error to be safe
        setIsLowEndDevice(true);
      }
    };

    detectDevice();
  }, []);

  // Auto-start download when component mounts
  useEffect(() => {
    if (!hasStarted.current && isLowEndDevice !== null) {
      hasStarted.current = true;
      // Start download automatically without showing cellular warning
      proceedWithDownload();
    }
  }, [isLowEndDevice]);

  const startWhisperDownload = async () => {
    // Auto-start without warnings - user doesn't need to know the details
    proceedWithDownload();
  };

  const proceedWithDownload = async () => {
    // Detect device capabilities if not already detected (outside try block for error handling)
    let deviceIsLowEnd = isLowEndDevice;
    let modelName = 'WHISPER'; // Default to standard model
    
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      if (deviceIsLowEnd === null) {
        try {
          const capabilities = await detectDeviceCapabilities();
          deviceIsLowEnd = capabilities.isLowEndDevice;
          setIsLowEndDevice(deviceIsLowEnd);
        } catch (error) {
          console.error('Error detecting device capabilities:', error);
          deviceIsLowEnd = true; // Default to low-end on error
        }
      }

      modelName = deviceIsLowEnd ? 'WHISPER_TINY' : 'WHISPER';
      const whisperUrl = MODEL_CONFIG.getWhisperModelUrl(deviceIsLowEnd);
      const whisperFileName =
        MODEL_CONFIG.getWhisperModelFileName(deviceIsLowEnd);
      const localPath = `${RNFS.DocumentDirectoryPath}/${whisperFileName}`;

      const fileExists = await RNFS.exists(localPath);

      if (fileExists) {
        try {
          const stats = await RNFS.stat(localPath);
        } catch (statError) {
          console.error('Could not get file stats:', statError);
        }
        setDownloadProgress(100);
        setIsDownloading(false);
        setIsComplete(true);
        
        // Mark model as available since file already exists
        try {
          await WhisperModelManager.markModelAsAvailable(setItem);
        } catch (error) {
          console.error(
            'Error updating Whisper model availability status:',
            error,
          );
        }
        
        onComplete?.(modelName);
        return;
      } else {
        try {
          const downloadJob = RNFS.downloadFile({
            fromUrl: whisperUrl,
            toFile: localPath,
            progress: res => {
              const now = Date.now();
              if (now - lastProgressUpdate.current > 100) {
                if (res.contentLength && res.bytesWritten) {
                  const progressPercent =
                    (res.bytesWritten / res.contentLength) * 100;

                  setDownloadProgress(progressPercent);
                }
                lastProgressUpdate.current = now;
              }
            },
            progressDivider: 1,
            headers: {
              'User-Agent': 'MaTalkAI/1.5',
            },
          });

          const result = await downloadJob.promise;

          const fileCheck = await RNFS.exists(localPath);

          if (fileCheck) {
            const stats = await RNFS.stat(localPath);
          } else {
            throw new Error('File not created after download');
          }
          setDownloadProgress(100);
        } catch (downloadError) {
          throw downloadError;
        }
      }

      setIsDownloading(false);
      setDownloadProgress(100);
      setIsComplete(true);

      // Mark model as available since download completed successfully
      try {
        await WhisperModelManager.markModelAsAvailable(setItem);
      } catch (error) {
        console.error(
          'Error updating Whisper model availability status:',
          error,
        );
      }

      onComplete?.(modelName);

      try {
        const finalCheck = await RNFS.exists(localPath);
        if (finalCheck) {
          const stats = await RNFS.stat(localPath);
        }
      } catch (verifyError) {
        console.error('Could not verify file:', verifyError);
      }
    } catch (error) {
      console.error('Whisper model download error:', error);
      setIsDownloading(false);
      setDownloadProgress(0);
      // Silently handle errors - don't show alerts to user
      // Still call onComplete to allow onboarding to continue
      // Pass model name even on error (based on device detection)
      // Use state value if deviceIsLowEnd wasn't set in try block
      if (deviceIsLowEnd === null) {
        modelName = isLowEndDevice ? 'WHISPER_TINY' : 'WHISPER';
      }
      onComplete?.(modelName);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={[styles.magicTitle, {fontSize: isTablet ? 28 : 24}]}>
          {isComplete ? 'Magic is READY!!' : 'We are setting up our magic!'}
        </Text>

        <View style={styles.downloadContainer}>
          {!isComplete && <ActivityIndicator size="large" color="#146CF0" />}
          {isComplete ? (
            <Text style={[styles.readyText, {color: '#4CAF50'}]}>
              ✨
            </Text>
          ) : (
            <Text style={[styles.progressText, {color: currentColor}]}>
              {feelGoodPhrases[currentPhraseIndex]}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  magicTitle: {
    color: '#333',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 32,
    fontWeight: 'bold',
  },
  description: {
    color: '#333',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
    fontWeight: '500',
  },
  downloadContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginVertical: 40,
  },
  progressText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  readyText: {
    fontSize: 48,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '80%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  downloadInfo: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  successText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
  },
  downloadButton: {
    backgroundColor: 'rgba(20, 108, 240, 0.75)',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    marginTop: 20,
    alignItems: 'center',
  },
  downloadButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  cellularWarning: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEAA7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    width: '100%',
  },
  cellularWarningText: {
    color: '#856404',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default WhisperDownload;
