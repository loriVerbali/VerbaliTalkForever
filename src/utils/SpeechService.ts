import { Platform, NativeEventEmitter } from 'react-native';

import Speech from 'react-native-davoice-tts/speech';
import AppConfig from './config';
import { prepareSpeechRecognitionAfterFullInit } from './STTService';
import WakeWordService from './wakewordService';

const STT_DEBUG = false;
const IOS_TTS_AUDIO_SETTLE_MS = 150;

/**
 * How long after the TTS queue drains before the wakeword mic is re-opened.
 * Resuming immediately made every tap in a burst pay the full mic
 * release/reacquire cycle (~1s+ on iOS); deferring it keeps the mic off while
 * the user is still tapping words, so only the first tap after a real pause
 * pays the mic handoff.
 */
const WAKEWORD_RESUME_AFTER_TTS_MS = 1200;

type SpeechQueueItem = {
  text: string;
  onComplete?: () => void;
  resumeWakeWordOnComplete: boolean;
};

/**
 * Phonetic substitution map for words the TTS engine mispronounces.
 * Keys are regex patterns (case-insensitive); values are the spoken replacements.
 * Keep this lightweight — it runs synchronously on every speak() call.
 */
const PHONETIC_SUBSTITUTIONS: Array<[RegExp, string]> = [
  // "Verbi" → spoken as "Ver bee"
  [/\bVerbi\b/gi, 'ver be'],
];

// Fallback for TTS-only init when the Metro dev-server asset URL can't be
// loaded by the standalone TTS bridge. Must match the model file used in
// getTtsModel() below, which is also a native bundle resource — but the two
// platforms name that resource differently:
//   iOS     bundles the file directly (Xcode Resources), so the bare filename
//           resolves.
//   Android has no copy under app/src/main/assets. The RN asset pipeline emits
//           it as a res/raw entry whose name encodes the source path —
//           "ios/models/<name>" lowercased with "/" replaced by "_" (see
//           getAndroidResourceIdentifier in @react-native/assets-registry).
// Keep the .dm suffix on both: the bridge strips it before
// Resources.getIdentifier(), and it is how the engine learns the model format
// (without it the bridge defaults the extension to "onnx" and hands the DaVoice
// model to the wrong loader).
const TTS_MODEL_BUNDLED_FILENAME = Platform.select({
  android: 'ios_models_model_ex_hanna_light_davoice_ph.dm',
  default: 'model_ex_hanna_light_davoice_ph.dm',
});

/**
 * Applies phonetic substitutions to `text` before sending it to the TTS engine.
 * This has negligible overhead (a handful of regex replacements, no allocations
 * beyond the final string) and keeps pronunciation fixes isolated here.
 */
function normalizeForSpeech(text: string): string {
  return PHONETIC_SUBSTITUTIONS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

/**
 * Minimum chunk length for the Android sentence splitter. Fragments shorter
 * than this (typically abbreviations like "Mr.") are merged into the next
 * chunk instead of becoming their own utterance, which would insert an
 * audible pause mid-name.
 */
const MIN_TTS_CHUNK_CHARS = 8;

/**
 * Splits text into sentence-sized chunks for the Android TTS path.
 * A chunk ends at sentence punctuation only when it's followed by whitespace
 * or end-of-string, so decimals like "3.5" are never split. Falls back to the
 * whole text when no boundary is found.
 */
function splitIntoSentenceChunks(text: string): string[] {
  const matches = text.match(/[\s\S]+?(?:[.!?…]+(?=\s|$)|$)/g);
  if (!matches) return [text];
  const chunks: string[] = [];
  for (const raw of matches) {
    const part = raw.trim();
    if (!part) continue;
    const prev = chunks[chunks.length - 1];
    if (prev !== undefined && prev.length < MIN_TTS_CHUNK_CHARS) {
      chunks[chunks.length - 1] = `${prev} ${part}`;
    } else {
      chunks.push(part);
    }
  }
  return chunks.length > 0 ? chunks : [text];
}

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
  // Onboarding runs the engine in TTS-only mode: no STT bridge, so the iOS
  // mic + speech-recognition permission prompts don't fire before the
  // onboarding Permissions step asks for them. Full init tears this down.
  private ttsOnlyMode: boolean = false;
  private ttsOnlyInitPromise: Promise<void> | null = null;
  // In-flight full init. Deduplicates concurrent initialize() calls and lets
  // TTS-only callers wait for an upgrade that is already under way.
  private initializePromise: Promise<void> | null = null;
  private isPlaying: boolean = false;
  private queue: SpeechQueueItem[] = [];
  private processingQueue: boolean = false;
  private currentItem: SpeechQueueItem | null = null;
  private volumeCleanup: (() => void) | null = null;
  private speakStartCallbacks: Set<() => void> = new Set();
  private speakEndCallbacks: Set<() => void> = new Set();
  // Android: incremented by stop() so an in-flight chunk loop aborts instead of
  // enqueueing sentences from a cancelled utterance.
  private speakGeneration: number = 0;
  // Android: true while speakText is still feeding sentence chunks to the
  // engine. The native onFinishedSpeaking fires whenever its play queue drains,
  // which can happen between chunks if playback outpaces synthesis — those
  // mid-utterance events must not complete the JS queue item.
  private synthesisInProgress: boolean = false;
  // iOS: pending deferred wakeword resume (see WAKEWORD_RESUME_AFTER_TTS_MS).
  private wakeWordResumeTimer: ReturnType<typeof setTimeout> | null = null;

  private speechInstance = Speech;

  // Lazy-load the model so it isn't resolved at class construction time.
  // In dev mode Metro serves .dm assets over HTTP; an eager require() triggers
  // synchronous URL loading on the main thread and produces a runtime warning.
  // Switch voice models by changing which line is active below — and keep
  // TTS_MODEL_BUNDLED_FILENAME (top of file) in sync.
  private _ttsModel: any = null;
  private getTtsModel() {
    if (!this._ttsModel) {
      this._ttsModel = require('../../ios/models/model_ex_hanna_light_davoice_ph.dm');
      // this._ttsModel = require('../../ios/models/model_ex_rich_fast_davoice_phoneme.dm');
    }
    return this._ttsModel;
  }

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
        model: this.getTtsModel(),
      });
      trace(
        `[STT TRACE][SpeechService] initAll resolved result=${String(result)}`,
      );
      await prepareSpeechRecognitionAfterFullInit();

      this.attachFinishedSpeakingListener();
    } catch (e) {
      console.error('[SpeechService] init error:', e);
      throw e;
    }
  }

  private attachFinishedSpeakingListener() {
    // Set up completion listener
    this.speechInstance.onFinishedSpeaking = () => {
      trace('[STT TRACE][SpeechService] onFinishedSpeaking event');
      if (this.synthesisInProgress) {
        // Android: the native play queue drained between sentence chunks —
        // the utterance isn't actually done, more chunks are on the way.
        trace(
          '[STT TRACE][SpeechService] ignoring onFinishedSpeaking mid-synthesis',
        );
        return;
      }
      this.handlePlaybackFinished();
    };
  }

  public static getInstance(): SpeechServiceClass {
    if (!SpeechServiceClass.instance) {
      SpeechServiceClass.instance = new SpeechServiceClass();
    }
    return SpeechServiceClass.instance;
  }

  private async speakText(text: string) {
    if (!text) return;
    text = normalizeForSpeech(text);

    try {
      trace(`[STT TRACE][SpeechService] speakText begin text="${text}"`);
      const speakerId = 0; // Piper uses 0 for single‑speaker models

      if (Platform.OS === 'ios') {
        // Only release the mic (and pay the settle delay) when the wakeword
        // mic is actually live or starting up. During a burst of word taps the
        // deferred resume keeps it off, so this whole block is skipped and the
        // word speaks immediately.
        let releasedMic = false;
        if (WakeWordService.getInstance().isActiveOrStarting()) {
          try {
            trace('[SpeechService] speakText: pausing wakeword detection (keepWarm=true) before starting TTS');
            await WakeWordService.getInstance().pauseDetection(false);
            releasedMic = true;
            trace('[SpeechService] speakText: pauseDetection completed');
          } catch (error) {
            console.warn('[SpeechService] WakeWord pause before TTS failed:', error);
          }
        }

        // Notify Verbi that TTS is starting (pause partner STT)
        this.speakStartCallbacks.forEach(cb => { try { cb(); } catch { } });

        if (releasedMic) {
          // Give the audio session a moment to settle after releasing the mic.
          await new Promise<void>(resolve =>
            setTimeout(resolve, IOS_TTS_AUDIO_SETTLE_MS),
          );
        }
      }

      if (Platform.OS === 'android') {
        // The Android engine synthesizes an ENTIRE string to PCM before it
        // enqueues anything for playback, so time-to-first-audio scales with
        // text length. Feed it sentence by sentence instead: each speak()
        // resolves once that sentence is synthesized and enqueued, and the
        // native side plays clips serially — so the first sentence is audible
        // while the rest are still synthesizing.
        const generation = this.speakGeneration;
        const chunks = splitIntoSentenceChunks(text);
        this.synthesisInProgress = true;
        try {
          for (const chunk of chunks) {
            if (generation !== this.speakGeneration) {
              trace(
                '[STT TRACE][SpeechService] chunk loop aborted by stop()',
              );
              break;
            }
            await this.speakNativeWithRetry(chunk, speakerId);
          }
        } finally {
          this.synthesisInProgress = false;
        }
      } else {
        await this.speakNativeWithRetry(text, speakerId);
      }
    } catch (e) {
      console.error('[SpeechService] speakText error after retries:', e);
      this.handlePlaybackFinished();
    }
  }

  private async speakNativeWithRetry(
    text: string,
    speakerId: number,
  ): Promise<void> {
    try {
      await this.speechInstance.speak(text, speakerId, 0.9);
      trace('[STT TRACE][SpeechService] speak resolved');
    } catch (error) {
      traceWarn('[SpeechService] First TTS attempt failed, retrying...', error);
      // Wait a bit longer and retry once
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      await this.speechInstance.speak(text, speakerId, 0.9);
      trace('[STT TRACE][SpeechService] retry speak resolved');
    }
  }

  private handlePlaybackFinished() {
    trace(
      `[STT TRACE][SpeechService] handlePlaybackFinished queue=${this.queue.length
      } current=${String(this.currentItem?.text)}`,
    );
    this.isPlaying = false;
    this.processingQueue = false;

    const completedItem = this.currentItem;
    this.currentItem = null;

    // Call completion callback if set
    completedItem?.onComplete?.();

    // Notify Verbi that TTS has ended (resume partner STT if eligible)
    this.speakEndCallbacks.forEach(cb => { try { cb(); } catch { } });

    // Process next in queue if any
    if (this.queue.length > 0) {
      this.processQueue();
    } else if (
      Platform.OS === 'ios' &&
      // completedItem is null when a stale native finish event arrives after
      // stop() already cleared it — a cancelled utterance must not re-open
      // the mic.
      completedItem != null &&
      completedItem.resumeWakeWordOnComplete !== false
    ) {
      // Queue is drained — the audio session is no longer needed for TTS.
      // Resume wakeword detection so it can listen again without waiting for
      // a navigation event (Open.tsx focus or handleAnswerSelected setTimeout)
      // to do it. Deferred so a burst of word taps never restarts the mic
      // between words — any speak() before the timer fires cancels it.
      // Callers that immediately start STT will re-pause via
      // handleRecord → WakeWordService.pauseDetection before opening the mic.
      trace('[SpeechService] handlePlaybackFinished: queue is empty, scheduling deferred wakeword resume');
      this.scheduleWakeWordResume();
    }
  }

  private cancelScheduledWakeWordResume(): void {
    if (this.wakeWordResumeTimer) {
      clearTimeout(this.wakeWordResumeTimer);
      this.wakeWordResumeTimer = null;
    }
  }

  private scheduleWakeWordResume(): void {
    this.cancelScheduledWakeWordResume();
    this.wakeWordResumeTimer = setTimeout(() => {
      this.wakeWordResumeTimer = null;
      // Resume only re-opens a mic that was open before TTS started. It must
      // never bootstrap wakeword — resumeDetection self-initializes, which
      // opens the mic and fires the permission prompt (e.g. mid-onboarding).
      if (!WakeWordService.getInstance().hasInitialized()) {
        trace(
          '[SpeechService] skipping wakeword resume — service never initialized',
        );
        return;
      }
      WakeWordService.getInstance()
        .resumeDetection()
        .then(() => {
          trace('[SpeechService] deferred WakeWordService.resumeDetection() resolved successfully');
        })
        .catch(err =>
          console.warn('[SpeechService] WakeWord resume after TTS failed:', err),
        );
    }, WAKEWORD_RESUME_AFTER_TTS_MS);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    const upgradingFromTtsOnly = this.ttsOnlyMode;
    // The upgrade tears down the standalone TTS bridge right away (initAll
    // destroys it before booting the unified engine), so TTS-only mode is
    // over no matter how initAll ends. Leaving the flag set would let
    // speak()/stop() talk to the destroyed bridge while init is in flight.
    this.ttsOnlyMode = false;

    this.initializePromise = (async () => {
      try {
        if (Platform.OS === 'ios' && upgradingFromTtsOnly) {
          // Undo onboarding's playback-only routing so the full engine falls
          // back to the wakeword routing config (playAndRecord).
          try {
            await this.speechInstance.clearAudioRoutingConfig();
          } catch (routingError) {
            console.warn(
              '[SpeechService] clearing TTS-only routing config failed:',
              routingError,
            );
          }
        }
        await this.initSpeech();
        this.initialized = true;
      } catch (error) {
        console.error('[SpeechService] initialize error:', error);
        this.initialized = false;
      } finally {
        this.initializePromise = null;
      }
    })();

    return this.initializePromise;
  }

  /**
   * Onboarding-only: initialize just the TTS engine, without the STT bridge.
   * Full init (initAll) warms the speech recognizer, which fires the iOS
   * microphone and speech-recognition permission prompts — this path doesn't.
   * Call initialize() afterwards (onboarding completion does) to upgrade to
   * the full engine.
   */
  public async initializeTtsOnly(): Promise<void> {
    if (this.initialized || this.ttsOnlyMode) return;
    // A full init is already under way (e.g. the Permissions step upgrades
    // after the mic grant) — wait for it instead of racing the dead
    // standalone bridge.
    if (this.initializePromise) return this.initializePromise;
    if (this.ttsOnlyInitPromise) return this.ttsOnlyInitPromise;

    this.ttsOnlyInitPromise = (async () => {
      try {
        if (AppConfig.davoiceLicense) {
          trace('[SpeechService] Activating DaVoice license (TTS-only)');
          await this.activateLicense(AppConfig.davoiceLicense);
        } else {
          throw new Error(
            'No DaVoice license found. Set DAVOICE_LICENSE in the environment.',
          );
        }

        // Without a direct routing config the TTS engine resolves its iOS
        // audio session from the wakeword routing (playAndRecord), and
        // activating a record-capable session triggers the mic permission
        // prompt. Playback-only routing keeps onboarding prompt-free; full
        // init clears it so wakeword routing takes over again.
        if (Platform.OS === 'ios') {
          try {
            await this.speechInstance.setAudioRoutingConfig({
              default: {
                category: 'playback',
                mode: 'default',
                options: ['mixWithOthers', 'duckOthers'],
                preferredInput: 'none',
              },
            });
          } catch (routingError) {
            console.warn(
              '[SpeechService] TTS-only routing config failed:',
              routingError,
            );
          }
        }

        try {
          await this.speechInstance.initTTS({ model: this.getTtsModel() });
        } catch (assetError) {
          // Dev mode: Metro serves the .dm over HTTP with a query string the
          // standalone TTS bridge can't load (initAll's unified bridge can).
          // The model also ships as a native bundle resource, so retry with
          // the bare filename — the bridge passes strings through unchanged.
          trace(
            `[SpeechService] initTTS via asset failed (${String(
              assetError,
            )}); retrying with bundled filename`,
          );
          await this.speechInstance.initTTS({
            model: TTS_MODEL_BUNDLED_FILENAME,
          });
        }
        this.attachFinishedSpeakingListener();
        this.ttsOnlyMode = true;
        trace('[SpeechService] TTS-only init complete');
      } catch (e) {
        console.error('[SpeechService] initializeTtsOnly error:', e);
        throw e;
      } finally {
        this.ttsOnlyInitPromise = null;
      }
    })();

    return this.ttsOnlyInitPromise;
  }

  public async speak(
    text: string,
    immediate: boolean = false,
    onComplete?: () => void,
    resumeWakeWordOnComplete: boolean = true,
  ): Promise<void> {
    trace(
      `[STT TRACE][SpeechService] speak requested immediate=${immediate} initialized=${this.initialized} text="${text}"`,
    );
    if (!text || text.trim().length === 0) {
      return;
    }

    // New speech is starting — don't let a pending deferred resume re-open
    // the wakeword mic underneath it.
    this.cancelScheduledWakeWordResume();

    try {
      // TTS-only mode (onboarding) can speak without the full engine —
      // self-initializing here would boot STT and trigger permission prompts.
      if (!this.initialized && !this.ttsOnlyMode) {
        const initialized = await this.waitForInitialization();
        if (!initialized) {
          return;
        }
      }

      if (immediate) {
        // Nothing is playing or queued in the common case (a word tap on an
        // idle engine) — skip the native stop round-trip and the settle delay
        // entirely and start speaking right away.
        if (!this.isPlaying && !this.processingQueue && this.queue.length === 0) {
          this.queue = [{ text, onComplete, resumeWakeWordOnComplete }];
          this.processQueue();
          return;
        }

        await this.stop();
        // Wait a bit to ensure previous playback is fully stopped
        const stopDelay = Platform.OS === 'ios' ? 200 : 50;
        setTimeout(() => {
          this.queue = [{ text, onComplete, resumeWakeWordOnComplete }];
          this.processQueue();
        }, stopDelay);
        return;
      } else {
        this.queue.push({ text, onComplete, resumeWakeWordOnComplete });
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
    // Abort any Android sentence-chunk loop still feeding the engine.
    this.speakGeneration++;
    try {
      if (this.speechInstance && (this.initialized || this.ttsOnlyMode)) {
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
      this.cancelScheduledWakeWordResume();
      await this.stop();
      if (this.speechInstance && (this.initialized || this.ttsOnlyMode)) {
        await this.speechInstance.destroyAll();
      }
      this.speechInstance.onFinishedSpeaking = () => { };
      this.volumeCleanup?.();
      this.volumeCleanup = null;
      this.initialized = false;
      this.ttsOnlyMode = false;
    } catch (error) {
      console.error('[SpeechService] shutdown error:', error);
      this.volumeCleanup?.();
      this.volumeCleanup = null;
      this.initialized = false;
      this.ttsOnlyMode = false;
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

  /**
   * Register a callback that fires when TTS begins speaking.
   * Returns an unsubscribe function. Used by Verbi to pause partner STT.
   */
  public onSpeakStart(cb: () => void): () => void {
    this.speakStartCallbacks.add(cb);
    return () => this.speakStartCallbacks.delete(cb);
  }

  /**
   * Register a callback that fires when TTS finishes speaking.
   * Returns an unsubscribe function. Used by Verbi to resume partner STT.
   */
  public onSpeakEnd(cb: () => void): () => void {
    this.speakEndCallbacks.add(cb);
    return () => this.speakEndCallbacks.delete(cb);
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
