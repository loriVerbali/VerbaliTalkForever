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
  onComplete?: () => void;
}

const WhisperDownload: React.FC<WhisperDownloadProps> = ({onComplete}) => {
  const {isTablet} = useAdmin();
  const {setItem, getItem} = useAppSettings();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [currentColor, setCurrentColor] = useState('#333');
  const [isCellular, setIsCellular] = useState(false);
  const [isLowEndDevice, setIsLowEndDevice] = useState<boolean | null>(null);
  const lastProgressUpdate = useRef(0);

  const nextButtonTextFontSize = isTablet ? 20 : 14;

  // Rotate phrases and colors every 3 seconds during download
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isDownloading) {
      interval = setInterval(() => {
        setCurrentPhraseIndex(prev => (prev + 1) % feelGoodPhrases.length);
        setCurrentColor(
          accessibleColors[Math.floor(Math.random() * accessibleColors.length)],
        );
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDownloading]);

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

  const startWhisperDownload = async () => {
    try {
      // Check if on cellular and warn user
      if (isCellular) {
        Alert.alert(
          'Cellular Data Warning',
          'You are currently on cellular data. This download is large (~190MB) and may use significant data. Consider switching to WiFi to avoid data charges.',
          [
            {text: 'Continue Anyway', onPress: () => proceedWithDownload()},
            {text: 'Cancel', style: 'cancel'},
          ],
        );
        return;
      }

      proceedWithDownload();
    } catch (error) {
      console.error('Whisper model download error:', error);
      setIsDownloading(false);
      setDownloadProgress(0);
      Alert.alert(
        'Download Error',
        'Failed to download the Whisper model. Please check your internet connection and try again.',
      );
    }
  };

  const proceedWithDownload = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      // Detect device capabilities if not already detected
      let deviceIsLowEnd = isLowEndDevice;
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
          console.error('Whisper download error:', downloadError);
          console.error(
            'Error details:',
            JSON.stringify(downloadError, null, 2),
          );
          throw downloadError;
        }
      }

      setIsDownloading(false);
      setDownloadProgress(100);

      // Mark model as available since download completed successfully
      try {
        await WhisperModelManager.markModelAsAvailable(setItem);
      } catch (error) {
        console.error(
          'Error updating Whisper model availability status:',
          error,
        );
      }

      onComplete?.();

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
      Alert.alert(
        'Download Error',
        'Failed to download the Whisper model. Please check your internet connection and try again.',
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={[styles.description, {fontSize: isTablet ? 18 : 16}]}>
          To use MaTalk AI, you must download our free transcription package.
          This enables on-device voice transcription and is required to
          continue.
        </Text>

        {isDownloading && (
          <View style={styles.downloadContainer}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={[styles.progressText, {color: currentColor}]}>
              {feelGoodPhrases[currentPhraseIndex]}
            </Text>

            <Text style={styles.downloadInfo}>This may take a few minutes</Text>
          </View>
        )}

        {!isDownloading && downloadProgress === 100 && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              ✅ Whisper model downloaded successfully!
            </Text>
          </View>
        )}

        {!isDownloading && downloadProgress === 0 && (
          <>
            {isCellular && (
              <View style={styles.cellularWarning}>
                <Text style={styles.cellularWarningText}>
                  ⚠️ You're on cellular data. This download is large and may use
                  significant data.
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={startWhisperDownload}>
              <Text
                style={[
                  styles.downloadButtonText,
                  {fontSize: nextButtonTextFontSize},
                ]}>
                📥 Download{' '}
                {isLowEndDevice !== null
                  ? MODEL_CONFIG.getWhisperModelSize(isLowEndDevice)
                  : MODEL_CONFIG.getWhisperModelSize()}
              </Text>
            </TouchableOpacity>
          </>
        )}
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
    marginVertical: 20,
  },
  progressText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 10,
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
