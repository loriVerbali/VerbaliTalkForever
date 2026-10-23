/**
 * Turns measurements into the numbers a therapist reads, and nothing else.
 *
 * Pure: no storage, no formatting, no view. Ported from `ProgressCalculator.swift` with
 * the rules in IMPLEMENTATION_GUIDE.md Step 3.
 */

import { MeasurementResult, measuredValue } from './measurementResult';
import { ComparisonDirection, isTargetMet } from './metricDefinition';

/** One session's value for one metric. */
export interface SessionMeasurement {
  readonly sessionId: string;
  /** Epoch milliseconds. */
  readonly dateMs: number;
  readonly result: MeasurementResult;
}

/** The rule a goal is scored by, as approved by the SLP. */
export interface GoalSpecification {
  readonly target: number;
  readonly comparison: ComparisonDirection;
  /**
   * How many consecutive meeting sessions constitute achievement. A goal that states no
   * rule must be given one deliberately rather than inheriting a hardcoded floor.
   */
  readonly requiredConsecutiveSessions: number;
}

export function goalSpecification(
  target: number,
  comparison: ComparisonDirection = 'atLeast',
  requiredConsecutiveSessions = 1,
): GoalSpecification {
  return {
    target,
    comparison,
    requiredConsecutiveSessions: Math.max(1, requiredConsecutiveSessions),
  };
}

export type GoalStatus =
  | { readonly kind: 'achieved' }
  | { readonly kind: 'progressing' }
  | { readonly kind: 'needsAttention' }
  /** Sessions exist but none carried a measurement. */
  | { readonly kind: 'noData' }
  /** The metric cannot be scored at all. Never rendered as failure. */
  | { readonly kind: 'notScorable'; readonly reason: string };

export type Trend = 'improving' | 'stable' | 'declining' | 'insufficientData';

export interface GoalOutcome {
  readonly status: GoalStatus;
  /** Progress toward the target, 0–100, or null when nothing was measured. Never 0 for absent data. */
  readonly percentOfTarget: number | null;
  readonly sessionsMeasured: number;
  readonly sessionsMeetingTarget: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly trend: Trend;
  readonly latestValue: number | null;
}

/** The clinically meaningful relative change for a trend. Pending SLP approval (B5). */
export const MEANINGFUL_RELATIVE_CHANGE = 0.05;

/** Minimum measured sessions before a direction is reported. */
export const MIN_SESSIONS_FOR_TREND = 4;

function emptyOutcome(status: GoalStatus): GoalOutcome {
  return {
    status,
    percentOfTarget: null,
    sessionsMeasured: 0,
    sessionsMeetingTarget: 0,
    currentStreak: 0,
    longestStreak: 0,
    trend: 'insufficientData',
    latestValue: null,
  };
}

/** The first session id wins. Duplicates are dropped rather than double counted into a streak. */
export function deduplicateSessions(sessions: readonly SessionMeasurement[]): SessionMeasurement[] {
  const seen = new Set<string>();
  return sessions.filter(s => {
    if (seen.has(s.sessionId)) {
      return false;
    }
    seen.add(s.sessionId);
    return true;
  });
}

/** Sort by date then session id so the same sessions in any order give one answer. */
export function orderSessions(sessions: readonly SessionMeasurement[]): SessionMeasurement[] {
  return deduplicateSessions(sessions).sort((a, b) => {
    if (a.dateMs !== b.dateMs) {
      return a.dateMs - b.dateMs;
    }
    return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
  });
}

/** Sessions all agree the metric cannot be produced. */
function blockingReason(sessions: readonly SessionMeasurement[]): string | null {
  if (sessions.length === 0) {
    return null;
  }
  let reason: string | null = null;
  for (const session of sessions) {
    if (session.result.kind !== 'unsupported') {
      return null;
    }
    reason = reason ?? session.result.reason;
  }
  return reason;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Later sessions against earlier ones, by median of each half. A single noisy session
 * must not decide the direction of a whole reporting period.
 */
export function trendOf(values: readonly number[], target: number, comparison: ComparisonDirection = 'atLeast'): Trend {
  if (values.length < MIN_SESSIONS_FOR_TREND) {
    return 'insufficientData';
  }
  const half = Math.floor(values.length / 2);
  const earlier = median(values.slice(0, half));
  const recent = median(values.slice(half));
  const scale = Math.max(Math.abs(earlier), target, 1);
  // For a ceiling (build time, prompts needed) a falling value is the improvement.
  const direction = comparison === 'atMost' ? -1 : 1;
  const change = (direction * (recent - earlier)) / scale;
  if (change > MEANINGFUL_RELATIVE_CHANGE) {
    return 'improving';
  }
  if (change < -MEANINGFUL_RELATIVE_CHANGE) {
    return 'declining';
  }
  return 'stable';
}

/**
 * How close the latest session came, capped at 100. Exceeding a target is not 367% of
 * an IEP goal; the goal is met. For a ceiling the ratio inverts.
 */
export function percentOfTarget(latest: number, specification: GoalSpecification): number | null {
  switch (specification.comparison) {
    case 'atLeast':
      if (specification.target <= 0) {
        return null;
      }
      return Math.min(100, Math.max(0, (latest / specification.target) * 100));
    case 'atMost':
      if (latest <= 0) {
        return 100;
      }
      return Math.min(100, Math.max(0, (specification.target / latest) * 100));
    default:
      return null;
  }
}

export function evaluateGoal(
  sessions: readonly SessionMeasurement[],
  specification: GoalSpecification,
): GoalOutcome {
  const ordered = orderSessions(sessions);

  // A metric the app cannot produce is not a failing metric.
  const blocked = blockingReason(ordered);
  if (blocked !== null) {
    return emptyOutcome({ kind: 'notScorable', reason: blocked });
  }

  // Pending and no-data sessions are excluded rather than counted as a miss.
  const values: number[] = [];
  for (const session of ordered) {
    const v = measuredValue(session.result);
    if (v !== null) {
      values.push(v);
    }
  }
  if (values.length === 0) {
    return emptyOutcome({ kind: 'noData' });
  }

  const met = values.map(
    v => isTargetMet(specification.comparison, v, specification.target) ?? false,
  );

  let current = 0;
  for (let i = met.length - 1; i >= 0; i -= 1) {
    if (!met[i]) {
      break;
    }
    current += 1;
  }
  let longest = 0;
  let run = 0;
  for (const outcome of met) {
    run = outcome ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  const latest = values[values.length - 1];
  const trend = trendOf(values, specification.target, specification.comparison);
  const achieved = current >= specification.requiredConsecutiveSessions;

  const status: GoalStatus = achieved
    ? { kind: 'achieved' }
    : trend === 'declining'
      ? { kind: 'needsAttention' }
      : { kind: 'progressing' };

  return {
    status,
    percentOfTarget: percentOfTarget(latest, specification),
    sessionsMeasured: values.length,
    sessionsMeetingTarget: met.filter(Boolean).length,
    currentStreak: current,
    longestStreak: longest,
    trend,
    latestValue: latest,
  };
}
