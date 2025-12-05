import RNFS from 'react-native-fs';
import {Platform} from 'react-native';
import {MODEL_CONFIG} from './constants';
import {detectDeviceCapabilities} from './deviceDetection';

// Import whisper.rn
let initWhisper: any;
let releaseAllWhisper: any;
try {
  const whisperModule = require('whisper.rn');
  initWhisper = whisperModule.initWhisper;
  releaseAllWhisper = whisperModule.releaseAllWhisper;
} catch (e) {
  console.error('whisper.rn import failed:', e);
}

interface WhisperTranscriptionResult {
  text: string;
  success: boolean;
  error?: string;
}

class WhisperService {
  private static instance: WhisperService;
  private initialized: boolean = false;
  private initializationChecked: boolean = false; // optimization 6
  private modelPath: string = '';
  private whisperContext: any = null;
  private useGpu: boolean = true; // Will be determined based on device
  private isLowEndDevice: boolean = false; // Cached device capability

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): WhisperService {
    if (!WhisperService.instance) {
      WhisperService.instance = new WhisperService();
    }
    return WhisperService.instance;
  }

  /**
   * Detect if device is low-end and should use CPU instead of GPU
   * Pi-3 tablets and similar low-end devices benefit from CPU mode
   */
  private async detectDeviceCapabilities(): Promise<void> {
    if (this.initializationChecked) {
      return; // Already detected
    }

    try {
      const capabilities = await detectDeviceCapabilities();
      this.isLowEndDevice = capabilities.isLowEndDevice;

      // On low-end devices, CPU is often faster than GPU
      // GPU on these devices is usually weak and can cause slowdowns
      this.useGpu = !this.isLowEndDevice;

      console.log(
        `🔍 Device detection: Model=${capabilities.deviceModel}, Brand=${capabilities.deviceBrand}, ` +
          `RAM=${capabilities.totalMemoryMB.toFixed(0)}MB, LowEnd=${
            this.isLowEndDevice
          }, ` +
          `UseGPU=${this.useGpu}`,
      );
    } catch (error) {
      console.warn(
        '⚠️ Error detecting device capabilities, defaulting to CPU:',
        error,
      );
      // Default to CPU on error to be safe
      this.isLowEndDevice = true;
      this.useGpu = false;
    }
  }

  /**
   * Initialize the Whisper service with the downloaded model
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      if (!initWhisper) {
        console.error('whisper.rn is not available or not properly imported');
        return false;
      }

      // Detect device capabilities first
      await this.detectDeviceCapabilities();

      // Check if model file exists (use appropriate model for device)
      const whisperFileName = MODEL_CONFIG.getWhisperModelFileName(
        this.isLowEndDevice,
      );
      this.modelPath = `${RNFS.DocumentDirectoryPath}/${whisperFileName}`;

      const modelExists = await RNFS.exists(this.modelPath);

      if (!modelExists) {
        console.error('Whisper model file not found at:', this.modelPath);
        return false;
      }

      // Verify model file size (different thresholds for different models)
      const stats = await RNFS.stat(this.modelPath);
      const minSize = this.isLowEndDevice
        ? 50 * 1024 * 1024 // 50MB for tiny model
        : 100 * 1024 * 1024; // 100MB for small model
      if (stats.size < minSize) {
        console.warn(
          `Whisper model file seems too small (${(
            stats.size /
            1024 /
            1024
          ).toFixed(2)}MB), might be corrupted`,
        );
      }

      // Try to initialize with detected GPU preference
      // If GPU fails on low-end device, fallback to CPU
      let initAttempts = 0;
      const maxAttempts = this.isLowEndDevice ? 1 : 2; // Only try GPU once on low-end, allow retry on others

      while (initAttempts < maxAttempts) {
        try {
          console.log(
            `🚀 Initializing Whisper with ${
              this.useGpu ? 'GPU' : 'CPU'
            } mode (attempt ${initAttempts + 1})`,
          );

          this.whisperContext = await initWhisper({
            filePath: this.modelPath,
            isBundleAsset: false,
            useGpu: this.useGpu,
          });

          if (this.whisperContext) {
            console.log(
              `✅ Whisper initialized successfully with ${
                this.useGpu ? 'GPU' : 'CPU'
              }`,
            );
            this.initialized = true;
            return true;
          }
        } catch (gpuError) {
          console.warn(
            `⚠️ GPU initialization failed: ${
              gpuError instanceof Error ? gpuError.message : 'Unknown error'
            }`,
          );

          // If GPU failed and we haven't tried CPU yet, fallback to CPU
          if (this.useGpu && initAttempts < maxAttempts - 1) {
            console.log('🔄 Falling back to CPU mode...');
            this.useGpu = false;
          }
        }

        initAttempts++;
      }

      // If we get here, initialization failed
      console.error(
        '❌ Failed to initialize Whisper context after all attempts',
      );
      return false;
    } catch (error) {
      console.error('❌ Error initializing Whisper service:', error);
      return false;
    }
  }

  /**
   * Check if the Whisper model is available and ready to use
   */
  public async isModelAvailable(): Promise<boolean> {
    if (!initWhisper) {
      return false;
    }

    // Detect device capabilities to determine which model to check for
    let deviceIsLowEnd = false;
    try {
      const capabilities = await detectDeviceCapabilities();
      deviceIsLowEnd = capabilities.isLowEndDevice;
    } catch (error) {
      console.warn('Error detecting device capabilities:', error);
      deviceIsLowEnd = true; // Default to low-end on error
    }

    const whisperFileName =
      MODEL_CONFIG.getWhisperModelFileName(deviceIsLowEnd);
    const modelPath = `${RNFS.DocumentDirectoryPath}/${whisperFileName}`;

    try {
      const exists = await RNFS.exists(modelPath);
      if (exists) {
        const stats = await RNFS.stat(modelPath);
        const minSize = deviceIsLowEnd
          ? 50 * 1024 * 1024 // 50MB for tiny model
          : 100 * 1024 * 1024; // 100MB for small model
        const isValidSize = stats.size > minSize;

        return isValidSize;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error checking model availability:', error);
      return false;
    }
  }

  /**
   * Get detailed information about model availability
   */
  public async getModelStatus(): Promise<{
    available: boolean;
    reason?: string;
    path: string;
    size?: number;
    downloadInProgress?: boolean;
  }> {
    if (!initWhisper) {
      return {
        available: false,
        reason: 'Whisper module not available',
        path: '',
      };
    }

    // Detect device capabilities to determine which model to check for
    let deviceIsLowEnd = false;
    try {
      const capabilities = await detectDeviceCapabilities();
      deviceIsLowEnd = capabilities.isLowEndDevice;
    } catch (error) {
      console.warn('Error detecting device capabilities:', error);
      deviceIsLowEnd = true; // Default to low-end on error
    }

    const whisperFileName =
      MODEL_CONFIG.getWhisperModelFileName(deviceIsLowEnd);
    const modelPath = `${RNFS.DocumentDirectoryPath}/${whisperFileName}`;

    try {
      const exists = await RNFS.exists(modelPath);
      if (exists) {
        const stats = await RNFS.stat(modelPath);
        const minSize = deviceIsLowEnd
          ? 50 * 1024 * 1024 // 50MB for tiny model
          : 100 * 1024 * 1024; // 100MB for small model
        const isValidSize = stats.size > minSize;

        return {
          available: isValidSize,
          reason: isValidSize
            ? 'Model ready'
            : `Model file too small: ${(stats.size / 1024 / 1024).toFixed(
                2,
              )}MB`,
          path: modelPath,
          size: stats.size,
        };
      } else {
        // Check if there's a partial download file
        const tempPath = `${modelPath}.tmp`;
        const tempExists = await RNFS.exists(tempPath);

        return {
          available: false,
          reason: tempExists
            ? 'Model download in progress'
            : 'Model file not found',
          path: modelPath,
          downloadInProgress: tempExists,
        };
      }
    } catch (error) {
      return {
        available: false,
        reason: `Error checking model: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        path: modelPath,
      };
    }
  }

  /**
   * Transcribe audio file using local Whisper model
   */
  public async transcribeAudio(
    audioPath: string,
  ): Promise<WhisperTranscriptionResult> {
    try {
      // Fast path: if already initialized, skip all checks
      if (this.initialized && this.whisperContext) {
        // Proceed directly to transcription
      } else if (!this.initializationChecked) {
        // Only check initialization if not already checked
        if (!this.initialized || !this.whisperContext) {
          const initSuccess = await this.initialize();
          if (!initSuccess || !this.whisperContext) {
            return {text: '', success: false, error: 'Whisper not available'};
          }
        }
        this.initializationChecked = true;
      } else {
        // Initialization was checked but failed - don't retry on every call
        if (!this.initialized || !this.whisperContext) {
          return {text: '', success: false, error: 'Whisper not available'};
        }
      }

      // Use the original audio path directly since it works
      let transcriptionResult = null;
      let processedAudioPath = audioPath;

      // For iOS, remove file:// prefix if present (only if needed)
      // For Android, keep file:// prefix as-is since it's already added in transcribeAudioWithWhisper
      if (Platform.OS === 'ios' && processedAudioPath.startsWith('file://')) {
        processedAudioPath = processedAudioPath.slice(7);
      }

      // // Check if the audio file exists before attempting transcription
      // const fileExists = await RNFS.exists(processedAudioPath);
      // if (!fileExists) {
      //   console.error('❌ Audio file does not exist:', processedAudioPath);
      //   return {
      //     text: '',
      //     success: false,
      //     error: `Audio file not found: ${processedAudioPath}`,
      //   };
      // }

      // Optimize transcription options for speed, especially on low-end devices
      // Lower temperature and bestOf values = faster processing
      const transcriptionOptions = {
        language: 'en',
        translateToEnglish: false,
        wordTimestamps: false,
        outputFormat: 'text',
        temperature: 0.0, // Keep at 0 for deterministic, faster results
        bestOf: 1, // Single pass for speed (no beam search)
        suppressBlank: true,
        suppressNonSpeechTokens: true,
        initialPrompt: '',
        // Additional speed optimizations for low-end devices
        ...(this.isLowEndDevice &&
          {
            // On low-end devices, we can skip some processing for speed
            // These options are already optimal, but we document them here
          }),
      };

      try {
        const transcribeJob = this.whisperContext.transcribe(
          processedAudioPath,
          transcriptionOptions,
        );

        transcriptionResult = await transcribeJob.promise;
      } catch (transcriptionError) {
        console.error(
          `WhisperService: Transcription error with path ${processedAudioPath}:`,
          transcriptionError,
        );
        return {
          text: '',
          success: false,
          error: `Transcription failed: ${
            transcriptionError instanceof Error
              ? transcriptionError.message
              : 'Unknown error'
          }`,
        };
      }

      // Extract text from result (optimization 5)
      let transcribedText = '';
      if (typeof transcriptionResult === 'string') {
        transcribedText = transcriptionResult.trim();
      } else if (transcriptionResult?.result) {
        transcribedText = transcriptionResult.result.trim();
      } else if (transcriptionResult?.text) {
        transcribedText = transcriptionResult.text.trim();
      }

      return {
        text: transcribedText,
        success: true,
      };
    } catch (error) {
      console.error('❌ Error during Whisper transcription:', error);
      return {
        text: '',
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown transcription error',
      };
    }
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    try {
      if (this.whisperContext) {
        await this.whisperContext.release();
        this.whisperContext = null;
      }
      this.initialized = false;
    } catch (error) {
      console.error('Error cleaning up Whisper service:', error);
    }
  }

  /**
   * Get model information
   */
  public getModelInfo(): {path: string; available: boolean} {
    return {
      path: this.modelPath,
      available: this.initialized,
    };
  }

  /**
   * Test transcription with a specific audio file
   */
  public async testTranscription(audioPath: string): Promise<{
    success: boolean;
    text?: string;
    error?: string;
    fileInfo?: any;
  }> {
    try {
      // Check if file exists
      const fileExists = await RNFS.exists(audioPath);
      if (!fileExists) {
        return {
          success: false,
          error: 'Audio file not found',
        };
      }

      // Get file info
      const fileInfo = await RNFS.stat(audioPath);

      // Initialize if needed
      if (!this.initialized) {
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            success: false,
            error: 'Failed to initialize Whisper service',
            fileInfo,
          };
        }
      }

      // Try transcription
      const result = await this.transcribeAudio(audioPath);

      return {
        success: result.success,
        text: result.text,
        error: result.error,
        fileInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test audio file format compatibility
   */
  public async testAudioFileCompatibility(audioPath: string): Promise<{
    compatible: boolean;
    error?: string;
    fileInfo?: any;
    testResult?: any;
  }> {
    try {
      // Check if file exists
      const fileExists = await RNFS.exists(audioPath);
      if (!fileExists) {
        return {
          compatible: false,
          error: 'Audio file not found',
        };
      }

      // Get file info
      const fileInfo = await RNFS.stat(audioPath);

      // Check file size
      if (fileInfo.size < 1024) {
        return {
          compatible: false,
          error: 'File too small (less than 1KB)',
          fileInfo,
        };
      }

      // Initialize if needed
      if (!this.initialized) {
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            compatible: false,
            error: 'Failed to initialize Whisper service',
            fileInfo,
          };
        }
      }

      // Try a minimal transcription test with optimized options
      try {
        const transcriptionOptions = {
          language: 'en',
          translateToEnglish: false,
          wordTimestamps: false,
          outputFormat: 'text',
          temperature: 0.0,
          bestOf: 1,
          suppressBlank: true,
          suppressNonSpeechTokens: true,
          initialPrompt: '',
        };

        const transcribeJob = this.whisperContext.transcribe(
          audioPath,
          transcriptionOptions,
        );

        const testResult = await transcribeJob.promise;

        // Check if we got any result (even if empty)
        if (testResult !== null && testResult !== undefined) {
          return {
            compatible: true,
            fileInfo,
            testResult,
          };
        } else {
          return {
            compatible: false,
            error: 'Transcription returned null/undefined',
            fileInfo,
            testResult,
          };
        }
      } catch (transcriptionError) {
        return {
          compatible: false,
          error: `Transcription failed: ${
            transcriptionError instanceof Error
              ? transcriptionError.message
              : 'Unknown error'
          }`,
          fileInfo,
        };
      }
    } catch (error) {
      return {
        compatible: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export default WhisperService.getInstance();
