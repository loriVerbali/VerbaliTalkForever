/**
 * Builds the one `GoalProgress` model from a goal, the reporting period and a measurement
 * source. Live and mock differ only in the source and provenance; formula, target, status,
 * chart rule and evidence meaning are shared.
 */

import {
  MeasurementResult,
  MetricCatalogue,
  MetricDefinition,
  MockSessionMetricSource,
  Result,
  attainment,
  evaluateGoal,
  goalSpecification,
  isTargetMet,
  latestSessionPercentOfTarget,
  measuredValue,
  metricCanBeScored,
  presentMetric,
} from '../core';
import { parseComparisonOperator } from '../model/goalCalculation';
import { GoalMetric, IepGoal } from '../model/types';
import { MockDataset, goalSessionKey, localDayMs, mockColumnsForGoal } from '../mock/mockDataset';
import { MeasurementState } from '../store/measurementState';
import { liveMeasurement } from '../store/liveMeasurement';
import { GoalProgress, GoalUiStatus, MetricTarget, SessionResult } from './goalProgress';
import { ReportingPeriod, isInPeriod, periodLabel, previousPeriod } from './reportingPeriod';

export interface LiveContext {
  kind: 'live';
  state: MeasurementState;
}

export interface MockContext {
  kind: 'mock';
  dataset: MockDataset;
}

export type ProgressContext = LiveContext | MockContext;

interface ResolvedPlan {
  primaryMetricId: string;
  definition: MetricDefinition | null;
  target: number | null;
  minimumWords: number | null;
  requiredPos: Record<string, number> | null;
  allowedSupport: string[] | null;
  sessionsRequired: number;
  sessionRule: 'consecutive' | 'cumulative';
  requiredConditions: string[];
  calculationVersion: number;
  metrics: GoalMetric[];
}

/** The goal's own target for its primary metric, never inferred from prose. */
export function resolveTarget(goal: IepGoal, primaryMetricId: string, definition: MetricDefinition | null): number | null {
  const plan = goal.plan;
  const metricTarget = plan?.metrics.find(m => m.id === primaryMetricId)?.targetValue;
  if (typeof metricTarget === 'number' && Number.isFinite(metricTarget)) {
    return metricTarget;
  }
  if (goal.targetValue > 0) {
    return goal.targetValue;
  }
  const sentenceScoped = primaryMetricId === MetricCatalogue.qualifyingSentences.id || definition?.scope === 'sentence';
  if (sentenceScoped && sentenceBar(goal) !== null) {
    return 1;
  }
  return null;
}

function sentenceBar(goal: IepGoal): number | null {
  const plan = goal.plan;
  if (!plan) {
    return null;
  }
  const fromCalc = plan.calculation?.minimumWordsPerSentence;
  if (typeof fromCalc === 'number') {
    return fromCalc;
  }
  for (const m of plan.metrics) {
    const def = MetricCatalogue.resolve(m.id);
    if (def && MetricCatalogue.definitionFor(def.id)?.scope === 'sentence' && typeof m.targetValue === 'number') {
      return Math.trunc(m.targetValue);
    }
  }
  for (const m of plan.metrics) {
    if (typeof m.constraints?.minimumWordsPerSentence === 'number') {
      return m.constraints.minimumWordsPerSentence;
    }
  }
  return null;
}

function resolvePlan(goal: IepGoal): ResolvedPlan {
  const plan = goal.plan;
  const calc = plan?.calculation ?? null;
  const rawPrimary = (calc?.primaryMetricId ?? plan?.metrics.find(m => m.role === 'direct')?.id ?? plan?.metrics[0]?.id ?? '').toLowerCase();
  const resolution = MetricCatalogue.resolve(rawPrimary);
  const primaryMetricId = resolution?.id ?? rawPrimary;
  let definition = resolution ? MetricCatalogue.definitionFor(resolution.id) ?? null : null;
  // A per-sentence measure is scored per session as the count of qualifying sentences.
  if (definition?.scope === 'sentence') {
    definition = MetricCatalogue.qualifyingSentences;
  }
  const scoredId = definition?.id ?? primaryMetricId;
  const minimumWords = calc?.minimumWordsPerSentence ?? resolution?.minimumWordsPerSentence ?? sentenceBar(goal);
  return {
    primaryMetricId: scoredId,
    definition,
    target: resolveTarget(goal, primaryMetricId, definition),
    minimumWords,
    requiredPos: calc?.requiredPartOfSpeechCounts ?? null,
    allowedSupport: calc?.allowedSupportLevels ?? null,
    sessionsRequired: Math.max(1, calc?.requiredSessionCount ?? plan?.consecutiveSessions ?? 1),
    sessionRule: calc?.requiresConsecutiveSessions === false ? 'cumulative' : 'consecutive',
    requiredConditions: calc?.requiredConditions ?? (plan?.condition ? [plan.condition] : []),
    calculationVersion: calc?.calculationVersion ?? 0,
    metrics: plan?.metrics ?? [],
  };
}

export function measurementCaveat(goal: IepGoal): string | null {
  const text = `${goal.description} ${goal.plan?.goalSummary ?? ''}`.toLowerCase();
  const notes: string[] = [];
  if (text.includes('meaningful') || text.includes('appropriate')) {
    notes.push('Meaningfulness is not detected — sentences are counted by word count alone.');
  }
  if (text.includes('independent') || text.includes('without prompt')) {
    notes.push('Independence is not reliably detected; undetected gestural or verbal prompts may have occurred.');
  }
  if (text.includes('initiat')) {
    notes.push('Initiation relies on detected first-speaker context; some prompts may not be captured.');
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

interface SessionDescriptor {
  sessionId: string;
  dateMs: number;
  endMs: number | null;
  durationSeconds: number | null;
  partnerType: string;
  treatmentContext: string;
  reviewState: string | null;
}

function humanize(raw: string): string {
  const t = raw.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return t.length === 0 ? '' : t[0].toUpperCase() + t.slice(1);
}

function liveDescriptors(state: MeasurementState, goal: IepGoal, period: ReportingPeriod): SessionDescriptor[] {
  return state.sessions
    .filter(s => s.endedAtMs !== null && s.endedAtMs !== undefined)
    .filter(s => isInPeriod(period, s.startedAtMs))
    .filter(s => s.trackedGoalIds.includes(goal.id))
    .sort((a, b) => a.startedAtMs - b.startedAtMs)
    .map(s => ({
      sessionId: s.id,
      dateMs: s.startedAtMs,
      endMs: s.endedAtMs ?? null,
      durationSeconds: s.endedAtMs ? (s.endedAtMs - s.startedAtMs) / 1000 : null,
      partnerType: humanize(s.partnerType),
      treatmentContext: humanize(s.treatmentContext),
      reviewState: s.reviewState ?? null,
    }));
}

/** The dataset goal a mock goal reads. All standard goals share one session table. */
export function mockDatasetGoalId(goal: IepGoal, dataset: MockDataset): string | null {
  if (goal.mockDataSourceId && dataset.goalsById.has(goal.mockDataSourceId)) {
    return goal.mockDataSourceId;
  }
  return dataset.goals[0]?.goalId ?? null;
}

function mockDescriptors(dataset: MockDataset, datasetGoalId: string, period: ReportingPeriod): SessionDescriptor[] {
  return (dataset.sessionsByGoal.get(datasetGoalId) ?? [])
    .map(row => {
      const dayMs = localDayMs(row.sessionDate);
      const descriptor = dataset.sessions.find(s => s.sessionId === row.sessionId);
      const start = dayMs + 10 * 3_600_000;
      return {
        sessionId: row.sessionId,
        dateMs: start,
        endMs: row.durationMinutes !== null ? start + row.durationMinutes * 60_000 : null,
        durationSeconds: row.durationMinutes !== null ? row.durationMinutes * 60 : null,
        partnerType: humanize(descriptor?.partnerType ?? ''),
        treatmentContext: humanize(descriptor?.context ?? ''),
        reviewState: 'finalized',
      };
    })
    .filter(d => isInPeriod(period, d.dateMs))
    .sort((a, b) => a.dateMs - b.dateMs);
}

function measure(
  context: ProgressContext,
  datasetGoalId: string | null,
  plan: ResolvedPlan,
  sessionId: string,
  metricId: string = plan.primaryMetricId,
): MeasurementResult {
  if (context.kind === 'live') {
    return liveMeasurement(context.state, metricId, sessionId, {
      minimumWordsPerSentence: plan.minimumWords,
      requiredPartOfSpeechCounts: plan.requiredPos,
      allowedSupportLevels: plan.allowedSupport,
    });
  }
  if (!datasetGoalId) {
    return Result.unsupported('no synthetic dataset goal is available');
  }
  const source = new MockSessionMetricSource(mockColumnsForGoal(context.dataset, datasetGoalId), context.dataset.id);
  return source.measurement(metricId, sessionId, plan.minimumWords);
}

/**
 * One session's result for any catalogue metric under the goal's own plan options (word
 * bar, parts of speech, support levels), exactly as the goal's sessions are scored. A
 * screen reading a metric beside the headline goes through here so the two cannot disagree.
 */
export function measureSessionMetric(goal: IepGoal, context: ProgressContext, metricId: string, sessionId: string): MeasurementResult {
  const plan = resolvePlan(goal);
  const datasetGoalId = context.kind === 'mock' ? mockDatasetGoalId(goal, context.dataset) : null;
  return measure(context, datasetGoalId, plan, sessionId, metricId);
}

function uiStatus(params: {
  scorable: boolean;
  hasTarget: boolean;
  sessions: SessionResult[];
  outcome: ReturnType<typeof evaluateGoal>;
  qualifying: number;
  sessionsRequired: number;
}): GoalUiStatus {
  const { scorable, hasTarget, sessions, outcome, qualifying, sessionsRequired } = params;
  if (!scorable) {
    return 'notScorable';
  }
  if (sessions.length === 0) {
    return 'noTrackedSessions';
  }
  if (!hasTarget) {
    return 'trackingOnly';
  }
  if (qualifying >= sessionsRequired) {
    return 'achieved';
  }
  const latestMeasured = [...sessions].reverse().find(s => s.result.kind === 'value');
  if (latestMeasured?.metTarget === true) {
    return 'onTrack';
  }
  if (outcome.sessionsMeasured <= 1) {
    return 'notEnoughData';
  }
  if (outcome.trend === 'declining') {
    return 'needsAttention';
  }
  if (outcome.trend === 'stable') {
    return 'stable';
  }
  return 'progressing';
}

export function buildGoalProgress(goal: IepGoal, period: ReportingPeriod, context: ProgressContext): GoalProgress {
  const plan = resolvePlan(goal);
  const datasetGoalId = context.kind === 'mock' ? mockDatasetGoalId(goal, context.dataset) : null;
  const descriptors = context.kind === 'live'
    ? liveDescriptors(context.state, goal, period)
    : datasetGoalId ? mockDescriptors(context.dataset, datasetGoalId, period) : [];

  const comparison = plan.definition?.comparison ?? parseComparisonOperator(goal.plan?.calculation?.comparisonOperator);
  const hasTarget = plan.target !== null;
  const scorableDefinition = plan.definition !== null && metricCanBeScored(plan.definition);

  const sessions: SessionResult[] = descriptors.map(d => {
    const result = measure(context, datasetGoalId, plan, d.sessionId);
    const value = measuredValue(result);
    const met = value !== null && hasTarget ? (isTargetMet(comparison, value, plan.target as number) ?? null) : null;
    return { ...d, result, metTarget: met };
  });

  const specification = goalSpecification(plan.target ?? 0, comparison, plan.sessionsRequired);
  const outcome = evaluateGoal(
    sessions.map(s => ({ sessionId: s.sessionId, dateMs: s.dateMs, result: s.result })),
    specification,
  );
  const unsupportedEverywhere = sessions.length > 0 && sessions.every(s => s.result.kind === 'unsupported');
  const scorable = scorableDefinition && !unsupportedEverywhere;
  const unavailableReason = !scorable
    ? (outcome.status.kind === 'notScorable'
        ? outcome.status.reason
        : plan.definition
          ? plan.definition.unavailableReason ?? `${plan.definition.displayName} cannot be scored yet.`
          : `Verbali has no measure called "${plan.primaryMetricId}" in its metrics library, so this goal cannot be scored yet.`)
    : null;

  const qualifying = hasTarget
    ? plan.sessionRule === 'consecutive' ? outcome.currentStreak : outcome.sessionsMeetingTarget
    : 0;
  const headline = attainment({
    qualifyingSessions: qualifying,
    statedConsecutiveSessions: plan.sessionsRequired,
    sessionsMeasured: outcome.sessionsMeasured,
    rule: plan.sessionRule,
  });
  const status = uiStatus({ scorable, hasTarget, sessions, outcome, qualifying, sessionsRequired: plan.sessionsRequired });

  const latestResult: MeasurementResult = sessions.length > 0 ? sessions[sessions.length - 1].result : Result.noData('no sessions in this period');
  const metricTargets: MetricTarget[] = plan.metrics.map(metric => {
    const resolution = MetricCatalogue.resolve(metric.id);
    const definition = resolution ? MetricCatalogue.definitionFor(resolution.id) ?? null : null;
    const isPrimary = (resolution?.id ?? metric.id) === plan.primaryMetricId || (definition?.scope === 'sentence' && plan.primaryMetricId === MetricCatalogue.qualifyingSentences.id);
    const targetValue = typeof metric.targetValue === 'number' ? metric.targetValue : isPrimary ? plan.target : null;
    const role: MetricTarget['role'] = metric.role ?? (isPrimary ? 'direct' : 'supporting');
    const isSupported = definition !== null && definition.requirement !== 'notImplemented';
    // A supporting metric is measured on the latest session like the primary one; it is
    // never given an invented zero that would read as a miss.
    const latestSessionId = sessions.length > 0 ? sessions[sessions.length - 1].sessionId : null;
    const result = !definition
      ? Result.unsupported(`${metric.id} is not in the metrics library`)
      : isPrimary
        ? latestResult
        : latestSessionId === null
          ? Result.noData('no sessions in this period')
          : measure(context, datasetGoalId, plan, latestSessionId, resolution?.id ?? metric.id);
    return {
      metric,
      definition,
      targetValue,
      role,
      isSupported,
      result,
      presentation: presentMetric(
        definition ?? { ...MetricCatalogue.totalSentences, id: metric.id, displayName: metric.name, unit: metric.targetUnit ?? '', requirement: 'notImplemented', approval: 'awaitingDefinition', unavailableReason: 'Not measured by the app.' },
        targetValue,
        isPrimary,
        result,
      ),
    };
  });

  const measuredValues = sessions.map(s => measuredValue(s.result)).filter((v): v is number => v !== null);
  const currentPeriodAverage = measuredValues.length > 0 ? measuredValues.reduce((a, b) => a + b, 0) / measuredValues.length : null;
  const prev = previousPeriod(period);
  const prevDescriptors = context.kind === 'live'
    ? liveDescriptors(context.state, goal, prev)
    : datasetGoalId ? mockDescriptors(context.dataset, datasetGoalId, prev) : [];
  const prevValues = prevDescriptors.map(d => measuredValue(measure(context, datasetGoalId, plan, d.sessionId))).filter((v): v is number => v !== null);
  const previousPeriodAverage = prevValues.length > 0 ? prevValues.reduce((a, b) => a + b, 0) / prevValues.length : null;

  const dependsOnAi = plan.definition?.requirement === 'aiAssisted' || sessions.some(s => s.result.kind === 'value' && s.result.provenance.kind === 'aiAssisted');
  const isMock = context.kind === 'mock';

  return {
    goal,
    goalId: goal.id,
    displayNumber: goal.displayNumber ?? 0,
    title: goal.title,
    statement: goal.description.length > 0 ? goal.description : goal.plan?.goalSummary ?? 'No goal statement provided.',
    period,
    periodLabel: periodLabel(period),
    primaryMetricId: plan.primaryMetricId,
    primaryDefinition: plan.definition,
    primaryLabel: plan.definition?.displayName ?? plan.metrics.find(m => m.id === plan.primaryMetricId)?.name ?? 'Configured metric',
    primaryUnit: plan.definition?.unit ?? goal.targetUnit,
    target: plan.target,
    hasTarget,
    comparison,
    metricTargets,
    sessionsRequired: plan.sessionsRequired,
    sessionRule: plan.sessionRule,
    minimumWordsPerSentence: plan.minimumWords,
    requiredConditions: plan.requiredConditions,
    planMetricIds: plan.metrics.map(m => MetricCatalogue.resolve(m.id)?.id ?? m.id),
    sessions,
    outcome,
    headline,
    latestSessionPercent: hasTarget ? latestSessionPercentOfTarget(outcome.latestValue, plan.target as number) : null,
    latestValue: outcome.latestValue,
    trend: outcome.trend,
    status,
    unavailableReason,
    previousPeriodAverage,
    currentPeriodAverage,
    provenance: isMock ? { kind: 'mock', datasetId: context.dataset.id } : { kind: 'recorded' },
    isMock,
    dataSourceLabel: isMock ? 'mock' : 'live',
    dependsOnAi,
    measurementCaveat: isMock ? null : measurementCaveat(goal),
    calculationVersion: plan.calculationVersion,
  };
}

/** "Target met in 2 of 3 consecutive sessions" and its siblings, used by cards and the hero. */
export function sessionRequirementText(p: GoalProgress): string {
  if (p.sessions.length === 0) {
    return 'No tracked sessions yet';
  }
  if (!p.hasTarget) {
    return 'Tracked; no target set';
  }
  const run = p.sessionRule === 'consecutive' ? ' consecutive' : '';
  const q = p.sessionRule === 'consecutive' ? p.outcome.currentStreak : p.outcome.sessionsMeetingTarget;
  if (q >= p.sessionsRequired) {
    return `Target met in ${q}${run} ${q === 1 ? 'session' : 'sessions'}`;
  }
  if (p.sessionsRequired > 1) {
    return `Target met in ${q} of ${p.sessionsRequired}${run} sessions`;
  }
  const n = p.sessions.length;
  return `Target met in ${p.outcome.sessionsMeetingTarget} of ${n} ${n === 1 ? 'session' : 'sessions'}`;
}

/** Up to eight most recent session outcomes, oldest first; null when not measured. */
export function recentOutcomes(p: GoalProgress): Array<boolean | null> {
  return p.sessions.slice(-8).map(s => s.metTarget);
}

/** The mock summary row for a session, when one exists. */
export function mockRowFor(dataset: MockDataset, goal: IepGoal, sessionId: string) {
  const id = mockDatasetGoalId(goal, dataset);
  return id ? dataset.rowsByGoalSession.get(goalSessionKey(id, sessionId)) ?? null : null;
}
