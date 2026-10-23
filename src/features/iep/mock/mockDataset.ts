/**
 * Loads the bundled synthetic datasets into typed structures. Everything here is labelled
 * synthetic; the summary drives cards and charts, the events drive evidence and the
 * derived language and duration data.
 */

import { booleanOrNull, numberOrNull, parseCsv } from './csv';
import eventsEdgeCases from './data/eventsEdgeCases.csv';
import eventsStandard from './data/eventsStandard.csv';
import summaryEdgeCases from './data/summaryEdgeCases.csv';
import summaryStandard from './data/summaryStandard.csv';

export type MockDatasetId = 'standard' | 'edgeCases';

export const MOCK_DATASET_LABEL: Record<MockDatasetId, string> = {
  standard: '52-week sample',
  edgeCases: 'Edge cases',
};

export const MOCK_DATA_LABEL = 'Mock data';
export const SYNTHETIC_NOTE = 'Synthetic mock data for dashboard prototyping; not clinical data';

/** Columns that identify and route a summary row; every other numeric column is a measurement. */
const SUMMARY_ROUTING_COLUMNS = new Set([
  'goal_id', 'goal_name', 'goal_category', 'goal_statement', 'week_number', 'session_id',
  'session_date', 'session_duration_minutes', 'primary_metric', 'primary_metric_field',
  'target_value', 'target_unit', 'sessions_required', 'ai_required', 'slp_help_required',
  'supporting_metric', 'supporting_target_value', 'supporting_result_value',
  'target_met_this_session', 'sessions_meeting_target_to_date', 'current_success_streak',
  'longest_success_streak', 'long_term_condition_met', 'ai_insight', 'opportunity', 'mock_data_note',
]);

export interface MockGoal {
  goalId: string;
  name: string;
  category: string;
  statement: string;
  primaryMetricLabel: string;
  primaryMetricField: string;
  targetValue: number | null;
  targetUnit: string;
  sessionsRequired: number;
  aiRequired: boolean | null;
  slpHelpRequired: string;
  supportingMetric: string | null;
  supportingTargetValue: number | null;
  sessionIds: string[];
}

export interface MockSessionRow {
  goalId: string;
  sessionId: string;
  weekNumber: number;
  /** Local calendar day as yyyy-MM-dd. */
  sessionDate: string;
  durationMinutes: number | null;
  /** Every numeric measurement column by column name. Blank cells are absent. */
  columns: Record<string, number>;
  supportingResultValue: number | null;
  targetMetThisSession: boolean | null;
  sessionsMeetingTargetToDate: number | null;
  currentSuccessStreak: number | null;
  longestSuccessStreak: number | null;
  longTermConditionMet: boolean | null;
  aiInsight: string;
  opportunity: string;
}

export interface MockEvent {
  eventId: string;
  sessionId: string;
  weekNumber: number;
  sessionDate: string;
  elapsedSeconds: number;
  eventType: string;
  conversationId: string;
  turnId: string;
  speaker: string;
  partnerType: string;
  context: string;
  sentenceId: string;
  sentenceStatus: string;
  wordId: string;
  wordText: string;
  pageId: string;
  fromPageId: string;
  toPageId: string;
  content: string;
  wordCount: number | null;
  communicationFunction: string;
  supportLevel: string;
  supportConfidence: number | null;
  questionId: string;
  questionText: string;
  answerId: string;
  answerText: string;
  isWhQuestion: boolean | null;
  isPreferredPage: boolean | null;
  isNovelContribution: boolean | null;
  isRepairAttempt: boolean | null;
  isSuccessfulRepair: boolean | null;
  retellingId: string;
  detailType: string;
  detailText: string;
  goalIdsSupported: string[];
}

export interface MockDataset {
  id: MockDatasetId;
  goals: MockGoal[];
  goalsById: Map<string, MockGoal>;
  /** goalId -> session rows in date order. */
  sessionsByGoal: Map<string, MockSessionRow[]>;
  /** sessionId -> row (rows are shared across goals in the standard set, keyed per goal+session). */
  rowsByGoalSession: Map<string, MockSessionRow>;
  /** sessionId -> events in elapsed order. */
  eventsBySession: Map<string, MockEvent[]>;
  /** Distinct session descriptors across all goals, date order. */
  sessions: Array<{ sessionId: string; sessionDate: string; weekNumber: number; durationMinutes: number | null; partnerType: string; context: string }>;
}

export function goalSessionKey(goalId: string, sessionId: string): string {
  return `${goalId}::${sessionId}`;
}

function parseSummary(text: string): { goals: MockGoal[]; rows: MockSessionRow[] } {
  const table = parseCsv(text);
  const goals = new Map<string, MockGoal>();
  const rows: MockSessionRow[] = [];
  for (const r of table.rows) {
    const goalId = r.goal_id;
    if (!goalId) {
      continue;
    }
    if (!goals.has(goalId)) {
      goals.set(goalId, {
        goalId,
        name: r.goal_name ?? '',
        category: r.goal_category ?? '',
        statement: r.goal_statement ?? '',
        primaryMetricLabel: r.primary_metric ?? '',
        primaryMetricField: r.primary_metric_field ?? '',
        targetValue: numberOrNull(r.target_value),
        targetUnit: r.target_unit ?? '',
        sessionsRequired: Math.max(1, numberOrNull(r.sessions_required) ?? 1),
        aiRequired: booleanOrNull(r.ai_required),
        slpHelpRequired: r.slp_help_required ?? '',
        supportingMetric: r.supporting_metric ? r.supporting_metric : null,
        supportingTargetValue: numberOrNull(r.supporting_target_value),
        sessionIds: [],
      });
    }
    const goal = goals.get(goalId)!;
    goal.sessionIds.push(r.session_id);
    const columns: Record<string, number> = {};
    for (const [name, cell] of Object.entries(r)) {
      if (SUMMARY_ROUTING_COLUMNS.has(name)) {
        continue;
      }
      const n = numberOrNull(cell);
      if (n !== null) {
        columns[name] = n;
      }
    }
    rows.push({
      goalId,
      sessionId: r.session_id,
      weekNumber: numberOrNull(r.week_number) ?? 0,
      sessionDate: r.session_date,
      durationMinutes: numberOrNull(r.session_duration_minutes),
      columns,
      supportingResultValue: numberOrNull(r.supporting_result_value),
      targetMetThisSession: booleanOrNull(r.target_met_this_session),
      sessionsMeetingTargetToDate: numberOrNull(r.sessions_meeting_target_to_date),
      currentSuccessStreak: numberOrNull(r.current_success_streak),
      longestSuccessStreak: numberOrNull(r.longest_success_streak),
      longTermConditionMet: booleanOrNull(r.long_term_condition_met),
      aiInsight: r.ai_insight ?? '',
      opportunity: r.opportunity ?? '',
    });
  }
  return { goals: [...goals.values()], rows };
}

function parseEvents(text: string): MockEvent[] {
  const table = parseCsv(text);
  return table.rows
    .filter(r => r.event_id)
    .map(r => ({
      eventId: r.event_id,
      sessionId: r.session_id,
      weekNumber: numberOrNull(r.week_number) ?? 0,
      sessionDate: r.session_date,
      elapsedSeconds: numberOrNull(r.elapsed_seconds) ?? 0,
      eventType: r.event_type,
      conversationId: r.conversation_id ?? '',
      turnId: r.turn_id ?? '',
      speaker: r.speaker ?? '',
      partnerType: r.partner_type ?? '',
      context: r.context ?? '',
      sentenceId: r.sentence_id ?? '',
      sentenceStatus: r.sentence_status ?? '',
      wordId: r.word_id ?? '',
      wordText: r.word_text ?? '',
      pageId: r.page_id ?? '',
      fromPageId: r.from_page_id ?? '',
      toPageId: r.to_page_id ?? '',
      content: r.content ?? '',
      wordCount: numberOrNull(r.word_count),
      communicationFunction: r.communication_function ?? '',
      supportLevel: r.support_level ?? '',
      supportConfidence: numberOrNull(r.support_confidence),
      questionId: r.question_id ?? '',
      questionText: r.question_text ?? '',
      answerId: r.answer_id ?? '',
      answerText: r.answer_text ?? '',
      isWhQuestion: booleanOrNull(r.is_wh_question),
      isPreferredPage: booleanOrNull(r.is_preferred_page),
      isNovelContribution: booleanOrNull(r.is_novel_contribution),
      isRepairAttempt: booleanOrNull(r.is_repair_attempt),
      isSuccessfulRepair: booleanOrNull(r.is_successful_repair),
      retellingId: r.retelling_id ?? '',
      detailType: r.detail_type ?? '',
      detailText: r.detail_text ?? '',
      goalIdsSupported: (r.goal_ids_supported ?? '').split('|').map(s => s.trim()).filter(s => s.length > 0),
    }))
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.elapsedSeconds - b.elapsedSeconds);
}

function buildDataset(id: MockDatasetId, summaryText: string, eventsText: string): MockDataset {
  const { goals, rows } = parseSummary(summaryText);
  const events = parseEvents(eventsText);
  const goalsById = new Map(goals.map(g => [g.goalId, g]));
  const sessionsByGoal = new Map<string, MockSessionRow[]>();
  const rowsByGoalSession = new Map<string, MockSessionRow>();
  for (const row of rows) {
    const list = sessionsByGoal.get(row.goalId) ?? [];
    list.push(row);
    sessionsByGoal.set(row.goalId, list);
    rowsByGoalSession.set(goalSessionKey(row.goalId, row.sessionId), row);
  }
  for (const list of sessionsByGoal.values()) {
    list.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.sessionId.localeCompare(b.sessionId));
  }
  const eventsBySession = new Map<string, MockEvent[]>();
  for (const event of events) {
    const list = eventsBySession.get(event.sessionId) ?? [];
    list.push(event);
    eventsBySession.set(event.sessionId, list);
  }
  const seen = new Set<string>();
  const sessions: MockDataset['sessions'] = [];
  for (const row of rows) {
    if (seen.has(row.sessionId)) {
      continue;
    }
    seen.add(row.sessionId);
    const started = eventsBySession.get(row.sessionId)?.find(e => e.eventType === 'session_started');
    sessions.push({
      sessionId: row.sessionId,
      sessionDate: row.sessionDate,
      weekNumber: row.weekNumber,
      durationMinutes: row.durationMinutes,
      partnerType: started?.partnerType ?? '',
      context: started?.context ?? '',
    });
  }
  sessions.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.sessionId.localeCompare(b.sessionId));
  return { id, goals, goalsById, sessionsByGoal, rowsByGoalSession, eventsBySession, sessions };
}

const cache = new Map<MockDatasetId, MockDataset>();

/** Parsed once per dataset and cached for the life of the app. */
export function loadMockDataset(id: MockDatasetId): MockDataset {
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }
  const dataset =
    id === 'standard'
      ? buildDataset('standard', summaryStandard, eventsStandard)
      : buildDataset('edgeCases', summaryEdgeCases, eventsEdgeCases);
  cache.set(id, dataset);
  return dataset;
}

/** Columns for the core MockSessionMetricSource: sessionId -> column -> value, for one goal's rows. */
export function mockColumnsForGoal(dataset: MockDataset, goalId: string): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const row of dataset.sessionsByGoal.get(goalId) ?? []) {
    out[row.sessionId] = row.columns;
  }
  return out;
}

/** Parses a yyyy-MM-dd calendar day as local midnight in epoch milliseconds. */
export function localDayMs(day: string): number {
  const [y, m, d] = day.split('-').map(s => parseInt(s, 10));
  if (!y || !m || !d) {
    return Number.NaN;
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Mock event timestamps are a stable local start of day plus elapsed seconds. */
export const MOCK_SESSION_START_HOUR = 10;

export function mockEventTimestampMs(event: MockEvent): number {
  return localDayMs(event.sessionDate) + MOCK_SESSION_START_HOUR * 3_600_000 + event.elapsedSeconds * 1000;
}
