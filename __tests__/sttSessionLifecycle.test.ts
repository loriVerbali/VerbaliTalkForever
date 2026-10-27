/**
 * The speech-recognition session lifecycle in STTService, against a mocked
 * DaVoice bridge. What matters: the same owner resumes the warm session
 * (fast path), a different owner - or an explicit end-session - cancels the
 * engine's open segment and starts a brand-new session, and the per-question
 * stop never cancels (its pending finals must still arrive). This is what
 * keeps words spoken on Convo from surfacing on Home.
 */
jest.mock('react-native-davoice-tts/speech', () => ({
  __esModule: true,
  default: {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
    pauseSpeechRecognition: jest.fn(async () => undefined),
    unPauseSpeechRecognition: jest.fn(async () => undefined),
    pauseMicrophone: jest.fn(async () => undefined),
    unPauseMicrophone: jest.fn(async () => undefined),
    stopSpeaking: jest.fn(async () => undefined),
    isRecognizing: jest.fn(async () => 1),
    setLicense: jest.fn(async () => true),
    initAll: jest.fn(async () => 'ok'),
    destroyWithoutModel: jest.fn(async () => undefined),
    initWithoutModel: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/utils/config', () => ({
  __esModule: true,
  default: {davoiceLicense: 'test-license'},
}));

import DaVoice from 'react-native-davoice-tts/speech';
import {
  endSpeechRecognitionSession,
  prepareSpeechRecognitionAfterFullInit,
  startSpeechRecognition,
  stopSpeechRecognition,
} from '../src/utils/STTService';

const bridge = DaVoice as unknown as {
  start: jest.Mock;
  cancel: jest.Mock;
  pauseSpeechRecognition: jest.Mock;
  unPauseSpeechRecognition: jest.Mock;
};

beforeAll(async () => {
  // The app's bootstrap path: initAll already ran, the recogniser is warm.
  await prepareSpeechRecognitionAfterFullInit();
});

beforeEach(() => {
  bridge.start.mockClear();
  bridge.cancel.mockClear();
  bridge.pauseSpeechRecognition.mockClear();
  bridge.unPauseSpeechRecognition.mockClear();
});

describe('speech session lifecycle (iOS)', () => {
  it('the first start of the process resumes the initAll-warmed session', async () => {
    await startSpeechRecognition('en-US', {}, 'home');
    expect(bridge.unPauseSpeechRecognition).toHaveBeenCalledTimes(1);
    expect(bridge.start).not.toHaveBeenCalled();
    expect(bridge.cancel).not.toHaveBeenCalled();
  });

  it('the same owner keeps the warm resume across stop/start cycles', async () => {
    await stopSpeechRecognition(); // between questions
    await startSpeechRecognition('en-US', {}, 'home');
    expect(bridge.pauseSpeechRecognition).toHaveBeenCalledTimes(1);
    expect(bridge.unPauseSpeechRecognition).toHaveBeenCalledTimes(1);
    expect(bridge.start).not.toHaveBeenCalled();
    expect(bridge.cancel).not.toHaveBeenCalled();
  });

  it('a different owner cancels the old session and starts a new one', async () => {
    await stopSpeechRecognition();
    await startSpeechRecognition('en-US', {}, 'verbi-partner');
    expect(bridge.cancel).toHaveBeenCalledTimes(1);
    expect(bridge.start).toHaveBeenCalledTimes(1);
    expect(bridge.unPauseSpeechRecognition).not.toHaveBeenCalled();
  });

  it('ending the session discards the segment and forces the next start cold, same owner included', async () => {
    await endSpeechRecognitionSession(); // leaving the screen
    expect(bridge.cancel).toHaveBeenCalledTimes(1);

    await startSpeechRecognition('en-US', {}, 'verbi-partner');
    expect(bridge.cancel).toHaveBeenCalledTimes(2);
    expect(bridge.start).toHaveBeenCalledTimes(1);
    expect(bridge.unPauseSpeechRecognition).not.toHaveBeenCalled();
  });

  it('after the fresh start, the owner is warm again', async () => {
    await stopSpeechRecognition();
    await startSpeechRecognition('en-US', {}, 'verbi-partner');
    expect(bridge.unPauseSpeechRecognition).toHaveBeenCalledTimes(1);
    expect(bridge.start).not.toHaveBeenCalled();
  });

  it('the per-question stop never cancels, so pending finals still arrive', async () => {
    await stopSpeechRecognition();
    expect(bridge.cancel).not.toHaveBeenCalled();
    expect(bridge.pauseSpeechRecognition).toHaveBeenCalledTimes(1);
  });

  it('a failing native cancel still forces the cold start', async () => {
    bridge.cancel.mockRejectedValueOnce(new Error('engine busy'));
    await endSpeechRecognitionSession();
    await startSpeechRecognition('en-US', {}, 'home');
    expect(bridge.start).toHaveBeenCalledTimes(1);
    expect(bridge.unPauseSpeechRecognition).not.toHaveBeenCalled();
  });
});
