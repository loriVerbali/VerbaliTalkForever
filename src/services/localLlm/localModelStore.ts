/**
 * Where on-device models live and how they get there.
 *
 * Ported from AmigoLocal's modelStore. Downloads go to a `.part` file that is
 * renamed only once the transfer completes, so an interrupted download can
 * never be mistaken for a complete model and fail at load time instead.
 */
import RNFS from 'react-native-fs';
import {
  LOCAL_MODEL_KEYS,
  LocalModelKey,
  getLocalModel,
} from './localLlmModels';

export interface LocalModelStatus {
  key: LocalModelKey;
  isDownloaded: boolean;
  /** Bytes on disk, 0 when absent. */
  bytes: number;
}

export class DownloadCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'DownloadCancelledError';
  }
}

const MODELS_DIR = `${RNFS.DocumentDirectoryPath}/local-llm`;

const pathFor = (fileName: string) => `${MODELS_DIR}/${fileName}`;
const tempPathFor = (fileName: string) => `${pathFor(fileName)}.part`;

const ensureDir = async () => {
  try {
    if (!(await RNFS.exists(MODELS_DIR))) {
      await RNFS.mkdir(MODELS_DIR);
    }
  } catch (error) {
    console.warn('[LocalLLM] could not create models directory:', error);
  }
};

const unlinkQuietly = async (path: string) => {
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch {
    // Best effort.
  }
};

export const localModelStore = {
  localPath(key: LocalModelKey) {
    return pathFor(getLocalModel(key).fileName);
  },

  async isDownloaded(key: LocalModelKey): Promise<boolean> {
    try {
      return await RNFS.exists(this.localPath(key));
    } catch {
      return false;
    }
  },

  /** Download state for every model offered. */
  async statuses(): Promise<LocalModelStatus[]> {
    return Promise.all(
      LOCAL_MODEL_KEYS.map(async key => {
        const path = this.localPath(key);
        try {
          if (!(await RNFS.exists(path))) {
            return {key, isDownloaded: false, bytes: 0};
          }
          const stat = await RNFS.stat(path);
          return {key, isDownloaded: true, bytes: Number(stat.size) || 0};
        } catch {
          return {key, isDownloaded: false, bytes: 0};
        }
      }),
    );
  },

  /** Any downloaded model, preferring `preferred` when it is on disk. */
  async firstDownloaded(
    preferred?: LocalModelKey,
  ): Promise<LocalModelKey | null> {
    if (preferred && (await this.isDownloaded(preferred))) return preferred;
    for (const key of LOCAL_MODEL_KEYS) {
      if (await this.isDownloaded(key)) return key;
    }
    return null;
  },

  /**
   * Fetch a model to local storage. Returns a cancel function alongside the
   * promise; cancelling rejects the promise with DownloadCancelledError.
   */
  download(
    key: LocalModelKey,
    onProgress: (percent: number) => void,
  ): {promise: Promise<void>; cancel: () => void} {
    const model = getLocalModel(key);
    const finalPath = pathFor(model.fileName);
    const tempPath = tempPathFor(model.fileName);
    let jobId: number | null = null;
    let cancelled = false;

    const promise = (async () => {
      await ensureDir();
      await unlinkQuietly(tempPath);

      // The awaits above mean cancel() can arrive before there is a job to
      // stop. Bail here rather than starting a transfer nobody is waiting on.
      if (cancelled) throw new DownloadCancelledError();

      const job = RNFS.downloadFile({
        fromUrl: model.url,
        toFile: tempPath,
        // Required even though the result is ignored: the iOS downloader only
        // records the status code inside its begin branch and gates every
        // progress callback on it, so without a begin handler progress never
        // fires.
        begin: () => {},
        progress: res => {
          if (res.contentLength > 0) {
            onProgress((res.bytesWritten / res.contentLength) * 100);
          }
        },
        // Throttle natively (~10 fps) instead of on whole-percent boundaries.
        progressInterval: 100,
      });
      jobId = job.jobId;

      // A cancel that landed while downloadFile was starting up found jobId
      // still null and could not stop the job; honour it now.
      if (cancelled) {
        RNFS.stopDownload(job.jobId);
        await unlinkQuietly(tempPath);
        throw new DownloadCancelledError();
      }

      const result = await job.promise;
      if (cancelled) throw new DownloadCancelledError();

      // A 404 or error page still "downloads"; only 2xx is a real model.
      if (result.statusCode && result.statusCode >= 400) {
        await unlinkQuietly(tempPath);
        throw new Error(`Download failed with status ${result.statusCode}`);
      }

      // Never clobber a model that is already on disk: arriving here with the
      // file present means a second download raced this one.
      if (await RNFS.exists(finalPath)) {
        await unlinkQuietly(tempPath);
        onProgress(100);
        return;
      }
      await RNFS.moveFile(tempPath, finalPath);
      onProgress(100);
    })();

    return {
      promise,
      cancel: () => {
        cancelled = true;
        // Stop the transfer before removing the file it writes to: unlink
        // first and the native job keeps streaming into a deleted inode,
        // which looks like a download frozen at 0%.
        if (jobId !== null) {
          RNFS.stopDownload(jobId);
          unlinkQuietly(tempPath);
        }
      },
    };
  },

  /** Remove a downloaded model to reclaim space. Always user-initiated. */
  async remove(key: LocalModelKey): Promise<void> {
    await unlinkQuietly(this.localPath(key));
    await unlinkQuietly(tempPathFor(getLocalModel(key).fileName));
  },

  /** Total bytes used by downloaded models. */
  async totalBytes(): Promise<number> {
    const statuses = await this.statuses();
    return statuses.reduce((sum, s) => sum + s.bytes, 0);
  },
};

/** Human-readable size, e.g. "1.6 GB". */
export const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};
