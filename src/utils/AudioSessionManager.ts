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
      const result = await NativeModules.AudioSessionManagerModule.configure();
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
      const result = await AudioSessionManagerModule.reactivate();

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
      AudioSessionManagerModule.setWakewordActive(active);
    }
  }

  /**
   * Notify the manager that Whisper is active/inactive
   */
  setWhisperActive(active: boolean): void {
    if (Platform.OS === 'ios' && AudioSessionManagerModule) {
      AudioSessionManagerModule.setWhisperActive(active);
    }
  }

  /**
   * Notify the manager that TTS is active/inactive
   */
  setTTSActive(active: boolean): void {
    if (Platform.OS === 'ios' && AudioSessionManagerModule) {
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
      const result = await AudioSessionManagerModule.prepareForWakeword();
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
      const result = await AudioSessionManagerModule.prepareForWhisper();
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
      const result = await AudioSessionManagerModule.prepareForTTS();
      return result;
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove event listeners (cleanup)
   */
  removeListeners(): void {
    if (this.eventEmitter) {
      this.eventEmitter.removeAllListeners('audioSessionInterruptionEnded');
    }
  }
}

export default new AudioSessionManagerService();
