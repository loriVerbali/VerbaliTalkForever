import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import TTSManager from 'react-native-sherpa-onnx-offline-tts';
import {NativeEventEmitter, NativeModules} from 'react-native';

// Class to handle all TTS operations in the app
class TTSService {
  private static instance: TTSService;
  private initialized: boolean = false;
  private isPlaying: boolean = false;
  private queue: string[] = [];
  private processingQueue: boolean = false;
  private ttsBasePath: string = `${RNFS.MainBundlePath}`;
  private ttsConfig = {
    modelPath: `${this.ttsBasePath}/en_US-amy-medium.onnx`,
    tokensPath: `${this.ttsBasePath}/tokens.txt`,
    dataDirPath: `${this.ttsBasePath}/espeak-ng-data`,
  };
  private constructor() {
    // Private constructor for singleton
    TTSService.suppressVolumeWarning();
  }

  private async initTTS() {
    const valid = await this.validateTTSFiles();
    console.log('validateTTSFiles result:', valid);
    if (!valid) return;
    try {
      await TTSManager.initialize(JSON.stringify(this.ttsConfig));
      console.log('TTS initialized');
    } catch (e) {
      console.error('TTS init failed', e);
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
    const speakerId = 0; // Piper uses 0 for single‑speaker models
    const speed = 1.0; // 1 == default, < 1 slower, > 1 faster
    try {
      await TTSManager.generateAndPlay(text, speakerId, speed);
    } catch (e) {
      console.error('TTS playback failed', e);
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.initTTS();
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
      if (immediate) {
        await this.stop();
        if (Platform.OS === 'ios') {
          this.queue = [];
          setTimeout(() => {
            this.queue.push(text);
            this.processQueue();
          }, 50);
          return;
        }
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
        await this.speakText(nextText);
      }
    } catch (error) {
      console.error('Error processing TTS queue:', error);
      this.isPlaying = false;
    } finally {
      this.isPlaying = false;
      this.processingQueue = false;
      // Automatically process next in queue if any
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  public async stop(): Promise<void> {
    // For custom TTS, just clear the queue and reset state
    this.isPlaying = false;
    this.queue = [];
    this.processingQueue = false;
  }

  public async shutdown(): Promise<void> {
    try {
      await this.stop();
    } catch (error) {
      console.error('Error shutting down TTS:', error);
    }
  }

  private async validateTTSFiles() {
    const basePath = RNFS.MainBundlePath;
    const modelPath = `${basePath}/en_US-amy-medium.onnx`;
    const tokensPath = `${basePath}/tokens.txt`;
    const dataDirPath = `${basePath}/espeak-ng-data`;
    const modelCardPath = `${basePath}/MODEL_CARD`;

    const modelExists = await RNFS.exists(modelPath);
    if (!modelExists) {
      const msg = `Missing TTS model file: ${modelPath}`;
      console.error(msg);
      return false;
    }

    const tokensExists = await RNFS.exists(tokensPath);
    if (!tokensExists) {
      const msg = `Missing TTS tokens file: ${tokensPath}`;
      console.error(msg);
      return false;
    }

    const dataDirExists = await RNFS.exists(dataDirPath);
    if (!dataDirExists) {
      const msg = `Missing espeak-ng-data folder: ${dataDirPath}`;
      console.error(msg);
      return false;
    }

    const modelCardExists = await RNFS.exists(modelCardPath);
    if (!modelCardExists) {
      const msg = `Missing MODEL_CARD file: ${modelCardPath}`;
      console.error(msg);
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
