import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { AudioSessionManagerModule } = NativeModules;

interface AudioSessionStatus {
  category: string;
  mode: string;
  isActive: boolean;
}

class AudioSessionManagerService {
  private eventEmitter: NativeEventEmitter | null = null;

  constructor() {
    if (Platform.OS === 'ios' && AudioSessionManagerModule) {
      this.eventEmitter = new NativeEventEmitter(AudioSessionManagerModule);
      this.setupEventListeners();
    }
  }

  private setupEventListeners() {
    if (!this.eventEmitter) return;

    // Listen for interruption ended events
    this.eventEmitter.addListener('audioSessionInterruptionEnded', () => {
      // Services can listen to this and restart if needed
    });
  }

  /**
   * Configure the audio session (called automatically at app startup)
   * This sets up a single category that works for wakeword, Whisper, and TTS
   */
  async configure(): Promise<boolean> {
    if (Platform.OS !== 'ios' || !NativeModules.AudioSessionManagerModule) {
      return false;
    }

    try {
      console.log('[AudioSessionManager] configure calling native...');
      const result = await NativeModules.AudioSessionManagerModule.configure();
      console.log('[AudioSessionManager] configure result:', result);

      return result;
    } catch (error) {
      console.error('[AudioSessionManager] configure error:', error);
      return false;
    }
  }

  /**
   * Reactivate the audio session (useful after interruptions)
   */
  async reactivate(): Promise<boolean> {
    if (Platform.OS !== 'ios' || !AudioSessionManagerModule) {
      return false;
    }

    try {
      console.log('[AudioSessionManager] reactivate calling native...');
      const result = await AudioSessionManagerModule.reactivate();
      console.log('[AudioSessionManager] reactivate result:', result);

      return result;
    } catch (error) {
      console.error('[AudioSessionManager] reactivate error:', error);
      return false;
    }
  }

  /**
   * Notify the manager that wakeword is active/inactive
   * This helps track which components are using the session
   */
  setWakewordActive(active: boolean): void {
    if (Platform.OS === 'ios' && AudioSessionManagerModule) {
      console.log('[AudioSessionManager] setWakewordActive:', active);
      AudioSessionManagerModule.setWakewordActive(active);
    }
  }

  /**
   * Notify the manager that Whisper is active/inactive
   */
  setWhisperActive(active: boolean): void {
    if (Platform.OS === 'ios' && AudioSessionManagerModule) {
      console.log('[AudioSessionManager] setWhisperActive:', active);
      AudioSessionManagerModule.setWhisperActive(active);
    }
  }

  /**
   * Notify the manager that TTS is active/inactive
   */
  setTTSActive(active: boolean): void {
    if (Platform.OS === 'ios' && AudioSessionManagerModule) {
      console.log('[AudioSessionManager] setTTSActive:', active);
      AudioSessionManagerModule.setTTSActive(active);
    }
  }

  /**
   * Get current audio session status (for debugging)
   */
  async getStatus(): Promise<AudioSessionStatus | null> {
    if (Platform.OS !== 'ios' || !AudioSessionManagerModule) {
      return null;
    }

    try {
      const status = await AudioSessionManagerModule.getStatus();
      console.log('[AudioSessionManager] getStatus:', status);
      return status as AudioSessionStatus;
    } catch (error) {
      console.error('[AudioSessionManager] getStatus error:', error);
      return null;
    }
  }

  /**
   * Prepare audio session for wakeword (record category, measurement mode)
   */
  async prepareForWakeword(): Promise<boolean> {
    if (Platform.OS !== 'ios' || !AudioSessionManagerModule) {
      return false;
    }

    try {
      console.log('[AudioSessionManager] prepareForWakeword calling native...');
      const result = await AudioSessionManagerModule.prepareForWakeword();
      console.log('[AudioSessionManager] prepareForWakeword result:', result);
      return result;
    } catch (error) {
      console.error('[AudioSessionManager] prepareForWakeword error:', error);
      return false;
    }
  }

  /**
   * Prepare audio session for Whisper (playAndRecord category, measurement mode)
   */
  async prepareForWhisper(): Promise<boolean> {
    if (Platform.OS !== 'ios' || !AudioSessionManagerModule) {
      return false;
    }

    try {
      console.log('[AudioSessionManager] prepareForWhisper calling native...');
      const result = await AudioSessionManagerModule.prepareForWhisper();
      console.log('[AudioSessionManager] prepareForWhisper result:', result);
      return result;
    } catch (error) {
      console.error('[AudioSessionManager] prepareForWhisper error:', error);
      return false;
    }
  }

  /**
   * Prepare audio session for TTS (playback category, spokenAudio mode)
   */
  async prepareForTTS(): Promise<boolean> {
    if (Platform.OS !== 'ios' || !AudioSessionManagerModule) {
      return false;
    }

    try {
      console.log('[AudioSessionManager] prepareForTTS calling native...');
      const result = await AudioSessionManagerModule.prepareForTTS();
      console.log('[AudioSessionManager] prepareForTTS result:', result);
      return result;
    } catch (error) {
      console.error('[AudioSessionManager] prepareForTTS error:', error);
      return false;
    }
  }

  /**
   * Remove event listeners (cleanup)
   */
  removeListeners(): void {
    if (this.eventEmitter) {
      console.log('[AudioSessionManager] removeListeners');
      this.eventEmitter.removeAllListeners('audioSessionInterruptionEnded');
    }
  }
}

export default new AudioSessionManagerService();
