import RNFS from 'react-native-fs';

/**
 * Download an image from URL and save it locally for sentence builder
 * @param imageUrl - The URL of the image to download
 * @param filename - The filename to save as (without extension)
 * @returns Promise with the local file path
 */
export const downloadSentenceBuilderImage = async (
  imageUrl: string,
  filename: string,
): Promise<string> => {
  try {
    // Create directory for sentence builder images if it doesn't exist
    const sentenceBuilderDir = `${RNFS.DocumentDirectoryPath}/sentenceBuilder`;
    const dirExists = await RNFS.exists(sentenceBuilderDir);
    if (!dirExists) {
      await RNFS.mkdir(sentenceBuilderDir);
    }

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();

    // Robust extension detection
    let extension = 'png';
    try {
      const urlWithoutParams = imageUrl.split('?')[0];
      const parts = urlWithoutParams.split('.');
      if (parts.length > 1) {
        const ext = parts.pop()?.toLowerCase();
        if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
          extension = ext;
        }
      }
    } catch (e) {
      // Keep default 'png'
    }

    const localFilename = `${filename}_${timestamp}.${extension}`;
    const localPath = `${sentenceBuilderDir}/${localFilename}`;

    // Download the image
    const downloadResult = await RNFS.downloadFile({
      fromUrl: imageUrl,
      toFile: localPath,
    }).promise;

    if (downloadResult.statusCode === 200) {
      return localPath;
    } else {
      throw new Error(
        `Download failed with status code: ${downloadResult.statusCode}`,
      );
    }
  } catch (error) {

    throw error;
  }
};

/**
 * Check if a local image file exists
 * @param localPath - The local file path
 * @returns Promise with boolean indicating if file exists
 */
export const sentenceBuilderImageExists = async (
  localPath: string,
): Promise<boolean> => {
  try {
    return await RNFS.exists(localPath);
  } catch (error) {

    return false;
  }
};

/**
 * Delete a local image file
 * @param localPath - The local file path
 * @returns Promise with boolean indicating success
 */
export const deleteSentenceBuilderImage = async (
  localPath: string,
): Promise<boolean> => {
  try {
    const exists = await RNFS.exists(localPath);
    if (exists) {
      await RNFS.unlink(localPath);
      return true;
    }
    return false;
  } catch (error) {

    return false;
  }
};

/**
 * Clean up old images that are no longer referenced
 * @param currentImagePaths - Array of current image paths
 * @returns Promise with number of files deleted
 */
export const cleanupOldSentenceBuilderImages = async (
  currentImagePaths: string[],
): Promise<number> => {
  try {
    const sentenceBuilderDir = `${RNFS.DocumentDirectoryPath}/sentenceBuilder`;
    const dirExists = await RNFS.exists(sentenceBuilderDir);

    if (!dirExists) {
      return 0;
    }

    const files = await RNFS.readDir(sentenceBuilderDir);
    const currentPaths = currentImagePaths
      .filter(Boolean)
      .map(path => path!.replace('file://', ''));

    let deletedCount = 0;
    for (const file of files) {
      if (!currentPaths.includes(file.path)) {
        try {
          await RNFS.unlink(file.path);
          deletedCount++;
        } catch (error) {

        }
      }
    }

    return deletedCount;
  } catch (error) {

    return 0;
  }
};
