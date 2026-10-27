// Jest stub for llama.rn: the real module installs a JSI binding at import
// time, which does not exist under Jest. Tests can reach the shared context
// through `__context` to script completions.
const context = {
  id: 1,
  gpu: false,
  reasonNoGPU: 'mock',
  systemInfo: 'CPU : NEON = 1 | mock',
  completion: jest.fn(async () => ({text: '', content: '', tokens_predicted: 0, stopped_eos: true})),
  stopCompletion: jest.fn(async () => undefined),
  release: jest.fn(async () => undefined),
};

module.exports = {
  __esModule: true,
  __context: context,
  initLlama: jest.fn(async () => context),
  releaseAllLlama: jest.fn(async () => undefined),
  loadLlamaModelInfo: jest.fn(async () => ({})),
  LlamaContext: function LlamaContext() {
    return context;
  },
};
