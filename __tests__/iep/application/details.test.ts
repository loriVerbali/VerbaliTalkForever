/**
 * The trend cards under "Metrics behind the goal": which metrics get one, what each is
 * called, and when a card explains itself instead of drawing. Then the figures behind the
 * tiles under "What explains this goal": each states its minimum evidence and gives
 * nothing rather than a number below it.
 */

import { GoalProgress, MetricTarget } from '../../../src/features/iep/application/goalProgress';
import {
  SUPPORTING_PANEL_ORDER,
  SentenceSample,
  TrendSeriesId,
  WORDS_PER_SESSION_SERIES,
  buildTimeChanges,
  durationsByLength,
  metricTrends,
  sentenceLengthShares,
  supportingMetrics,
  trendShift,
} from '../../../src/features/iep/application/details';
import { MetricCatalogue, MetricVisualStyle, Result } from '../../../src/features/iep/core';

/** Weekly Monday sessions from 22 June 2026. */
const day = (n: number) => new Date(2026, 5, 22 + 7 * n, 10).getTime();

function target(
  id: string,
  opts: { name?: string; style?: MetricVisualStyle; targetLine?: number | null; reason?: string | null; unsupported?: boolean } = {},
): MetricTarget {
  const definition = opts.unsupported ? null : MetricCatalogue.definitionFor(id) ?? null;
  return {
    metric: { id, name: opts.name ?? definition?.displayName ?? id, category: '', definition: '', measurementMethod: '', targetUnit: definition?.unit ?? 'items' },
    definition,
    targetValue: opts.targetLine ?? null,
    role: 'supporting',
    isSupported: definition !== null,
    result: Result.noData('fixture'),
    presentation: {
      metricId: id,
      displayName: definition?.displayName ?? id,
      unit: definition?.unit ?? '',
      style: opts.style ?? 'contextualTrend',
      targetLine: opts.targetLine ?? null,
      rule: '',
      unavailableReason: opts.reason ?? null,
    },
  };
}

function progress(primaryMetricId: string, metricTargets: MetricTarget[], sessionCount = 4): GoalProgress {
  return {
    primaryMetricId,
    metricTargets,
    sessions: Array.from({ length: sessionCount }, (_, i) => ({ sessionId: `S${i + 1}`, dateMs: day(i) })),
  } as unknown as GoalProgress;
}

function reader(values: Record<string, number[]>): (series: TrendSeriesId, sessionId: string) => number | null {
  return (series, sessionId) => {
    const v = values[series]?.[Number(sessionId.slice(1)) - 1];
    return v === undefined ? null : v;
  };
}

describe('metricTrends', () => {
  const values = {
    total_sentences: [11, 11, 12, 12],
    average_words_per_sentence: [2.1, 2.1, 2.3, 2.3],
    [WORDS_PER_SESSION_SERIES]: [23, 23, 28, 28],
  };

  it("charts the plan's other metrics, never the goal's own measure, then the language statistics", () => {
    const p = progress('qualifying_sentences', [
      target('qualifying_sentences', { style: 'goalProgress', targetLine: 2 }),
      target('total_sentences'),
    ]);
    const trends = metricTrends(p, reader(values));
    expect(trends.map(t => [t.key, t.name])).toEqual([
      ['total_sentences', 'Total sentences per session'],
      ['average_words_per_sentence', 'Average words per sentence'],
      [WORDS_PER_SESSION_SERIES, 'Average words per session'],
    ]);
    expect(trends[0].points.map(pt => pt.value)).toEqual([11, 11, 12, 12]);
    expect(trends[0].points[3]).toEqual({ sessionId: 'S4', dateMs: day(3), value: 12 });
    expect(trends[2].unit).toBe('words');
    expect(trends.every(t => t.unavailableReason === null && t.targetLine === null)).toBe(true);
  });

  it('charts words per sentence as the session average, under that name, without the per-sentence bar', () => {
    const p = progress('qualifying_sentences', [
      target('total_word_count_per_sentence', { name: 'Words per sentence', style: 'goalProgress', targetLine: 2 }),
    ]);
    const trends = metricTrends(p, reader(values));
    expect(trends.map(t => t.key)).toEqual(['average_words_per_sentence', WORDS_PER_SESSION_SERIES]);
    expect(trends[0].name).toBe('Average words per sentence');
    expect(trends[0].targetLine).toBeNull();
    expect(trends[0].points.map(pt => pt.value)).toEqual([2.1, 2.1, 2.3, 2.3]);
  });

  it('keeps the target line for a metric scored on its own series', () => {
    const p = progress('qualifying_sentences', [target('total_sentences', { style: 'conditionProgress', targetLine: 10 })]);
    expect(metricTrends(p, reader(values))[0].targetLine).toBe(10);
  });

  it('draws a series once when the plan names it twice', () => {
    const p = progress('total_sentences', [
      target('average_words_per_sentence', { style: 'conditionProgress', targetLine: 2 }),
      target('total_word_count_per_sentence', { name: 'Words per sentence' }),
    ]);
    const trends = metricTrends(p, reader(values));
    expect(trends.map(t => t.key)).toEqual(['average_words_per_sentence', WORDS_PER_SESSION_SERIES]);
    expect(trends[0].targetLine).toBe(2);
  });

  it('says why instead of charting a metric the app cannot measure', () => {
    const p = progress('total_sentences', [
      target('peer_reciprocal_interactions', { name: 'Peer interactions', unsupported: true, style: 'unsupported', reason: 'Not measured by the app.' }),
    ]);
    const [card] = metricTrends(p, reader(values));
    expect(card).toMatchObject({ key: 'peer_reciprocal_interactions', name: 'Peer interactions', unavailableReason: 'Not measured by the app.', points: [] });
  });

  it('says when a planned metric recorded nothing in the period', () => {
    const [card] = metricTrends(progress('total_sentences', [target('page_navigations')]), reader(values));
    expect(card.key).toBe('page_navigations');
    expect(card.unavailableReason).toBe('Not measured in this period');
  });

  it('leaves a language statistic out when every session recorded zero', () => {
    const trends = metricTrends(progress('total_sentences', []), reader({ ...values, [WORDS_PER_SESSION_SERIES]: [0, 0, 0, 0] }));
    expect(trends.map(t => t.key)).toEqual(['average_words_per_sentence']);
  });

  it('marks AI-assisted metrics', () => {
    const trends = metricTrends(progress('total_sentences', [target('request_count')]), reader({ ...values, request_count: [1, 2, 2, 3] }));
    expect(trends[0]).toMatchObject({ key: 'request_count', usesAi: true, targetLine: null });
  });
});

const sample = (dayIndex: number, words: number, seconds: number): SentenceSample => ({ dateMs: day(dayIndex), words, seconds });

describe('sentenceLengthShares', () => {
  it('counts every sample to date into three buckets with rounded percentages', () => {
    const samples = [1, 1, 2, 3, 4, 5, 1].map((words, i) => sample(i, words, 2));
    expect(sentenceLengthShares(samples)).toEqual([
      { label: '1 word', count: 3, percent: 43 },
      { label: '2 words', count: 1, percent: 14 },
      { label: '3+ words', count: 3, percent: 43 },
    ]);
  });

  it('is empty without samples', () => {
    expect(sentenceLengthShares([])).toEqual([]);
  });
});

describe('buildTimeChanges', () => {
  /** Eight one-word sentences, one a week: 4s each in the earlier half, 2s each recently. */
  const oneWord = [4, 4, 4, 4, 2, 2, 2, 2].map((seconds, i) => sample(i, 1, seconds));

  it('compares the earlier half with the recent half for each sentence length', () => {
    expect(buildTimeChanges(oneWord)).toEqual([
      { label: '1 word', earlierSeconds: 4, recentSeconds: 2, earlierCount: 4, recentCount: 4, percentChange: -50 },
    ]);
  });

  it('needs eight timed sentences overall and three of a length in each half', () => {
    expect(buildTimeChanges(oneWord.slice(0, 7))).toEqual([]);
    // Two-word sentences only in the recent half: nothing earlier to compare them with.
    const twoWords = [3, 3, 3].map((seconds, i) => sample(10 + i, 2, seconds));
    const changes = buildTimeChanges([...oneWord, ...twoWords]);
    expect(changes.map(c => c.label)).toEqual(['1 word']);
    expect(changes[0]).toMatchObject({ earlierCount: 5, recentCount: 3, percentChange: -44 });
  });

  it('ignores untimed sentences and reports no change at equal means', () => {
    const flat = [...oneWord.map(s => ({ ...s, seconds: 3 })), sample(9, 1, 0)];
    expect(buildTimeChanges(flat)).toEqual([
      { label: '1 word', earlierSeconds: 3, recentSeconds: 3, earlierCount: 4, recentCount: 4, percentChange: 0 },
    ]);
  });
});

describe('durationsByLength', () => {
  it('averages timed sentences by length, needing three of each', () => {
    const samples = [
      ...[2, 2, 2].map((seconds, i) => sample(i, 1, seconds)),
      ...[5, 7].map((seconds, i) => sample(i, 2, seconds)),
      ...[6, 8, 10].map((seconds, i) => sample(i, 5, seconds)),
      sample(0, 1, 0),
    ];
    expect(durationsByLength(samples)).toEqual([
      { label: '1 word', averageSeconds: 2, count: 3 },
      { label: '4+ words', averageSeconds: 8, count: 3 },
    ]);
  });
});

describe('trendShift', () => {
  const points = (values: number[]) => values.map((value, i) => ({ sessionId: `S${i + 1}`, dateMs: day(i), value }));

  it('averages the earlier half against the recent half, the odd point going to recent', () => {
    expect(trendShift(points([2, 2, 3, 5]))).toEqual({ from: 2, to: 4 });
    expect(trendShift(points([2, 2, 3]))).toEqual({ from: 2, to: 2.5 });
  });

  it('needs two points', () => {
    expect(trendShift([])).toBeNull();
    expect(trendShift(points([3]))).toBeNull();
  });
});

describe('supportingMetrics', () => {
  const series = (entries: Record<string, number[]>) => new Map<TrendSeriesId, number[]>(Object.entries(entries) as Array<[TrendSeriesId, number[]]>);

  it('lists average words per session with the other language statistics', () => {
    const panel = supportingMetrics(
      series({
        total_sentences: [11, 11, 12, 12],
        average_words_per_sentence: [2.1, 2.1, 2.3, 2.3],
        [WORDS_PER_SESSION_SERIES]: [23, 23, 28, 28],
        longest_sentence_words: [4, 5, 5, 6],
      }),
    );
    expect(panel.map(m => [m.id, m.name, m.value, m.unit])).toEqual([
      ['total_sentences', 'Average sentences per session', '11.5', 'sentences'],
      ['average_words_per_sentence', 'Average words per sentence', '2.2', 'words'],
      [WORDS_PER_SESSION_SERIES, 'Average words per session', '25.5', 'words'],
      ['longest_sentence_words', 'Longest sentence', '6', 'words'],
    ]);
    expect(panel[2].aggregation).toBe('average');
  });

  it('leaves out a series with no recorded values', () => {
    const panel = supportingMetrics(series({ total_sentences: [3], [WORDS_PER_SESSION_SERIES]: [] }));
    expect(panel.map(m => m.id)).toEqual(['total_sentences']);
  });

  it('places words per session directly after words per sentence in the panel order', () => {
    const i = SUPPORTING_PANEL_ORDER.indexOf('average_words_per_sentence');
    expect(SUPPORTING_PANEL_ORDER[i + 1]).toBe(WORDS_PER_SESSION_SERIES);
  });
});
