// wakeWord.ts  – Type‑safe, singleton Wake‑Word listener for "Hey Matalk"

import {
  KeyWordRNBridgeInstance,
  createKeyWordRNBridgeInstance,
} from 'react-native-wakeword';
import Config from 'react-native-config';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import AudioSessionManager from './AudioSessionManager';
import { Mixpanel } from 'mixpanel-react-native';

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
    threshold: 0.9999,
    bufferCnt: 4,
    sticky: false,
    msBetweenCallbacks: 1000,
  },
];

// Retry configuration
const MAX_INIT_RETRIES = 3;
const INIT_RETRY_DELAY_MS = 1000; // Base delay in milliseconds

export type WakeWordCallback = (phrase: string) => void;

class WakeWordService {
  private static instance: WakeWordService;
  private wakeWordCallback: WakeWordCallback | null = null;
  private keywordInstance: KeyWordRNBridgeInstance | null = null;
  private eventListener: any = null;
  private isInitialized: boolean = false;
  private mixpanel: Mixpanel;
  private isListening: boolean = false;
  private license: string = Config.WAKEWORD_LICENSE || '';
  private initializingPromise: Promise<void> | null = null; // Track ongoing initialization
  private startingPromise: Promise<void> | null = null; // Track ongoing startListening
  private deviceModel: string | null = null;
  private iosVersion: string | null = null;
  private statusCheckInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    // Private constructor for singleton
    this.mixpanel = new Mixpanel('f88f7a27585868c53b1e08c06f5226bd', true);
    this.detectDevice();
  }

  // Detect device model for logging purposes
  private async detectDevice(): Promise<void> {
    try {
      this.deviceModel = await DeviceInfo.getModel();
      this.iosVersion = await DeviceInfo.getSystemVersion();
    } catch (error) {
      console.warn('[WakeWord] Could not detect device model:', error);
    }
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

  // Helper function to determine if an error is retryable
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();

    // Don't retry on these errors (they won't succeed on retry):
    // - License errors (configuration issue)
    // - Permission errors (user action required)
    // - Model file errors (build issue)
    const nonRetryableErrors = [
      'license',
      'permission',
      'microphone',
      'model file',
      'model not found',
      'not configured',
    ];

    if (nonRetryableErrors.some(keyword => errorMessage.includes(keyword))) {
      return false;
    }

    // Retry on transient errors:
    // - Network/timeout errors
    // - Instance creation failures (might be temporary)
    // - Generic errors that might be transient
    return true;
  }

  // Helper function to sleep/delay
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Initialize the wake word service
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // If initialization is already in progress, wait for it instead of starting a new one
    if (this.initializingPromise) {
      await this.initializingPromise;
      return;
    }

    // Create a promise to track this initialization
    this.initializingPromise = (async () => {
      try {
        let lastError: unknown = null;
        let attempt = 0;

        while (attempt < MAX_INIT_RETRIES) {
          attempt++;
          try {
            if (attempt > 1) {
              // Exponential backoff: delay increases with each retry
              const delayMs = INIT_RETRY_DELAY_MS * Math.pow(2, attempt - 2);
              await this.delay(delayMs);
            }

            // Verify license is set
            if (!this.license) {
              throw new Error(
                'Wake word license not configured. Please set WAKEWORD_LICENSE in your .env file.',
              );
            }

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
            // Note: The library expects just the model filename, it will look in the main bundle

            await this.keywordInstance.createInstance(
              config.modelName,
              config.threshold,
              config.bufferCnt,
            );

            // Log device information

            // Set license
            const isLicensed =
              await this.keywordInstance.setKeywordDetectionLicense(
                this.license,
              );

            this.isInitialized = true;

            return; // Success - exit retry loop
          } catch (error) {
            lastError = error;
            console.error(
              `[WakeWord] ❌ Error initializing Wake Word Service (attempt ${attempt}/${MAX_INIT_RETRIES}):`,
              error,
            );
            console.error(
              '[WakeWord] Error details:',
              error instanceof Error ? error.message : String(error),
            );

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

                  return; // Success - exit retry loop
                }
              } catch (reuseError) {
                console.error(
                  '[WakeWord] ❌ Failed to reuse existing instance:',
                  reuseError,
                );
                lastError = reuseError;
              }
            }

            // Check if error is retryable
            if (!this.isRetryableError(error)) {
              break; // Don't retry non-retryable errors
            }

            // If this was the last attempt, break out of the loop
            if (attempt >= MAX_INIT_RETRIES) {
              console.error(
                `[WakeWord] ❌ Failed after ${MAX_INIT_RETRIES} attempts`,
              );
              break;
            }

            // Reset state before retry
            this.keywordInstance = null;
            this.isInitialized = false;
          }
        }

        // If we get here, all retries failed
        this.isInitialized = false;
        throw (
          lastError ||
          new Error('Wake word initialization failed after all retry attempts')
        );
      } finally {
        // Clear the promise when initialization completes (success or failure)
        this.initializingPromise = null;
      }
    })();

    // Wait for initialization to complete
    await this.initializingPromise;
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
        // Track Hey Verbi detection
        this.mixpanel.track('Hey Verbi Detected');

        // Stop detection when keyword is detected
        await this.stopListening();

        // Format the phrase
        const formattedPhrase = this.formatWakeWord(instanceConfigs[0].id);

        // Call user callback if set
        if (this.wakeWordCallback) {
          this.wakeWordCallback(formattedPhrase);
        }
      } catch (error) {
        console.error('[WakeWord] ❌ Error in keyword callback:', error);
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

    // If wake word is already listening but event listener wasn't set up with this callback,
    // we need to ensure the callback will be called. The event listener checks this.wakeWordCallback
    // dynamically, so it should work, but let's verify the event listener exists.
    if (this.isListening && !this.eventListener) {
      this.setupCallback().catch(error => {
        console.error('[WakeWord] ❌ Error re-setting up callback:', error);
      });
    }
  }

  // Start listening for wake words
  public async startListening(): Promise<void> {
    // If startListening is already in progress, wait for it instead of starting a new one
    if (this.startingPromise) {
      await this.startingPromise;
      return;
    }

    // Create a promise to track this startListening call
    this.startingPromise = (async () => {
      try {
        if (this.isListening) {
          return;
        }

        // Initialize if not already done
        if (!this.isInitialized) {
          await this.initialize();
        }

        if (!this.keywordInstance) {
          throw new Error(
            'Wake word instance not available after initialization',
          );
        }

        // Set up callback if not already done
        if (!this.eventListener) {
          await this.setupCallback();
        }

        // Prepare audio session for wakeword before starting
        if (Platform.OS === 'ios') {
          await AudioSessionManager.prepareForWakeword();
        }

        // Add a small delay to ensure audio session is ready
        await new Promise<void>(resolve => setTimeout(resolve, 100));

        try {
          const detectionResult =
            await this.keywordInstance.startKeywordDetection(
              instanceConfigs[0].threshold,
            );

          this.isListening = true;

          // Set up a periodic check to verify service is still active (for debugging)
          if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
          }
        } catch (detectionError) {
          console.error(
            '[WakeWord] Error starting wake word detection:',
            detectionError,
          );
          throw detectionError;
        }
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
      } finally {
        // Clear the promise when startListening completes (success or failure)
        this.startingPromise = null;
      }
    })();

    // Wait for startListening to complete
    await this.startingPromise;
  }

  // Stop listening for wake words
  public async stopListening(): Promise<void> {
    // Clear status check interval
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }

    // Wait for any in-progress startListening() to complete first
    // This prevents race conditions where stop is called while start is in progress
    if (this.startingPromise) {
      try {
        await this.startingPromise;
      } catch (error) {
        console.warn(
          '[WakeWord] Error waiting for startListening promise:',
          error,
        );
      }
    }

    try {
      if (!this.isListening || !this.keywordInstance) {
        // Clear startingPromise if it exists but we're not actually listening
        this.startingPromise = null;
        return;
      }

      // Stop detection
      await this.keywordInstance.stopKeywordDetection();
      this.isListening = false;
      // Clear startingPromise after successful stop
      this.startingPromise = null;
    } catch (error) {
      console.error('Error stopping wake word detection:', error);
      this.isListening = false;
      // Clear startingPromise even on error
      this.startingPromise = null;
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
      // Wait for any ongoing operations to complete
      if (this.startingPromise) {
        await this.startingPromise;
      }
      if (this.initializingPromise) {
        await this.initializingPromise;
      }

      await this.stopListening();
      this.removeEventListener();
      this.keywordInstance = null;
      this.isInitialized = false;
      this.wakeWordCallback = null;
      this.initializingPromise = null;
      this.startingPromise = null;
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
      deviceModel: this.deviceModel || 'Unknown',
    };
  }

  // Diagnostic method to check if service is functional
  // This helps identify if ONNX Runtime errors are just warnings or actual failures
  public async testService(): Promise<{
    success: boolean;
    error?: string;
    details: object;
  }> {
    try {
      const status = this.getStatus();

      if (!this.isInitialized) {
        return {
          success: false,
          error: 'Service not initialized',
          details: status,
        };
      }

      if (!this.keywordInstance) {
        return {
          success: false,
          error: 'Keyword instance not available',
          details: status,
        };
      }

      // Try to start listening briefly to test if it works
      const wasListening = this.isListening;
      if (!wasListening) {
        try {
          await this.startListening();
          // Give it a moment to initialize
          await this.delay(500);
          await this.stopListening();
        } catch (error) {
          return {
            success: false,
            error: `Failed to start/stop listening: ${error instanceof Error ? error.message : String(error)
              }`,
            details: {
              ...status,
              testError: error,
            },
          };
        }
      }

      return {
        success: true,
        details: {
          ...status,
          note: 'Service appears functional',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Test failed: ${error instanceof Error ? error.message : String(error)
          }`,
        details: this.getStatus(),
      };
    }
  }
}

export default WakeWordService;
