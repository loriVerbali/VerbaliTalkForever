import RNFS from 'react-native-fs';
import {Platform} from 'react-native';
import {MODEL_CONFIG} from './constants';
import {detectDeviceCapabilities} from './deviceDetection';
import DeviceInfo from 'react-native-device-info';
// @ts-ignore - whisper.rn types exist at runtime
import {initWhisper, releaseAllWhisper} from 'whisper.rn';
// @ts-ignore - RN packager doesn't support package exports, use src/ path
import {RealtimeTranscriber} from 'whisper.rn/src/realtime-transcription';
// @ts-ignore
import {AudioPcmStreamAdapter} from 'whisper.rn/src/realtime-transcription/adapters/AudioPcmStreamAdapter';

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
  private realTimeTranscriber: any = null;
  private isRealTimeCapturing: boolean = false;
  private realTimeResult: string = '';
  private realTimeFinalResult: string = '';
  // Optimization: Cache model file existence check
  private modelFileCache: {
    exists: boolean;
    path: string;
    lastChecked: number;
  } | null = null;
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

      // CRITICAL FIX: Force CPU mode on iPhone 17+ due to Metal/GPU backend incompatibility
      // The iPhone 17 (and potentially newer models) uses a new GPU architecture that
      // the whisper.cpp GGML Metal backend doesn't support yet, causing abort() crash
      // during backend scheduler initialization
      if (Platform.OS === 'ios') {
        try {
          const deviceId = await DeviceInfo.getDeviceId();
          // iPhone 17 series: iPhone18,1 (Plus), iPhone18,2 (Pro), iPhone18,3 (Pro Max), iPhone18,4 (base)
          // Also check for iPhone19,x (future iPhone 18) and beyond to be safe
          const isNewHardware = /iPhone(18|19|[2-9][0-9]),/.test(deviceId);
          
          if (isNewHardware) {
            console.warn(
              `⚠️ ${deviceId} detected - forcing CPU mode for Whisper to avoid Metal backend crash on new hardware`,
            );
            this.useGpu = false;
            this.isLowEndDevice = true; // Treat as low-end to use appropriate model
            return;
          }
        } catch (deviceError) {
          console.warn(
            '⚠️ Could not detect device model, will try GPU mode:',
            deviceError,
          );
          // If we can't detect device model, proceed with normal GPU detection
        }
      }

      // On low-end devices, CPU is often faster than GPU
      // GPU on these devices is usually weak and can cause slowdowns
      this.useGpu = !this.isLowEndDevice;
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
      // Detect device capabilities first
      await this.detectDeviceCapabilities();

      // Check if model file exists (use appropriate model for device)
      const whisperFileName = MODEL_CONFIG.getWhisperModelFileName(
        this.isLowEndDevice,
      );
      this.modelPath = `${RNFS.DocumentDirectoryPath}/${whisperFileName}`;

      // Optimization: Use cached file check if available and path matches
      let modelExists: boolean;
      if (
        this.modelFileCache &&
        this.modelFileCache.path === this.modelPath &&
        this.modelFileCache.exists
      ) {
        // Use cached result
        modelExists = this.modelFileCache.exists;
      } else {
        // Check file existence
        modelExists = await RNFS.exists(this.modelPath);
        // Cache the result
        this.modelFileCache = {
          exists: modelExists,
          path: this.modelPath,
          lastChecked: Date.now(),
        };
      }

      if (!modelExists) {
        console.error('Whisper model file not found at:', this.modelPath);
        return false;
      }

      // Verify model file size (different thresholds for different models)
      // Only check size if not using cache (to avoid redundant I/O)
      if (!this.modelFileCache || this.modelFileCache.path !== this.modelPath) {
        const stats = await RNFS.stat(this.modelPath);
        const minSize = this.isLowEndDevice
          ? 20 * 1024 * 1024 // 20MB for tiny.en-q5_1 model (~32MB, 10MB buffer)
          : 60 * 1024 * 1024; // 60MB for tiny model (~75MB, 10MB+ buffer)
        if (stats.size < minSize) {
          console.warn(
            `Whisper model file seems too small (${(
              stats.size /
              1024 /
              1024
            ).toFixed(2)}MB), might be corrupted`,
          );
        }
      }

      // Try to initialize with detected GPU preference
      // If GPU fails on low-end device, fallback to CPU
      let initAttempts = 0;
      const maxAttempts = this.isLowEndDevice ? 1 : 2; // Only try GPU once on low-end, allow retry on others

      console.log(
        `🎤 Initializing Whisper: useGpu=${this.useGpu}, isLowEndDevice=${this.isLowEndDevice}, modelPath=${this.modelPath}`,
      );

      while (initAttempts < maxAttempts) {
        try {
          console.log(
            `🔄 Whisper init attempt ${initAttempts + 1}/${maxAttempts} with ${this.useGpu ? 'GPU' : 'CPU'} backend`,
          );

          this.whisperContext = await initWhisper({
            filePath: this.modelPath,
            isBundleAsset: false,
            useGpu: this.useGpu,
          });

          if (this.whisperContext) {
            console.log(
              `✅ Whisper initialized successfully with ${this.useGpu ? 'GPU' : 'CPU'} backend`,
            );
            this.initialized = true;
            return true;
          }
        } catch (gpuError) {
          console.warn(
            `⚠️ Whisper initialization failed (attempt ${initAttempts + 1}/${maxAttempts}): ${
              gpuError instanceof Error ? gpuError.message : 'Unknown error'
            }`,
          );

          // If GPU failed and we haven't tried CPU yet, fallback to CPU
          if (this.useGpu && initAttempts < maxAttempts - 1) {
            console.log('🔄 Falling back to CPU backend...');
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
      // Optimization: Use cached file check if available and path matches
      let exists: boolean;
      if (
        this.modelFileCache &&
        this.modelFileCache.path === modelPath &&
        this.modelFileCache.exists
      ) {
        // Use cached result
        exists = this.modelFileCache.exists;
      } else {
        // Check file existence
        exists = await RNFS.exists(modelPath);
        // Cache the result
        this.modelFileCache = {
          exists: exists,
          path: modelPath,
          lastChecked: Date.now(),
        };
      }

      if (exists) {
        const stats = await RNFS.stat(modelPath);
        const minSize = deviceIsLowEnd
          ? 20 * 1024 * 1024 // 20MB for tiny.en-q5_1 model (~32MB, 10MB buffer)
          : 60 * 1024 * 1024; // 60MB for tiny model (~75MB, 10MB+ buffer)
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
          ? 20 * 1024 * 1024 // 20MB for tiny.en-q5_1 model (~32MB, 10MB buffer)
          : 60 * 1024 * 1024; // 60MB for tiny model (~75MB, 10MB+ buffer)
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
      // Combine validation checks with caching (optimization 4 & 6)
      if (!this.initializationChecked) {
        if (!this.initialized || !this.whisperContext) {
          const initSuccess = await this.initialize();
          if (!initSuccess || !this.whisperContext) {
            return {text: '', success: false, error: 'Whisper not available'};
          }
        }
        this.initializationChecked = true;
      }

      // Use the original audio path directly since it works
      let transcriptionResult = null;
      let processedAudioPath = audioPath;

      // For iOS, remove file:// prefix if present
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
      // Stop real-time transcription if active
      if (this.realTimeTranscriber) {
        await this.stopRealTimeTranscription();
      }

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

  public async startRealTimeTranscription(): Promise<boolean> {
    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        return false;
      }
    }

    try {
      // Reset state
      this.realTimeResult = '';
      this.realTimeFinalResult = '';
      this.isRealTimeCapturing = true;

      // Create audio stream adapter
      const audioStream = new AudioPcmStreamAdapter();

      // Create RealtimeTranscriber with proper structure:
      // 1. dependencies (whisperContext, audioStream)
      // 2. options (audioSliceSec, audioMinSec, etc.)
      // 3. callbacks (onTranscribe, onError, etc.)
      this.realTimeTranscriber = new RealtimeTranscriber(
        // Dependencies
        {
          whisperContext: this.whisperContext,
          audioStream: audioStream,
        },
        // Options
        {
          audioSliceSec: 20, // Process audio in 20 second chunks
          audioMinSec: 2, // Minimum 2 seconds before transcribing
          audioStreamConfig: {
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            audioSource: Platform.OS === 'ios' ? 0 : 6, // iOS: 0 = default, Android: 6 = VOICE_RECOGNITION
            bufferSize: 16 * 1024,
          },
          transcribeOptions: {
            language: 'en',
            translateToEnglish: false,
            wordTimestamps: false,
            temperature: 0.0,
            bestOf: 1,
          },
        },
        // Callbacks
        {
          onTranscribe: (event: any) => {
            if (event.data?.result) {
              const transcribedText = event.data.result.trim();

              // Accumulate the results
              if (transcribedText.length > 0) {
                this.realTimeResult = transcribedText;
              }
            }
          },
          onStatusChange: (isRecording: boolean) => {
            this.isRealTimeCapturing = isRecording;
          },
          onError: (error: any) => {
            console.error('❌ Real-time transcription error:', error);
          },
        },
      );

      // Start the transcriber
      await this.realTimeTranscriber.start();

      return true;
    } catch (error) {
      console.error('❌ Error starting real-time transcription:', error);
      this.isRealTimeCapturing = false;
      this.realTimeTranscriber = null;
      return false;
    }
  }

  public async stopRealTimeTranscription(): Promise<string> {
    try {
      if (this.realTimeTranscriber) {
        await this.realTimeTranscriber.stop();

        const finalResult = this.realTimeResult.trim();
        if (finalResult.length > 0) {
          this.realTimeFinalResult = finalResult;
        }
        return finalResult;
      } else {
        return '';
      }
    } catch (error) {
      console.error('❌ Error stopping real-time transcription:', error);
      return '';
    } finally {
      this.realTimeTranscriber = null;
      this.isRealTimeCapturing = false;
      this.realTimeResult = '';
    }
  }

  /**
   * Get the current real-time transcription result
   */
  public getRealTimeResult(): string {
    return this.realTimeResult;
  }

  /**
   * Check if real-time transcription is currently active
   */
  public isRealTimeActive(): boolean {
    return this.isRealTimeCapturing;
  }
}

export default WhisperService.getInstance();
