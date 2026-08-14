import { PredictionMode } from '../state/verbiTypes';
import { VerbiFolder } from '../state/verbiTypes';

interface RouteModeInput {
  openVerbiFolder?: VerbiFolder | null;
  sentenceItemCount: number;
  isTurnStale: boolean;
}

/**
 * Determines the prediction mode for a given Verbi state.
 *
 * - 'folder'       → user has opened a Verbi folder to expand suggestions
 * - 'starter'      → empty bar or returning after a spoken turn (stale)
 * - 'continuation' → user is actively building a sentence
 */
export function routePredictionMode(input: RouteModeInput): PredictionMode {
  if (input.openVerbiFolder) {
    return 'folder';
  }
  if (input.sentenceItemCount === 0 || input.isTurnStale) {
    return 'starter';
  }
  return 'continuation';
}
