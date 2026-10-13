/**
 * Detail tiles and supporting figures. Each derivation states its minimum evidence and
 * returns null rather than a number when that minimum is not met.
 */

import { Aggregation, MetricCatalogue, MetricId } from '../core';
import { classifyPartOfSpeech } from '../model/partOfSpeech';
import { GoalProgress, MetricTarget, formatValue } from './goalProgress';
import { LanguageAnalysis } from './insights';

export interface SentenceSample {
  dateMs: number;
  words: number;
  seconds: number;
}

export interface StreakTile {
  length: number;
  startMs: number;
  endMs: number;
}

/** Earliest longest run wins on ties. */
export function longestStreak(p: GoalProgress): StreakTile | null {
  let best: StreakTile | null = null;
  let run = 0;
  let runStart = 0;
  for (const s of p.sessions) {
    if (s.metTarget === true) {
      run += 1;
      if (run === 1) {
        runStart = s.dateMs;
      }
      if (!best || run > best.length) {
        best = { length: run, startMs: runStart, endMs: s.dateMs };
      }
    } else if (s.result.kind === 'value') {
      run = 0;
    }
  }
  return best;
}

export interface LengthShare {
  label: string;
  count: number;
  /** Rounded share of every sampled sentence, in percent. */
  percent: number;
}

const SHARE_LABELS = ['1 word', '2 words', '3+ words'] as const;
const shareIndex = (words: number): number => (words <= 1 ? 0 : words === 2 ? 1 : 2);

/** Sentences by length across every sample given, one row per bucket; empty without samples. */
export function sentenceLengthShares(samples: readonly SentenceSample[]): LengthShare[] {
  if (samples.length === 0) {
    return [];
  }
  const counts = [0, 0, 0];
  for (const s of samples) {
    counts[shareIndex(s.words)] += 1;
  }
  return SHARE_LABELS.map((label, i) => ({ label, count: counts[i], percent: Math.round((counts[i] / samples.length) * 100) }));
}

/** The sentence-length buckets the build-time figures are held constant over. */
export const LENGTH_LABELS = ['1 word', '2 words', '3 words', '4+ words'] as const;
export type LengthLabel = (typeof LENGTH_LABELS)[number];

export const lengthLabel = (words: number): LengthLabel => (words <= 1 ? '1 word' : words === 2 ? '2 words' : words === 3 ? '3 words' : '4+ words');

const meanSeconds = (xs: readonly SentenceSample[]): number => xs.reduce((a, b) => a + b.seconds, 0) / xs.length;

export interface BuildTimeChange {
  label: LengthLabel;
  earlierSeconds: number;
  recentSeconds: number;
  earlierCount: number;
  recentCount: number;
  /** Negative means faster. */
  percentChange: number;
}

/**
 * Build time for each sentence length, the earlier half of the timed sentences against
 * the recent half. Length is held constant because a longer sentence takes longer whatever
 * the child's progress. Needs eight timed sentences, and a length needs three in each half.
 */
export function buildTimeChanges(samples: readonly SentenceSample[]): BuildTimeChange[] {
  const ordered = samples.filter(s => s.seconds > 0).sort((a, b) => a.dateMs - b.dateMs);
  if (ordered.length < 8) {
    return [];
  }
  const midpointMs = ordered[Math.floor(ordered.length / 2)].dateMs;
  const out: BuildTimeChange[] = [];
  for (const label of LENGTH_LABELS) {
    const rows = ordered.filter(s => lengthLabel(s.words) === label);
    const earlier = rows.filter(s => s.dateMs < midpointMs);
    const recent = rows.filter(s => s.dateMs >= midpointMs);
    if (earlier.length < 3 || recent.length < 3) {
      continue;
    }
    const e = meanSeconds(earlier);
    const r = meanSeconds(recent);
    out.push({
      label,
      earlierSeconds: e,
      recentSeconds: r,
      earlierCount: earlier.length,
      recentCount: recent.length,
      percentChange: e > 0 ? Math.round(((r - e) / e) * 100) : 0,
    });
  }
  return out;
}

export interface DurationBucket {
  label: LengthLabel;
  averageSeconds: number;
  count: number;
}

/** Average build time by sentence length; buckets need at least three samples. */
export function durationsByLength(samples: readonly SentenceSample[]): DurationBucket[] {
  const timed = samples.filter(s => s.seconds > 0);
  return LENGTH_LABELS.map(label => ({ label, list: timed.filter(s => lengthLabel(s.words) === label) }))
    .filter(g => g.list.length >= 3)
    .map(g => ({ label: g.label, averageSeconds: meanSeconds(g.list), count: g.list.length }));
}

export type PosFilter = 'all' | 'pronoun' | 'verb' | 'descriptor' | 'noun';

export const POS_FILTER_LABEL: Record<PosFilter, string> = {
  all: 'All words',
  pronoun: 'Pronouns',
  verb: 'Verbs',
  descriptor: 'Descriptors',
  noun: 'Nouns',
};

/** Top five words for a POS filter, using the closed classifier lists. */
export function topWords(language: LanguageAnalysis, filter: PosFilter, limit = 5): Array<{ label: string; count: number }> {
  const matches = (label: string): boolean => {
    if (filter === 'all') {
      return true;
    }
    const pos = classifyPartOfSpeech(label);
    if (filter === 'descriptor') {
      return pos === 'adjective' || pos === 'adverb';
    }
    return pos === filter;
  };
  return language.words.filter(w => matches(w.label)).slice(0, limit);
}

/**
 * The series behind "Average words per session": every word in a session's completed
 * sentences. Not a catalogue metric, so the screen reads it rather than measuring it.
 */
export const WORDS_PER_SESSION_SERIES = 'words_per_session';
export type TrendSeriesId = MetricId | typeof WORDS_PER_SESSION_SERIES;

/** How the words-per-session series presents when no catalogue definition can say. */
const WORDS_PER_SESSION_PANEL = {
  name: 'Average words per session',
  unit: 'words',
  aggregation: 'average',
} as const;

export interface SupportingMetric {
  id: TrendSeriesId;
  name: string;
  unit: string;
  value: string;
  aggregation: Aggregation;
}

/**
 * Panel order from the reference app. Words per session sits with the other language
 * statistics even though the catalogue does not define it.
 */
export const SUPPORTING_PANEL_ORDER: readonly TrendSeriesId[] = [
  'total_sentences',
  'average_words_per_sentence',
  WORDS_PER_SESSION_SERIES,
  'longest_sentence_words',
  'different_communication_functions',
  'different_pages_visited',
  'different_words_activated',
  'total_word_activations',
  'page_navigations',
  'questions_asked',
  'wh_questions',
  'request_count',
];

const PANEL_NAME: Partial<Record<string, string>> = { total_sentences: 'Average sentences per session' };

function aggregate(values: readonly number[], aggregation: Aggregation): number {
  switch (aggregation) {
    case 'maximum':
      return Math.max(...values);
    case 'total':
      return values.reduce((a, b) => a + b, 0);
    case 'latest':
      return values[values.length - 1];
    default:
      return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

/** Aggregates per-session values by each series' own aggregation rule. */
export function supportingMetrics(valuesBySeries: ReadonlyMap<TrendSeriesId, readonly number[]>): SupportingMetric[] {
  const out: SupportingMetric[] = [];
  for (const id of SUPPORTING_PANEL_ORDER) {
    const values = valuesBySeries.get(id);
    if (!values || values.length === 0) {
      continue;
    }
    const def = id === WORDS_PER_SESSION_SERIES ? WORDS_PER_SESSION_PANEL : MetricCatalogue.definitionFor(id);
    if (!def) {
      continue;
    }
    const name = 'displayName' in def ? PANEL_NAME[id] ?? def.displayName : def.name;
    out.push({ id, name, unit: def.unit, value: formatValue(aggregate(values, def.aggregation)), aggregation: def.aggregation });
  }
  return out;
}

// Metric trend cards ("Metrics behind the goal")

export interface TrendPoint {
  sessionId: string;
  dateMs: number;
  value: number;
}

export interface MetricTrend {
  /** The plotted series; unique within one goal. */
  key: TrendSeriesId;
  name: string;
  unit: string;
  usesAi: boolean;
  /** Drawn only when the target applies to the plotted series itself. */
  targetLine: number | null;
  /** Why no line is drawn; null when the series charts. */
  unavailableReason: string | null;
  points: TrendPoint[];
}

/** One session's value for a series, or null when nothing was measured. Never an invented zero. */
export type TrendValueReader = (series: TrendSeriesId, sessionId: string) => number | null;

/**
 * A line over sessions cannot carry a per-sentence quantity, so words per sentence is
 * charted as each session's average instead. Only the trend cards rename it; the plan
 * rows keep the metric's own name.
 */
const TREND_SERIES_FOR_METRIC: Partial<Record<string, TrendSeriesId>> = {
  [MetricCatalogue.totalWordCountPerSentence.id]: MetricCatalogue.averageWordsPerSentence.id,
};

const TREND_NAME: Partial<Record<string, string>> = {
  [WORDS_PER_SESSION_SERIES]: WORDS_PER_SESSION_PANEL.name,
};

/** Language statistics every goal charts, whatever its plan names. */
const ALWAYS_TRACKED: readonly TrendSeriesId[] = [MetricCatalogue.averageWordsPerSentence.id, WORDS_PER_SESSION_SERIES];

const NOT_MEASURED = 'Not measured in this period';

function trendPoints(p: GoalProgress, series: TrendSeriesId, read: TrendValueReader): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const s of p.sessions) {
    const value = read(series, s.sessionId);
    if (value !== null) {
      points.push({ sessionId: s.sessionId, dateMs: s.dateMs, value });
    }
  }
  return points;
}

/**
 * The cards under "Metrics behind the goal": every plan metric except the goal's own
 * measure (the progress chart carries that), then the language statistics the plan did
 * not already claim. One card per series, so a plan naming a metric twice draws it once.
 */
export function metricTrends(p: GoalProgress, read: TrendValueReader): MetricTrend[] {
  const out: MetricTrend[] = [];
  const claimed = new Set<string>([p.primaryMetricId]);
  const isPrimary = (m: MetricTarget) => m.metric.id === p.primaryMetricId || m.definition?.id === p.primaryMetricId;

  for (const m of p.metricTargets) {
    if (isPrimary(m)) {
      continue;
    }
    if (!m.definition) {
      if (claimed.has(m.metric.id)) {
        continue;
      }
      claimed.add(m.metric.id);
      out.push({
        key: m.metric.id,
        name: m.metric.name,
        unit: m.metric.targetUnit ?? '',
        usesAi: false,
        targetLine: null,
        unavailableReason: m.presentation.unavailableReason ?? 'Not measured by the app.',
        points: [],
      });
      continue;
    }
    const series = TREND_SERIES_FOR_METRIC[m.definition.id] ?? m.definition.id;
    if (claimed.has(series)) {
      continue;
    }
    claimed.add(series);
    const renamed = series !== m.definition.id;
    const seriesDefinition = MetricCatalogue.definitionFor(series) ?? m.definition;
    const unsupported = m.presentation.style === 'unsupported';
    const points = unsupported ? [] : trendPoints(p, series, read);
    let unavailableReason: string | null = null;
    if (unsupported || (points.length === 0 && m.presentation.style === 'pending')) {
      unavailableReason = m.presentation.unavailableReason ?? NOT_MEASURED;
    } else if (points.length === 0) {
      unavailableReason = NOT_MEASURED;
    }
    out.push({
      key: series,
      name: TREND_NAME[series] ?? seriesDefinition.displayName,
      unit: seriesDefinition.unit,
      usesAi: m.definition.requirement === 'aiAssisted',
      // A per-sentence bar says nothing about a session average, so it is not drawn there.
      targetLine: renamed ? null : m.presentation.targetLine,
      unavailableReason,
      points,
    });
  }

  for (const series of ALWAYS_TRACKED) {
    if (claimed.has(series)) {
      continue;
    }
    const points = trendPoints(p, series, read);
    if (!points.some(pt => pt.value > 0)) {
      continue;
    }
    claimed.add(series);
    const definition = MetricCatalogue.definitionFor(series);
    out.push({
      key: series,
      name: TREND_NAME[series] ?? definition?.displayName ?? series,
      unit: definition?.unit ?? 'words',
      usesAi: false,
      targetLine: null,
      unavailableReason: null,
      points,
    });
  }
  return out;
}

export interface TrendShift {
  from: number;
  to: number;
}

/**
 * A series as its earlier half against its recent half, each averaged. Two points is the
 * minimum: one session has no earlier half to compare with.
 */
export function trendShift(points: readonly TrendPoint[]): TrendShift | null {
  if (points.length < 2) {
    return null;
  }
  const split = Math.floor(points.length / 2);
  const mean = (xs: readonly TrendPoint[]) => xs.reduce((a, b) => a + b.value, 0) / xs.length;
  return { from: mean(points.slice(0, split)), to: mean(points.slice(split)) };
}

export function countedNoun(p: GoalProgress): string {
  const id = p.primaryMetricId;
  const label = p.primaryLabel.toLowerCase();
  if (id === 'total_word_count_per_sentence' || label.includes('total words per session')) {
    return 'total words per session';
  }
  if (label.includes('sentence')) {
    return 'qualifying sentences';
  }
  if (label.includes('initiat')) {
    return 'conversation initiations';
  }
  if (label.includes('turn')) {
    return 'conversation turns';
  }
  if (label.includes('navigat') || label.includes('page')) {
    return 'page navigations';
  }
  if (label.includes('function')) {
    return 'communication functions';
  }
  if (label.includes('word')) {
    return 'different words';
  }
  if (label.includes('question')) {
    return 'questions';
  }
  return p.primaryUnit.replace(' per session', '').toLowerCase();
}

export function measurementNarrative(p: GoalProgress): string {
  const noun = countedNoun(p);
  const label = p.primaryLabel.toLowerCase();
  let base: string;
  if (noun === 'total words per session') {
    base = 'Verbali counts every final word across all completed sentences in the session.';
  } else if (label.includes('sentence')) {
    base = "Verbali counts each completed sentence and checks its final word count against the goal's threshold.";
  } else if (label.includes('initiat')) {
    base = 'Verbali counts each conversation where the child was recorded as the first speaker.';
  } else if (label.includes('turn')) {
    base = 'Verbali counts each turn the child contributes within a conversation.';
  } else if (label.includes('navigat') || label.includes('page')) {
    base = 'Verbali counts each recorded move between board pages.';
  } else if (label.includes('function')) {
    base = "Verbali counts the distinct communication functions detected in the child's messages.";
  } else if (label.includes('word')) {
    base = 'Verbali counts the distinct words the child selected.';
  } else if (label.includes('question')) {
    base = 'Verbali counts the messages detected as questions.';
  } else {
    base = `Verbali counts each recorded ${noun} in the session.`;
  }
  const tail = p.hasTarget
    ? ` The session meets the target when ${p.comparison === 'atMost' ? 'at most' : 'at least'} ${formatValue(p.target as number)} ${noun} are recorded.`
    : ' No target was stated, so this measurement is tracked but not scored.';
  return base + tail;
}

export function sessionRuleText(p: GoalProgress): string {
  const n = p.sessionsRequired;
  return p.sessionRule === 'consecutive' ? `${n} consecutive ${n === 1 ? 'session' : 'sessions'}` : `${n} ${n === 1 ? 'session' : 'sessions'}, any order`;
}
