/**
 * One `GoalProgress` model supplies every screen and both exports. It is derived from
 * the approved goal and the session evidence each time it is needed; status, percent,
 * trend and chart points are never persisted as independent truth.
 */

import {
  ComparisonDirection,
  GoalOutcome,
  HeadlineFigure,
  MeasurementProvenance,
  MeasurementResult,
  MetricDefinition,
  MetricPresentation,
  SessionRule,
  Trend,
} from '../core';
import { GoalMetric, IepGoal } from '../model/types';
import { ReportingPeriod } from './reportingPeriod';

/** The UI status a card shows. Every status has a symbol so colour is never the only signal. */
export type GoalUiStatus =
  | 'noTrackedSessions'
  | 'trackingOnly'
  | 'notEnoughData'
  | 'progressing'
  | 'onTrack'
  | 'stable'
  | 'achieved'
  | 'needsAttention'
  | 'notScorable';

export const GOAL_STATUS_LABEL: Record<GoalUiStatus, string> = {
  noTrackedSessions: 'No tracked sessions',
  trackingOnly: 'Tracking only',
  notEnoughData: 'Not enough data',
  progressing: 'Progressing',
  onTrack: 'On track',
  stable: 'Stable',
  achieved: 'Achieved',
  needsAttention: 'Needs attention',
  notScorable: 'Not scorable',
};

/** Text symbols paired with each status so status is readable without colour. */
export const GOAL_STATUS_SYMBOL: Record<GoalUiStatus, string> = {
  noTrackedSessions: '○',
  trackingOnly: '◔',
  notEnoughData: '◑',
  progressing: '↗',
  onTrack: '→',
  stable: '≈',
  achieved: '✓',
  needsAttention: '!',
  notScorable: '–',
};

export interface SessionResult {
  sessionId: string;
  /** Local start of the session, epoch ms. */
  dateMs: number;
  endMs: number | null;
  durationSeconds: number | null;
  partnerType: string;
  treatmentContext: string;
  reviewState: string | null;
  result: MeasurementResult;
  /** Met, missed, or null when not measured or no target. */
  metTarget: boolean | null;
}

export interface MetricTarget {
  metric: GoalMetric;
  definition: MetricDefinition | null;
  targetValue: number | null;
  role: 'direct' | 'supporting' | 'context';
  isSupported: boolean;
  /** The latest session's measurement of this metric; never an invented value. */
  result: MeasurementResult;
  presentation: MetricPresentation;
}

export interface GoalProgress {
  goal: IepGoal;
  goalId: string;
  displayNumber: number;
  title: string;
  statement: string;
  period: ReportingPeriod;
  periodLabel: string;

  primaryMetricId: string;
  primaryDefinition: MetricDefinition | null;
  primaryLabel: string;
  primaryUnit: string;
  target: number | null;
  hasTarget: boolean;
  comparison: ComparisonDirection;
  /** Every plan metric with its own target, presentation and support state. */
  metricTargets: MetricTarget[];

  sessionsRequired: number;
  sessionRule: SessionRule;
  minimumWordsPerSentence: number | null;
  requiredConditions: string[];
  planMetricIds: string[];

  /** Ordered session results inside the reporting period. */
  sessions: SessionResult[];
  outcome: GoalOutcome;
  headline: HeadlineFigure;
  latestSessionPercent: number | null;
  latestValue: number | null;
  trend: Trend;
  status: GoalUiStatus;
  /** Why the goal cannot be scored, when it cannot. */
  unavailableReason: string | null;
  /** Average measured value in the immediately preceding period, or null. */
  previousPeriodAverage: number | null;
  currentPeriodAverage: number | null;

  provenance: MeasurementProvenance;
  isMock: boolean;
  dataSourceLabel: 'live' | 'mock';
  /** Whether any counted value depends on an AI classification. */
  dependsOnAi: boolean;
  measurementCaveat: string | null;
  calculationVersion: number;
}

/** Latest-session text such as "4 of 5 sentences" or "No data". */
export function latestResultText(progress: GoalProgress): string {
  const latest = progress.sessions.length > 0 ? progress.sessions[progress.sessions.length - 1] : null;
  if (!latest || latest.result.kind !== 'value') {
    return latest && latest.result.kind === 'pending' ? 'Pending review' : 'No data';
  }
  const value = formatValue(latest.result.value);
  if (progress.target === null) {
    return `${value} ${pluralUnit(progress.primaryUnit, latest.result.value)}`;
  }
  return `${value} of ${formatValue(progress.target)} ${pluralUnit(progress.primaryUnit, progress.target)}`;
}

export function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Singularises a unit at exactly one. */
export function pluralUnit(unit: string, value: number): string {
  if (value !== 1) {
    return unit;
  }
  if (unit.endsWith('ies')) {
    return `${unit.slice(0, -3)}y`;
  }
  if (unit.endsWith('ches') || unit.endsWith('ses') || unit.endsWith('xes')) {
    return unit.slice(0, -2);
  }
  if (unit.endsWith('s') && !unit.endsWith('ss')) {
    return unit.slice(0, -1);
  }
  return unit;
}
