import WhisperService from './WhisperService';
import {MODEL_CONFIG} from './constants';
import RNFS from 'react-native-fs';

/**
 * Test utility for Whisper service
 * Use this to debug Whisper integration issues
 */
export const testWhisperIntegration = async () => {
  try {
    // Check if model file exists
    const whisperFileName = MODEL_CONFIG.getWhisperModelFileName();
    const modelPath = `${RNFS.DocumentDirectoryPath}/${whisperFileName}`;
    const modelExists = await RNFS.exists(modelPath);

    if (!modelExists) {
      return {success: false, error: 'Model file not found'};
    }

    // Test Whisper service
    const testResult = await WhisperService.testWhisperService();
    return testResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
