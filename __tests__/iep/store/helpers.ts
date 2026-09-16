import { sequentialIds } from '../../../src/features/iep/model';
import { Clock, IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';

/** A clock that advances a fixed step on every read so durations are positive and deterministic. */
export function steppingClock(startMs = 1_700_000_000_000, stepMs = 1500): Clock & { advance(ms: number): void } {
  let now = startMs;
  return {
    now() {
      now += stepMs;
      return now;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

export async function makeStore(persistence = new MemoryPersistence(), clock: Clock = steppingClock()) {
  const store = new IepMeasurementStore(persistence, { clock, ids: sequentialIds() });
  await store.load();
  return store;
}

/** "I want more" then "juice", both played, with one page move in between. */
export function drivenSession(store: IepMeasurementStore): string {
  const session = store.startSession();
  const first = store.recordWordSelection({ word: 'I', pageId: 'core' });
  store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: first });
  store.recordWordSelection({ word: 'more', pageId: 'core', sentenceId: first });
  store.completeSentence(first, ['I', 'want', 'more'], 'play');

  store.recordNavigation('core', 'food');
  const second = store.recordWordSelection({ word: 'juice', pageId: 'food' });
  store.completeSentence(second, ['juice'], 'play');
  store.endActiveSession();
  return session;
}

/** Recorded on 2026-08-04 for "Child will create 5 sentences with 2 or more words during a session." */
export const plannerSentenceGoal = {
  goalTitle: 'Sentence Complexity',
  goalSummary: 'Child will create 5 sentences with 2 or more words during a session.',
  metrics: [
    {
      id: 'sentences',
      name: 'Number of sentences',
      category: 'Communication production',
      definition: 'Completed AAC sentences during a tracked session.',
      measurementMethod: 'Count completed AAC sentences.',
    },
    {
      id: 'words_per_sentence',
      name: 'Words per sentence',
      category: 'Communication production',
      definition: 'Final word count for each completed AAC sentence.',
      measurementMethod: 'Count final words per sentence.',
    },
    {
      id: 'qualifying_sentences_2plus',
      name: 'Qualifying sentences',
      category: 'Communication production',
      definition: "Sentences reaching the goal's word threshold.",
      measurementMethod: 'Count sentences of two or more words.',
    },
  ],
  condition: 'during a treatment session',
  targetValue: 5,
  targetUnit: 'sentences',
  timeframe: 'by the target date',
  consecutiveSessions: 3,
  dashboardTitle: 'IEP Goal Progress',
  dashboardTiles: ['Progress', 'Current session', 'Trend'],
  confidenceNote: 'Review the goal details before saving.',
  provider: 'recorded-fixture',
  status: 'ok',
  primaryMetricID: 'sentences',
  ambiguities: [],
};

/** A goal naming a measure the app cannot produce at all. */
export const plannerUnmeasurableGoal = {
  goalTitle: 'Joint Attention',
  goalSummary: 'Child will sustain eye contact for 5 seconds during a session.',
  metrics: [
    {
      id: 'eye_contact_duration',
      name: 'Eye contact duration',
      category: 'Interaction',
      definition: 'Seconds of sustained eye contact.',
      measurementMethod: 'Observed by the therapist.',
    },
  ],
  condition: '',
  targetValue: 5,
  targetUnit: 'seconds',
  timeframe: 'by the target date',
  consecutiveSessions: 3,
  dashboardTitle: 'IEP Goal Progress',
  dashboardTiles: ['Progress'],
  confidenceNote: 'Review the goal details before saving.',
  provider: 'recorded-fixture',
  status: 'ok',
  primaryMetricID: 'eye_contact_duration',
  ambiguities: ['Eye contact is not captured by the device.'],
};
