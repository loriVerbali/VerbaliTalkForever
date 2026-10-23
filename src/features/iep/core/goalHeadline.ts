/**
 * The single percentage a therapist reads at the top of a goal.
 *
 * There are two honest percentages for a goal and they answer different questions:
 * - How close was the child in the last session?  latestValue / target
 * - How far through the goal's consistency rule?  qualifyingSessions / sessionsRequired
 *
 * They are separated here and each is labelled for what it is, so the number and its
 * caption cannot drift apart.
 */

export type HeadlineBasis =
  /** Progress through the consistency rule the goal is scored on. */
  | { readonly kind: 'attainment'; readonly streak: number; readonly required: number }
  /** Nothing measured, so no percentage may be shown. Absent is not zero. */
  | { readonly kind: 'noData' };

export interface HeadlineFigure {
  /** null when nothing was measured. Never 0 for absent data. */
  readonly percent: number | null;
  readonly basis: HeadlineBasis;
  /** Wording for the figure, so the number and its caption travel together. */
  readonly caption: string;
}

/** Whether a goal's session requirement must be met in a row. */
export type SessionRule = 'consecutive' | 'cumulative';

export const NO_SESSIONS_CAPTION = 'No tracked sessions yet';

/**
 * Successful sessions before a goal may read as achieved: the number the goal itself
 * carries. A requirement the clinician did not set is not the app's to invent.
 */
export function sessionsRequired(statedConsecutiveSessions: number): number {
  return Math.max(1, Math.floor(statedConsecutiveSessions));
}

/**
 * The headline figure: how far through the goal's consistency rule the child is.
 * `qualifyingSessions` is the streak for a consecutive rule and the plain count of
 * successful sessions for a cumulative one; only the goal knows its rule.
 */
export function attainment(params: {
  qualifyingSessions: number;
  statedConsecutiveSessions: number;
  sessionsMeasured: number;
  rule?: SessionRule;
}): HeadlineFigure {
  const rule = params.rule ?? 'consecutive';
  if (params.sessionsMeasured <= 0) {
    return { percent: null, basis: { kind: 'noData' }, caption: NO_SESSIONS_CAPTION };
  }
  const required = sessionsRequired(params.statedConsecutiveSessions);
  const met = Math.max(0, params.qualifyingSessions);
  const percent = Math.min(100, Math.round((met / required) * 100));
  return {
    percent,
    basis: { kind: 'attainment', streak: met, required },
    caption:
      rule === 'consecutive'
        ? `${met} of ${required} consecutive sessions at target`
        : `${met} of ${required} sessions at target`,
  };
}

/**
 * How close the most recent session came to the per-session target. Reported separately
 * and never as the goal's score. Uncapped: "267% of the session target" is information.
 */
export function latestSessionPercentOfTarget(
  latestValue: number | null,
  target: number,
): number | null {
  if (latestValue === null || !(target > 0)) {
    return null;
  }
  return Math.round((latestValue / target) * 100);
}
