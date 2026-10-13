import {
  MetricCatalogue,
  MetricId,
  evaluateGoal,
  goalSpecification,
  measuredValue,
} from '../../../src/features/iep/core';
import { IepMeasurementStore } from '../../../src/features/iep/store';
import { drivenSession, makeStore } from './helpers';

function value(store: IepMeasurementStore, metric: MetricId, session: string, bar: number | null = null) {
  return measuredValue(store.measurement(metric, session, { minimumWordsPerSentence: bar }));
}

/** Each metric, measured from a session driven exactly as the keyboard drives it. */
describe('live measurement', () => {
  describe('deterministic metrics', () => {
    it('sentence metrics match what was tapped', async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      expect(value(store, MetricCatalogue.totalSentences.id, session)).toBe(2);
      expect(value(store, MetricCatalogue.averageWordsPerSentence.id, session)).toBe(2);
      expect(value(store, MetricCatalogue.longestSentenceWords.id, session)).toBe(3);
    });

    it('words per sentence has no session figure', async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      const result = store.measurement(MetricCatalogue.totalWordCountPerSentence.id, session);
      expect(result.kind).toBe('noData');
      expect(store.metricsSnapshot(session).totalWordCountPerSentence).toBe(4);
    });

    it("qualifying sentences follow the goal's own bar", async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      expect(value(store, MetricCatalogue.qualifyingSentences.id, session, 1)).toBe(2);
      expect(value(store, MetricCatalogue.qualifyingSentences.id, session, 3)).toBe(1);
      expect(value(store, MetricCatalogue.qualifyingSentences.id, session, 4)).toBe(0);
    });

    it('word and navigation metrics', async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      expect(value(store, MetricCatalogue.differentWordsActivated.id, session)).toBe(4);
      expect(value(store, MetricCatalogue.pageNavigations.id, session)).toBe(1);
      expect(value(store, MetricCatalogue.differentPagesVisited.id, session)).toBe(1);
    });

    it('total AAC button taps include repeated taps', async () => {
      const store = await makeStore();
      const session = store.startSession();
      const sentence = store.recordWordSelection({ word: 'more', pageId: 'core' });
      store.recordWordSelection({ word: 'more', pageId: 'core', sentenceId: sentence });
      store.recordWordSelection({ word: 'juice', pageId: 'food', sentenceId: sentence });
      store.completeSentence(sentence, ['more', 'more', 'juice'], 'play');
      store.endActiveSession();
      expect(value(store, MetricCatalogue.totalWordActivations.id, session)).toBe(3);
      expect(value(store, MetricCatalogue.differentWordsActivated.id, session)).toBe(2);
    });

    it('qualifying sentences can require POS and independent support', async () => {
      const store = await makeStore();
      const session = store.startSession();
      const sentence = store.recordWordSelection({ word: 'big', pageId: 'descriptions', partOfSpeech: 'adjective' });
      store.recordWordSelection({ word: 'ball', pageId: 'things', sentenceId: sentence, partOfSpeech: 'noun' });
      store.completeSentence(sentence, ['big', 'ball'], 'play');
      expect(store.stopActiveSessionForReview()).toBe(session);

      const result = () =>
        measuredValue(
          store.measurement(MetricCatalogue.qualifyingSentences.id, session, {
            minimumWordsPerSentence: 2,
            requiredPartOfSpeechCounts: { noun: 1, adjective: 1 },
            allowedSupportLevels: ['independent'],
          }),
        );

      expect(result()).toBeNull();
      store.setSupportLevel(sentence, 'independent');
      expect(result()).toBe(1);
      store.setSupportLevel(sentence, 'prompted');
      expect(result()).toBe(0);
    });

    it('a stopped session must be reviewed before finalizing', async () => {
      const store = await makeStore();
      const session = store.startSession();
      const sentence = store.recordWordSelection({ word: 'help', pageId: 'core' });
      store.completeSentence(sentence, ['help'], 'play');

      expect(store.stopActiveSessionForReview()).toBe(session);
      expect(store.activeSession).toBeNull();
      expect(store.session(session)?.reviewState).toBe('awaitingReview');
      expect(store.sentenceReview(sentence)?.supportLevel).toBe('unrated');
      expect(store.finalizeSessionReview(session)).toBe(false);

      store.setSupportLevel(sentence, 'assisted');
      expect(store.finalizeSessionReview(session)).toBe(true);
      expect(store.session(session)?.reviewState).toBe('finalized');
    });

    it('revisiting a page adds a navigation but not a page', async () => {
      const store = await makeStore();
      const session = store.startSession();
      store.recordNavigation('core', 'food');
      store.recordNavigation('food', 'core');
      store.recordNavigation('core', 'food');
      store.endActiveSession();
      expect(value(store, MetricCatalogue.pageNavigations.id, session)).toBe(3);
      expect(value(store, MetricCatalogue.differentPagesVisited.id, session)).toBe(2);
    });

    it('time to build is measured in seconds', async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      const seconds = value(store, MetricCatalogue.buildSeconds.id, session);
      expect(seconds).not.toBeNull();
      expect(seconds!).toBeGreaterThan(0);
      expect(seconds!).toBeLessThan(60);
    });
  });

  describe('the distinction absent values used to lose', () => {
    it('an empty session reports no data rather than zero', async () => {
      const store = await makeStore();
      const session = store.startSession();
      store.endActiveSession();
      for (const metric of [
        MetricCatalogue.totalSentences.id,
        MetricCatalogue.averageWordsPerSentence.id,
        MetricCatalogue.pageNavigations.id,
        MetricCatalogue.differentWordsActivated.id,
      ]) {
        const result = store.measurement(metric, session);
        expect(measuredValue(result)).toBeNull();
        expect(result.kind).toBe('noData');
      }
    });

    it('unanalysed communications are pending or measured, never zero-as-fact', async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      const result = store.measurement(MetricCatalogue.requestCount.id, session);
      expect(['pending', 'value']).toContain(result.kind);
      // The rule-based classifier tags "I want more" as a request, so a value is expected.
      expect(measuredValue(result)).toBe(1);
    });

    it('an unknown metric is unsupported, not zero', async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      const result = store.measurement('eye_contact_duration', session);
      expect(result.kind).toBe('unsupported');
      expect((result as { reason: string }).reason).toContain('eye_contact_duration');
    });

    it('contested metrics refuse to measure', async () => {
      const store = await makeStore();
      const session = drivenSession(store);
      for (const metric of [MetricCatalogue.conversationTurns.id, MetricCatalogue.reciprocalInteractions.id]) {
        expect(store.measurement(metric, session).kind).toBe('unsupported');
      }
    });

    it('an unknown session is no data', async () => {
      const store = await makeStore();
      drivenSession(store);
      expect(store.measurement(MetricCatalogue.totalSentences.id, 'nope').kind).toBe('noData');
    });
  });

  describe('feeding the calculator', () => {
    it('measurements drive the calculator end to end', async () => {
      const store = await makeStore();
      const ids = [0, 1, 2].map(() => drivenSession(store));
      const outcome = evaluateGoal(
        ids.map((id, i) => ({
          sessionId: id,
          dateMs: (i + 1) * 86_400_000,
          result: store.measurement(MetricCatalogue.totalSentences.id, id),
        })),
        goalSpecification(2, 'atLeast', 3),
      );
      expect(outcome.sessionsMeasured).toBe(3);
      expect(outcome.sessionsMeetingTarget).toBe(3);
      expect(outcome.status).toEqual({ kind: 'achieved' });
      expect(outcome.percentOfTarget).toBe(100);
    });
  });

  describe('support review and pending', () => {
    async function unratedSession() {
      const store = await makeStore();
      const session = store.startSession();
      const sentence = store.recordWordSelection({ word: 'I', pageId: 'core' });
      store.recordWordSelection({ word: 'go', pageId: 'core', sentenceId: sentence });
      store.completeSentence(sentence, ['I', 'go'], 'play');
      store.stopActiveSessionForReview();
      return { store, session, sentence };
    }

    it('an unrated session is pending for a support-restricted goal', async () => {
      const { store, session } = await unratedSession();
      const result = store.measurement(MetricCatalogue.qualifyingSentences.id, session, {
        minimumWordsPerSentence: 2,
        allowedSupportLevels: ['independent'],
      });
      expect(result.kind).toBe('pending');
    });

    it('an unrated session still scores a goal with no support rule', async () => {
      const { store, session } = await unratedSession();
      expect(value(store, MetricCatalogue.qualifyingSentences.id, session, 2)).toBe(1);
    });

    it('rating every sentence makes the number knowable', async () => {
      const { store, session, sentence } = await unratedSession();
      store.setSupportLevel(sentence, 'prompted');
      expect(
        measuredValue(
          store.measurement(MetricCatalogue.qualifyingSentences.id, session, {
            minimumWordsPerSentence: 2,
            allowedSupportLevels: ['independent'],
          }),
        ),
      ).toBe(0);
    });
  });
});
