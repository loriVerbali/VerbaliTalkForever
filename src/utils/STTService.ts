import { Platform } from 'react-native';
import DaVoice from 'react-native-davoice-tts/speech';
import AppConfig from './config';

type SpeechEventHandlers = {
  onSpeechStart?: (event: any) => void;
  onSpeechRecognized?: (event: any) => void;
  onSpeechEnd?: (event: any) => void;
  onSpeechError?: (event: any) => void;
  onSpeechResults?: (event: any) => void;
  onSpeechPartialResults?: (event: any) => void;
  onSpeechVolumeChanged?: (event: any) => void;
};

type SpeechEventName = keyof SpeechEventHandlers;
type SpeechEventSubscriptionOptions = {
  key?: string;
};

const STT_DEBUG = false;
const IOS_START_WATCHDOG_MS = 3000;
const IOS_START_ACTIVITY_GRACE_MS = 700;

const subscribers = new Set<SpeechEventHandlers>();
const keyedSubscribers = new Map<string, SpeechEventHandlers>();
let nextSubscriberId = 1;
let transition: Promise<void> = Promise.resolve();
let lastVolumeTraceAt = 0;
let lastVolumeEventAt = 0;
let lastSpeechStartAt = 0;
let lastSpeechErrorCode = '';
let lastSpeechErrorAt = 0;
let initialized = false;
let initPromise: Promise<void> | null = null;
let licenseActivated = false;
let speechRecognitionNeedsPause = false;

// Lazy-load the model to avoid synchronous asset URL resolution on the
// main thread at module load time. In dev mode Metro serves .dm files over
// HTTP; evaluating require() eagerly triggers a synchronous network fetch
// before the JS thread yields, producing the main-thread warning.
let _ttsModel: any = null;
const getTtsModel = () => {

  if (!_ttsModel) {
    _ttsModel = require('../../ios/models/model_ex_hanna_light_davoice_ph.dm');
  }
  return _ttsModel;
};

const tracePayload = (event: any) => {
  try {
    return JSON.stringify(event);
  } catch {
    return String(event);
  }
};

const getSpeechErrorCode = (error: any): string => {
  return String(error?.code ?? error?.error?.code ?? '');
};

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

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

const dispatch = (eventName: SpeechEventName, event: any) => {
  const now = Date.now();
  if (eventName === 'onSpeechVolumeChanged') {
    lastVolumeEventAt = now;
  }
  if (eventName === 'onSpeechStart') {
    lastSpeechStartAt = now;
  }
  if (eventName === 'onSpeechError') {
    lastSpeechErrorCode = getSpeechErrorCode(event);
    lastSpeechErrorAt = now;
    if (STT_DEBUG || lastSpeechErrorCode !== 'already_started') {
      console.error('[STT PACKAGE ERROR][event]', tracePayload(event));
    }
  }
  if (
    STT_DEBUG &&
    (eventName !== 'onSpeechVolumeChanged' || now - lastVolumeTraceAt >= 1000)
  ) {
    console.log(
      `[STT TRACE][router] ${eventName} subscribers=${subscribers.size
      } payload=${tracePayload(event)}`,
    );
    if (eventName === 'onSpeechVolumeChanged') {
      lastVolumeTraceAt = now;
    }
  }

  subscribers.forEach(subscriber => {
    try {
      subscriber[eventName]?.(event);
    } catch (error) {
      console.error(`[STTService] ${eventName} subscriber failed:`, error);
    }
  });
};

const enqueueTransition = (work: () => Promise<void>): Promise<void> => {
  const run = transition.catch(() => { }).then(work);
  transition = run.catch(() => { });
  return run;
};

const describeError = (error: unknown) => {
  if (error instanceof Error) {
    const nativeError = error as Error & {
      code?: string;
      domain?: string;
      userInfo?: unknown;
    };
    return {
      name: nativeError.name,
      message: nativeError.message,
      code: nativeError.code,
      domain: nativeError.domain,
      userInfo: nativeError.userInfo,
      stack: nativeError.stack,
    };
  }
  return { value: error };
};

const installEventRouting = () => {
  DaVoice.onSpeechStart = (event: any) => dispatch('onSpeechStart', event);
  DaVoice.onSpeechRecognized = (event: any) =>
    dispatch('onSpeechRecognized', event);
  DaVoice.onSpeechEnd = (event: any) => dispatch('onSpeechEnd', event);
  DaVoice.onSpeechError = (event: any) => dispatch('onSpeechError', event);
  DaVoice.onSpeechResults = (event: any) => dispatch('onSpeechResults', event);
  DaVoice.onSpeechPartialResults = (event: any) =>
    dispatch('onSpeechPartialResults', event);
  DaVoice.onSpeechVolumeChanged = (event: any) =>
    dispatch('onSpeechVolumeChanged', event);
};

installEventRouting();

const getIOSRecognizing = async () => {
  try {
    return (await DaVoice.isRecognizing()) === 1;
  } catch {
    return false;
  }
};

export const logSpeechDiagnostics = async (label: string): Promise<void> => {
  if (!STT_DEBUG || Platform.OS !== 'ios') {
    return;
  }

  try {
    const [micPermission, speechPermission, recognizing] = await Promise.all([
      DaVoice.hasIOSMicPermissions(),
      DaVoice.hasIOSSpeechRecognitionPermissions(),
      getIOSRecognizing(),
    ]);

    console.log(
      `[STT DIAGNOSTICS][${label}] micPermission=${String(
        micPermission,
      )} speechPermission=${String(speechPermission)} recognizing=${String(
        recognizing,
      )} lastVolumeAgeMs=${lastVolumeEventAt ? Date.now() - lastVolumeEventAt : 'never'
      }`,
    );
  } catch (error) {
    console.error(
      `[STT DIAGNOSTICS][${label}] probe failed`,
      describeError(error),
    );
  }
};

export const subscribeToSpeechEvents = (
  handlers: SpeechEventHandlers,
  options: SpeechEventSubscriptionOptions = {},
): (() => void) => {
  const subscriberId = nextSubscriberId++;
  if (options.key) {
    const previous = keyedSubscribers.get(options.key);
    if (previous) {
      subscribers.delete(previous);
      trace(
        `[STT TRACE][router] replaced subscriber key=${options.key} total=${subscribers.size}`,
      );
    }
    keyedSubscribers.set(options.key, handlers);
  }
  subscribers.add(handlers);
  trace(
    `[STT TRACE][router] subscriber=${subscriberId} added handlers=${Object.keys(
      handlers,
    ).join(',')} key=${options.key ?? 'none'} total=${subscribers.size}`,
  );

  return () => {
    subscribers.delete(handlers);
    if (options.key && keyedSubscribers.get(options.key) === handlers) {
      keyedSubscribers.delete(options.key);
    }
    trace(
      `[STT TRACE][router] subscriber=${subscriberId} removed total=${subscribers.size}`,
    );
  };
};

const activateLicense = async () => {
  if (licenseActivated) {
    return;
  }

  if (!AppConfig.davoiceLicense) {
    throw new Error(
      'No DaVoice license found. Set DAVOICE_LICENSE in the environment.',
    );
  }

  const activated = await DaVoice.setLicense(AppConfig.davoiceLicense);
  if (!activated) {
    throw new Error('DaVoice rejected DAVOICE_LICENSE.');
  }

  licenseActivated = true;
};

const pauseSpeechRecognitionNow = async () => {
  trace('[STT TRACE][service] pause speech recognition begin');
  if (Platform.OS === 'ios' && !speechRecognitionNeedsPause) {
    trace('[STT TRACE][service] pause skipped: speech recognition already parked');
    await logSpeechDiagnostics('after-pause-skip');
    return;
  }

  if (Platform.OS === 'ios' && typeof DaVoice.pauseSpeechRecognition === 'function') {
    try {
      await DaVoice.pauseSpeechRecognition();
    } finally {
      speechRecognitionNeedsPause = false;
    }
  } else {
    try {
      await DaVoice.stop();
    } finally {
      speechRecognitionNeedsPause = false;
    }
  }
  trace('[STT TRACE][service] pause speech recognition resolved');
  await logSpeechDiagnostics('after-stop');
};

const initializeSpeechRecognition = async (
  locale: string,
): Promise<void> => {
  if (initialized) {
    return;
  }

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    trace('[STT TRACE][service] init begin');
    await activateLicense();

    // Always use the on-device model for low-latency partials.
    // initWithoutModel falls back to Apple cloud STT which has slow network round-trips.
    trace('[STT TRACE][service] calling initAll with on-device model');
    await DaVoice.initAll({
      locale,
      model: getTtsModel(),
    });

    initialized = true;
    speechRecognitionNeedsPause = true;
    await pauseSpeechRecognitionNow();
    trace('[STT TRACE][service] init complete and paused');
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
};

const resetIOSSpeechRecognition = async (): Promise<void> => {
  traceWarn('[STT TRACE][service] resetting stale iOS STT session');

  try {
    await DaVoice.cancel();
  } catch (error) {
    traceWarn(
      '[STT TRACE][service] cancel before reset failed',
      describeError(error),
    );
  }

  try {
    await DaVoice.stop();
  } catch (error) {
    traceWarn(
      '[STT TRACE][service] stop before reset failed',
      describeError(error),
    );
  } finally {
    speechRecognitionNeedsPause = false;
  }

  await sleep(300);
  await DaVoice.destroyWithoutModel();
  initialized = false;
  await sleep(300);
  await DaVoice.initWithoutModel();
  initialized = true;
  speechRecognitionNeedsPause = true;
  await pauseSpeechRecognitionNow();
  await sleep(300);
};

export const pauseSpeechRecognition = (): Promise<void> =>
  enqueueTransition(pauseSpeechRecognitionNow);

export const prepareSpeechRecognitionAfterFullInit = (): Promise<void> =>
  enqueueTransition(async () => {
    initialized = true;
    licenseActivated = true;
    // initAll starts the warm recognizer. Mark it active so the initial pause
    // is not mistaken for an already-parked session and skipped.
    speechRecognitionNeedsPause = true;
    await pauseSpeechRecognitionNow();
  });

export const startSpeechRecognition = (
  locale: string = 'en-US',
  options: Record<string, unknown> = {},
): Promise<void> =>
  enqueueTransition(async () => {
    if (Platform.OS !== 'ios') {
      await DaVoice.start(locale, options);
      return;
    }

    trace(`[STT TRACE][service] DaVoice start session locale=${locale}`);

    try {
      await initializeSpeechRecognition(locale);
      await DaVoice.stopSpeaking?.();
      await logSpeechDiagnostics('before-start');

      lastVolumeEventAt = 0;
      const startRequestedAt = Date.now();
      lastSpeechStartAt = 0;
      lastSpeechErrorCode = '';
      lastSpeechErrorAt = 0;

      try {
        if (typeof DaVoice.unPauseSpeechRecognition === 'function') {
          trace('[STT TRACE][service] unpausing warm STT session');
          await DaVoice.unPauseSpeechRecognition(1);
          speechRecognitionNeedsPause = true;
        } else {
          trace('[STT TRACE][service] unPause unavailable, falling back to start');
          await DaVoice.start(locale, options);
          speechRecognitionNeedsPause = true;
        }
      } catch (startError) {
        const nativeErrorCode = getSpeechErrorCode(startError);
        const alreadyStartedDuringStart =
          lastSpeechErrorCode === 'already_started' &&
          lastSpeechErrorAt >= startRequestedAt;
        if (
          alreadyStartedDuringStart ||
          nativeErrorCode === 'already_started' ||
          nativeErrorCode === 'stt_start_timeout'
        ) {
          traceWarn(
            '[STT TRACE][service] DaVoice start found stale STT; resetting and retrying',
          );
          await resetIOSSpeechRecognition();
          lastVolumeEventAt = 0;
          lastSpeechStartAt = 0;
          lastSpeechErrorCode = '';
          lastSpeechErrorAt = 0;
          if (typeof DaVoice.unPauseSpeechRecognition === 'function') {
            await DaVoice.unPauseSpeechRecognition(1);
            speechRecognitionNeedsPause = true;
          } else {
            await DaVoice.start(locale, options);
            speechRecognitionNeedsPause = true;
          }
        } else {
          throw startError;
        }
      }

      trace('[STT TRACE][service] DaVoice start resolved');

      // Run the post-start activity check asynchronously so it does NOT
      // hold the enqueueTransition lock for 700ms after every start.
      // The 3s watchdog below already covers detecting a silent failure.
      const capturedStartAt = startRequestedAt;
      (async () => {
        await sleep(IOS_START_ACTIVITY_GRACE_MS);
        const recognizing = await getIOSRecognizing();
        await logSpeechDiagnostics('after-start');
        if (!recognizing && lastSpeechStartAt < capturedStartAt) {
          traceWarn(
            '[STT TRACE][service] DaVoice.start resolved but iOS speech recognition did not become active.',
          );
        }
      })().catch(() => { });

      setTimeout(() => {
        if (lastSpeechStartAt < startRequestedAt) {
          traceWarn(
            '[STT TRACE][service] DaVoice start resolved without onSpeechStart event',
          );
        }
        logSpeechDiagnostics('start-watchdog-3s').catch(() => { });
      }, IOS_START_WATCHDOG_MS);
    } catch (error) {
      console.error(
        '[STT PACKAGE ERROR][startSpeechRecognition]',
        describeError(error),
      );
      await logSpeechDiagnostics('start-failed');
      throw error;
    }
  });

export const stopSpeechRecognition = (): Promise<void> =>
  enqueueTransition(async () => {
    trace('[STT TRACE][service] pause session');
    try {
      await pauseSpeechRecognitionNow();
      trace('[STT TRACE][service] pause session resolved');
    } catch (error) {
      console.error(
        '[STT PACKAGE ERROR][stopSpeechRecognition]',
        describeError(error),
      );
      throw error;
    }
  });

const VoiceCompatibility = DaVoice as typeof DaVoice & {
  destroy: () => Promise<void>;
};

if (typeof VoiceCompatibility.destroy !== 'function') {
  VoiceCompatibility.destroy = async () => {
    if (typeof DaVoice.destroyAll === 'function') {
      await DaVoice.destroyAll();
    }
  };
}

export default VoiceCompatibility;
