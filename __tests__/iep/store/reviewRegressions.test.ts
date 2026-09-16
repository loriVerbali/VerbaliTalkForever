import { IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';
import { sequentialIds } from '../../../src/features/iep/model';
import { makeStore, steppingClock } from './helpers';

/** Regressions from the IEP code review: recording must never invent or destroy evidence. */
describe('conversation initiation', () => {
  it('the first turn seen decides the initiator, and a second report of the same conversation is ignored', async () => {
    const store = await makeStore();
    const sessionId = store.startSession();
    const turn = (id: string, speaker: string) => ({
      id,
      sessionId,
      conversationId: 'conv1',
      speaker,
      startedAtMs: 1,
      endedAtMs: null,
      content: null,
      childResponded: null,
      timeUntilNextTurnMs: null,
    });
    store.recordTurn(turn('t1', 'partner'));
    store.recordTurn(turn('t2', 'child'));
    // A hook that believes it saw the conversation first must not add a second row.
    store.recordConversation({ id: 'conv1', sessionId, startedAtMs: 2, endedAtMs: null, firstSpeaker: 'child', partnerType: 'partner', turnIds: [] });

    const conversations = store.snapshot().conversations.filter(c => c.sessionId === sessionId);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].firstSpeaker).toBe('partner');
    expect(conversations[0].turnIds).toEqual(['t1', 't2']);
  });
});

describe('AI event analysis', () => {
  it('never overwrites a clinician\'s manual function choice', async () => {
    const store = await makeStore();
    store.startSession();
    const id = store.recordWordSelection({ word: 'I', pageId: 'core' });
    store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: id });
    store.recordWordSelection({ word: 'juice', pageId: 'core', sentenceId: id });
    store.completeSentence(id, ['I', 'want', 'juice'], 'play');
    store.stopActiveSessionForReview();

    store.setCommunicationFunction(id, 'protest');
    const communication = store.communications.find(c => c.sentenceId === id)!;
    store.applyAiEventAnalysis([{ eventId: communication.id, status: 'ok', communicationFunction: 'comment', communicationFunctionConfidence: 0.9 }]);

    const after = store.communications.find(c => c.sentenceId === id)!;
    expect(after.analysis.communicationFunction).toBe('protest');
    expect(after.analysis.functionSource).toBe('manual');
  });
});

describe('load failures', () => {
  it('a read that throws blocks goal writes instead of replacing the file with an empty list', async () => {
    const persistence = new MemoryPersistence();
    persistence.loadGoals = async () => {
      throw new Error('EIO');
    };
    const store = new IepMeasurementStore(persistence, { clock: steppingClock(), ids: sequentialIds() });
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.isLoaded).toBe(true);
    expect(store.storageFailure).not.toBeNull();

    store.addGoal({ title: 'New', description: 'Child will create 5 sentences.', targetValue: 5, targetUnit: 'sentences', timeframe: 'per session' });
    await store.flush();
    expect(persistence.saveCount).toBe(0);
    expect(persistence.rawGoals()).toBeNull();
  });
});

describe('session writes', () => {
  it('coalesces a burst of taps into one archive write and flush() writes what is pending', async () => {
    const persistence = new MemoryPersistence();
    const store = await makeStore(persistence);
    store.startSession();
    await store.flush();
    const afterStart = persistence.saveCount;

    const id = store.recordWordSelection({ word: 'I', pageId: 'core' });
    store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: id });
    store.recordWordSelection({ word: 'more', pageId: 'core', sentenceId: id });
    store.completeSentence(id, ['I', 'want', 'more'], 'play');
    await store.flush();

    expect(persistence.saveCount).toBe(afterStart + 1);
    const reloaded = await makeStore(persistence);
    expect(reloaded.snapshot().sentences).toHaveLength(1);
    expect(reloaded.snapshot().sentences[0].finalWords).toEqual(['I', 'want', 'more']);
  });
});
