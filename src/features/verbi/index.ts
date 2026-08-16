// Feature entry point — re-exports everything consumers need
export { useVerbiController } from './hooks/useVerbiController';
export { default as VerbiColumn } from './components/VerbiColumn';
export type {
  VerbiClientState,
  VerbiSuggestion,
  VerbiFolder,
  TurnState,
  PredictionMode,
} from './state/verbiTypes';
