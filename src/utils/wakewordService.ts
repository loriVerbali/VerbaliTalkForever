// wakeWord.ts  – Type‑safe, singleton Wake‑Word listener for "Hey Matalk"

import {
  KeyWordRNBridgeInstance,
  createKeyWordRNBridgeInstance,
} from 'react-native-wakeword';
import Config from 'react-native-config';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';
import mixpanel from './mixpanelInstance';

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
const IOS_MIC_RELEASE_SETTLE_MS = 250;

const WW_DEBUG = false;
const wwTrace = (...args: unknown[]) => {
  if (WW_DEBUG) {
    console.log(...args);
  }
};

export type WakeWordCallback = (phrase: string) => void;

class WakeWordService {
  private static instance: WakeWordService;
  private wakeWordCallback: WakeWordCallback | null = null;
  private keywordInstance: KeyWordRNBridgeInstance | null = null;
  private eventListener: any = null;
  private isInitialized: boolean = false;

  private isListening: boolean = false;
  private isDetectionPaused: boolean = false;
  private license: string = Config.WAKEWORD_LICENSE || '';
  private initializingPromise: Promise<void> | null = null; // Track ongoing initialization
  private startingPromise: Promise<void> | null = null; // Track ongoing startListening
  private pausingPromise: Promise<void> | null = null;
  private cleanupPromise: Promise<void> | null = null;
  private deviceModel: string | null = null;
  private iosVersion: string | null = null;
  private statusCheckInterval: ReturnType<typeof setInterval> | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    // Private constructor for singleton

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
    const promise = (async () => {
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

          // Configure Audio Routing Config for iOS to enforce defaultToSpeaker option
          if (Platform.OS === 'ios') {
            try {
              const { setWakewordAudioRoutingConfig } = require('react-native-wakeword');
              const routingConfig = {
                default: {
                  category: 'playAndRecord',
                  mode: 'measurement',
                  options: [
                    'mixWithOthers',
                    'duckOthers',
                    'allowBluetooth',
                    'allowBluetoothA2DP',
                    'allowAirPlay',
                    'defaultToSpeaker',
                  ],
                  preferredInput: 'builtInMic',
                },
                byOutputPort: {
                  builtInReceiver: {
                    category: 'playAndRecord',
                    mode: 'measurement',
                    options: [
                      'mixWithOthers',
                      'duckOthers',
                      'allowBluetooth',
                      'allowBluetoothA2DP',
                      'allowAirPlay',
                      'defaultToSpeaker',
                    ],
                    preferredInput: 'builtInMic',
                  },
                  builtInSpeaker: {
                    category: 'playAndRecord',
                    mode: 'measurement',
                    options: [
                      'mixWithOthers',
                      'duckOthers',
                      'allowBluetooth',
                      'allowBluetoothA2DP',
                      'allowAirPlay',
                      'defaultToSpeaker',
                    ],
                    preferredInput: 'builtInMic',
                  },
                },
              };
              await setWakewordAudioRoutingConfig(routingConfig);
              wwTrace('[WakeWord] iOS Audio Session routing config applied successfully.');
            } catch (configErr) {
              console.warn('[WakeWord] Failed to set audio routing config:', configErr);
            }
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
    })();

    this.initializingPromise = promise;

    try {
      await promise;
    } finally {
      if (this.initializingPromise === promise) {
        this.initializingPromise = null;
      }
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

    const keywordCallback = async () => {
      try {
        // Track Hey Verbi detection
        mixpanel.track('Hey Verbi Detected');

        // Keep the initialized detector available for the upcoming STT/TTS
        // handoff while releasing its microphone.
        await this.pauseDetection(false);

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

  // Bootstrap entry point: initialize the native instance, start detection,
  // then immediately pause so the mic is released until resumeDetection() is called.
  // Call this once at app start — never call cleanup() or initialize() again after this.
  public async initializeAndPause(): Promise<void> {
    if (this.isInitialized && this.isListening) {
      // Already bootstrapped — just ensure it is paused
      if (!this.isDetectionPaused) {
        await this.pauseDetection(false);
      }
      return;
    }

    // Run the private initialization (idempotent)
    await this.initialize();

    if (!this.keywordInstance) {
      throw new Error('[WakeWord] initializeAndPause: instance not available after init');
    }

    // Set up the event listener now (callback will be assigned by Open.tsx later)
    if (!this.eventListener) {
      await this.setupCallback();
    }

    // Start detection to put the native engine in an active state…
    await this.keywordInstance.startKeywordDetection(instanceConfigs[0].threshold);
    this.isListening = true;
    this.isDetectionPaused = false;

    // …then immediately pause — mic released, instance stays warm
    await this.pauseDetection(false);
  }

  // Start listening for wake words
  public async startListening(): Promise<void> {
    wwTrace('[WakeWordService] startListening() called');
    if (this.cleanupPromise) {
      wwTrace('[WakeWordService] startListening: waiting for cleanupPromise');
      await this.cleanupPromise;
    }

    if (this.pausingPromise) {
      wwTrace('[WakeWordService] startListening: waiting for pausingPromise');
      await this.pausingPromise;
    }

    // If startListening is already in progress, wait for it instead of starting a new one
    if (this.startingPromise) {
      wwTrace('[WakeWordService] startListening: startingPromise already exists, waiting for it');
      await this.startingPromise;
      return;
    }

    // Create a promise to track this startListening call
    const promise = (async () => {
      if (this.isListening) {
        if (this.isDetectionPaused && this.keywordInstance) {
          wwTrace('[WakeWordService] startListening: isListening is true, isDetectionPaused is true, calling unPauseDetection()');
          await this.keywordInstance.unPauseDetection();
          this.isDetectionPaused = false;
          wwTrace('[WakeWordService] startListening: unPauseDetection() completed successfully');
        } else {
          wwTrace(`[WakeWordService] startListening: isListening is true, isDetectionPaused=${this.isDetectionPaused}, no action needed`);
        }
        return;
      }

      // Initialize if not already done
      if (!this.isInitialized) {
        wwTrace('[WakeWordService] startListening: isInitialized is false, calling initialize()');
        await this.initialize();
      }

      if (!this.keywordInstance) {
        throw new Error(
          'Wake word instance not available after initialization',
        );
      }

      // Set up callback if not already done
      if (!this.eventListener) {
        wwTrace('[WakeWordService] startListening: eventListener is null, calling setupCallback()');
        await this.setupCallback();
      }

      try {
        wwTrace('[WakeWordService] startListening: calling startKeywordDetection()');
        await this.keywordInstance.startKeywordDetection(
          instanceConfigs[0].threshold,
        );

        this.isListening = true;
        this.isDetectionPaused = false;
        wwTrace('[WakeWordService] startListening: startKeywordDetection() completed successfully');

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
    })();

    this.startingPromise = promise;

    try {
      await promise;
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
      if (this.startingPromise === promise) {
        this.startingPromise = null;
      }
    }
  }

  // Stop listening for wake words
  public async stopListening(): Promise<void> {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
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
      this.isDetectionPaused = false;
      // Clear startingPromise after successful stop
      this.startingPromise = null;
    } catch (error) {
      console.error('Error stopping wake word detection:', error);
      this.isListening = false;
      this.isDetectionPaused = false;
      // Clear startingPromise even on error
      this.startingPromise = null;
      throw error;
    }
  }

  // Check if currently listening
  public isCurrentlyListening(): boolean {
    return this.isListening && !this.isDetectionPaused;
  }

  /**
   * True when the mic is live OR a startListening() is still in flight.
   * Callers that need the mic released before playing audio (TTS) must pause
   * in both cases; when this is false the mic is already off and pausing —
   * with its settle delays — can be skipped entirely.
   */
  public isActiveOrStarting(): boolean {
    return (
      (this.isListening && !this.isDetectionPaused) ||
      this.startingPromise !== null
    );
  }

  /**
   * True once the engine has been initialized this session. Callers that only
   * want to RE-open the mic (e.g. resume after TTS) must check this first —
   * resumeDetection/startListening self-initialize, which opens the mic and
   * triggers the permission prompt.
   */
  public hasInitialized(): boolean {
    return this.isInitialized;
  }

  public async pauseDetection(stopMic: boolean = true): Promise<void> {
    wwTrace(`[WakeWordService] pauseDetection(stopMic=${stopMic}) called`);
    if (this.pausingPromise) {
      wwTrace('[WakeWordService] pauseDetection: pausingPromise already exists, waiting for it');
      await this.pausingPromise;
      return;
    }

    const promise = (async () => {
      if (this.startingPromise) {
        wwTrace('[WakeWordService] pauseDetection: waiting for startingPromise');
        await this.startingPromise;
      }

      if (
        !this.isListening ||
        this.isDetectionPaused ||
        !this.keywordInstance
      ) {
        wwTrace(`[WakeWordService] pauseDetection early return: isListening=${this.isListening}, isDetectionPaused=${this.isDetectionPaused}, hasInstance=${!!this.keywordInstance}`);
        return;
      }

      wwTrace('[WakeWordService] pauseDetection: calling keywordInstance.pauseDetection()');
      await this.keywordInstance.pauseDetection(stopMic);
      this.isDetectionPaused = true;
      wwTrace('[WakeWordService] pauseDetection: paused successfully');

      if (stopMic && Platform.OS === 'ios') {
        await this.delay(IOS_MIC_RELEASE_SETTLE_MS);
      }
    })();

    this.pausingPromise = promise;

    try {
      await promise;
    } finally {
      if (this.pausingPromise === promise) {
        this.pausingPromise = null;
      }
    }
  }

  public async resumeDetection(): Promise<void> {
    wwTrace('[WakeWordService] resumeDetection() called, calling startListening()');
    await this.startListening();
  }

  // Clean up resources
  public async cleanup(): Promise<void> {
    if (this.cleanupPromise) {
      await this.cleanupPromise;
      return;
    }

    const promise = (async () => {
      try {
        if (this.restartTimeout) {
          clearTimeout(this.restartTimeout);
          this.restartTimeout = null;
        }

        if (this.initializingPromise) {
          try {
            await this.initializingPromise;
          } catch {
            // Initialization failure still needs the local state reset below.
          }
        }

        await this.stopListening();
        this.removeEventListener();

        if (this.keywordInstance) {
          try {
            await this.keywordInstance.destroyInstance();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (!message.includes('InstanceNotFound')) {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
      } finally {
        this.keywordInstance = null;
        this.isInitialized = false;
        this.isDetectionPaused = false;
        this.wakeWordCallback = null;
        this.initializingPromise = null;
        this.startingPromise = null;
        this.pausingPromise = null;
      }
    })();

    this.cleanupPromise = promise;

    try {
      await promise;
    } finally {
      if (this.cleanupPromise === promise) {
        this.cleanupPromise = null;
      }
    }
  }

  // Restart listening (useful after detection)
  public async restartListening(delayMs: number = 0): Promise<void> {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (delayMs > 0) {
      this.restartTimeout = setTimeout(async () => {
        this.restartTimeout = null;
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
      isDetectionPaused: this.isDetectionPaused,
      hasInstance: !!this.keywordInstance,
      hasEventListener: !!this.eventListener,
      hasCallback: !!this.wakeWordCallback,
      license: this.license ? 'Set' : 'Not set',
      deviceModel: this.deviceModel || 'Unknown',
    };
  }


}

export default WakeWordService;
