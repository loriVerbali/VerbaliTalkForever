import Voice, {SpeechResultsEvent} from '@react-native-voice/voice';
import {Platform, PermissionsAndroid, NativeModules} from 'react-native';

// ===== ANDROID speech tuning (no ducking) =====
const ANDROID_START_DEBOUNCE_MS = 400; // avoid "Recognizer busy" after stop → start
const ANDROID_DEFAULT_LOCALE = 'en-US';
const ANDROID_SILENCE_AFTER_MS = 1200; // end-of-speech detection
const ANDROID_POSSIBLY_SILENCE_MS = 800; // quicker finish
const ANDROID_MIN_UTTERANCE_MS = 600; // min capture window

function getAndroidRecognizerOptions() {
  return {
    EXTRA_LANGUAGE: ANDROID_DEFAULT_LOCALE,
    EXTRA_MAX_RESULTS: 1,
    EXTRA_PARTIAL_RESULTS: true,
    EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
    EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: ANDROID_SILENCE_AFTER_MS,
    EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS:
      ANDROID_POSSIBLY_SILENCE_MS,
    EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: ANDROID_MIN_UTTERANCE_MS,
  } as any;
}

type VoiceStatus =
  | 'started'
  | 'recognizing'
  | 'stopped'
  | 'error'
  | 'not_available';
type VoiceCallback = (text: string) => void;
type StatusCallback = (status: VoiceStatus, error?: string) => void;

// Import AVAudioSession for iOS if available
let AVAudioSession: any;
if (Platform.OS === 'ios') {
  try {
    AVAudioSession =
      NativeModules.RNVoiceAudioSession ||
      NativeModules.AudioSessionManager ||
      NativeModules.AVAudioSession;
  } catch (e) {
    console.warn('Could not access AVAudioSession native module', e);
  }
}

class VoiceService {
  private static instance: VoiceService;
  private initialized: boolean = false;
  private isListening: boolean = false;
  private resultCallback: VoiceCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private autoStopTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoStopAfterSilenceMs: number = 2000;
  private errorCount: number = 0;
  private lastResultTimestamp: number = 0;
  private lastStopAt: number = 0;

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
      // Request permissions for Android
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs access to your microphone to record audio',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.error('Microphone permission denied');
          if (this.statusCallback) {
            this.statusCallback('error', 'Microphone permission denied');
          }
          return false;
        }
      }

      // Check if Voice is available
      const isAvailable = await Voice.isAvailable();
      if (!isAvailable) {
        console.error('Voice recognition is not available on this device');
        if (this.statusCallback) {
          this.statusCallback(
            'not_available',
            'Voice recognition not available',
          );
        }
        return false;
      }

      // On iOS, try to configure the audio session prior to recognition
      if (Platform.OS === 'ios' && AVAudioSession) {
        try {
          // Reset any previous configuration
          await Voice.destroy();
        } catch (e) {
          console.warn('Error destroying previous Voice instance', e);
        }
      }

      // Set up event listeners
      Voice.onSpeechStart = this.handleSpeechStart.bind(this);
      Voice.onSpeechRecognized = this.handleSpeechRecognized.bind(this);
      Voice.onSpeechEnd = this.handleSpeechEnd.bind(this);
      Voice.onSpeechError = this.handleSpeechError.bind(this);
      Voice.onSpeechResults = this.handleSpeechResults.bind(this);
      Voice.onSpeechPartialResults = this.handleSpeechPartialResults.bind(this);
      Voice.onSpeechVolumeChanged = this.handleSpeechVolumeChanged.bind(this);

      this.errorCount = 0;
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
    if (this.isListening) return true;

    // Debounce quick restarts on Android (prevents "Recognizer busy")
    if (Platform.OS === 'android') {
      const now = Date.now();
      if (now - this.lastStopAt < ANDROID_START_DEBOUNCE_MS) {
        await new Promise(resolve =>
          setTimeout(() => resolve(undefined), ANDROID_START_DEBOUNCE_MS),
        );
      }
    }

    if (!this.initialized) {
      const ok = await this.initialize();
      if (!ok) return false;
    }

    try {
      this.clearTimers();
      this.errorCount = 0;
      this.lastResultTimestamp = Date.now();
      this.autoStopAfterSilenceMs = autoStopAfterSilenceMs;

      // Hard cap: stop if it runs too long
      this.autoStopTimeout = setTimeout(() => {
        // @ts-ignore
        VoiceService.getInstance().stopListening();
      }, maxDurationMs);

      // Silence detection on Android (iOS handles internally)
      if (Platform.OS !== 'ios') {
        this.resetSilenceTimer(autoStopAfterSilenceMs);
      }

      const locale = 'en-US';

      if (Platform.OS === 'android') {
        await Voice.start(
          ANDROID_DEFAULT_LOCALE,
          getAndroidRecognizerOptions(),
        );
      } else {
        // iOS path as-is, with your existing retry/reinit
        try {
          await Voice.start(locale);
        } catch (error) {
          console.error(
            'First attempt to start Voice failed, retrying with defaults:',
            error,
          );
          await Voice.destroy();
          await new Promise(resolve =>
            setTimeout(() => resolve(undefined), 500),
          );
          await this.initialize();
          await Voice.start(locale);
        }
      }

      this.isListening = true;
      this.statusCallback?.('started');
      return true;
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      this.statusCallback?.('error', 'Failed to start voice recognition');
      return false;
    }
  }

  public async clearCallbacks(): Promise<void> {
    this.resultCallback = null;
    this.statusCallback = null;
  }

  public async stopListening(): Promise<boolean> {
    if (!this.isListening) return true;

    try {
      this.clearTimers();
      await Voice.stop();
      this.isListening = false;
      this.lastStopAt = Date.now();
      this.statusCallback?.('stopped');
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

    this.silenceTimer = setTimeout(function () {
      // @ts-ignore
      VoiceService.getInstance().stopListening();
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
    this.lastResultTimestamp = Date.now();
    if (this.statusCallback) {
      this.statusCallback('started');
    }
  }

  private handleSpeechRecognized(): void {
    this.lastResultTimestamp = Date.now();
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
    this.errorCount++;

    // Normalize Android error message/code
    const raw =
      (error?.error?.message ??
        error?.error?.code ??
        error?.message ??
        error?.code ??
        '') + '';
    const msg = raw.toLowerCase();

    // Android often throws "no match" (silence) or "recognizer busy"
    if (
      Platform.OS === 'android' &&
      (msg.includes('no match') ||
        msg.includes('no_speech') ||
        msg.includes('no speech') ||
        msg.includes('recognizer busy') ||
        msg.includes('busy'))
    ) {
      this.isListening = false;
      this.clearTimers();
      this.statusCallback?.('stopped');
      this.lastStopAt = Date.now();
      return;
    }

    // iOS: if we got results recently, ignore transient errors
    if (
      Platform.OS === 'ios' &&
      this.lastResultTimestamp > 0 &&
      Date.now() - this.lastResultTimestamp < 3000
    ) {
      return;
    }

    if (this.errorCount > 3) {
      console.log('Too many errors, destroying voice service');
      this.destroy();
      this.initialized = false;
    }

    this.isListening = false;
    this.clearTimers();
    this.statusCallback?.(
      'error',
      error?.error?.message || 'Speech recognition error',
    );
    this.lastStopAt = Date.now();
  }

  private handleSpeechResults(event: SpeechResultsEvent): void {
    this.lastResultTimestamp = Date.now();
    this.errorCount = 0; // Reset error count on successful results

    // Reset the silence detection timer on any result
    // but only for Android
    if (Platform.OS !== 'ios') {
      this.resetSilenceTimer(this.autoStopAfterSilenceMs);
    }

    const text = event.value?.[0] || '';

    if (this.resultCallback && text) {
      this.resultCallback(text);
    }
  }

  private handleSpeechPartialResults(event: SpeechResultsEvent): void {
    this.lastResultTimestamp = Date.now();
    this.errorCount = 0; // Reset error count on successful partial results

    // Reset the silence detection timer on any partial result
    // but only for Android
    if (Platform.OS !== 'ios') {
      this.resetSilenceTimer(this.autoStopAfterSilenceMs);
    }

    const text = event.value?.[0] || '';

    if (this.resultCallback && text) {
      this.resultCallback(text);
    }
  }

  private handleSpeechVolumeChanged(event: any): void {
    this.lastResultTimestamp = Date.now();

    // Could be used for visual feedback of voice level
    // Reset silence timer when volume changes significantly
    // but only for Android
    if (Platform.OS !== 'ios' && event.value > 0.5) {
      this.resetSilenceTimer(this.autoStopAfterSilenceMs);
    }
  }
}

export default VoiceService.getInstance();
