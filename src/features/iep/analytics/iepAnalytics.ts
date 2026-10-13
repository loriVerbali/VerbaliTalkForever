/**
 * Mixpanel events for the IEP reports.
 *
 * Privacy rule for this file: every property is a count, an enum, a catalogue metric id,
 * a duration or a flag. Nothing a clinician or child typed is ever sent — no goal wording,
 * goal titles, sentences, words, measured values, attainment percentages or the hero name.
 * Build event properties only through the helpers below so that rule stays in one place.
 */

import { useEffect, useRef } from 'react';
import mixpanel from '../../../utils/mixpanelInstance';
import { useAppSettings } from '../../../utils/persistance';
import { GoalProgress } from '../application/goalProgress';
import { GoalPlan } from '../model/types';

export const IEP_EVENTS = {
  // Dashboard
  DASHBOARD_VIEWED: 'IEP Dashboard Viewed',
  DASHBOARD_FILTER_CHANGED: 'IEP Dashboard Filter Changed',
  REPORTING_PERIOD_CHANGED: 'IEP Reporting Period Changed',
  AUTO_STOP_CHANGED: 'IEP Auto Stop Changed',
  EDIT_MODE_TOGGLED: 'IEP Goals Edit Mode Toggled',
  MOCK_MODE_CHANGED: 'IEP Mock Mode Changed',
  MOCK_DATASET_CHANGED: 'IEP Mock Dataset Changed',
  // Sessions
  SESSION_STARTED: 'IEP Session Started',
  SESSION_STOPPED: 'IEP Session Stopped',
  SESSION_REVIEW_FINALIZED: 'IEP Session Review Finalized',
  SESSION_REVIEW_POSTPONED: 'IEP Session Review Postponed',
  // Add goal flow
  ADD_GOAL_STARTED: 'IEP Add Goal Started',
  ADD_GOAL_CANCELLED: 'IEP Add Goal Cancelled',
  GOAL_SAMPLE_SELECTED: 'IEP Goal Sample Selected',
  GOAL_PLAN_REQUESTED: 'IEP Goal Plan Requested',
  GOAL_PLAN_CREATED: 'IEP Goal Plan Created',
  GOAL_PLAN_FAILED: 'IEP Goal Plan Failed',
  GOAL_PLAN_METRIC_ADDED: 'IEP Goal Plan Metric Added',
  GOAL_PLAN_METRIC_REMOVED: 'IEP Goal Plan Metric Removed',
  GOAL_PLAN_TEXT_REOPENED: 'IEP Goal Plan Text Reopened',
  GOAL_ADDED: 'IEP Goal Added',
  // Goal screen
  GOAL_VIEWED: 'IEP Goal Viewed',
  GOAL_TAB_VIEWED: 'IEP Goal Tab Viewed',
  GOAL_ACHIEVED: 'IEP Goal Achieved',
  GOAL_REMOVED: 'IEP Goal Removed',
  GOAL_TARGET_DATE_CHANGED: 'IEP Goal Target Date Changed',
  GOAL_NARRATIVE_LOADED: 'IEP Goal Narrative Loaded',
  GOAL_NARRATIVE_UNAVAILABLE: 'IEP Goal Narrative Unavailable',
  GOAL_WORDS_FILTER_CHANGED: 'IEP Goal Words Filter Changed',
  EVIDENCE_FILTER_CHANGED: 'IEP Evidence Filter Changed',
  EVIDENCE_FILTERS_RESET: 'IEP Evidence Filters Reset',
  EVIDENCE_SESSION_CHANGED: 'IEP Evidence Session Changed',
  EVIDENCE_EDITED: 'IEP Evidence Edited',
  // Export
  EXPORT_SCREEN_VIEWED: 'IEP Export Screen Viewed',
  REPORT_EXPORTED: 'IEP Report Exported',
  REPORT_EXPORT_FAILED: 'IEP Report Export Failed',
} as const;

export type IepEvent = (typeof IEP_EVENTS)[keyof typeof IEP_EVENTS];

/** The only value shapes an IEP event may carry. Free text is deliberately not one of them. */
export type IepEventValue = string | number | boolean | null | readonly string[];
export type IepEventProps = Record<string, IepEventValue | undefined>;

/** Where a goal plan came from. Mirrors the provider test used for the AI tag on screen. */
export type PlanSource = 'ai' | 'fallback' | 'none';

const NON_AI_PROVIDERS = ['built-in', 'builtin', 'manual', 'user', 'derived', 'deterministic', 'mock', 'fallback', 'seed'];

export function planSource(plan: GoalPlan | null | undefined): PlanSource {
  if (!plan) {
    return 'none';
  }
  const p = (plan.provider ?? '').trim().toLowerCase();
  return p && !NON_AI_PROVIDERS.includes(p) ? 'ai' : 'fallback';
}

const DAY_MS = 86_400_000;

/** Whole days from `fromMs` to `toMs`; negative when `toMs` is earlier. */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / DAY_MS);
}

/** Whole minutes, never below zero. */
export function minutesBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / 60_000));
}

/** Sends one IEP event. Undefined properties are dropped; failures never reach the UI. */
export function trackIep(event: IepEvent, props: IepEventProps = {}): void {
  const clean: Record<string, IepEventValue> = { feature: 'iep' };
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  try {
    mixpanel.track(event, clean);
  } catch (error) {
    console.warn('IEP analytics: event not sent', event, error);
  }
}

/** Structure of a goal and where it stands. Never its wording or its measured values. */
export function goalEventProps(p: GoalProgress, nowMs: number = Date.now()): IepEventProps {
  return {
    goal_number: p.displayNumber,
    status: p.status,
    has_target: p.hasTarget,
    has_target_date: p.goal.targetDateMs != null,
    session_count: p.sessions.length,
    sessions_required: p.sessionsRequired,
    session_rule: p.sessionRule,
    primary_metric_id: p.primaryMetricId,
    metric_ids: p.planMetricIds,
    metric_count: p.planMetricIds.length,
    plan_source: planSource(p.goal.plan),
    depends_on_ai: p.dependsOnAi,
    is_mock: p.isMock,
    goal_age_days: daysBetween(p.goal.createdAtMs, nowMs),
  };
}

/** Shape of a plan under review or about to be saved. Catalogue ids only, no targets or text. */
export function planEventProps(plan: GoalPlan): IepEventProps {
  const ids = plan.metrics.map(m => m.id);
  const hasSentenceRule =
    typeof plan.calculation?.minimumWordsPerSentence === 'number' || plan.metrics.some(m => typeof m.constraints?.minimumWordsPerSentence === 'number');
  return {
    metric_ids: ids,
    metric_count: ids.length,
    targeted_metric_count: plan.metrics.filter(m => typeof m.targetValue === 'number').length,
    unsupported_metric_count: plan.metrics.filter(m => m.isSupported === false).length,
    primary_metric_id: plan.calculation?.primaryMetricId || null,
    sessions_required: Math.max(1, plan.calculation?.requiredSessionCount ?? plan.consecutiveSessions ?? 1),
    consecutive_sessions: plan.calculation?.requiresConsecutiveSessions ?? true,
    has_sentence_length_rule: hasSentenceRule,
    plan_source: planSource(plan),
  };
}

/** Size of a typed goal, so adoption of long versus short wordings is visible without the text. */
export function goalTextStats(text: string): IepEventProps {
  const trimmed = text.trim();
  return {
    goal_text_length: trimmed.length,
    goal_text_word_count: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
  };
}

/** Preference key holding the goal ids whose achievement was already reported. */
export const ACHIEVED_GOALS_REPORTED_KEY = 'iepAchievedGoalsReported';

export function parseReportedGoalIds(raw: string | null | undefined): Set<string> {
  try {
    const parsed = JSON.parse(raw || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Reports `IEP Goal Achieved` once per live goal the first time it reads as achieved.
 * Achievement is derived, not stored, so the reported ids are remembered in preferences;
 * mock goals are synthetic and never reported.
 */
export function useIepGoalAchievementTracking(all: readonly GoalProgress[]): void {
  const { preferences, setItem } = useAppSettings();
  const reported = useRef<Set<string> | null>(null);
  const stored = preferences[ACHIEVED_GOALS_REPORTED_KEY];
  useEffect(() => {
    if (reported.current === null) {
      reported.current = new Set();
    }
    for (const id of parseReportedGoalIds(stored)) {
      reported.current.add(id);
    }
    const newly = all.filter(p => p.status === 'achieved' && !p.isMock && !reported.current!.has(p.goalId));
    if (newly.length === 0) {
      return;
    }
    const now = Date.now();
    for (const p of newly) {
      reported.current.add(p.goalId);
      trackIep(IEP_EVENTS.GOAL_ACHIEVED, {
        ...goalEventProps(p, now),
        days_to_achieve: daysBetween(p.goal.createdAtMs, now),
        sessions_measured: p.outcome.sessionsMeasured,
      });
    }
    setItem(ACHIEVED_GOALS_REPORTED_KEY, JSON.stringify([...reported.current]));
  }, [all, stored, setItem]);
}
