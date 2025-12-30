import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {NativeEventEmitter, NativeModules} from 'react-native';

// Platform-specific imports
let TTSManager: any;
let Tts: any;

if (Platform.OS === 'ios') {
  TTSManager = require('react-native-sherpa-onnx-offline-tts').default;
} else {
  Tts = require('react-native-tts').default;
}

// Class to handle all TTS operations in the app
class TTSService {
  private static instance: TTSService;
  private initialized: boolean = false;
  private isPlaying: boolean = false;
  private queue: Array<{text: string; onComplete?: () => void}> = [];
  private processingQueue: boolean = false;
  private currentItem: {text: string; onComplete?: () => void} | null = null;
  private ttsBasePath: string = `${RNFS.MainBundlePath}`;
  private ttsConfig = {
    modelPath: `${this.ttsBasePath}/en_US-amy-medium.onnx`,
    tokensPath: `${this.ttsBasePath}/tokens.txt`,
    dataDirPath: `${this.ttsBasePath}/espeak-ng-data`,
  };
  private iosTTSPlaybackTimeout: ReturnType<typeof setTimeout> | null = null;
  private iosTTSPlaybackStartTime: number = 0;
  private iosTTSEstimatedDuration: number = 0;

  private constructor() {
    // Private constructor for singleton
    TTSService.suppressVolumeWarning();
  }

  private async initTTS() {
    if (Platform.OS === 'ios') {
      const valid = await this.validateTTSFiles();
      if (!valid) return;
      try {
        await TTSManager.initialize(JSON.stringify(this.ttsConfig));
      } catch (e) {
        
      }
    } else {
      // Android - using react-native-tts
      try {
        await Tts.setDefaultLanguage('en-US');
        await Tts.setDefaultRate(0.5);
        await Tts.setDefaultPitch(1.0);

        // Set up event listeners for Android TTS
        Tts.addEventListener('tts-start', () => {
          this.isPlaying = true;
        });

        Tts.addEventListener('tts-finish', () => {
          this.isPlaying = false;
          this.processingQueue = false;
          // Call completion callback if set
          if (this.currentItem?.onComplete) {
            this.currentItem.onComplete();
            this.currentItem = null;
          }
          // Process next in queue if any
          if (this.queue.length > 0) {
            this.processQueue();
          }
        });

        Tts.addEventListener('tts-cancel', () => {
          this.isPlaying = false;
          this.processingQueue = false;
        });
      } catch (e) {
        
      }
    }
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  private async speakText(text: string) {
    if (!text) return;

    try {
      if (Platform.OS === 'ios') {
        const speakerId = 0; // Piper uses 0 for single‑speaker models
        const speed = 1.0; // 1 == default, < 1 slower, > 1 faster

        // Estimate duration for iOS TTS (roughly 15 characters per second)
        this.iosTTSEstimatedDuration = Math.max(
          1000,
          (text.length / 15) * 1000,
        );
        this.iosTTSPlaybackStartTime = Date.now();

        // Set a timeout to mark playback as finished
        this.iosTTSPlaybackTimeout = setTimeout(() => {
          this.handleIOSPlaybackFinished();
        }, this.iosTTSEstimatedDuration);

        await TTSManager.generateAndPlay(text, speakerId, speed);
      } else {
        // Android - using react-native-tts
        await Tts.speak(text);
      }
    } catch (e) {
      
      // Clear timeout on error
      if (Platform.OS === 'ios') {
        this.clearIOSPlaybackTimeout();
        this.handleIOSPlaybackFinished();
      }
    }
  }

  private handleIOSPlaybackFinished() {
    this.clearIOSPlaybackTimeout();
    this.isPlaying = false;
    this.processingQueue = false;

    // Call completion callback if set
    if (this.currentItem?.onComplete) {
      this.currentItem.onComplete();
      this.currentItem = null;
    }

    // Process next in queue if any
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }

  private clearIOSPlaybackTimeout() {
    if (this.iosTTSPlaybackTimeout) {
      clearTimeout(this.iosTTSPlaybackTimeout);
      this.iosTTSPlaybackTimeout = null;
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.initTTS();
      this.initialized = true;
    } catch (error) {
      
      this.initialized = false;
    }
  }

  public async speak(
    text: string,
    immediate: boolean = false,
    onComplete?: () => void,
  ): Promise<void> {
    if (!text || text.trim().length === 0) {
      
      return;
    }

    try {
      if (!this.initialized) {
        const initialized = await this.waitForInitialization();
        if (!initialized) {
          
          return;
        }
      }

      if (immediate) {
        await this.stop();
        // For iOS, wait a bit longer to ensure previous playback is fully stopped
        const stopDelay = Platform.OS === 'ios' ? 200 : 50;
        setTimeout(() => {
          this.queue = [{text, onComplete}];
          this.processQueue();
        }, stopDelay);
        return;
      } else {
        this.queue.push({text, onComplete});
      }

      if (!this.isPlaying && !this.processingQueue) {
        this.processQueue();
      }
    } catch (error) {
      
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.isPlaying || this.queue.length === 0) {
      return;
    }

    this.processingQueue = true;
    try {
      const nextItem = this.queue.shift();
      if (nextItem) {
        this.currentItem = nextItem;
        this.isPlaying = true;
        await this.speakText(nextItem.text);

        // For iOS, don't immediately set isPlaying to false
        // Let the timeout handle it
        if (Platform.OS !== 'ios') {
          this.isPlaying = false;
          this.processingQueue = false;
          // Call completion callback if set (for Android, it's called in tts-finish event)
          // But we handle it in the event listener, so no need to call here
          this.currentItem = null;
          // Process next in queue if any
          if (this.queue.length > 0) {
            this.processQueue();
          }
        }
      }
    } catch (error) {
      
      this.isPlaying = false;
      this.processingQueue = false;
      this.currentItem = null;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (Platform.OS === 'android' && Tts) {
        await Tts.stop();
      } else if (Platform.OS === 'ios') {
        // For iOS, clear the timeout and reset state
        this.clearIOSPlaybackTimeout();
      }

      // Clear the queue and reset state for both platforms
      this.isPlaying = false;
      this.queue = [];
      this.processingQueue = false;
      this.currentItem = null;
    } catch (error) {
      
      // Reset state even if stop fails
      this.isPlaying = false;
      this.queue = [];
      this.processingQueue = false;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      await this.stop();
      this.initialized = false;
    } catch (error) {
      
      // Reset state even if shutdown fails
      this.initialized = false;
    }
  }

  public clearQueue(): void {
    this.queue = [];
    this.processingQueue = false;
  }

  public isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isAvailable(): boolean {
    return this.initialized;
  }

  public async waitForInitialization(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      await this.initialize();
      return this.initialized;
    } catch (error) {
      
      return false;
    }
  }

  private async validateTTSFiles() {
    // Only validate TTS files on iOS since Android uses system TTS
    if (Platform.OS !== 'ios') {
      return true;
    }

    const basePath = RNFS.MainBundlePath;
    const modelPath = `${basePath}/en_US-amy-medium.onnx`;
    const tokensPath = `${basePath}/tokens.txt`;
    const dataDirPath = `${basePath}/espeak-ng-data`;
    const modelCardPath = `${basePath}/MODEL_CARD`;

    const modelExists = await RNFS.exists(modelPath);
    if (!modelExists) {
      const msg = `Missing TTS model file: ${modelPath}`;
      
      return false;
    }

    const tokensExists = await RNFS.exists(tokensPath);
    if (!tokensExists) {
      const msg = `Missing TTS tokens file: ${tokensPath}`;
      
      return false;
    }

    const dataDirExists = await RNFS.exists(dataDirPath);
    if (!dataDirExists) {
      const msg = `Missing espeak-ng-data folder: ${dataDirPath}`;
      
      return false;
    }

    const modelCardExists = await RNFS.exists(modelCardPath);
    if (!modelCardExists) {
      const msg = `Missing MODEL_CARD file: ${modelCardPath}`;
      
      return false;
    }

    return true;
  }

  // Suppress volume warning by subscribing to VolumeUpdate event
  public static suppressVolumeWarning() {
    const emitter = new NativeEventEmitter(
      NativeModules.TTSManager || NativeModules.TTS,
    );
    const subscription = emitter.addListener('VolumeUpdate', () => {});
    return () => subscription.remove();
  }
}

export default TTSService.getInstance();
