// wakeWord.ts  – Type‑safe, singleton Wake‑Word listener for "Hey Matalk"

import {
  KeyWordRNBridgeInstance,
  createKeyWordRNBridgeInstance,
} from 'react-native-wakeword';
import Config from 'react-native-config';
import {Platform} from 'react-native';
import RNFS from 'react-native-fs';

interface InstanceConfig {
  id: string;
  modelName: string;
  threshold: number;
  bufferCnt: number;
  sticky: boolean;
  msBetweenCallbacks: number;
}

const instanceConfigs: InstanceConfig[] = [
  {
    id: 'hey_verbi_v1',
    modelName: 'hey_verbi_v1.onnx',
    threshold: 0.99,
    bufferCnt: 4,
    sticky: false,
    msBetweenCallbacks: 1000,
  },
];

export type WakeWordCallback = (phrase: string) => void;

class WakeWordService {
  private static instance: WakeWordService;
  private wakeWordCallback: WakeWordCallback | null = null;
  private keywordInstance: KeyWordRNBridgeInstance | null = null;
  private eventListener: any = null;
  private isInitialized: boolean = false;
  private isListening: boolean = false;
  private license: string = Config.WAKEWORD_LICENSE || '';

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): WakeWordService {
    if (!WakeWordService.instance) {
      WakeWordService.instance = new WakeWordService();
    }
    return WakeWordService.instance;
  }

  // Helper function to format the ONNX file name
  private formatWakeWord(fileName: string): string {
    return fileName
      .replace(/_/g, ' ') // Use global flag to replace all underscores
      .replace('.onnx', '')
      .replace(/\b\w/g, char => char.toUpperCase()); // Capitalize each word
  }

  // Verify model file exists before initialization
  private async verifyModelFile(): Promise<void> {
    const config = instanceConfigs[0];
    let modelPath: string;

    if (Platform.OS === 'ios') {
      // On iOS, model is in the main bundle - use the full path with models/ subdirectory
      modelPath = `${RNFS.MainBundlePath}/${config.modelName}`;
    } else {
      // On Android, model is in assets
      modelPath = `${RNFS.MainBundlePath}/${config.modelName}`;
    }

    console.log('[WakeWord] Verifying model file at:', modelPath);

    const exists = await RNFS.exists(modelPath);
    if (!exists) {
      throw new Error(
        `Wake word model file not found at: ${modelPath}. Please ensure ${config.modelName} is included in your build.`,
      );
    }

    console.log('[WakeWord] Model file verified successfully');
  }

  // Initialize the wake word service
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[WakeWord] Already initialized');
      return;
    }

    try {
      console.log('[WakeWord] Starting initialization...');

      // Verify license is set
      if (!this.license) {
        throw new Error(
          'Wake word license not configured. Please set WAKEWORD_LICENSE in your .env file.',
        );
      }

      // Verify model file exists
      await this.verifyModelFile();

      // Create instance
      const config = instanceConfigs[0];
      console.log('[WakeWord] Creating keyword instance with config:', {
        id: config.id,
        modelName: config.modelName,
        threshold: config.threshold,
      });

      this.keywordInstance = await createKeyWordRNBridgeInstance(
        config.id,
        false,
      );

      if (!this.keywordInstance) {
        throw new Error(`Failed to create instance ${config.id}`);
      }

      console.log('[WakeWord] Keyword instance created');

      // Create the instance with model configuration
      await this.keywordInstance.createInstance(
        config.modelName,
        config.threshold,
        config.bufferCnt,
      );

      console.log('[WakeWord] Instance configured with model');

      // Set license
      const isLicensed = await this.keywordInstance.setKeywordDetectionLicense(
        this.license,
      );

      if (!isLicensed) {
        console.warn('[WakeWord] License validation failed, but continuing...');
      } else {
        console.log('[WakeWord] License validated successfully');
      }

      this.isInitialized = true;
      console.log('[WakeWord] Initialization complete');
    } catch (error) {
      console.error('[WakeWord] Error initializing Wake Word Service:', error);

      // Check if the error is about instance already existing
      if (
        error instanceof Error &&
        error.message.includes('Instance already exists')
      ) {
        try {
          console.log('[WakeWord] Attempting to reuse existing instance...');
          // Try to get the existing instance
          const config = instanceConfigs[0];
          this.keywordInstance = await createKeyWordRNBridgeInstance(
            config.id,
            true, // Set to true to get existing instance
          );

          if (this.keywordInstance) {
            this.isInitialized = true;
            console.log('[WakeWord] Successfully reused existing instance');
            return;
          }
        } catch (reuseError) {
          console.error(
            '[WakeWord] Failed to reuse existing instance:',
            reuseError,
          );
        }
      }

      this.isInitialized = false;
      throw error;
    }
  }

  // Set up the detection callback
  private async setupCallback(): Promise<void> {
    if (!this.keywordInstance) {
      throw new Error('Wake word instance not initialized');
    }

    if (this.eventListener) {
      return;
    }

    const keywordCallback = async (phrase: string) => {
      try {
        // Stop detection when keyword is detected
        await this.stopListening();

        // Format the phrase
        const formattedPhrase = this.formatWakeWord(instanceConfigs[0].id);

        // Call user callback if set
        if (this.wakeWordCallback) {
          this.wakeWordCallback(formattedPhrase);
        }
      } catch (error) {
        console.error('Error in keyword callback:', error);
      }
    };

    // Set up event listener
    this.eventListener =
      this.keywordInstance.onKeywordDetectionEvent(keywordCallback);
  }

  // Remove event listener
  private removeEventListener(): void {
    if (this.eventListener && typeof this.eventListener.remove === 'function') {
      try {
        this.eventListener.remove();
      } catch (error) {
        console.error('Error removing event listener:', error);
      }
      this.eventListener = null;
    }
  }

  // Set callback for wake word detection
  public setCallback(callback: WakeWordCallback): void {
    this.wakeWordCallback = callback;
  }

  // Start listening for wake words
  public async startListening(): Promise<void> {
    try {
      if (this.isListening) {
        console.log('[WakeWord] Already listening');
        return;
      }

      console.log('[WakeWord] Starting listening...');

      // Initialize if not already done
      if (!this.isInitialized) {
        console.log('[WakeWord] Not initialized, initializing now...');
        await this.initialize();
      }

      if (!this.keywordInstance) {
        throw new Error(
          'Wake word instance not available after initialization',
        );
      }

      // Set up callback if not already done
      if (!this.eventListener) {
        console.log('[WakeWord] Setting up callback...');
        await this.setupCallback();
      }

      // Start detection
      console.log('[WakeWord] Starting keyword detection...');
      await this.keywordInstance.startKeywordDetection(
        instanceConfigs[0].threshold,
      );
      this.isListening = true;
      console.log('[WakeWord] Now listening for wake word');
    } catch (error) {
      console.error('[WakeWord] Error starting wake word detection:', error);
      console.error(
        '[WakeWord] Error details:',
        error instanceof Error ? error.message : String(error),
      );
      this.isListening = false;

      // Provide more helpful error message
      if (error instanceof Error) {
        if (error.message.includes('model')) {
          throw new Error(
            'Failed to start wake word service: Model file issue. Please rebuild the iOS app.',
          );
        } else if (error.message.includes('license')) {
          throw new Error(
            'Failed to start wake word service: License validation failed. Please check your WAKEWORD_LICENSE.',
          );
        } else if (
          error.message.includes('permission') ||
          error.message.includes('microphone')
        ) {
          throw new Error(
            'Failed to start wake word service: Microphone permission denied. Please grant microphone access in Settings.',
          );
        }
      }

      throw error;
    }
  }

  // Stop listening for wake words
  public async stopListening(): Promise<void> {
    try {
      if (!this.isListening || !this.keywordInstance) {
        return;
      }

      // Stop detection
      await this.keywordInstance.stopKeywordDetection();
      this.isListening = false;
    } catch (error) {
      console.error('Error stopping wake word detection:', error);
      this.isListening = false;
      throw error;
    }
  }

  // Check if currently listening
  public isCurrentlyListening(): boolean {
    return this.isListening;
  }

  // Clean up resources
  public async cleanup(): Promise<void> {
    try {
      await this.stopListening();
      this.removeEventListener();
      this.keywordInstance = null;
      this.isInitialized = false;
      this.wakeWordCallback = null;
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Restart listening (useful after detection)
  public async restartListening(delayMs: number = 0): Promise<void> {
    if (delayMs > 0) {
      setTimeout(async () => {
        await this.startListening();
      }, delayMs);
    } else {
      await this.startListening();
    }
  }

  // Set custom license
  public setLicense(license: string): void {
    this.license = license;
  }

  // Get service status for debugging
  public getStatus(): object {
    return {
      isInitialized: this.isInitialized,
      isListening: this.isListening,
      hasInstance: !!this.keywordInstance,
      hasEventListener: !!this.eventListener,
      hasCallback: !!this.wakeWordCallback,
      license: this.license ? 'Set' : 'Not set',
    };
  }
}

export default WakeWordService;
