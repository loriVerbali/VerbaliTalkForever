/**
 * The speech (TTS) service against mocked native bridges: what matters here
 * is the queue's handling of a tap that lands while the previous word is
 * still getting the microphone, and the wait for the Verbi STT pause - the
 * two reasons a first tap could go unheard.
 */
jest.mock('react-native-davoice-tts/speech', () => ({
  __esModule: true,
  default: {
    speak: jest.fn(async () => undefined),
    stopSpeaking: jest.fn(async () => undefined),
    setLicense: jest.fn(async () => true),
    initAll: jest.fn(async () => 'ok'),
    initTTS: jest.fn(async () => undefined),
    destroyAll: jest.fn(async () => undefined),
    setAudioRoutingConfig: jest.fn(async () => undefined),
    clearAudioRoutingConfig: jest.fn(async () => undefined),
    onFinishedSpeaking: () => undefined,
  },
}));
jest.mock('../ios/models/model_ex_hanna_light_davoice_ph.dm', () => 1);
jest.mock('../src/utils/STTService', () => ({
  prepareSpeechRecognitionAfterFullInit: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/config', () => ({
  __esModule: true,
  // The expiry prefix decodes to a date in 2100.
  default: {davoiceLicense: `${Buffer.from('4102444800000').toString('base64')}-test`},
}));
jest.mock('../src/utils/wakewordService', () => {
  const instance = {
    isActiveOrStarting: jest.fn(() => false),
    pauseDetection: jest.fn(async () => undefined),
    resumeDetection: jest.fn(async () => undefined),
    hasInitialized: jest.fn(() => true),
  };
  return {__esModule: true, default: {getInstance: () => instance}};
});

import Speech from 'react-native-davoice-tts/speech';
import WakeWordService from '../src/utils/wakewordService';
import TTSService from '../src/utils/SpeechService';

const speech = Speech as unknown as {speak: jest.Mock; stopSpeaking: jest.Mock};
const wakeWord = WakeWordService.getInstance() as unknown as {
  isActiveOrStarting: jest.Mock;
  pauseDetection: jest.Mock;
  resumeDetection: jest.Mock;
};

const SETTLE_MS = 150;
const RESTART_MS = 200;
const RESUME_MS = 1200;
const CALLBACK_MAX_MS = 700;

const flush = async (rounds = 4) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

/** Make the next wake-word mic release wait until the test lets it go. */
const holdMicRelease = () => {
  let release: () => void = () => undefined;
  wakeWord.pauseDetection.mockImplementationOnce(
    () => new Promise<void>(resolve => {
      release = resolve;
    }),
  );
  return () => release();
};

beforeAll(async () => {
  await TTSService.initialize();
  expect(TTSService.isAvailable()).toBe(true);
});

beforeEach(() => {
  jest.useFakeTimers({doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask']});
  speech.speak.mockReset();
  speech.speak.mockImplementation(async () => undefined);
  speech.stopSpeaking.mockReset();
  speech.stopSpeaking.mockImplementation(async () => undefined);
  wakeWord.pauseDetection.mockReset();
  wakeWord.pauseDetection.mockImplementation(async () => undefined);
  wakeWord.resumeDetection.mockReset();
  wakeWord.resumeDetection.mockImplementation(async () => undefined);
  wakeWord.isActiveOrStarting.mockReturnValue(false);
});

afterEach(async () => {
  await TTSService.stop();
  jest.useRealTimers();
});

describe('SpeechService word taps', () => {
  it('a plain word on an idle engine: mic released, word spoken, wake word resumed after the deferral', async () => {
    wakeWord.isActiveOrStarting.mockReturnValue(true);
    TTSService.speak('Hello', true);
    await flush();
    expect(wakeWord.pauseDetection).toHaveBeenCalledWith(false);
    expect(speech.speak).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(SETTLE_MS);
    await flush();
    expect(speech.speak).toHaveBeenCalledWith('Hello', 0, 0.9);
    expect(TTSService.isCurrentlyPlaying()).toBe(false);
    expect(wakeWord.resumeDetection).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(RESUME_MS);
    await flush();
    expect(wakeWord.resumeDetection).toHaveBeenCalledTimes(1);
  });

  it('a second tap during the mic handoff swaps the word in; only that word is spoken, once', async () => {
    wakeWord.isActiveOrStarting.mockReturnValue(true);
    const releaseMic = holdMicRelease();
    const first = TTSService.speak('Happy', true);
    await flush();
    expect(wakeWord.pauseDetection).toHaveBeenCalledTimes(1);
    expect(speech.speak).not.toHaveBeenCalled();

    const second = TTSService.speak('Sad', true);
    await flush();
    expect(speech.stopSpeaking).not.toHaveBeenCalled();

    releaseMic();
    await flush();
    await jest.advanceTimersByTimeAsync(SETTLE_MS);
    await flush();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.speak.mock.calls[0][0]).toBe('Sad');
    await Promise.all([first, second]);
  });

  it('stop() during the handoff cancels the word instead of speaking it late', async () => {
    wakeWord.isActiveOrStarting.mockReturnValue(true);
    const releaseMic = holdMicRelease();
    TTSService.speak('Happy', true);
    await flush();
    await TTSService.stop();
    releaseMic();
    await flush();
    await jest.advanceTimersByTimeAsync(SETTLE_MS);
    await flush();
    expect(speech.speak).not.toHaveBeenCalled();
    expect(TTSService.isCurrentlyPlaying()).toBe(false);
  });

  it('an utterance with a completion callback is stopped and restarted, never swapped', async () => {
    wakeWord.isActiveOrStarting.mockReturnValue(true);
    const releaseMic = holdMicRelease();
    const done = jest.fn();
    TTSService.speak('Hello there', true, done);
    await flush();
    TTSService.speak('Sad', true);
    await flush();
    expect(speech.stopSpeaking).toHaveBeenCalledTimes(1);

    releaseMic();
    await flush();
    await jest.advanceTimersByTimeAsync(RESTART_MS + SETTLE_MS);
    await flush();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.speak.mock.calls[0][0]).toBe('Sad');
    expect(done).not.toHaveBeenCalled();
  });

  it('waits for a speak-start listener (Verbi releasing the STT mic) before speaking', async () => {
    let releaseStt: () => void = () => undefined;
    const unsubscribe = TTSService.onSpeakStart(
      () =>
        new Promise<void>(resolve => {
          releaseStt = resolve;
        }),
    );
    try {
      TTSService.speak('Hello', true);
      await flush();
      expect(speech.speak).not.toHaveBeenCalled();
      releaseStt();
      await flush();
      expect(speech.speak).toHaveBeenCalledWith('Hello', 0, 0.9);
    } finally {
      unsubscribe();
    }
  });

  it('a listener that never settles delays the word by at most the cap', async () => {
    const unsubscribe = TTSService.onSpeakStart(() => new Promise<void>(() => undefined));
    try {
      TTSService.speak('Hello', true);
      await flush();
      expect(speech.speak).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(CALLBACK_MAX_MS);
      await flush();
      expect(speech.speak).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });
});
