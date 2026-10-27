/**
 * The engine is exercised against the llama.rn and react-native-fs stubs in
 * __mocks__: what matters here is the orchestration (one load for concurrent
 * callers, release ordering, fallbacks), not inference.
 */
import RNFS from 'react-native-fs';
import * as llama from 'llama.rn';
import {localLlmEngine, ModelNotDownloadedError} from '../src/services/localLlm/localLlmEngine';
import {localModelStore} from '../src/services/localLlm/localModelStore';
import {FALLBACK_ANSWER_IMAGE} from '../src/services/localLlm/localLlmModels';

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {isEmulator: jest.fn(async () => true)},
}));

const mockLlama = llama as unknown as {
  initLlama: jest.Mock;
  __context: {
    completion: jest.Mock;
    stopCompletion: jest.Mock;
    release: jest.Mock;
    gpu: boolean;
  };
};
const fs = RNFS as unknown as {__reset: () => void; writeFile: (p: string, c: string) => Promise<void>};

const completionText = (payload: unknown) => ({
  content: JSON.stringify(payload),
  text: '',
  tokens_predicted: 12,
  stopped_eos: true,
  timings: {prompt_n: 180, cache_n: 150, prompt_ms: 400, prompt_per_second: 450, predicted_n: 12, predicted_ms: 300, predicted_per_second: 40},
});

const flush = () => new Promise(resolve => setImmediate(resolve));

const deviceInfo = jest.requireMock('react-native-device-info').default as {
  isEmulator: jest.Mock;
};

/** The call that carried a grammar, i.e. a real question rather than the priming pass. */
const lastAnswerCall = () =>
  [...mockLlama.__context.completion.mock.calls].reverse().find(c => c[0].response_format)?.[0];

const request = {
  sentence: 'How are you feeling today?',
  mode: 'generate_answers' as const,
  count: 3,
};

beforeEach(async () => {
  // Drop whatever the previous test left loaded before the call counts reset.
  await localLlmEngine.release();
  fs.__reset();
  jest.clearAllMocks();
  // clearAllMocks keeps queued mockImplementationOnce values; a test that
  // failed before consuming one must not hand it to the next test.
  mockLlama.__context.completion.mockReset();
  mockLlama.initLlama.mockImplementation(async () => mockLlama.__context);
  mockLlama.__context.completion.mockImplementation(async () =>
    completionText(['Good', 'Tired', 'Sore', 'Happy']),
  );
  await fs.writeFile(localModelStore.localPath('GEMMA_2B'), 'weights');
  await fs.writeFile(localModelStore.localPath('SMOLLM2'), 'weights');
});

describe('localLlmEngine', () => {
  it('rejects when the model file is missing and reports the error', async () => {
    await expect(localLlmEngine.generateAnswers(request, 'GEMMA_3N')).rejects.toBeInstanceOf(
      ModelNotDownloadedError,
    );
    expect(localLlmEngine.getState()).toMatchObject({status: 'error', modelKey: 'GEMMA_3N'});
    expect(mockLlama.initLlama).not.toHaveBeenCalled();
  });

  it('loads once for concurrent callers and returns parsed answers', async () => {
    const [a, b] = await Promise.all([
      localLlmEngine.generateAnswers(request, 'GEMMA_2B'),
      localLlmEngine.generateAnswers(request, 'GEMMA_2B'),
    ]);
    expect(mockLlama.initLlama).toHaveBeenCalledTimes(1);
    expect(mockLlama.initLlama.mock.calls[0][0]).toMatchObject({
      n_ctx: 2048,
      n_gpu_layers: 0, // emulator
      n_threads: 8, // emulator: desktop CPU underneath
      use_mmap: true,
      cache_type_k: 'q8_0',
      swa_full: true,
    });
    expect(a.map(x => x.word)).toEqual(['Good', 'Tired', 'Sore']);
    expect(a[0].imageUrl).toBe(FALLBACK_ANSWER_IMAGE);
    expect(b).toHaveLength(3);
    expect(localLlmEngine.getState()).toMatchObject({status: 'ready', modelKey: 'GEMMA_2B'});
  });

  it('passes the JSON schema and prior answers through', async () => {
    await localLlmEngine.generateAnswers(
      {...request, mode: 'generate_more_answers', priorAnswers: ['Good']},
      'GEMMA_2B',
    );
    const params = lastAnswerCall();
    expect(params.response_format.type).toBe('json_schema');
    // One prior → one extra slot, since the model repeats some of what was shown.
    expect(params.response_format.json_schema.schema).toMatchObject({type: 'array', minItems: 4, maxItems: 4});
    expect(params.n_predict).toBe(8 + 12 * 4);
    expect(params.min_p).toBe(0.05);
    expect(params.messages[1].content).toContain('Already shown');
  });

  it('records where the time went for Settings to show', async () => {
    await localLlmEngine.generateAnswers(request, 'GEMMA_2B');
    expect(localLlmEngine.getState().lastRun).toMatchObject({
      mode: 'generate_answers',
      promptTokens: 180,
      cachedTokens: 150,
      promptMs: 400,
      genTokens: 12,
      genMs: 300,
      answers: 3,
      fallback: false,
      timedOut: false,
      prefills: 0,
      prefillTokens: 0,
      stop: 'eos',
    });
  });

  it('drops names from the list that the question did not ask for', async () => {
    mockLlama.__context.completion.mockImplementation(async () =>
      completionText(['Good', 'Rex', 'Tired']),
    );
    const answers = await localLlmEngine.generateAnswers(
      {...request, pepes: {Pets: [{name: 'Rex'}]}},
      'GEMMA_2B',
    );
    expect(answers.map(a => a.word)).toEqual(['Good', 'Tired']);
    expect(localLlmEngine.getState().lastRun).toMatchObject({
      answers: 2,
      droppedNames: 1,
      fallback: false,
    });
  });

  it('falls back to the built-in answers when every answer was an unasked name', async () => {
    mockLlama.__context.completion.mockImplementation(async () =>
      completionText(['Rex', 'Lori', 'Dad']),
    );
    const answers = await localLlmEngine.generateAnswers(
      {
        ...request,
        sentence: 'Did you sleep well?',
        pepes: {People: [{name: 'Lori', aliases: ['Dad']}], Pets: [{name: 'Rex'}]},
      },
      'GEMMA_2B',
    );
    expect(answers.map(a => a.word)).toEqual(['Yes', 'No']);
    expect(localLlmEngine.getState().lastRun).toMatchObject({droppedNames: 3, fallback: true});
  });

  it('reports why generation stopped', async () => {
    mockLlama.__context.completion.mockImplementation(async () => ({
      ...completionText(['Good', 'Tired', 'Sore']),
      stopped_eos: false,
      stopped_limit: 1,
    }));
    await localLlmEngine.generateAnswers(request, 'GEMMA_2B');
    expect(localLlmEngine.getState().lastRun?.stop).toBe('limit');
  });

  it('loads an iOS device with every layer on Metal and four CPU threads', async () => {
    deviceInfo.isEmulator.mockResolvedValueOnce(false);
    await localLlmEngine.ensureLoaded('GEMMA_2B');
    expect(mockLlama.initLlama.mock.calls[0][0]).toMatchObject({n_gpu_layers: 99, n_threads: 4});
  });

  it('primes the shared prompt prefix at load time when given the stable context', async () => {
    const stable = {userName: 'Sam', tellUsMore: 'Loves football.', count: 3};
    await localLlmEngine.ensureLoaded('GEMMA_2B', stable);
    expect(mockLlama.__context.completion).toHaveBeenCalledTimes(1);
    const prime = mockLlama.__context.completion.mock.calls[0][0];
    expect(prime.n_predict).toBe(1);
    expect(prime.response_format).toBeUndefined();
    expect(localLlmEngine.getState().status).toBe('ready');

    await localLlmEngine.generateAnswers({...request, ...stable}, 'GEMMA_2B');
    const answer = lastAnswerCall();
    // Same system turn, and the question's user turn extends the primed one.
    expect(answer.messages[0].content).toBe(prime.messages[0].content);
    expect(answer.messages[1].content.startsWith(prime.messages[1].content)).toBe(true);
    expect(mockLlama.initLlama).toHaveBeenCalledTimes(1);
  });

  it('loads without priming when no stable context is given', async () => {
    await localLlmEngine.ensureLoaded('GEMMA_2B');
    expect(mockLlama.__context.completion).not.toHaveBeenCalled();
  });

  it('warmUp primes again only when the stable head changed', async () => {
    const stable = {userName: 'Sam', count: 3};
    await localLlmEngine.ensureLoaded('GEMMA_2B', stable);
    expect(mockLlama.__context.completion).toHaveBeenCalledTimes(1);

    localLlmEngine.warmUp('GEMMA_2B', stable); // same head: nothing to do
    await new Promise(resolve => setImmediate(resolve));
    expect(mockLlama.__context.completion).toHaveBeenCalledTimes(1);

    localLlmEngine.warmUp('GEMMA_2B', {...stable, count: 5}); // preferences changed
    await new Promise(resolve => setImmediate(resolve));
    expect(mockLlama.__context.completion).toHaveBeenCalledTimes(2);
    expect(mockLlama.__context.completion.mock.calls[1][0].messages[1].content).toContain(
      'Number of answers: 5',
    );
    expect(mockLlama.initLlama).toHaveBeenCalledTimes(1);
  });

  describe('prefill', () => {
    const stable = {userName: 'Sam', count: 3};
    const partial = (sentence: string) => ({...stable, sentence, mode: 'generate_answers' as const});
    /** Completion calls after the priming pass, in order. */
    const prefillCalls = () =>
      mockLlama.__context.completion.mock.calls.slice(1).map(c => c[0]);

    beforeEach(() => {
      // Fake the clock and timers (the interval logic reads Date.now()), but
      // leave setImmediate real so flush() can drain the promise chains.
      jest.useFakeTimers({doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask']});
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('does nothing until the model is loaded', async () => {
      localLlmEngine.prefill(partial('Do you'), 'GEMMA_2B');
      await flush();
      expect(mockLlama.initLlama).not.toHaveBeenCalled();
      expect(mockLlama.__context.completion).not.toHaveBeenCalled();
    });

    it('runs the newest partial at most once per interval, with n_predict 1 and no grammar', async () => {
      await localLlmEngine.ensureLoaded('GEMMA_2B', stable);
      jest.advanceTimersByTime(5000); // well past the interval since the prime

      localLlmEngine.prefill(partial('Do you'), 'GEMMA_2B');
      await flush();
      expect(prefillCalls()).toHaveLength(1);
      expect(prefillCalls()[0]).toMatchObject({n_predict: 1, temperature: 0});
      expect(prefillCalls()[0].response_format).toBeUndefined();
      expect(prefillCalls()[0].messages[1].content.endsWith('Partner said: "Do you"')).toBe(true);

      // Two more partials inside the interval: only the newest is kept, and it
      // waits for the interval to elapse.
      localLlmEngine.prefill(partial('Do you want'), 'GEMMA_2B');
      localLlmEngine.prefill(partial('Do you want some'), 'GEMMA_2B');
      await flush();
      expect(prefillCalls()).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1500);
      expect(prefillCalls()).toHaveLength(2);
      expect(prefillCalls()[1].messages[1].content.endsWith('Partner said: "Do you want some"')).toBe(
        true,
      );
      expect(localLlmEngine.getState().status).toBe('ready');
    });

    it('a question drops the waiting prefill and reports the ones that ran', async () => {
      await localLlmEngine.ensureLoaded('GEMMA_2B', stable);
      jest.advanceTimersByTime(5000);
      localLlmEngine.prefill(partial('Do you'), 'GEMMA_2B');
      await flush();
      localLlmEngine.prefill(partial('Do you want'), 'GEMMA_2B'); // waiting for the interval
      expect(prefillCalls()).toHaveLength(1);

      const answers = await localLlmEngine.generateAnswers(
        {...stable, sentence: 'Do you want some tea?', mode: 'generate_answers'},
        'GEMMA_2B',
      );
      expect(answers.length).toBeGreaterThan(0);
      await jest.advanceTimersByTimeAsync(3000);
      // One prefill, then the question; the waiting partial never ran.
      expect(prefillCalls()).toHaveLength(2);
      expect(prefillCalls()[1].response_format).toBeDefined();
      expect(localLlmEngine.getState().lastRun).toMatchObject({prefills: 1, prefillTokens: 180});

      // The next question starts its count afresh.
      await localLlmEngine.generateAnswers(request, 'GEMMA_2B');
      expect(localLlmEngine.getState().lastRun).toMatchObject({prefills: 0, prefillTokens: 0});
    });

    it('a prefill still running is stopped by the question and not counted twice', async () => {
      await localLlmEngine.ensureLoaded('GEMMA_2B', stable);
      jest.advanceTimersByTime(5000);
      let finishPrefill: (r: unknown) => void = () => undefined;
      mockLlama.__context.completion.mockImplementationOnce(
        () => new Promise(resolve => {
          finishPrefill = resolve;
        }),
      );
      localLlmEngine.prefill(partial('Do you'), 'GEMMA_2B');
      await flush();
      expect(prefillCalls()).toHaveLength(1);

      const question = localLlmEngine.generateAnswers(
        {...stable, sentence: 'Do you want tea?', mode: 'generate_answers'},
        'GEMMA_2B',
      );
      await flush();
      expect(mockLlama.__context.stopCompletion).toHaveBeenCalled();
      expect(prefillCalls()).toHaveLength(1); // waits for the prefill to settle
      finishPrefill(completionText([]));
      await question;
      expect(prefillCalls()).toHaveLength(2);
      expect(localLlmEngine.getState().lastRun).toMatchObject({prefills: 1});
    });

    it('release() drops a waiting prefill', async () => {
      await localLlmEngine.ensureLoaded('GEMMA_2B', stable);
      jest.advanceTimersByTime(5000);
      localLlmEngine.prefill(partial('Do you'), 'GEMMA_2B');
      await flush();
      localLlmEngine.prefill(partial('Do you want'), 'GEMMA_2B');
      await localLlmEngine.release();
      await jest.advanceTimersByTimeAsync(3000);
      expect(prefillCalls()).toHaveLength(1);
    });
  });

  it('falls back to heuristic answers when the model output is unusable', async () => {
    mockLlama.__context.completion.mockImplementation(async () => ({
      content: 'Sorry, I cannot do that.',
      text: '',
      tokens_predicted: 5,
    }));
    const answers = await localLlmEngine.generateAnswers(
      {...request, sentence: 'Did you sleep well?'},
      'GEMMA_2B',
    );
    expect(answers.map(x => x.word)).toEqual(['Yes', 'No']);
  });

  it('still answers when the completion itself throws', async () => {
    mockLlama.__context.completion.mockImplementation(async () => {
      throw new Error('native failure');
    });
    const answers = await localLlmEngine.generateAnswers(request, 'GEMMA_2B');
    expect(answers.length).toBeGreaterThan(0);
    expect(localLlmEngine.getState().status).toBe('ready');
  });

  it('releases the previous model before loading another', async () => {
    await localLlmEngine.generateAnswers(request, 'GEMMA_2B');
    await localLlmEngine.generateAnswers(request, 'SMOLLM2');
    expect(mockLlama.__context.release).toHaveBeenCalledTimes(1);
    expect(mockLlama.initLlama).toHaveBeenCalledTimes(2);
    expect(localLlmEngine.getState()).toMatchObject({status: 'ready', modelKey: 'SMOLLM2'});
  });

  it('discards a model whose load finishes after release()', async () => {
    let finishLoad: (ctx: unknown) => void = () => undefined;
    mockLlama.initLlama.mockImplementation(
      () => new Promise(resolve => {
        finishLoad = resolve;
      }),
    );
    const loading = localLlmEngine.ensureLoaded('GEMMA_2B');
    // Let the load reach initLlama (it awaits the file check and GPU probe first).
    while (mockLlama.initLlama.mock.calls.length === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
    await localLlmEngine.release();
    finishLoad(mockLlama.__context);
    await expect(loading).rejects.toThrow('released while loading');
    expect(mockLlama.__context.release).toHaveBeenCalledTimes(1);
    expect(localLlmEngine.getState()).toMatchObject({status: 'idle', modelKey: null});
    expect(localLlmEngine.isReady('GEMMA_2B')).toBe(false);
  });
});
