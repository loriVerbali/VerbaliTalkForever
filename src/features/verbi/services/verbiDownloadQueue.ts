import {
  downloadImageToCache,
  isImageCached,
  getCachedImageUri,
} from './verbiImageCache';

export interface DownloadTask {
  imageUrl: string;
  filenameKey: string;
  rank: number;
  suggestionId: string;
  onComplete?: (suggestionId: string, localUri: string) => void;
}

const MAX_CONCURRENT_DOWNLOADS = 2;

class VerbiDownloadQueue {
  private pendingQueue: DownloadTask[] = [];
  private activeDownloads = new Set<string>(); // filenameKeys currently in-flight

  /**
   * Enqueues prediction items for background downloading.
   * Only enqueues items that are NOT already cached and NOT currently downloading.
   */
  public enqueueItems(tasks: DownloadTask[]): void {
    for (const task of tasks) {
      if (isImageCached(task.filenameKey)) {
        // If already cached, call complete callback immediately if provided
        const localUri = getCachedImageUri(task.filenameKey);
        if (localUri && task.onComplete) {
          task.onComplete(task.suggestionId, localUri);
        }
        continue;
      }

      if (this.activeDownloads.has(task.filenameKey)) {
        continue;
      }

      const alreadyInPending = this.pendingQueue.some(
        t => t.filenameKey === task.filenameKey,
      );
      if (!alreadyInPending) {
        this.pendingQueue.push(task);
      }
    }

    // Sort pending tasks by prediction rank (highest confidence rank 0 first)
    this.pendingQueue.sort((a, b) => a.rank - b.rank);

    this.processQueue();
  }

  /**
   * Clears unstarted pending tasks (e.g. on new turn if obsolete).
   */
  public clearPending(): void {
    this.pendingQueue = [];
  }

  private async processQueue(): Promise<void> {
    while (
      this.pendingQueue.length > 0 &&
      this.activeDownloads.size < MAX_CONCURRENT_DOWNLOADS
    ) {
      const task = this.pendingQueue.shift();
      if (!task) break;

      if (isImageCached(task.filenameKey)) {
        const localUri = getCachedImageUri(task.filenameKey);
        if (localUri && task.onComplete) {
          task.onComplete(task.suggestionId, localUri);
        }
        continue;
      }

      this.activeDownloads.add(task.filenameKey);

      // Execute background download non-blockingly
      this.runDownloadTask(task);
    }
  }

  private async runDownloadTask(task: DownloadTask): Promise<void> {
    try {
      const localUri = await downloadImageToCache(
        task.imageUrl,
        task.filenameKey,
      );
      if (localUri && task.onComplete) {
        task.onComplete(task.suggestionId, localUri);
      }
    } catch (error) {
      console.warn(
        `[VerbiDownloadQueue] Error downloading ${task.filenameKey}:`,
        error,
      );
    } finally {
      this.activeDownloads.delete(task.filenameKey);
      // Continue processing next queued item
      this.processQueue();
    }
  }
}

export const verbiDownloadQueue = new VerbiDownloadQueue();
