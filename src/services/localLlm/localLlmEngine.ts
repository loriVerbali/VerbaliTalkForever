/**
 * The single llama.rn context the app runs, and the answer generation on top
 * of it.
 *
 * One model at a time: two multi-GB models mapped at once would exhaust memory
 * on most devices, so switching releases the current context before loading
 * the next. Loads are coalesced (a second caller waits for the load already
 * in flight) and a new question stops any answer still being generated.
 *
 * Nothing here waits on work that could have happened earlier: the prompt
 * head is evaluated at load time, and partial transcripts are prefilled while
 * the partner is still talking, so a question evaluates only its last words.
 */
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {initLlama, releaseAllLlama, LlamaContext} from 'llama.rn';
import mixpanel from '../../utils/mixpanelInstance';
import {
  DEVICE_THREADS,
  LOCAL_LLM_CONTEXT_CONFIG,
  LOCAL_LLM_GENERATION,
  LOCAL_LLM_PREFILL,
  LocalModelKey,
  SIMULATOR_THREADS,
  getLocalModel,
} from './localLlmModels';
import {localModelStore} from './localModelStore';
import {
  LocalAnswer,
  LocalAnswerMode,
  LocalAnswerRequest,
  LocalStableContext,
  buildLocalAnswerMessages,
  buildLocalAnswerSchema,
  buildPrefillMessages,
  buildPrimingMessages,
  buildStableContextText,
  dropUnaskedNames,
  extraAnswersFor,
  heuristicAnswers,
  maxAnswerTokens,
  parseLocalAnswers,
} from './localAnswerPrompt';

export type LocalLlmStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

/** Why a completion ended; 'none' is a decode that stopped for no reported reason. */
export type LocalLlmStopReason =
  | 'eos'
  | 'word'
  | 'limit'
  | 'context_full'
  | 'interrupted'
  | 'timeout'
  | 'none';

/** Where the time went for the last question; shown in Settings. */
export interface LocalLlmRunStats {
  mode: LocalAnswerMode;
  ms: number;
  /** Prompt tokens evaluated this time (after the cached prefix). */
  promptTokens: number;
  /** Prompt tokens served from the KV cache. */
  cachedTokens: number;
  promptMs: number;
  genTokens: number;
  genMs: number;
  answers: number;
  /** Answers removed because they named someone or something from the user's list that the question had not asked about. */
  droppedNames: number;
  /** True when the model's reply was unusable and the built-in list was shown. */
  fallback: boolean;
  timedOut: boolean;
  /** Prefills run on partial transcripts while the partner was still talking. */
  prefills: number;
  /** Prompt tokens those prefills evaluated: work the question did not wait for. */
  prefillTokens: number;
  stop: LocalLlmStopReason;
}

export interface LocalLlmState {
  status: LocalLlmStatus;
  /** Model loaded, loading, or that failed to load. */
  modelKey: LocalModelKey | null;
  error: string | null;
  /** True when llama.cpp reports the GPU backend is in use. */
  gpu: boolean;
  lastRun: LocalLlmRunStats | null;
}

export class ModelNotDownloadedError extends Error {
  constructor(key: LocalModelKey) {
    super(`${getLocalModel(key).name} is not downloaded`);
    this.name = 'ModelNotDownloadedError';
  }
}

type Listener = (state: LocalLlmState) => void;

const STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<end_of_turn>',
  '<|endoftext|>',
];

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** llama.rn's completion result carries one flag per way a decode can end. */
interface StopFlags {
  stopped_eos?: boolean;
  stopped_word?: string | boolean;
  stopped_limit?: number | boolean;
  context_full?: boolean;
  interrupted?: boolean;
}

function stopReasonOf(result: StopFlags, timedOut: boolean): LocalLlmStopReason {
  if (timedOut) return 'timeout';
  if (result.stopped_eos) return 'eos';
  if (result.stopped_word) return 'word';
  if (result.stopped_limit) return 'limit';
  if (result.context_full) return 'context_full';
  if (result.interrupted) return 'interrupted';
  return 'none';
}

/**
 * Metal on iOS devices (Apple7 GPU and newer; llama.rn falls back if the
 * device cannot), never in the simulator where Metal is unsupported. Android
 * stays on CPU: the OpenCL backend only covers Adreno GPUs with Q4_0 weights,
 * and these models are Q4_K_M.
 *
 * Thread counts are explicit where llama.rn's default is wrong for us: one
 * thread on an A-series device (see DEVICE_THREADS) and four in the
 * simulator, which has a desktop CPU underneath (+50% prompt speed measured
 * on an M4 Pro with eight). Android is left to llama.rn, which pins its
 * threads to the fastest cores.
 */
async function resolveHardware(): Promise<{n_gpu_layers: number; n_threads?: number}> {
  if (Platform.OS !== 'ios') return {n_gpu_layers: 0};
  try {
    if (await DeviceInfo.isEmulator()) {
      return {n_gpu_layers: 0, n_threads: SIMULATOR_THREADS};
    }
  } catch {
    // Assume a device.
  }
  return {n_gpu_layers: 99, n_threads: DEVICE_THREADS};
}

class LocalLlmEngine {
  private context: LlamaContext | null = null;
  private loadedKey: LocalModelKey | null = null;
  private loading: Promise<LlamaContext> | null = null;
  private loadingKey: LocalModelKey | null = null;
  private generation: Promise<unknown> | null = null;
  /** Bumped by release(); a load that finishes under a newer epoch discards its context. */
  private epoch = 0;
  /** The stable prompt head whose tokens the KV cache currently holds. */
  private primedHead: string | null = null;
  /** The newest partial transcript not yet prefilled; older ones are dropped unseen. */
  private prefillPending: {req: LocalAnswerRequest; key: LocalModelKey} | null = null;
  private prefillTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPrefillStartedAt = 0;
  /** Prefill work since the last question, reported with that question's stats. */
  private turnPrefills = 0;
  private turnPrefillTokens = 0;
  private listeners = new Set<Listener>();
  private state: LocalLlmState = {
    status: 'idle',
    modelKey: null,
    error: null,
    gpu: false,
    lastRun: null,
  };

  constructor() {
    // A Metro reload replaces this JS instance but not the native contexts
    // the previous one created; free them so each reload does not keep
    // another copy of the model resident. A no-op on a normal launch.
    releaseAllLlama().catch(() => undefined);
  }

  getState(): LocalLlmState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<LocalLlmState>) {
    this.state = {...this.state, ...patch};
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.warn('[LocalLLM] listener failed:', error);
      }
    });
  }

  /** True when `key` is loaded and idle or answering. */
  isReady(key: LocalModelKey): boolean {
    return this.context !== null && this.loadedKey === key;
  }

  /**
   * Load `key`, releasing any other model first. Safe to call repeatedly.
   *
   * With `stable`, the session-constant head of every prompt is evaluated
   * right after loading, so the first question only pays for its own tail.
   */
  async ensureLoaded(
    key: LocalModelKey,
    stable?: LocalStableContext,
  ): Promise<LlamaContext> {
    if (this.context && this.loadedKey === key) return this.context;
    if (this.loading) {
      if (this.loadingKey === key) return this.loading;
      // A different model is loading; let it finish, then replace it.
      await this.loading.catch(() => undefined);
      return this.ensureLoaded(key, stable);
    }

    this.loadingKey = key;
    this.loading = this.load(key, stable);
    try {
      return await this.loading;
    } finally {
      this.loading = null;
      this.loadingKey = null;
    }
  }

  private async load(
    key: LocalModelKey,
    stable?: LocalStableContext,
  ): Promise<LlamaContext> {
    await this.releaseContext();
    const epoch = this.epoch;
    const model = getLocalModel(key);
    this.setState({status: 'loading', modelKey: key, error: null, gpu: false});
    try {
      if (!(await localModelStore.isDownloaded(key))) {
        throw new ModelNotDownloadedError(key);
      }
      const path = localModelStore.localPath(key);
      const startedAt = Date.now();
      const hardware = await resolveHardware();
      let context: LlamaContext;
      try {
        context = await initLlama({
          model: path,
          n_ctx: model.contextLength,
          ...hardware,
          ...LOCAL_LLM_CONTEXT_CONFIG,
        });
      } catch (error) {
        if (hardware.n_gpu_layers === 0) throw error;
        // Some GPUs cannot run llama.cpp's Metal kernels; the CPU path can.
        console.warn('[LocalLLM] GPU load failed, retrying on CPU:', errorMessage(error));
        context = await initLlama({
          model: path,
          n_ctx: model.contextLength,
          ...hardware,
          n_gpu_layers: 0,
          ...LOCAL_LLM_CONTEXT_CONFIG,
        });
      }
      if (epoch !== this.epoch) {
        // release() ran while the model was loading: the option was turned
        // off, so do not keep a context nobody asked for.
        await context.release().catch(() => undefined);
        this.setState({status: 'idle', modelKey: null, error: null, gpu: false});
        throw new Error('released while loading');
      }
      this.context = context;
      this.loadedKey = key;
      this.primedHead = null;
      const loadMs = Date.now() - startedAt;
      // The load line and the CPU feature line are what a device log needs
      // to say where the model runs (gpu, or why not) and which kernels the
      // CPU path has (DOTPROD, I8MM, FP16_VA).
      console.log(
        `[LocalLLM] loaded ${key} in ${loadMs}ms, gpu=${context.gpu}` +
          (context.gpu ? '' : ` (${context.reasonNoGPU || 'cpu'})`) +
          `, threads=${hardware.n_threads ?? 'default'}`,
      );
      if (context.systemInfo) console.log(`[LocalLLM] ${context.systemInfo}`);

      const primeMs = stable ? await this.prime(context, stable) : 0;
      if (epoch !== this.epoch || this.context !== context) {
        throw new Error('released while loading');
      }

      this.setState({status: 'ready', modelKey: key, error: null, gpu: !!context.gpu});
      mixpanel.track('local_llm_model_loaded', {
        model: key,
        loadMs,
        primeMs,
        gpu: !!context.gpu,
        reasonNoGPU: context.gpu ? undefined : context.reasonNoGPU || 'cpu',
      });
      return context;
    } catch (error) {
      if (epoch !== this.epoch) throw error; // already reported as idle above
      const message = errorMessage(error);
      console.error(`[LocalLLM] failed to load ${key}:`, message);
      this.setState({status: 'error', modelKey: key, error: message, gpu: false});
      throw error;
    }
  }

  /**
   * Evaluate the shared prompt prefix into the KV cache. llama.rn reuses the
   * cache for the longest common prefix with the previous prompt, so after
   * this a question costs its own tail instead of the whole prompt.
   * Best effort: a failure here only costs time on the first question.
   */
  private async prime(context: LlamaContext, stable: LocalStableContext): Promise<number> {
    const startedAt = Date.now();
    const head = buildStableContextText(stable);
    const run = context.completion({
      messages: buildPrimingMessages(stable),
      n_predict: 1,
      temperature: 0,
    });
    this.generation = run;
    try {
      const result = await run;
      const ms = Date.now() - startedAt;
      if (this.context === context) this.primedHead = head;
      console.log(
        `[LocalLLM] primed ${result.timings?.prompt_n ?? '?'} prompt tokens in ${ms}ms` +
          ` (${result.timings?.cache_n ?? 0} cached, ${Math.round(result.timings?.prompt_per_second ?? 0)} tok/s)`,
      );
      return ms;
    } catch (error) {
      console.warn('[LocalLLM] priming failed:', errorMessage(error));
      return Date.now() - startedAt;
    } finally {
      if (this.generation === run) this.generation = null;
      this.schedulePrefill();
    }
  }

  /**
   * Start loading without waiting; errors are reported through state. When
   * the model is already loaded but `stable` differs from what the cache
   * holds (preferences hydrated after the first call, or edited), prime
   * again so the next question still only pays for its tail.
   */
  warmUp(key: LocalModelKey, stable?: LocalStableContext): void {
    this.ensureLoaded(key, stable)
      .then(context => {
        if (!stable || this.context !== context || this.generation) return;
        if (buildStableContextText(stable) === this.primedHead) return;
        return this.prime(context, stable).then(() => undefined);
      })
      .catch(() => undefined);
  }

  /**
   * Feed the words heard so far to the model while the partner is still
   * talking, so the KV cache holds the prompt up to them when the sentence is
   * final and that question evaluates only its last words.
   *
   * Cheap to call on every partial result: nothing happens unless `key` is
   * loaded (a prefill never waits for a load), only the newest partial is
   * kept, and at most one prefill runs per LOCAL_LLM_PREFILL.minIntervalMs.
   * A question sent meanwhile drops whatever is still waiting.
   */
  prefill(req: LocalAnswerRequest, key: LocalModelKey): void {
    if (!this.isReady(key) || !req.sentence.trim()) return;
    this.prefillPending = {req, key};
    this.schedulePrefill();
  }

  private schedulePrefill(): void {
    if (!this.prefillPending || this.prefillTimer || this.generation) return;
    const elapsed = Date.now() - this.lastPrefillStartedAt;
    // A clock that went backwards counts as "long enough ago".
    const wait = elapsed < 0 ? 0 : LOCAL_LLM_PREFILL.minIntervalMs - elapsed;
    if (wait > 0) {
      this.prefillTimer = setTimeout(() => {
        this.prefillTimer = null;
        this.schedulePrefill();
      }, wait);
      return;
    }
    const next = this.prefillPending;
    this.prefillPending = null;
    this.runPrefill(next.req, next.key).catch(() => undefined);
  }

  private async runPrefill(req: LocalAnswerRequest, key: LocalModelKey): Promise<void> {
    const context = this.context;
    if (!context || this.loadedKey !== key) return;
    const startedAt = Date.now();
    this.lastPrefillStartedAt = startedAt;
    const run = context.completion({
      messages: buildPrefillMessages(req),
      n_predict: 1,
      temperature: 0,
    });
    this.generation = run;
    try {
      const result = await run;
      const promptTokens = result.timings?.prompt_n ?? 0;
      if (this.context === context) {
        this.primedHead = buildStableContextText(req);
        this.turnPrefills += 1;
        this.turnPrefillTokens += promptTokens;
      }
      console.log(
        `[LocalLLM] prefill ${Date.now() - startedAt}ms: prompt ${promptTokens} tok` +
          ` (${result.timings?.cache_n ?? 0} cached) for ${req.sentence.trim().split(/\s+/).length} words`,
      );
    } catch (error) {
      console.warn('[LocalLLM] prefill failed:', errorMessage(error));
    } finally {
      if (this.generation === run) this.generation = null;
      // A newer partial may have arrived while this one ran.
      this.schedulePrefill();
    }
  }

  /** Drop any prefill not yet started; one already running is stopped by the caller. */
  private cancelPrefill(): void {
    this.prefillPending = null;
    if (this.prefillTimer) {
      clearTimeout(this.prefillTimer);
      this.prefillTimer = null;
    }
  }

  /** Unload the current model and go idle; a load in flight is discarded when it lands. */
  async release(): Promise<void> {
    this.epoch += 1;
    this.cancelPrefill();
    this.lastPrefillStartedAt = 0;
    this.turnPrefills = 0;
    this.turnPrefillTokens = 0;
    await this.releaseContext();
    this.setState({status: 'idle', modelKey: null, error: null, gpu: false, lastRun: null});
  }

  /**
   * Stop generation, wait for it to settle, then free the context. Releasing
   * under a running completion is a native crash, not a catchable error.
   */
  private async releaseContext(): Promise<void> {
    const context = this.context;
    if (!context) return;
    this.context = null;
    this.loadedKey = null;
    this.primedHead = null;
    try {
      await context.stopCompletion();
    } catch {
      // Nothing was running.
    }
    if (this.generation) await this.generation.catch(() => undefined);
    try {
      await context.release();
    } catch (error) {
      console.warn('[LocalLLM] release failed:', errorMessage(error));
    }
  }

  /**
   * Produce answer cards for `req` with model `key`.
   *
   * Always resolves with at least one answer once the model is loaded: an
   * empty or unparseable reply, or one cut off by the timeout, falls back to
   * the same heuristics the backend uses. Only a model that cannot load
   * rejects; the caller shows those heuristics itself and never goes online.
   */
  async generateAnswers(req: LocalAnswerRequest, key: LocalModelKey): Promise<LocalAnswer[]> {
    // The sentence is final: nothing still waiting to be prefilled matters.
    this.cancelPrefill();
    const context = await this.ensureLoaded(key);

    // A newer question supersedes any answer still being generated, and a
    // prefill still running has done its work once its prompt is evaluated.
    // Hold the promise locally: its own finally clears this.generation.
    const pending = this.generation;
    if (pending) {
      try {
        await context.stopCompletion();
      } catch {
        // Already finished.
      }
      await pending.catch(() => undefined);
    }

    const prefills = this.turnPrefills;
    const prefillTokens = this.turnPrefillTokens;
    this.turnPrefills = 0;
    this.turnPrefillTokens = 0;

    const messages = buildLocalAnswerMessages(req);
    const startedAt = Date.now();
    let timedOut = false;
    let lastRun: LocalLlmRunStats | null = null;
    const timer = setTimeout(() => {
      timedOut = true;
      context.stopCompletion().catch(() => undefined);
    }, LOCAL_LLM_GENERATION.timeoutMs);

    this.setState({status: 'generating'});
    const extra = extraAnswersFor(req);
    if (__DEV__) {
      console.log('[BAD_ANSWERS] request', JSON.stringify({
        model: key,
        modelFile: getLocalModel(key).fileName,
        mode: req.mode,
        sentence: req.sentence,
        messages,
      }, null, 2));
    }
    const run = context.completion({
      messages,
      n_predict: maxAnswerTokens(req.count + extra),
      temperature: LOCAL_LLM_GENERATION.temperature,
      top_p: LOCAL_LLM_GENERATION.top_p,
      min_p: LOCAL_LLM_GENERATION.min_p,
      stop: STOP_WORDS,
      response_format: {
        type: 'json_schema',
        json_schema: {strict: true, schema: buildLocalAnswerSchema(req.count, extra)},
      },
    });
    this.generation = run;

    try {
      const result = await run;
      const text = result.content || result.text || '';
      const parsed = parseLocalAnswers(text, {
        count: req.count,
        priorAnswers: req.priorAnswers,
      });
      // The list of names sits in every prompt; keep its names out of
      // answers to questions that never asked for one.
      let answers = dropUnaskedNames(parsed, req);
      const droppedNames = parsed.length - answers.length;
      const usedFallback = answers.length === 0;
      if (usedFallback) {
        answers = heuristicAnswers(req.sentence, req.count, req.priorAnswers);
      }
      const elapsed = Date.now() - startedAt;
      const t = result.timings;
      const stop = stopReasonOf(result as StopFlags, timedOut);
      if (__DEV__) {
        console.log('[BAD_ANSWERS] response', JSON.stringify({
          model: key,
          mode: req.mode,
          sentence: req.sentence,
          rawContent: result.content,
          rawText: result.text,
          parsedAnswers: parsed.map(answer => answer.word),
          finalAnswers: answers.map(answer => answer.word),
          droppedNames,
          fallback: usedFallback,
          timedOut,
          stop,
        }, null, 2));
      }
      const stats: LocalLlmRunStats = {
        mode: req.mode,
        ms: elapsed,
        promptTokens: t?.prompt_n ?? 0,
        cachedTokens: t?.cache_n ?? 0,
        promptMs: Math.round(t?.prompt_ms ?? 0),
        genTokens: t?.predicted_n ?? result.tokens_predicted ?? 0,
        genMs: Math.round(t?.predicted_ms ?? 0),
        answers: answers.length,
        droppedNames,
        fallback: usedFallback,
        timedOut,
        prefills,
        prefillTokens,
        stop,
      };
      // The cache now holds this request's prefix, so its head is primed.
      if (this.context === context && !timedOut) this.primedHead = buildStableContextText(req);
      lastRun = stats;
      // One line per question that says where the time went: prompt tokens
      // actually evaluated (vs. served from the cache), what the prefills
      // took care of beforehand, generation speed and why it stopped.
      console.log(
        `[LocalLLM] ${req.mode} ${elapsed}ms: prompt ${stats.promptTokens} tok` +
          ` (${stats.cachedTokens} cached) ${stats.promptMs}ms` +
          ` @${Math.round(t?.prompt_per_second ?? 0)} tok/s; gen ${stats.genTokens} tok` +
          ` ${stats.genMs}ms @${Math.round(t?.predicted_per_second ?? 0)} tok/s;` +
          ` prefilled ${prefillTokens} tok in ${prefills}; stop=${stop};` +
          ` answers=${answers.length}${usedFallback ? ' (fallback)' : ''}` +
          (droppedNames ? ` dropped ${droppedNames} unasked name(s)` : ''),
      );
      if (stop === 'none') {
        console.warn('[LocalLLM] decode ended with no stop reason; output may be incomplete');
      }
      mixpanel.track('local_llm_generation', {model: key, ...stats});
      return answers;
    } catch (error) {
      // The completion itself failed (not a load failure). Still answer.
      if (__DEV__) {
        console.log('[BAD_ANSWERS] error', JSON.stringify({
          model: key,
          mode: req.mode,
          sentence: req.sentence,
          error: errorMessage(error),
          fallback: true,
          finalAnswers: heuristicAnswers(req.sentence, req.count, req.priorAnswers)
            .map(answer => answer.word),
        }, null, 2));
      }
      console.error('[LocalLLM] completion failed:', errorMessage(error));
      mixpanel.track('local_llm_generation_failed', {
        model: key,
        mode: req.mode,
        error: errorMessage(error),
      });
      return heuristicAnswers(req.sentence, req.count, req.priorAnswers);
    } finally {
      clearTimeout(timer);
      if (this.generation === run) this.generation = null;
      if (this.context === context) {
        this.setState(lastRun ? {status: 'ready', lastRun} : {status: 'ready'});
      }
      // A partial for the next turn may have arrived while answering.
      this.schedulePrefill();
    }
  }
}

export const localLlmEngine = new LocalLlmEngine();
