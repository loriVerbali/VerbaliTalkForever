/**
 * Where a session's value for a metric comes from.
 *
 * The calculator must not know whether a number was recorded on a device or read from a
 * synthetic dataset. Keeping both behind one question is what lets mock mode stand in
 * for real use and what lets a test assert the two agree.
 */

import { MeasurementResult, Result } from './measurementResult';
import { MetricId } from './metricDefinition';

export interface SessionMetricSource {
  measurement(
    metric: MetricId,
    sessionId: string,
    minimumWordsPerSentence: number | null,
  ): MeasurementResult;
}

/**
 * A source backed by values already gathered. Used to compare one adapter against
 * another and to drive the calculator from a fixture.
 */
export class FixtureSessionMetricSource implements SessionMetricSource {
  constructor(private readonly values: Record<string, Record<MetricId, MeasurementResult>>) {}

  measurement(metric: MetricId, sessionId: string): MeasurementResult {
    const session = this.values[sessionId];
    if (!session) {
      return Result.noData(`no session ${sessionId}`);
    }
    return session[metric] ?? Result.noData(`${metric} not recorded in ${sessionId}`);
  }
}
