import Voice from '@dev-amirzubair/react-native-voice';
import {Platform} from 'react-native';

interface VoiceTranscriptionResult {
  text: string;
  success: boolean;
  error?: string;
}

type TranscriptionCallback = (text: string, isFinal: boolean) => void;
type ErrorCallback = (error: {code: string; message: string}) => void;
type SpeechEndCallback = () => void;

class VoiceService {
  private static instance: VoiceService;
  private isListening: boolean = false;
  private currentText: string = '';
  private transcriptionCallback: TranscriptionCallback | null = null;
  private finalTextCallback: ((text: string) => void) | null = null;
  private errorCallback: ErrorCallback | null = null;
  private speechEndCallback: SpeechEndCallback | null = null;

  private constructor() {
    this.setupEventHandlers();
  }

  public static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  /**
   * Set up event handlers for voice recognition
   */
  private setupEventHandlers(): void {
    Voice.onSpeechStart = () => {
      this.isListening = true;
      this.currentText = '';
    };

    Voice.onSpeechEnd = () => {
      this.isListening = false;

      // Notify that speech has ended
      if (this.speechEndCallback) {
        this.speechEndCallback();
      }
    };

    Voice.onSpeechResults = e => {
      const results = e.value ?? [];
      if (results.length > 0) {
        const finalText = results[0];
        this.currentText = finalText;

        if (this.finalTextCallback) {
          this.finalTextCallback(finalText);
        }

        if (this.transcriptionCallback) {
          this.transcriptionCallback(finalText, true);
        }
      }
    };

    Voice.onSpeechPartialResults = e => {
      const results = e.value ?? [];
      if (results.length > 0) {
        const partialText = results[0];
        this.currentText = partialText;

        // Stream partial results in real-time
        if (this.transcriptionCallback) {
          this.transcriptionCallback(partialText, false);
        }
      }
    };

    Voice.onSpeechError = e => {
      const error = e.error || {code: 'unknown', message: 'Unknown error'};
      const errorCode = error.code || error.message || 'unknown';
      const errorMessage = error.message || errorCode;

      // Error code 7 = "No match" (Android) - user didn't speak or speech wasn't recognized
      // Error code 'recognition_fail_ooo' = iOS "No speech detected" error
      // This is not necessarily a fatal error, just means no speech was detected
      const isNoMatchError =
        errorCode === '7' ||
        errorCode === 'recognition_fail_ooo' ||
        errorMessage.includes('No match') ||
        errorMessage.includes('No speech detected');

      this.isListening = false;

      // Call error callback if set
      if (this.errorCallback) {
        this.errorCallback({
          code: String(errorCode),
          message: errorMessage,
        });
      }

      // For "No match" errors, don't call finalTextCallback with empty string
      // Let the caller handle it (they might want to retry or show a different message)
      if (!isNoMatchError && this.finalTextCallback) {
        this.finalTextCallback('');
      }
    };

    Voice.onSpeechVolumeChanged = e => {
      // Optional: Use for visual feedback
    };
  }

  /**
   * Check if speech recognition is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const result = await Voice.isAvailable();
      return Boolean(result);
    } catch (error) {
      return false;
    }
  }

  /**
   * Start listening for speech with streaming transcription
   * @param locale - Language locale (e.g., 'en-US', 'en-GB')
   * @param onTranscription - Callback for streaming transcription (text, isFinal)
   * @param onFinal - Callback for final transcription
   * @param onError - Callback for errors
   * @param onSpeechEnd - Callback when speech recognition ends
   */
  public async startListening(
    locale: string = 'en-US',
    onTranscription?: TranscriptionCallback,
    onFinal?: (text: string) => void,
    onError?: ErrorCallback,
    onSpeechEnd?: SpeechEndCallback,
  ): Promise<boolean> {
    try {
      if (this.isListening) {
        await this.stopListening();
      }

      this.transcriptionCallback = onTranscription || null;
      this.finalTextCallback = onFinal || null;
      this.errorCallback = onError || null;
      this.speechEndCallback = onSpeechEnd || null;
      this.currentText = '';

      await Voice.start(locale);
      return true;
    } catch (error) {
      this.isListening = false;

      // Call error callback if set
      if (this.errorCallback) {
        this.errorCallback({
          code: 'start_failed',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to start voice recognition',
        });
      }

      return false;
    }
  }

  /**
   * Stop listening for speech
   */
  public async stopListening(): Promise<void> {
    try {
      if (this.isListening) {
        await Voice.stop();
      }
      this.isListening = false;
    } catch (error) {
      // Error stopping voice recognition
    }
  }

  /**
   * Cancel speech recognition
   */
  public async cancel(): Promise<void> {
    try {
      await Voice.cancel();
      this.isListening = false;
      this.currentText = '';
    } catch (error) {
      // Error canceling voice recognition
    }
  }

  /**
   * Check if currently listening
   */
  public getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Get current transcription text
   */
  public getCurrentText(): string {
    return this.currentText;
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    try {
      await this.cancel();
      Voice.removeAllListeners();
      this.transcriptionCallback = null;
      this.finalTextCallback = null;
      this.errorCallback = null;
      this.speechEndCallback = null;
    } catch (error) {
      // Error destroying voice service
    }
  }

  /**
   * Get available speech recognition services (Android only)
   */
  public async getSpeechRecognitionServices(): Promise<string[]> {
    if (Platform.OS === 'android') {
      try {
        return await Voice.getSpeechRecognitionServices();
      } catch (error) {
        return [];
      }
    }
    return [];
  }
}

export default VoiceService.getInstance();
