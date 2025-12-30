import RNFS from 'react-native-fs';
import {Platform} from 'react-native';

export const showFiles = async () => {
  try {
    const documentFiles = await RNFS.readDir(RNFS.DocumentDirectoryPath);
    const temporaryFiles = await RNFS.readDir(RNFS.TemporaryDirectoryPath);

    if (Platform.OS === 'ios') {
      const mainBundleFiles = await RNFS.readDir(RNFS.MainBundlePath);
    }
  } catch (err) {
    
  }
};

// Add other helper functions here as needed
export const validateAudioPath = async (path: string) => {
  try {
    const exists = await RNFS.exists(path);
    if (exists) {
      const stats = await RNFS.stat(path);
    }
    return exists;
  } catch (error) {
    
    return false;
  }
};
