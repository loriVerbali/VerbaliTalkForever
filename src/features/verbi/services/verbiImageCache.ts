import RNFS from 'react-native-fs';

const CACHE_DIR_NAME = 'verbi_cache';
const CACHE_DIR = `${RNFS.DocumentDirectoryPath}/${CACHE_DIR_NAME}`;

/** In-memory Set of cached filename keys for O(1) synchronous lookup */
const cachedFileKeys = new Set<string>();
/** Map of imageKey -> full local path */
const keyToLocalPathMap = new Map<string, string>();

let isInitialized = false;

/**
 * Generates a deterministic cache key / filename from image URL or label
 */
export function generateImageKey(imageUrl: string, label?: string): string {
  const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  
  // Extract file extension
  let extension = 'png';
  try {
    const urlWithoutParams = imageUrl.split('?')[0];
    const parts = urlWithoutParams.split('.');
    if (parts.length > 1) {
      const ext = parts.pop()?.toLowerCase();
      if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        extension = ext;
      }
    }
  } catch {
    // default to png
  }

  // Simple string hash for URL uniqueness
  let hash = 0;
  for (let i = 0; i < imageUrl.length; i++) {
    hash = (hash << 5) - hash + imageUrl.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const positiveHash = Math.abs(hash).toString(36);
  const prefix = label ? sanitize(label).slice(0, 15) : 'img';

  return `${prefix}_${positiveHash}.${extension}`;
}

/**
 * Initializes the Verbi image cache by scanning the cache directory into memory.
 */
export async function initVerbiImageCache(): Promise<void> {
  if (isInitialized) return;
  try {
    const dirExists = await RNFS.exists(CACHE_DIR);
    if (!dirExists) {
      await RNFS.mkdir(CACHE_DIR);
    }

    const files = await RNFS.readDir(CACHE_DIR);
    for (const file of files) {
      if (file.isFile()) {
        cachedFileKeys.add(file.name);
        keyToLocalPathMap.set(file.name, file.path);
      }
    }
    isInitialized = true;
  } catch (error) {
    console.warn('[VerbiImageCache] Error initializing cache:', error);
  }
}

/**
 * Synchronously checks if an image key exists in the in-memory cache index.
 */
export function isImageCached(filenameKey: string): boolean {
  return cachedFileKeys.has(filenameKey);
}

/**
 * Synchronously gets the file:// URI if cached in memory.
 */
export function getCachedImageUri(filenameKey: string): string | null {
  if (cachedFileKeys.has(filenameKey)) {
    const fullPath = keyToLocalPathMap.get(filenameKey) || `${CACHE_DIR}/${filenameKey}`;
    return `file://${fullPath}`;
  }
  return null;
}

/**
 * Downloads a single remote image into the local Verbi cache directory.
 */
export async function downloadImageToCache(
  imageUrl: string,
  filenameKey: string,
): Promise<string | null> {
  try {
    if (!isInitialized) {
      await initVerbiImageCache();
    }

    // Double check memory index
    if (isImageCached(filenameKey)) {
      return getCachedImageUri(filenameKey);
    }

    const localPath = `${CACHE_DIR}/${filenameKey}`;

    const downloadResult = await RNFS.downloadFile({
      fromUrl: imageUrl,
      toFile: localPath,
      connectionTimeout: 10000,
      readTimeout: 15000,
    }).promise;

    if (downloadResult.statusCode === 200) {
      cachedFileKeys.add(filenameKey);
      keyToLocalPathMap.set(filenameKey, localPath);
      return `file://${localPath}`;
    } else {
      // Clean up partial file on failure
      if (await RNFS.exists(localPath)) {
        await RNFS.unlink(localPath);
      }
      return null;
    }
  } catch (error) {
    console.warn(`[VerbiImageCache] Failed downloading ${imageUrl}:`, error);
    return null;
  }
}
