/**
 * IEP metric identity and definition types.
 *
 * Ported from the reference package's `MetricDefinition.swift`. The reference code is a
 * guideline, not a spec: behaviour here follows `contracts/measurement-contract.md`.
 *
 * Pure TypeScript. No React Native imports, so it runs under Jest and Node unchanged.
 */

/** A metric's stable identity: lowercase snake_case, never renamed. */
export type MetricId = string;

/** Which way "better" runs. */
export type ComparisonDirection = 'atLeast' | 'atMost' | 'range' | 'descriptive';

/**
 * Whether a measured value satisfies a target under a direction.
 * `range` and `descriptive` need bounds or make no judgement, so they answer null.
 */
export function isTargetMet(
  direction: ComparisonDirection,
  value: number,
  target: number,
): boolean | null {
  switch (direction) {
    case 'atLeast':
      return value >= target;
    case 'atMost':
      return value <= target;
    default:
      return null;
  }
}

export function directionCanBeScored(direction: ComparisonDirection): boolean {
  return direction !== 'descriptive';
}

/** How a metric's per-session values combine over a reporting period. */
export type Aggregation = 'latest' | 'average' | 'maximum' | 'total';

/** What one measurement of this metric describes. */
export type MetricScope = 'session' | 'sentence';

/** How much of a metric the app can actually produce. */
export type MeasurementRequirement = 'deterministic' | 'aiAssisted' | 'notImplemented';

/** Whether the clinical definition has been agreed. */
export type ClinicalApproval = 'approved' | 'awaitingDefinition';

/** How a metric appears against a goal. */
export type PresentationRole = 'goalCondition' | 'contextualMetric' | 'descriptiveMetric';

/** One metric, defined once. */
export interface MetricDefinition {
  readonly id: MetricId;
  readonly displayName: string;
  readonly unit: string;
  readonly clinicalDefinition: string;
  readonly comparison: ComparisonDirection;
  readonly aggregation: Aggregation;
  readonly requirement: MeasurementRequirement;
  readonly approval: ClinicalApproval;
  readonly role: PresentationRole;
  readonly scope: MetricScope;
  /**
   * Why this metric cannot be scored, when it cannot. Present exactly when the metric
   * is not implemented or is awaiting a clinical definition.
   */
  readonly unavailableReason: string | null;
}

type MetricDefinitionInput = Pick<
  MetricDefinition,
  'id' | 'displayName' | 'unit' | 'clinicalDefinition'
> &
  Partial<Omit<MetricDefinition, 'id' | 'displayName' | 'unit' | 'clinicalDefinition'>>;

export function defineMetric(input: MetricDefinitionInput): MetricDefinition {
  return {
    comparison: 'atLeast',
    aggregation: 'average',
    requirement: 'deterministic',
    approval: 'approved',
    role: 'goalCondition',
    scope: 'session',
    unavailableReason: null,
    ...input,
  };
}

/** Whether this metric may be used as a goal's scored measure. */
export function metricCanBeScored(metric: MetricDefinition): boolean {
  return (
    directionCanBeScored(metric.comparison) &&
    metric.requirement !== 'notImplemented' &&
    metric.approval === 'approved' &&
    metric.role === 'goalCondition'
  );
}

/** What a planner-supplied identifier resolved to. */
export interface MetricResolution {
  readonly id: MetricId;
  /** Carried when the alias encoded a threshold, as `qualifying_sentences_2plus` does. */
  readonly minimumWordsPerSentence: number | null;
}
