import {
  FixtureSessionMetricSource,
  GoalOutcome,
  MeasurementResult,
  MetricCatalogue,
  MockSessionMetricSource,
  Result,
  SessionMetricSource,
  evaluateGoal,
  goalSpecification,
  measuredValue,
  metricCanBeScored,
  mockDatasetColumn,
} from '../../../src/features/iep/core';

function source(values: Record<string, number> = {}, session = 'S01') {
  return new MockSessionMetricSource({ [session]: values }, '52-weeks');
}

/**
 * Mock mode only stands in for real use if it refuses the same things real mode refuses.
 */
describe('MockSessionMetricSource', () => {
  describe('the gates hold on both sides', () => {
    it('a metric awaiting a clinical definition is refused', () => {
      const result = source({ conversation_turns: 11 }).measurement(
        MetricCatalogue.conversationTurns.id,
        'S01',
        null,
      );
      expect(result.kind).toBe('unsupported');
      expect((result as { reason: string }).reason.toLowerCase()).toContain('definition');
    });

    it('a metric that is not implemented is refused', () => {
      const result = source({ preferred_page_navigations: 4 }).measurement(
        MetricCatalogue.preferredPageNavigations.id,
        'S01',
        null,
      );
      expect(result.kind).toBe('unsupported');
    });

    it('an unknown metric is refused by name', () => {
      const result = source().measurement('eye_contact_duration', 'S01', null);
      expect(result.kind).toBe('unsupported');
      expect((result as { reason: string }).reason).toContain('eye_contact_duration');
    });
  });

  describe('reading the right column', () => {
    it('an approved metric reads its own column', () => {
      const result = source({ different_words_activated: 12 }).measurement(
        MetricCatalogue.differentWordsActivated.id,
        'S01',
        null,
      );
      expect(measuredValue(result)).toBe(12);
    });

    it('words per sentence does not read the session total column', () => {
      expect(mockDatasetColumn(MetricCatalogue.totalWordCountPerSentence.id, null)).toBeNull();
      const result = source({ total_word_count_per_sentence: 17 }).measurement(
        MetricCatalogue.totalWordCountPerSentence.id,
        'S01',
        null,
      );
      expect(measuredValue(result)).toBeNull();
    });

    it('total AAC button taps reads its own column', () => {
      const result = source({ total_word_activations: 23 }).measurement(
        MetricCatalogue.totalWordActivations.id,
        'S01',
        null,
      );
      expect(measuredValue(result)).toBe(23);
    });

    it("qualifying sentences follow the goal's own bar", () => {
      const s = source({ qualifying_sentences_2plus: 7, qualifying_sentences_3plus: 4 });
      const metric = MetricCatalogue.qualifyingSentences.id;
      expect(measuredValue(s.measurement(metric, 'S01', 2))).toBe(7);
      expect(measuredValue(s.measurement(metric, 'S01', 3))).toBe(4);
      expect(mockDatasetColumn(metric, 2)).toBe('qualifying_sentences_2plus');
    });

    it('a bar outside the dataset is clamped to what exists', () => {
      const metric = MetricCatalogue.qualifyingSentences.id;
      expect(mockDatasetColumn(metric, 4)).toBe('qualifying_sentences_3plus');
      expect(mockDatasetColumn(metric, 1)).toBe('qualifying_sentences_2plus');
    });
  });

  describe('absent data', () => {
    it('an unknown session is no data and names the dataset', () => {
      const result = source().measurement(MetricCatalogue.totalSentences.id, 'S99', null);
      expect(result.kind).toBe('noData');
      expect((result as { reason: string }).reason).toContain('52-weeks');
    });

    it('a column missing from a session is no data, not zero', () => {
      const result = source({ total_sentences: 5 }).measurement(
        MetricCatalogue.requestCount.id,
        'S01',
        null,
      );
      expect(measuredValue(result)).toBeNull();
    });

    it('a measured zero stays a value', () => {
      const result = source({ request_count: 0 }).measurement(
        MetricCatalogue.requestCount.id,
        'S01',
        null,
      );
      expect(measuredValue(result)).toBe(0);
    });
  });

  describe('parity with a live-shaped source', () => {
    it('the same numbers give the same verdict whichever source supplied them', () => {
      const ids = [1, 2, 3, 4].map(i => `S0${i}`);
      const metric = MetricCatalogue.totalSentences.id;
      const specification = goalSpecification(5, 'atLeast', 3);

      const mock = new MockSessionMetricSource(
        Object.fromEntries(ids.map(id => [id, { total_sentences: 6 }])),
        '52-weeks',
      );
      const live = new FixtureSessionMetricSource(
        Object.fromEntries(
          ids.map(id => [id, { [metric]: Result.value(6) } as Record<string, MeasurementResult>]),
        ),
      );

      const outcome = (s: SessionMetricSource): GoalOutcome =>
        evaluateGoal(
          ids.map((id, i) => ({
            sessionId: id,
            dateMs: (i + 1) * 86_400_000,
            result: s.measurement(metric, id, null),
          })),
          specification,
        );

      expect(outcome(mock)).toEqual(outcome(live));
      expect(outcome(mock).status).toEqual({ kind: 'achieved' });
    });

    it('every approved session metric has a dataset column except build_seconds', () => {
      const missing = MetricCatalogue.all
        .filter(m => metricCanBeScored(m) && m.scope === 'session')
        .filter(m => mockDatasetColumn(m.id, 3) === null)
        .map(m => m.id);
      expect(missing).toEqual(['build_seconds']);
    });
  });
});
