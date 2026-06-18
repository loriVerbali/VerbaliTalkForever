import { Platform, NativeEventEmitter } from 'react-native';

import Speech from 'react-native-davoice-tts/speech';
import AppConfig from './config';
import { prepareSpeechRecognitionAfterFullInit } from './STTService';

const STT_DEBUG = false;

const trace = (...args: unknown[]) => {
  if (STT_DEBUG) {
    console.log(...args);
  }
};

const traceWarn = (...args: unknown[]) => {
  if (STT_DEBUG) {
    console.warn(...args);
  }
};

class SpeechServiceClass {
  private static instance: SpeechServiceClass;
  private initialized: boolean = false;
  private isPlaying: boolean = false;
  private queue: Array<{ text: string; onComplete?: () => void }> = [];
  private processingQueue: boolean = false;
  private currentItem: { text: string; onComplete?: () => void } | null = null;
  private volumeCleanup: (() => void) | null = null;

  private speechInstance = Speech;

  // You can switch the voice by commenting/uncommenting the models below
  private ttsModel = require('../../ios/models/model_ex_ariana_fast_davoice_phoneme.dm');
  //private ttsModel = require('../../ios/models/model_ex_rich_fast_davoice_phoneme.dm');

  private constructor() {
    // Private constructor for singleton
    this.volumeCleanup = SpeechServiceClass.suppressVolumeWarning();
  }

  private getLicenseExpiry(licenseKey: string): Date | null {
    const encodedExpiry = licenseKey.split('-', 1)[0];
    if (!encodedExpiry) return null;

    try {
      const atob = (
        globalThis as typeof globalThis & {
          atob?: (value: string) => string;
        }
      ).atob;
      if (!atob) return null;

      const decodedExpiry = atob(encodedExpiry);
      const expiryMs = Number(decodedExpiry);
      if (!Number.isFinite(expiryMs)) return null;

      const expiry = new Date(expiryMs);
      return Number.isNaN(expiry.getTime()) ? null : expiry;
    } catch {
      return null;
    }
  }

  private async activateLicense(licenseKey: string): Promise<void> {
    const expiry = this.getLicenseExpiry(licenseKey);
    if (expiry && expiry.getTime() <= Date.now()) {
      throw new Error(
        `DaVoice license expired on ${expiry.toISOString()}. Update DAVOICE_LICENSE.`,
      );
    }

    const activated = await this.speechInstance.setLicense(licenseKey);
    if (!activated) {
      const expiryMessage = expiry
        ? ` The configured license expires on ${expiry.toISOString()}.`
        : '';
      throw new Error(
        `DaVoice rejected DAVOICE_LICENSE.${expiryMessage} Check that the license is valid for this app and platform.`,
      );
    }
  }

  private async initSpeech() {
    try {
      trace('[STT TRACE][SpeechService] initSpeech begin');

      if (AppConfig.davoiceLicense) {
        trace('[SpeechService] Activating DaVoice license');
        await this.activateLicense(AppConfig.davoiceLicense);
      } else {
        throw new Error(
          'No DaVoice license found. Set DAVOICE_LICENSE in the environment.',
        );
      }

      trace('[STT TRACE][SpeechService] calling initAll');
      const result = await this.speechInstance.initAll({
        locale: 'en-US',
        model: this.ttsModel,
      });
      trace(
        `[STT TRACE][SpeechService] initAll resolved result=${String(result)}`,
      );
      await prepareSpeechRecognitionAfterFullInit();

      // Set up completion listener
      this.speechInstance.onFinishedSpeaking = () => {
        trace('[STT TRACE][SpeechService] onFinishedSpeaking event');
        this.handlePlaybackFinished();
      };
    } catch (e) {
      console.error('[SpeechService] init error:', e);
      throw e;
    }
  }

  public static getInstance(): SpeechServiceClass {
    if (!SpeechServiceClass.instance) {
      SpeechServiceClass.instance = new SpeechServiceClass();
    }
    return SpeechServiceClass.instance;
  }

  private async speakText(text: string) {
    if (!text) return;

    try {
      trace(`[STT TRACE][SpeechService] speakText begin text="${text}"`);
      const speakerId = 0; // Piper uses 0 for single‑speaker models

      // Give the audio session a moment to settle after preparation
      if (Platform.OS === 'ios') {
        await new Promise<void>(resolve => setTimeout(resolve, 100));
      }

      try {
        await this.speechInstance.speak(text, speakerId);
        trace('[STT TRACE][SpeechService] speak resolved');
      } catch (error) {
        traceWarn(
          '[SpeechService] First TTS attempt failed, retrying...',
          error,
        );
        // Wait a bit longer and retry once
        await new Promise<void>(resolve => setTimeout(resolve, 200));
        await this.speechInstance.speak(text, speakerId);
        trace('[STT TRACE][SpeechService] retry speak resolved');
      }
    } catch (e) {
      console.error('[SpeechService] speakText error after retries:', e);
      this.handlePlaybackFinished();
    }
  }

  private handlePlaybackFinished() {
    trace(
      `[STT TRACE][SpeechService] handlePlaybackFinished queue=${this.queue.length
      } current=${String(this.currentItem?.text)}`,
    );
    this.isPlaying = false;
    this.processingQueue = false;

    // Call completion callback if set
    if (this.currentItem?.onComplete) {
      this.currentItem.onComplete();
      this.currentItem = null;
    }

    // Process next in queue if any
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.initSpeech();
      this.initialized = true;
    } catch (error) {
      console.error('[SpeechService] initialize error:', error);
      this.initialized = false;
    }
  }

  public async speak(
    text: string,
    immediate: boolean = false,
    onComplete?: () => void,
  ): Promise<void> {
    trace(
      `[STT TRACE][SpeechService] speak requested immediate=${immediate} initialized=${this.initialized} text="${text}"`,
    );
    if (!text || text.trim().length === 0) {
      return;
    }

    try {
      if (!this.initialized) {
        const initialized = await this.waitForInitialization();
        if (!initialized) {
          return;
        }
      }

      if (immediate) {
        await this.stop();
        // Wait a bit to ensure previous playback is fully stopped
        const stopDelay = Platform.OS === 'ios' ? 200 : 50;
        setTimeout(() => {
          this.queue = [{ text, onComplete }];
          this.processQueue();
        }, stopDelay);
        return;
      } else {
        this.queue.push({ text, onComplete });
      }

      if (!this.isPlaying && !this.processingQueue) {
        this.processQueue();
      }
    } catch (error) {
      console.error('[SpeechService] speak error:', error);
    }
  }

  private async processQueue(): Promise<void> {
    trace(
      `[STT TRACE][SpeechService] processQueue playing=${this.isPlaying} processing=${this.processingQueue} queue=${this.queue.length}`,
    );
    if (this.processingQueue || this.isPlaying || this.queue.length === 0) {
      return;
    }

    this.processingQueue = true;
    try {
      const nextItem = this.queue.shift();
      if (nextItem) {
        this.currentItem = nextItem;
        this.isPlaying = true;
        await this.speakText(nextItem.text);

        // DaVoice's speak() resolves after playback. Keep the native
        // onFinishedSpeaking event as the primary path, but finish here too if
        // that event was missed. The identity check prevents completing a
        // newer queued item when the event already advanced the queue.
        if (this.currentItem === nextItem && this.isPlaying) {
          this.handlePlaybackFinished();
        }
      }
    } catch (error) {
      console.error('[SpeechService] processQueue error:', error);
      this.isPlaying = false;
      this.processingQueue = false;
      this.currentItem = null;
    }
  }

  public async stop(): Promise<void> {
    trace(
      `[STT TRACE][SpeechService] stop requested initialized=${this.initialized} playing=${this.isPlaying} queue=${this.queue.length}`,
    );
    try {
      if (this.speechInstance && this.initialized) {
        await this.speechInstance.stopSpeaking();
        trace('[STT TRACE][SpeechService] stopSpeaking resolved');
      }

      this.isPlaying = false;
      this.queue = [];
      this.processingQueue = false;
      this.currentItem = null;
    } catch (error) {
      console.error('[SpeechService] stop error:', error);
      this.isPlaying = false;
      this.queue = [];
      this.processingQueue = false;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      await this.stop();
      if (this.speechInstance && this.initialized) {
        await this.speechInstance.destroyAll();
      }
      this.speechInstance.onFinishedSpeaking = () => { };
      this.volumeCleanup?.();
      this.volumeCleanup = null;
      this.initialized = false;
    } catch (error) {
      console.error('[SpeechService] shutdown error:', error);
      this.volumeCleanup?.();
      this.volumeCleanup = null;
      this.initialized = false;
    }
  }

  public clearQueue(): void {
    this.queue = [];
    this.processingQueue = false;
  }

  public isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isAvailable(): boolean {
    return this.initialized;
  }

  public async waitForInitialization(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      await this.initialize();
      return this.initialized;
    } catch {
      return false;
    }
  }

  // Validation is now handled natively by the Metro bundler via require()

  // Suppress volume warning by subscribing to VolumeUpdate event
  public static suppressVolumeWarning() {
    try {
      // Use the global device emitter if the specific TTS module emitter isn't found
      const emitter = new NativeEventEmitter();
      const subscription = emitter.addListener('VolumeUpdate', () => { });
      return () => subscription.remove();
    } catch {
      return () => { };
    }
  }
}

export default SpeechServiceClass.getInstance();
