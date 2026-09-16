import { makeStore } from './helpers';

/** Proves the app counts what a therapist would count. */
describe('sentence counting', () => {
  it('two sentences are counted with the right lengths', async () => {
    const store = await makeStore();
    const session = store.startSession();

    const first = store.recordWordSelection({ word: 'I', pageId: 'core' });
    store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: first });
    store.recordWordSelection({ word: 'more', pageId: 'core', sentenceId: first });
    store.completeSentence(first, ['I', 'want', 'more'], 'play');

    const second = store.recordWordSelection({ word: 'juice', pageId: 'food' });
    store.completeSentence(second, ['juice'], 'play');
    store.endActiveSession();

    expect(store.sentences).toHaveLength(2);
    expect(store.sentences[0].finalWords).toEqual(['I', 'want', 'more']);
    expect(store.sentences[1].finalWords).toEqual(['juice']);

    const metrics = store.metricsSnapshot(session);
    expect(metrics.sentenceCount).toBe(2);
    expect(metrics.averageWordsPerSentence).toBeCloseTo(2, 3);
    expect(metrics.uniqueWordsActivated).toBe(4);
  });

  it('only sentences meeting the goal threshold qualify', async () => {
    const store = await makeStore();
    const session = store.startSession();
    const first = store.recordWordSelection({ word: 'I', pageId: 'core' });
    store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: first });
    store.recordWordSelection({ word: 'more', pageId: 'core', sentenceId: first });
    store.completeSentence(first, ['I', 'want', 'more'], 'play');
    const second = store.recordWordSelection({ word: 'juice', pageId: 'food' });
    store.completeSentence(second, ['juice'], 'play');

    expect(store.metricsSnapshot(session, 3).qualifyingSentenceCount).toBe(1);
    expect(store.metricsSnapshot(session, 2).qualifyingSentenceCount).toBe(1);
    expect(store.metricsSnapshot(session, 1).qualifyingSentenceCount).toBe(2);
  });

  it('an abandoned sentence is still recorded but marked', async () => {
    const store = await makeStore();
    const session = store.startSession();
    const played = store.recordWordSelection({ word: 'I', pageId: 'core' });
    store.recordWordSelection({ word: 'go', pageId: 'core', sentenceId: played });
    store.completeSentence(played, ['I', 'go'], 'play');
    const abandoned = store.recordWordSelection({ word: 'help', pageId: 'core' });
    store.completeSentence(abandoned, ['help'], 'inactivity');

    expect(store.metricsSnapshot(session).sentenceCount).toBe(2);
    expect(store.sentences.filter(s => s.playPressed)).toHaveLength(1);
    expect(store.sentences.filter(s => s.wasAbandoned)).toHaveLength(1);
  });

  it('removed words do not count toward sentence length', async () => {
    const store = await makeStore();
    const session = store.startSession();
    const sentence = store.recordWordSelection({ word: 'I', pageId: 'core' });
    store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: sentence });
    store.recordWordSelection({ word: 'juice', pageId: 'food', sentenceId: sentence });
    store.recordWordRemoval({ word: 'juice', pageId: 'food', sentenceId: sentence });
    store.completeSentence(sentence, ['I', 'want'], 'play');

    expect(store.sentences[0].finalWords).toHaveLength(2);
    expect(store.sentences[0].wordsRemoved).toHaveLength(1);
    expect(store.metricsSnapshot(session, 3).qualifyingSentenceCount).toBe(0);
  });

  it('an empty sentence is not recorded', async () => {
    const store = await makeStore();
    const session = store.startSession();
    store.completeSentence(null, [], 'play');
    store.completeSentence('unknown', ['ghost'], 'play');
    expect(store.metricsSnapshot(session).sentenceCount).toBe(0);
  });

  it('stopping for review flushes an unfinished draft as an abandoned sentence', async () => {
    const store = await makeStore();
    store.startSession();
    const sentence = store.recordWordSelection({ word: 'I', pageId: 'core' });
    store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: sentence });
    store.recordWordSelection({ word: 'juice', pageId: 'core', sentenceId: sentence });
    store.recordWordRemoval({ word: 'juice', pageId: 'core', sentenceId: sentence });
    store.stopActiveSessionForReview();
    expect(store.sentences).toHaveLength(1);
    expect(store.sentences[0].finalWords).toEqual(['I', 'want']);
    expect(store.sentences[0].wasAbandoned).toBe(true);
  });

  it('the store starts empty', async () => {
    const store = await makeStore();
    expect(store.sentences).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
    expect(store.goals).toHaveLength(0);
    expect(store.storageFailure).toBeNull();
  });
});
