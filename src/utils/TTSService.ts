import Tts from 'react-native-tts';
import {Platform} from 'react-native';

// Class to handle all TTS operations in the app
class TTSService {
  private static instance: TTSService;
  private initialized: boolean = false;
  private isPlaying: boolean = false;
  private queue: string[] = [];
  private processingQueue: boolean = false;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Setup basic event listeners with only supported events
      Tts.addEventListener('tts-start', () => (this.isPlaying = true));
      Tts.addEventListener('tts-finish', () => {
        this.isPlaying = false;
        this.processQueue();
      });
      Tts.addEventListener('tts-cancel', () => {
        this.isPlaying = false;
        this.queue = [];
        this.processingQueue = false;
      });
      // Note: 'tts-error' is not supported on iOS, removed

      // Only configure language - this is the most reliable setting across platforms
      await Tts.setDefaultLanguage('en-US');

      // Set platform-specific options that are most reliable
      if (Platform.OS === 'android') {
        // These are safe on Android
        await Tts.setDefaultRate(0.5);
        await Tts.setDefaultPitch(1.0);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize TTS:', error);
      this.initialized = false;
    }
  }

  public async speak(text: string, immediate: boolean = false): Promise<void> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // If immediate is true, stop current speech and clear queue
      if (immediate) {
        this.stop();
        this.queue = [text];
      } else {
        this.queue.push(text);
      }

      if (!this.isPlaying && !this.processingQueue) {
        this.processQueue();
      }
    } catch (error) {
      console.error('Error in speak method:', error);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.isPlaying || this.queue.length === 0) {
      return;
    }

    this.processingQueue = true;
    try {
      const nextText = this.queue.shift();
      if (nextText) {
        this.isPlaying = true;
        await Tts.speak(nextText);
      }
    } catch (error) {
      console.error('Error processing TTS queue:', error);
      this.isPlaying = false;
    } finally {
      this.processingQueue = false;
    }
  }

  public stop(): void {
    try {
      Tts.stop();
      this.isPlaying = false;
    } catch (error) {
      console.error('Error stopping TTS:', error);
    }
  }

  public shutdown(): void {
    try {
      Tts.stop();
      Tts.removeAllListeners('tts-start');
      Tts.removeAllListeners('tts-finish');
      Tts.removeAllListeners('tts-cancel');
      // Note: 'tts-error' is not supported on iOS, removed from cleanup
    } catch (error) {
      console.error('Error shutting down TTS:', error);
    }
  }
}

export default TTSService.getInstance();
