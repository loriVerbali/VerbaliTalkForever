import Voice, {SpeechResultsEvent} from '@react-native-voice/voice';
import {Platform} from 'react-native';

type VoiceStatus =
  | 'started'
  | 'recognizing'
  | 'stopped'
  | 'error'
  | 'not_available';
type VoiceCallback = (text: string) => void;
type StatusCallback = (status: VoiceStatus, error?: string) => void;

class VoiceService {
  private static instance: VoiceService;
  private initialized: boolean = false;
  private isListening: boolean = false;
  private resultCallback: VoiceCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;
  private autoStopTimeout: NodeJS.Timeout | null = null;
  private autoStopAfterSilenceMs: number = 2000;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  public async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Set up event listeners
      Voice.onSpeechStart = this.handleSpeechStart.bind(this);
      Voice.onSpeechRecognized = this.handleSpeechRecognized.bind(this);
      Voice.onSpeechEnd = this.handleSpeechEnd.bind(this);
      Voice.onSpeechError = this.handleSpeechError.bind(this);
      Voice.onSpeechResults = this.handleSpeechResults.bind(this);
      Voice.onSpeechPartialResults = this.handleSpeechPartialResults.bind(this);
      Voice.onSpeechVolumeChanged = this.handleSpeechVolumeChanged.bind(this);

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Voice service:', error);
      return false;
    }
  }

  // Set callbacks for receiving recognition results and status updates
  public setCallbacks(
    resultCallback: VoiceCallback,
    statusCallback: StatusCallback,
  ): void {
    this.resultCallback = resultCallback;
    this.statusCallback = statusCallback;
  }

  // Start listening with automatic timeout
  public async startListening(
    autoStopAfterSilenceMs: number = 6000,
    maxDurationMs: number = 10000,
  ): Promise<boolean> {
    if (this.isListening) {
      return true;
    }

    if (!this.initialized) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    try {
      this.clearTimers();

      // Set up auto-stop after maxDuration
      this.autoStopTimeout = setTimeout(() => {
        if (this.isListening) {
          this.stopListening();
        }
      }, maxDurationMs);

      // Initialize silence detection with the provided timeout
      this.resetSilenceTimer(autoStopAfterSilenceMs);

      await Voice.start(Platform.OS === 'ios' ? 'en-US' : 'en-US');
      this.isListening = true;

      if (this.statusCallback) {
        this.statusCallback('started');
      }

      return true;
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      if (this.statusCallback) {
        this.statusCallback('error', 'Failed to start voice recognition');
      }
      return false;
    }
  }

  public async stopListening(): Promise<boolean> {
    if (!this.isListening) {
      return true;
    }

    try {
      this.clearTimers();
      await Voice.stop();
      this.isListening = false;

      if (this.statusCallback) {
        this.statusCallback('stopped');
      }

      return true;
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
      return false;
    }
  }

  public destroy(): void {
    this.clearTimers();
    Voice.destroy().then(() => {
      Voice.removeAllListeners();
      this.initialized = false;
      this.isListening = false;
    });
  }

  private resetSilenceTimer(silenceTimeoutMs: number): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    this.silenceTimer = setTimeout(() => {
      if (this.isListening) {
        this.stopListening();
      }
    }, silenceTimeoutMs);
  }

  private clearTimers(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.autoStopTimeout) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
    }
  }

  // Event handlers
  private handleSpeechStart(): void {
    if (this.statusCallback) {
      this.statusCallback('started');
    }
  }

  private handleSpeechRecognized(): void {
    if (this.statusCallback) {
      this.statusCallback('recognizing');
    }
  }

  private handleSpeechEnd(): void {
    if (this.statusCallback) {
      this.statusCallback('stopped');
    }
  }

  private handleSpeechError(error: any): void {
    this.isListening = false;
    this.clearTimers();

    if (this.statusCallback) {
      this.statusCallback(
        'error',
        error.error?.message || 'Speech recognition error',
      );
    }
  }

  private handleSpeechResults(event: SpeechResultsEvent): void {
    // Reset the silence detection timer on any result
    this.resetSilenceTimer(this.autoStopAfterSilenceMs);

    const text = event.value?.[0] || '';

    if (this.resultCallback && text) {
      this.resultCallback(text);
    }
  }

  private handleSpeechPartialResults(event: SpeechResultsEvent): void {
    // Reset the silence detection timer on any partial result
    this.resetSilenceTimer(this.autoStopAfterSilenceMs);

    const text = event.value?.[0] || '';

    if (this.resultCallback && text) {
      this.resultCallback(text);
    }
  }

  private handleSpeechVolumeChanged(event: any): void {
    // Could be used for visual feedback of voice level
    // Reset silence timer when volume changes significantly
    if (event.value > 0.5) {
      this.resetSilenceTimer(this.autoStopAfterSilenceMs);
    }
  }
}

export default VoiceService.getInstance();
