import {
  GoalProgress,
  SessionResult,
} from '../../../src/features/iep/application/goalProgress';
import { reportingPeriod, periodLabel } from '../../../src/features/iep/application/reportingPeriod';
import {
  MetricCatalogue,
  Provenance,
  Result,
  attainment,
  evaluateGoal,
  goalSpecification,
  presentMetric,
} from '../../../src/features/iep/core';
import { IepGoal } from '../../../src/features/iep/model';

const DAY = 86_400_000;
export const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();

export function fixtureGoal(overrides: Partial<IepGoal> = {}): IepGoal {
  return {
    id: 'goal-1',
    title: 'Sentence Complexity',
    description: 'Child will create 5 sentences with 3 or more words during a session.',
    targetValue: 5,
    targetUnit: 'sentences',
    timeframe: 'per session',
    isActive: true,
    createdAtMs: NOW - 90 * DAY,
    plan: {
      goalTitle: 'Sentence Complexity',
      goalSummary: 'Child will create 5 sentences with 3 or more words during a session.',
      metrics: [
        { id: 'qualifying_sentences', name: 'Qualifying sentences', category: '', definition: '', measurementMethod: '', role: 'direct', targetValue: 5, targetUnit: 'sentences', constraints: { minimumWordsPerSentence: 3 } },
        { id: 'total_sentences', name: 'Total sentences per session', category: '', definition: '', measurementMethod: '', role: 'supporting' },
      ],
      condition: 'Each counted sentence contains at least 3 words.',
      targetValue: 5,
      targetUnit: 'sentences',
      timeframe: 'per session',
      consecutiveSessions: 3,
      dashboardTitle: 'Sentence Complexity Progress',
      dashboardTiles: ['Progress'],
      confidenceNote: '',
      provider: 'test',
      calculation: {
        primaryMetricId: 'qualifying_sentences',
        comparisonOperator: 'atLeast',
        requiredConditions: ['Each counted sentence contains at least 3 words.'],
        requiredSessionCount: 3,
        eligibleEvidenceTypes: ['qualifying_sentences', 'total_sentences'],
        calculationVersion: 3,
        minimumWordsPerSentence: 3,
      },
    },
    displayNumber: 1,
    mockDataSourceId: null,
    targetDateMs: null,
    ...overrides,
  };
}

/** A progress model with the given per-session values (null = no data), scored against target 5, 3 consecutive. */
export function fixtureProgress(values: Array<number | null>, overrides: Partial<GoalProgress> = {}): GoalProgress {
  const goal = fixtureGoal();
  const period = reportingPeriod('12w', NOW);
  const target = overrides.target === undefined ? 5 : overrides.target;
  const sessions: SessionResult[] = values.map((v, i) => {
    const result = v === null ? Result.noData('nothing recorded') : Result.value(v, Provenance.recorded);
    return {
      sessionId: `S${i + 1}`,
      dateMs: NOW - (values.length - i) * 7 * DAY,
      endMs: NOW - (values.length - i) * 7 * DAY + 30 * 60_000,
      durationSeconds: 1800,
      partnerType: 'SLP',
      treatmentContext: 'Therapy',
      reviewState: 'finalized',
      result,
      metTarget: v === null || target === null ? null : v >= target,
    };
  });
  const outcome = evaluateGoal(
    sessions.map(s => ({ sessionId: s.sessionId, dateMs: s.dateMs, result: s.result })),
    goalSpecification(target ?? 0, 'atLeast', 3),
  );
  const headline = attainment({ qualifyingSessions: outcome.currentStreak, statedConsecutiveSessions: 3, sessionsMeasured: outcome.sessionsMeasured });
  const def = MetricCatalogue.qualifyingSentences;
  const status: GoalProgress['status'] =
    outcome.sessionsMeasured === 0 ? 'noTrackedSessions' : target === null ? 'trackingOnly' : outcome.status.kind === 'achieved' ? 'achieved' : outcome.status.kind === 'needsAttention' ? 'needsAttention' : 'progressing';
  return {
    goal,
    goalId: goal.id,
    displayNumber: 1,
    title: goal.title,
    statement: goal.description,
    period,
    periodLabel: periodLabel(period),
    primaryMetricId: def.id,
    primaryDefinition: def,
    primaryLabel: def.displayName,
    primaryUnit: def.unit,
    target,
    hasTarget: target !== null,
    comparison: 'atLeast',
    metricTargets: [
      { metric: goal.plan!.metrics[0], definition: def, targetValue: target, role: 'direct', isSupported: true, result: Result.value(1), presentation: presentMetric(def, target, true, Result.value(1)) },
      { metric: goal.plan!.metrics[1], definition: MetricCatalogue.totalSentences, targetValue: null, role: 'supporting', isSupported: true, result: Result.value(1), presentation: presentMetric(MetricCatalogue.totalSentences, null, false, Result.value(1)) },
    ],
    sessionsRequired: 3,
    sessionRule: 'consecutive',
    minimumWordsPerSentence: 3,
    requiredConditions: ['Each counted sentence contains at least 3 words.'],
    planMetricIds: ['qualifying_sentences', 'total_sentences'],
    sessions,
    outcome,
    headline,
    latestSessionPercent: null,
    latestValue: outcome.latestValue,
    trend: outcome.trend,
    status,
    unavailableReason: null,
    previousPeriodAverage: null,
    currentPeriodAverage: null,
    provenance: Provenance.recorded,
    isMock: false,
    dataSourceLabel: 'live',
    dependsOnAi: false,
    measurementCaveat: null,
    calculationVersion: 3,
    ...overrides,
  };
}
