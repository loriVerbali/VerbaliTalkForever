/**
 * How a metric should be drawn, decided from facts rather than from where it happens to
 * appear on screen. The calculator produces numbers; this decides what a reader is shown.
 */

import { MeasurementResult } from './measurementResult';
import { MetricDefinition, MetricId, metricCanBeScored } from './metricDefinition';

export type MetricVisualStyle =
  /** The goal's own measure. Chart with a target line and per-session pass marks. */
  | 'goalProgress'
  /** A second required condition. Its own target line, its own pass marks. */
  | 'conditionProgress'
  /** Explains the score. Plotted, but no target line. */
  | 'contextualTrend'
  /** A number worth showing with no trend claim attached. */
  | 'descriptiveValue'
  /** Sessions exist, none carried a measurement. */
  | 'noData'
  /** Awaiting analysis. Never drawn as a failing chart. */
  | 'pending'
  /** The app cannot produce this metric. Says why instead of drawing. */
  | 'unsupported';

/** Everything a view needs to render one metric, and nothing it can reinterpret. */
export interface MetricPresentation {
  readonly metricId: MetricId;
  readonly displayName: string;
  readonly unit: string;
  readonly style: MetricVisualStyle;
  /** The value a target line is drawn at. Non-null exactly when the style carries one. */
  readonly targetLine: number | null;
  /** The metric's own rule, shown beneath its chart. */
  readonly rule: string;
  /** Why nothing is drawn, when nothing is drawn. */
  readonly unavailableReason: string | null;
}

export function drawsTargetLine(p: MetricPresentation): boolean {
  return p.targetLine !== null;
}

export function isScored(p: MetricPresentation): boolean {
  return p.style === 'goalProgress' || p.style === 'conditionProgress';
}

/**
 * Decides how one metric appears against one goal.
 * @param target the goal's own target for this metric, when it states one. A metric the
 *   goal gave no number to is context, not a silently unscored condition.
 * @param isPrimary whether this is the measure the goal is scored on.
 */
export function presentMetric(
  metric: MetricDefinition,
  target: number | null,
  isPrimary: boolean,
  result: MeasurementResult,
): MetricPresentation {
  const make = (
    style: MetricVisualStyle,
    targetLine: number | null,
    reason: string | null = null,
  ): MetricPresentation => ({
    metricId: metric.id,
    displayName: metric.displayName,
    unit: metric.unit,
    style,
    targetLine,
    // The rule always comes from the metric, never from a neighbouring chart.
    rule: metric.clinicalDefinition,
    unavailableReason: reason,
  });

  // A metric that cannot be produced never renders as a chart and never as a miss.
  if (result.kind === 'unsupported') {
    return make('unsupported', null, result.reason);
  }
  if (!metricCanBeScored(metric) && isPrimary) {
    return make(
      'unsupported',
      null,
      metric.unavailableReason ?? `${metric.displayName} cannot be scored yet.`,
    );
  }
  if (result.kind === 'pending') {
    return make('pending', null, result.reason);
  }
  if (result.kind === 'noData') {
    return make('noData', null, result.reason);
  }

  // Scored metrics draw their own target. Everything else is explanation.
  if (target === null || !metricCanBeScored(metric)) {
    return make(metric.role === 'descriptiveMetric' ? 'descriptiveValue' : 'contextualTrend', null);
  }
  return make(isPrimary ? 'goalProgress' : 'conditionProgress', target);
}
