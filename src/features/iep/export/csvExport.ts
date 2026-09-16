/**
 * Tidy-data CSV: one row per session per goal, goal-level columns repeated so the file
 * can be filtered and pivoted. Follows IMPLEMENTATION_GUIDE.md Step 10 exactly.
 */

import { GOAL_STATUS_LABEL, GoalProgress, formatValue } from '../application/goalProgress';
import { isoDay } from '../application/reportingPeriod';

export const CSV_HEADER = [
  'student',
  'reporting_period',
  'data_source',
  'generated_on',
  'goal_number',
  'goal_title',
  'goal_statement',
  'status',
  'attainment_percent',
  'sessions_required',
  'session_rule',
  'sessions_met_in_period',
  'sessions_in_period',
  'measure',
  'measure_target',
  'unit',
  'words_per_sentence_target',
  'session_date',
  'session_result',
  'session_target',
  'session_target_met',
] as const;

const BOM = '﻿';
const CRLF = '\r\n';

/**
 * Quote only when needed; escape embedded quotes by doubling them. Free text that a
 * spreadsheet would read as a formula (=, +, -, @, tab, CR) is prefixed with an
 * apostrophe so a goal title never executes when the file is opened. Numbers are
 * formatted by the app and never prefixed.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return formatValue(value);
  }
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface CsvExportInput {
  student: string;
  reportingPeriodLabel: string;
  generatedOnMs: number;
  goals: readonly GoalProgress[];
}

export function buildIepCsv(input: CsvExportInput): string {
  const lines: string[] = [CSV_HEADER.join(',')];
  const generatedOn = isoDay(input.generatedOnMs);
  for (const goal of input.goals) {
    const base: Array<string | number | null> = [
      input.student,
      input.reportingPeriodLabel,
      goal.dataSourceLabel,
      generatedOn,
      goal.displayNumber,
      goal.title,
      goal.statement,
      GOAL_STATUS_LABEL[goal.status],
      goal.headline.percent,
      goal.sessionsRequired,
      goal.sessionRule === 'consecutive' ? 'consecutive' : 'any order',
      goal.outcome.sessionsMeetingTarget,
      goal.sessions.length,
      goal.primaryLabel,
      goal.target,
      goal.primaryUnit,
      goal.minimumWordsPerSentence,
    ];
    if (goal.sessions.length === 0) {
      lines.push([...base, null, null, null, null].map(csvField).join(','));
      continue;
    }
    for (const session of goal.sessions) {
      const value = session.result.kind === 'value' ? session.result.value : null;
      lines.push(
        [
          ...base,
          isoDay(session.dateMs),
          value,
          goal.target,
          session.metTarget === null ? null : session.metTarget ? 'yes' : 'no',
        ]
          .map(csvField)
          .join(','),
      );
    }
  }
  return BOM + lines.join(CRLF) + CRLF;
}

export function csvFileName(generatedOnMs: number): string {
  return `IEP-sessions-${isoDay(generatedOnMs)}.csv`;
}
