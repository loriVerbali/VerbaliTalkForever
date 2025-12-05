// wakeWord.ts  – Type‑safe, singleton Wake‑Word listener for "Hey Matalk"

import {
  KeyWordRNBridgeInstance,
  createKeyWordRNBridgeInstance,
} from 'react-native-wakeword';
import Config from 'react-native-config';

interface InstanceConfig {
  id: string;
  modelName: string;
  threshold: number;
  bufferCnt: number;
  sticky: boolean;
}

const instanceConfigs: InstanceConfig[] = [
  {
    id: 'hey_verbi_v1',
    modelName: 'hey_verbi_v1.onnx',
    threshold: 0.9999,
    bufferCnt: 3,
    sticky: false,
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

  // Initialize the wake word service
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create instance
      const config = instanceConfigs[0];

      this.keywordInstance = await createKeyWordRNBridgeInstance(
        config.id,
        false,
      );

      if (!this.keywordInstance) {
        throw new Error(`Failed to create instance ${config.id}`);
      }

      // Create the instance with model configuration
      await this.keywordInstance.createInstance(
        config.modelName,
        config.threshold,
        config.bufferCnt,
      );

      // Set license
      const isLicensed = await this.keywordInstance.setKeywordDetectionLicense(
        this.license,
      );
      if (!isLicensed) {
        console.warn('License validation failed, but continuing...');
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing Wake Word Service:', error);

      // Check if the error is about instance already existing
      if (
        error instanceof Error &&
        error.message.includes('Instance already exists')
      ) {
        try {
          // Try to get the existing instance
          const config = instanceConfigs[0];
          this.keywordInstance = await createKeyWordRNBridgeInstance(
            config.id,
            true, // Set to true to get existing instance
          );

          if (this.keywordInstance) {
            this.isInitialized = true;
            return;
          }
        } catch (reuseError) {
          console.error('Failed to reuse existing instance:', reuseError);
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
        return;
      }

      // Initialize if not already done
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.keywordInstance) {
        throw new Error('Wake word instance not available');
      }

      // Set up callback if not already done
      if (!this.eventListener) {
        await this.setupCallback();
      }

      // Start detection
      await this.keywordInstance.startKeywordDetection(
        instanceConfigs[0].threshold,
      );
      this.isListening = true;
    } catch (error) {
      console.error('Error starting wake word detection:', error);
      this.isListening = false;
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
