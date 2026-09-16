/**
 * A plain report model built from the same `GoalProgress` the screens use. The renderer
 * draws this and nothing else, so the sample-report tool and the app produce the same
 * document from the same facts.
 */

import { GOAL_STATUS_LABEL, GoalProgress, formatValue, pluralUnit } from '../application/goalProgress';
import { humanDay } from '../application/reportingPeriod';

export interface ReportPlanRow {
  name: string;
  /** "Target: 5 sentences" or "No target". */
  target: string;
  note: string | null;
}

export interface ReportLevel {
  label: string;
  rows: ReportPlanRow[];
}

export interface ReportSessionRow {
  date: string;
  result: string;
  target: string;
  /** "Yes", "No", or "–" when not scored. */
  met: string;
}

export interface ReportChartPoint {
  dateMs: number;
  value: number;
  met: boolean | null;
}

export interface ReportGoal {
  number: number;
  title: string;
  statement: string;
  status: string;
  /** "67%" or "Tracking only" or "No tracked sessions". */
  attainment: string;
  attainmentCaption: string;
  sessionsMet: string;
  levels: ReportLevel[];
  chart: {
    yAxisName: string;
    points: ReportChartPoint[];
    target: number | null;
  } | null;
  sessions: ReportSessionRow[];
  trendSentence: string;
  aiNote: string | null;
  unavailableReason: string | null;
}

export interface ReportModel {
  title: string;
  student: string;
  reportingPeriod: string;
  generatedOn: string;
  syntheticNote: string | null;
  goals: ReportGoal[];
}

function targetText(value: number | null, unit: string): string {
  if (value === null) {
    return 'No target';
  }
  return `Target: ${formatValue(value)} ${pluralUnit(unit, value)}`;
}

function trendSentence(p: GoalProgress): string {
  const measured = p.outcome.sessionsMeasured;
  if (measured === 0) {
    return 'No tracked sessions in this reporting period.';
  }
  const consistency =
    p.sessionRule === 'consecutive'
      ? `Current run of ${p.outcome.currentStreak} ${p.outcome.currentStreak === 1 ? 'session' : 'sessions'} at target; longest run ${p.outcome.longestStreak}.`
      : `${p.outcome.sessionsMeetingTarget} of ${measured} sessions at target.`;
  switch (p.trend) {
    case 'improving':
      return `Recent sessions are higher than earlier ones. ${consistency}`;
    case 'declining':
      return `Recent sessions are lower than earlier ones. ${consistency}`;
    case 'stable':
      return `Recent sessions are level with earlier ones. ${consistency}`;
    default:
      return `Fewer than four measured sessions, so no direction is reported. ${consistency}`;
  }
}

export function buildReportGoal(p: GoalProgress): ReportGoal {
  const primaryName = p.primaryLabel;
  const unit = p.primaryUnit;

  const level1: ReportPlanRow[] = [
    {
      name: 'Sessions at target',
      target: p.hasTarget ? `Target: ${p.sessionsRequired} ${p.sessionsRequired === 1 ? 'session' : 'sessions'}` : 'No target',
      note: p.hasTarget ? (p.sessionRule === 'consecutive' ? 'They must be consecutive' : 'In any order') : null,
    },
  ];
  const level2: ReportPlanRow[] = [{ name: primaryName, target: targetText(p.target, unit), note: null }];
  const level3: ReportPlanRow[] = [];
  if (p.minimumWordsPerSentence !== null) {
    level3.push({
      name: 'Words per sentence',
      target: `Target: ${p.minimumWordsPerSentence} ${pluralUnit('words', p.minimumWordsPerSentence)}`,
      note: 'Every sentence is measured against this',
    });
  }
  for (const mt of p.metricTargets) {
    if (mt.metric.id === p.primaryMetricId) {
      continue;
    }
    const name = mt.definition?.displayName ?? mt.metric.name;
    const mUnit = mt.definition?.unit ?? mt.metric.targetUnit ?? '';
    level3.push({
      name: mt.isSupported ? name : `${name} (not measurable by the app)`,
      target: targetText(mt.targetValue, mUnit),
      note: null,
    });
  }
  const levels: ReportLevel[] = [
    { label: 'LEVEL 1 · ACROSS THE PERIOD', rows: level1 },
    { label: 'LEVEL 2 · IN EACH SESSION', rows: level2 },
  ];
  if (level3.length > 0) {
    levels.push({ label: 'LEVEL 3 · WHAT MAKES ONE COUNT', rows: level3 });
  }

  const measuredSessions = p.sessions.filter(s => s.result.kind === 'value');
  const chart =
    measuredSessions.length >= 2
      ? {
          yAxisName: `${primaryName} (${unit})`,
          points: measuredSessions.map(s => ({
            dateMs: s.dateMs,
            value: s.result.kind === 'value' ? s.result.value : 0,
            met: s.metTarget,
          })),
          target: p.hasTarget ? p.target : null,
        }
      : null;

  const sessions: ReportSessionRow[] = p.sessions.map(s => {
    const value = s.result.kind === 'value' ? s.result.value : null;
    return {
      date: humanDay(s.dateMs),
      result:
        value === null
          ? s.result.kind === 'pending'
            ? 'Pending review'
            : 'No data'
          : `${formatValue(value)} ${pluralUnit(unit, value)}`,
      target: p.target === null ? 'Tracking only' : `${formatValue(p.target)} ${pluralUnit(unit, p.target)} per session`,
      met: s.metTarget === null ? '–' : s.metTarget ? 'Yes' : 'No',
    };
  });

  let attainment: string;
  if (p.status === 'notScorable') {
    attainment = 'Not scorable';
  } else if (!p.hasTarget) {
    attainment = 'Tracking only';
  } else if (p.headline.percent === null) {
    attainment = 'No tracked sessions';
  } else {
    attainment = `${p.headline.percent}%`;
  }

  const aiNote = p.dependsOnAi
    ? 'Counts for this goal depend on AI classification of the child\'s messages. An SLP should confirm classifications before this section is used in a statutory report.'
    : null;

  return {
    number: p.displayNumber,
    title: p.title,
    statement: p.statement,
    status: GOAL_STATUS_LABEL[p.status],
    attainment,
    attainmentCaption: p.status === 'notScorable' ? (p.unavailableReason ?? '') : p.headline.caption,
    sessionsMet: measuredSessions.length === 0 ? '–' : `${p.outcome.sessionsMeetingTarget} of ${measuredSessions.length}`,
    levels,
    chart,
    sessions,
    trendSentence: trendSentence(p),
    aiNote,
    unavailableReason: p.unavailableReason,
  };
}

export function buildReportModel(params: {
  student: string;
  reportingPeriod: string;
  generatedOnMs: number;
  goals: readonly GoalProgress[];
}): ReportModel {
  const isMock = params.goals.some(g => g.isMock);
  return {
    title: 'IEP Progress Report',
    student: params.student,
    reportingPeriod: params.reportingPeriod,
    generatedOn: new Date(params.generatedOnMs).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    syntheticNote: isMock ? 'Data source: synthetic mock data for demonstration. Not a clinical record.' : null,
    goals: params.goals.map(buildReportGoal),
  };
}
