import RNFS from 'react-native-fs';
import {Platform} from 'react-native';

export const showFiles = async () => {
  console.log('Document Directory:', RNFS.DocumentDirectoryPath);
  console.log('Temporary Directory:', RNFS.TemporaryDirectoryPath);
  console.log(
    'Main Bundle:',
    Platform.OS === 'ios' ? RNFS.MainBundlePath : 'N/A',
  );

  try {
    const documentFiles = await RNFS.readDir(RNFS.DocumentDirectoryPath);
    console.log('FilesDocument:', documentFiles);

    const temporaryFiles = await RNFS.readDir(RNFS.TemporaryDirectoryPath);
    console.log('FilesTemporary:', temporaryFiles);

    if (Platform.OS === 'ios') {
      const mainBundleFiles = await RNFS.readDir(RNFS.MainBundlePath);
      console.log('FilesMainBundle:', mainBundleFiles);
    }
  } catch (err) {
    console.error('Error reading directories:', err);
  }
};

// Add other helper functions here as needed
export const validateAudioPath = async (path: string) => {
  try {
    const exists = await RNFS.exists(path);
    console.log('Audio file exists:', exists);
    if (exists) {
      const stats = await RNFS.stat(path);
      console.log('Audio file size:', stats.size);
    }
    return exists;
  } catch (error) {
    console.error('Error validating audio path:', error);
    return false;
  }
};
