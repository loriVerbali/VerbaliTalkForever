/**
 * On-device answer generation: the GGUF models the app can run through
 * llama.rn, and the settings they are loaded with.
 *
 * Adult-fork only (see MERGING_FROM_MATALKFOREVER.md §3). The catalogue is the
 * one proven in AmigoLocal (github.com/loria33/AmigoLocal); the context sizes
 * are smaller here because an answer request is a single short prompt, not a
 * chat transcript, and a smaller KV cache is what keeps an older iPad off swap.
 */

export type LocalModelKey = 'GEMMA_2B' | 'SMOLLM2' | 'GEMMA_3N';

export interface LocalModelDef {
  key: LocalModelKey;
  /** Short caregiver-facing name shown in Settings. */
  name: string;
  description: string;
  url: string;
  fileName: string;
  sizeLabel: string;
  /** Rough download size, used for the mobile-data warning. */
  approxBytes: number;
  /**
   * n_ctx the model is loaded with. An answer prompt (rules + context + the
   * user's people list + recent turns) stays under ~1,500 tokens and the reply
   * under 256, so 4,096 leaves headroom while keeping the KV cache small.
   */
  contextLength: number;
  recommended?: boolean;
}

const GB = 1024 ** 3;

export const LOCAL_MODELS: Record<LocalModelKey, LocalModelDef> = {
  GEMMA_2B: {
    key: 'GEMMA_2B',
    name: 'Balanced',
    description:
      'Follows the answer rules well and runs at a comfortable speed on recent iPads. Recommended.',
    url: 'https://huggingface.co/BafS/gemma-2-2b-it-Q4_K_M-GGUF/resolve/main/gemma-2-2b-it-q4_k_m.gguf',
    fileName: 'gemma-2-2b-it-q4_k_m.gguf',
    sizeLabel: '1.6 GB',
    approxBytes: 1.6 * GB,
    contextLength: 2048,
    recommended: true,
  },
  SMOLLM2: {
    key: 'SMOLLM2',
    name: 'Quick',
    description:
      'Smallest and fastest. Fine for simple questions; answers are less varied.',
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf?download=true',
    fileName: 'smollm2-1.7b-instruct-q4_k_m.gguf',
    sizeLabel: '1.1 GB',
    approxBytes: 1.1 * GB,
    // SmolLM2 has no grouped-query attention, so its KV cache is the largest of
    // the three per token (192 KB at f16); 4,096 at q8_0 is ~384 MB.
    contextLength: 2048,
  },
  GEMMA_3N: {
    key: 'GEMMA_3N',
    name: 'Smart',
    description:
      'Most capable, slowest to load and answer. Needs a recent device with plenty of free memory.',
    url: 'https://huggingface.co/unsloth/gemma-3n-E2B-it-GGUF/resolve/main/gemma-3n-E2B-it-Q4_K_M.gguf',
    fileName: 'gemma-3n-E2B-it-Q4_K_M.gguf',
    sizeLabel: '2.8 GB',
    approxBytes: 2.8 * GB,
    contextLength: 2048,
  },
};

/** Display order: recommended first. */
export const LOCAL_MODEL_KEYS: LocalModelKey[] = ['GEMMA_2B', 'SMOLLM2', 'GEMMA_3N'];

export const DEFAULT_LOCAL_MODEL: LocalModelKey = 'GEMMA_2B';

export function isLocalModelKey(value: unknown): value is LocalModelKey {
  return typeof value === 'string' && value in LOCAL_MODELS;
}

/** Resolve a persisted preference to a model, falling back to the default. */
export function resolveLocalModelKey(value: unknown): LocalModelKey {
  return isLocalModelKey(value) ? value : DEFAULT_LOCAL_MODEL;
}

export function getLocalModel(key: LocalModelKey): LocalModelDef {
  return LOCAL_MODELS[key];
}

/**
 * llama.rn context settings shared by every model.
 *
 * use_mmap must be passed explicitly: llama.rn derives use_mmap/use_mlock from
 * its load_mode enum before applying overrides, and passing use_mlock alone
 * resolves to "read the whole file into anonymous memory" - ~1-3 GB of dirty
 * pages that can only go to swap. Memory-mapped weights are file-backed and
 * clean, so the kernel can drop and re-read them instead.
 *
 * q8_0 KV cache halves the dominant allocation for a quality difference that
 * is not measurable at these prompt sizes.
 */
export const LOCAL_LLM_CONTEXT_CONFIG = {
  use_mmap: true,
  use_mlock: false,
  cache_type_k: 'q8_0' as const,
  cache_type_v: 'q8_0' as const,
  /**
   * Keep every position in the sliding-window layers' cache (Gemma 2 and
   * 3n). Without it llama.cpp keeps only the last window there, llama.rn
   * cannot roll the cache back to a prompt prefix once the window has slid,
   * and every question re-evaluates the whole prompt. With our prompts well
   * inside the window this costs no extra memory worth mentioning.
   */
  swa_full: true,
};

/** Threads for the iOS simulator, which has no Metal and a desktop CPU. */
export const SIMULATOR_THREADS = 8;

/**
 * CPU threads on an iOS device. llama.rn 0.13's default on Apple is half the
 * performance cores (hw.perflevel0.physicalcpu / 2): one thread on every
 * A-series chip, two on an M-series iPad. With every layer on Metal the CPU
 * has little to do, but where Metal is refused (an older iPad, or the GPU
 * family check failing) that one thread is the whole model. Four is the
 * figure the Local LLM Performance PRD settled on: it leaves cores for the
 * speech recogniser, which runs on-device at the same time as the prefill.
 * Android is left to llama.rn, which pins its threads to the fastest cores.
 */
export const DEVICE_THREADS = 4;

/**
 * Prefill while the partner is still talking (PRD R5). Each partial
 * transcript is run through the model with n_predict 1 so the KV cache holds
 * the prompt up to the words heard so far; the final question then evaluates
 * only its last words plus the template tokens.
 */
export const LOCAL_LLM_PREFILL = {
  /**
   * At most one prefill per this many ms. One on every partial result kept
   * the GPU busy for the whole turn and heated the device; partials arrive
   * several times a second and only the newest one matters.
   */
  minIntervalMs: 1500,
};

/**
 * The clock time in the context line is rounded down to this many minutes.
 * llama.rn reuses the KV cache only for a byte-identical prompt prefix, and
 * the context line sits ahead of the question: a time that changed every
 * minute re-evaluated everything after it on almost every question.
 */
export const CONTEXT_TIME_GRANULARITY_MINUTES = 15;

/**
 * How long the personal-memory summary in the prompt head is kept before it
 * is rebuilt between questions. It is part of the cached head, so every
 * change to it costs a re-evaluation; word counts shift after every answer.
 */
export const MEMORY_SNAPSHOT_MS = 15 * 60 * 1000;

/**
 * Generation settings. Temperature matches what the backend asks Gemini for
 * on the same task. The token cap is per request (see maxAnswerTokens): just
 * the answers array, nothing else is generated.
 */
export const LOCAL_LLM_GENERATION = {
  temperature: 0.2,
  top_p: 0.9,
  /** Drop tokens under 5% of the top one's probability: no emoji runs inside a forced answer slot. */
  min_p: 0.05,
  /** Hard stop so a slow device never leaves the user staring at a spinner. */
  timeoutMs: 30000,
};

/**
 * The backend returns this for every adult-mode answer (the adult route never
 * looks images up), and Home drops any answer whose imageUrl is empty, so the
 * local path has to send the same placeholder.
 */
export const FALLBACK_ANSWER_IMAGE = 'https://matalkcdn.win/Ma-Talk%20logo.jpg';
