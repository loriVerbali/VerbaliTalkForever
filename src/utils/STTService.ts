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

const ttsModel = require('../../ios/models/model_ex_ariana_fast_davoice_phoneme.dm');

const tracePayload = (event: any) => {
  try {
    return JSON.stringify(event);
  } catch {
    return String(event);
  }
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
    lastSpeechErrorCode = String(event?.error?.code ?? '');
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
  trace('[STT TRACE][service] stop speech recognition begin');
  await DaVoice.stop();
  trace('[STT TRACE][service] stop speech recognition resolved');
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

    try {
      trace('[STT TRACE][service] calling initWithoutModel');
      await DaVoice.initWithoutModel();
    } catch (error) {
      trace(
        '[STT TRACE][service] initWithoutModel unavailable, calling initAll',
        describeError(error),
      );
      await DaVoice.initAll({
        locale,
        model: ttsModel,
      });
    }

    initialized = true;
    await pauseSpeechRecognitionNow();
    trace('[STT TRACE][service] init complete and paused');
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
};

const resetIOSSpeechEngine = async (): Promise<void> => {
  traceWarn('[STT TRACE][service] resetting iOS STT engine');
  try {
    await DaVoice.cancel();
  } catch (error) {
    traceWarn(
      '[STT TRACE][service] cancel before reset failed',
      describeError(error),
    );
  }
  await sleep(300);

  try {
    await DaVoice.destroyWithoutModel();
  } catch (error) {
    traceWarn(
      '[STT TRACE][service] destroyWithoutModel during reset failed',
      describeError(error),
    );
  }
  await sleep(300);

  await DaVoice.initWithoutModel();
  await sleep(300);
};

export const pauseSpeechRecognition = (): Promise<void> =>
  enqueueTransition(pauseSpeechRecognitionNow);

export const prepareSpeechRecognitionAfterFullInit = (): Promise<void> =>
  enqueueTransition(async () => {
    initialized = true;
    licenseActivated = true;
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

      trace('[STT TRACE][service] clearing any stale STT session before start');
      await DaVoice.cancel();
      await sleep(300);
      try {
        await DaVoice.start(locale, options);
      } catch (startError) {
        const nativeError = startError as Error & { code?: string };
        const alreadyStartedDuringStart =
          lastSpeechErrorCode === 'already_started' &&
          lastSpeechErrorAt >= startRequestedAt;
        if (
          nativeError.code === 'stt_start_timeout' &&
          alreadyStartedDuringStart
        ) {
          traceWarn(
            '[STT TRACE][service] DaVoice start timed out after already_started; resetting STT engine and retrying',
          );
          await resetIOSSpeechEngine();
          lastVolumeEventAt = 0;
          lastSpeechStartAt = 0;
          lastSpeechErrorCode = '';
          lastSpeechErrorAt = 0;
          await DaVoice.start(locale, options);
        } else {
          throw startError;
        }
      }

      trace('[STT TRACE][service] DaVoice start resolved');
      await sleep(IOS_START_ACTIVITY_GRACE_MS);
      const recognizing = await getIOSRecognizing();
      await logSpeechDiagnostics('after-start');

      if (
        !recognizing &&
        lastSpeechStartAt < startRequestedAt
      ) {
        throw new Error(
          'DaVoice.start resolved but iOS speech recognition did not become active.',
        );
      }

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
