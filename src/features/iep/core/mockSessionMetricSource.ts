/**
 * Reads a metric from a synthetic dataset, applying the same catalogue rules the live
 * path applies. One source of truth means one answer: a metric the device refuses to
 * measure is refused here too, whatever the dataset happens to contain.
 *
 * CSV parsing stays above this type. What arrives is a session id and its already-read
 * column values, so the part that decides which column a metric means is testable.
 */

import { MeasurementResult, Provenance, Result } from './measurementResult';
import { MetricCatalogue } from './metricCatalogue';
import { MetricId } from './metricDefinition';
import { SessionMetricSource } from './sessionMetricSource';

/** Metrics whose dataset column carries the metric's own name. */
const columnsByMetric: ReadonlySet<string> = new Set([
  // total_word_count_per_sentence is deliberately absent: the dataset column of that
  // name holds a session total, and the metric describes one sentence.
  'total_sentences',
  'average_words_per_sentence',
  'longest_sentence_words',
  'conversation_turns',
  'conversation_initiations',
  'reciprocal_interactions',
  'different_communication_functions',
  'page_navigations',
  'different_pages_visited',
  'different_words_activated',
  'total_word_activations',
  'device_interactions',
  'questions_asked',
  'wh_questions',
  'request_count',
  'novel_contributions',
  'repair_attempts',
  'retelling_details',
]);

/**
 * Which dataset column a metric reads. Qualifying sentences is split across a two-word
 * and a three-word column; the goal's own bar chooses, clamped to what exists.
 */
export function mockDatasetColumn(
  metric: MetricId,
  minimumWordsPerSentence: number | null,
): string | null {
  if (metric === MetricCatalogue.qualifyingSentences.id) {
    const bar = Math.min(Math.max(minimumWordsPerSentence ?? 3, 2), 3);
    return `qualifying_sentences_${bar}plus`;
  }
  const definition = MetricCatalogue.definitionFor(metric);
  if (!definition) {
    return null;
  }
  return columnsByMetric.has(definition.id) ? definition.id : null;
}

export type MockColumns = Record<string, Record<string, number>>;

export class MockSessionMetricSource implements SessionMetricSource {
  /** @param columns sessionId -> raw dataset column -> value */
  constructor(
    private readonly columns: MockColumns,
    private readonly datasetId: string,
  ) {}

  measurement(
    metric: MetricId,
    sessionId: string,
    minimumWordsPerSentence: number | null,
  ): MeasurementResult {
    const definition = MetricCatalogue.definitionFor(metric);
    if (!definition) {
      return Result.unsupported(`${metric} is not in the metrics library`);
    }
    // The same two gates the live path applies, in the same order.
    if (definition.requirement === 'notImplemented') {
      return Result.unsupported(definition.unavailableReason ?? `${metric} is not implemented`);
    }
    if (definition.approval !== 'approved') {
      return Result.unsupported(
        definition.unavailableReason ?? `${metric} is awaiting a clinical definition`,
      );
    }
    const session = this.columns[sessionId];
    if (!session) {
      return Result.noData(`no session ${sessionId} in ${this.datasetId}`);
    }
    const column = mockDatasetColumn(metric, minimumWordsPerSentence);
    if (column === null) {
      return Result.unsupported(`${metric} has no column in ${this.datasetId}`);
    }
    const value = session[column];
    if (value === undefined || value === null || Number.isNaN(value)) {
      return Result.noData(`${column} not recorded in ${sessionId}`);
    }
    return Result.value(value, Provenance.mock(this.datasetId));
  }
}
