/**
 * Detail tiles and supporting figures. Each derivation states its minimum evidence and
 * returns null rather than a number when that minimum is not met.
 */

import { Aggregation, MetricCatalogue, MetricId, measuredValue } from '../core';
import { classifyPartOfSpeech } from '../model/partOfSpeech';
import { GoalProgress, formatValue } from './goalProgress';
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

export interface LengthShares {
  one: number;
  two: number;
  threePlus: number;
  total: number;
}

const bucket = (w: number): keyof Omit<LengthShares, 'total'> => (w <= 1 ? 'one' : w === 2 ? 'two' : 'threePlus');

/** Share of sentences by length over the last eight sessions' samples. */
export function sentenceLengthShares(samples: readonly SentenceSample[], lastSessionDates: readonly number[]): LengthShares | null {
  const recent = new Set(lastSessionDates.slice(-8).map(startOfDay));
  const inRecent = recent.size > 0 ? samples.filter(s => recent.has(startOfDay(s.dateMs))) : samples;
  if (inRecent.length === 0) {
    return null;
  }
  const shares: LengthShares = { one: 0, two: 0, threePlus: 0, total: inRecent.length };
  for (const s of inRecent) {
    shares[bucket(s.words)] += 1;
  }
  return shares;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function averageBuildSeconds(samples: readonly SentenceSample[]): number | null {
  const timed = samples.filter(s => s.seconds > 0);
  if (timed.length === 0) {
    return null;
  }
  return timed.reduce((a, b) => a + b.seconds, 0) / timed.length;
}

export interface BuildTimeChange {
  earlierSeconds: number;
  recentSeconds: number;
  /** Negative means faster. */
  percentChange: number;
  minimumWords: number;
}

/** Needs at least eight samples with three in each half. */
export function buildTimeChange(samples: readonly SentenceSample[], minimumWords: number): BuildTimeChange | null {
  const eligible = samples.filter(s => s.seconds > 0 && s.words >= minimumWords).sort((a, b) => a.dateMs - b.dateMs);
  if (eligible.length < 8) {
    return null;
  }
  const half = Math.floor(eligible.length / 2);
  const earlier = eligible.slice(0, half);
  const recent = eligible.slice(half);
  if (earlier.length < 3 || recent.length < 3) {
    return null;
  }
  const mean = (xs: SentenceSample[]) => xs.reduce((a, b) => a + b.seconds, 0) / xs.length;
  const e = mean(earlier);
  const r = mean(recent);
  return { earlierSeconds: e, recentSeconds: r, percentChange: e > 0 ? Math.round(((r - e) / e) * 100) : 0, minimumWords };
}

export interface DurationBucket {
  label: string;
  averageSeconds: number;
  count: number;
}

/** Average build time by sentence length; buckets need at least three samples. */
export function durationsByLength(samples: readonly SentenceSample[]): DurationBucket[] {
  const groups = new Map<string, SentenceSample[]>();
  for (const s of samples) {
    if (s.seconds <= 0) {
      continue;
    }
    const label = s.words <= 1 ? '1 word' : s.words === 2 ? '2 words' : s.words === 3 ? '3 words' : '4+ words';
    const list = groups.get(label) ?? [];
    list.push(s);
    groups.set(label, list);
  }
  return ['1 word', '2 words', '3 words', '4+ words']
    .map(label => ({ label, list: groups.get(label) ?? [] }))
    .filter(g => g.list.length >= 3)
    .map(g => ({ label: g.label, averageSeconds: g.list.reduce((a, b) => a + b.seconds, 0) / g.list.length, count: g.list.length }));
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

export interface SupportingMetric {
  id: MetricId;
  name: string;
  unit: string;
  value: string;
  aggregation: Aggregation;
}

export const SUPPORTING_PANEL_ORDER: readonly MetricId[] = [
  'total_sentences',
  'average_words_per_sentence',
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

/** Aggregates per-session values by each metric's own aggregation rule. */
export function supportingMetrics(valuesByMetric: ReadonlyMap<MetricId, readonly number[]>): SupportingMetric[] {
  const out: SupportingMetric[] = [];
  for (const id of SUPPORTING_PANEL_ORDER) {
    const def = MetricCatalogue.definitionFor(id);
    const values = valuesByMetric.get(id);
    if (!def || !values || values.length === 0) {
      continue;
    }
    let value: number;
    switch (def.aggregation) {
      case 'maximum':
        value = Math.max(...values);
        break;
      case 'total':
        value = values.reduce((a, b) => a + b, 0);
        break;
      case 'latest':
        value = values[values.length - 1];
        break;
      default:
        value = values.reduce((a, b) => a + b, 0) / values.length;
    }
    out.push({ id, name: PANEL_NAME[id] ?? def.displayName, unit: def.unit, value: formatValue(value), aggregation: def.aggregation });
  }
  return out;
}

/** Latest session outcome text for the calculation block. */
export function calculationExplanation(p: GoalProgress): string | null {
  const latest = p.sessions.length > 0 ? p.sessions[p.sessions.length - 1] : null;
  const latestValue = latest ? measuredValue(latest.result) : null;
  if (!p.hasTarget || latest === null || latestValue === null || (p.target as number) <= 0) {
    return null;
  }
  if (p.sessionsRequired > 1) {
    const q = p.sessionRule === 'consecutive' ? p.outcome.currentStreak : p.outcome.sessionsMeetingTarget;
    const label = p.sessionRule === 'consecutive' ? 'consecutive successful sessions' : 'successful sessions';
    return `${q} ${label} ÷ the required ${p.sessionsRequired} = ${Math.min(100, Math.round((q / p.sessionsRequired) * 100))}%.`;
  }
  const raw = Math.round((latestValue / (p.target as number)) * 100);
  const base = `${formatValue(latestValue)} ${p.primaryLabel.toLowerCase()} ÷ goal threshold of ${formatValue(p.target as number)} = ${raw}%`;
  return raw > 100 ? `${base}, shown as 100%.` : `${base}.`;
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
