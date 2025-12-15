import RNFS from 'react-native-fs';
import {My8WordsCard} from './my8wordsUtils';
import {resolveImageSource} from './imageSourceResolver';

/**
 * Download an image from URL and save it locally
 * @param imageUrl - The URL of the image to download
 * @param filename - The filename to save as (without extension)
 * @returns Promise with the local file path
 */
export const downloadImage = async (
  imageUrl: string,
  filename: string,
): Promise<string> => {
  try {
    // Create directory for my8words images if it doesn't exist
    const my8wordsDir = `${RNFS.DocumentDirectoryPath}/my8words`;
    const dirExists = await RNFS.exists(my8wordsDir);
    if (!dirExists) {
      await RNFS.mkdir(my8wordsDir);
    }

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const extension = imageUrl.split('.').pop() || 'png';
    const localFilename = `${filename}_${timestamp}.${extension}`;
    const localPath = `${my8wordsDir}/${localFilename}`;

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
 * Download image for a card and update the card with local path
 * @param card - The card to update
 * @returns Promise with updated card
 */
export const downloadImageForCard = async (
  card: My8WordsCard,
): Promise<My8WordsCard> => {
  try {
    const localPath = await downloadImage(card.imageUrl, card.id);
    return {
      ...card,
      localImagePath: localPath,
    };
  } catch (error) {
    
    // Return original card if download fails
    return card;
  }
};

/**
 * Check if a local image file exists
 * @param localPath - The local file path
 * @returns Promise with boolean indicating if file exists
 */
export const imageExists = async (localPath: string): Promise<boolean> => {
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
export const deleteImage = async (localPath: string): Promise<boolean> => {
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
 * Get the appropriate image source for a card (local if available, otherwise URL)
 * @param card - The card
 * @returns Object with uri property for FastImage
 */
export const getImageSource = (card: My8WordsCard): any => {
  if (card.localImagePath) {
    return {uri: `file://${card.localImagePath}`};
  }

  // Use the image resolver to handle asset paths properly
  const resolvedSource = resolveImageSource(card.imageUrl);
  if (resolvedSource) {
    return resolvedSource;
  }

  // Fallback to URI format
  return {uri: card.imageUrl};
};

/**
 * Clean up old images that are no longer referenced
 * @param currentCards - Array of current cards
 * @returns Promise with number of files deleted
 */
export const cleanupOldImages = async (
  currentCards: My8WordsCard[],
): Promise<number> => {
  try {
    const my8wordsDir = `${RNFS.DocumentDirectoryPath}/my8words`;
    const dirExists = await RNFS.exists(my8wordsDir);

    if (!dirExists) {
      return 0;
    }

    const files = await RNFS.readDir(my8wordsDir);
    const currentPaths = currentCards
      .map(card => card.localImagePath)
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
