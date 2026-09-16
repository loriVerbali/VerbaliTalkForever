import { GoalPlan } from '../../../src/features/iep/model';
import { IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';
import { makeStore } from './helpers';

function addGoal(store: IepMeasurementStore, title: string): GoalPlan {
  const plan: GoalPlan = {
    goalTitle: title,
    goalSummary: 'Child will create 5 sentences with 2 or more words during a session.',
    metrics: [
      {
        id: 'qualifying_sentences',
        name: 'Qualifying sentences',
        category: '',
        definition: '',
        measurementMethod: '',
        targetValue: 5,
        targetUnit: 'sentences',
      },
    ],
    condition: '',
    targetValue: 5,
    targetUnit: 'sentences',
    timeframe: 'per session',
    consecutiveSessions: 3,
    dashboardTitle: 'IEP Goal Progress',
    dashboardTiles: [],
    confidenceNote: '',
    provider: 'test',
    calculation: {
      primaryMetricId: 'qualifying_sentences',
      comparisonOperator: 'atLeast',
      requiredConditions: [],
      requiredSessionCount: 3,
      eligibleEvidenceTypes: ['qualifying_sentences'],
      calculationVersion: 2,
      minimumWordsPerSentence: 2,
    },
  };
  store.addGoal({
    title,
    description: plan.goalSummary,
    targetValue: 5,
    targetUnit: 'sentences',
    timeframe: 'per session',
    plan,
  });
  return plan;
}

/** What survives a relaunch, and what happens when it cannot be read. */
describe('persistence', () => {
  describe('round trip', () => {
    it('a goal and its rule survive a relaunch', async () => {
      const persistence = new MemoryPersistence();
      const store = await makeStore(persistence);
      addGoal(store, 'Sentence work');
      await store.flush();

      const reloaded = await makeStore(persistence);
      const goal = reloaded.goals.find(g => g.title === 'Sentence work');
      const calculation = goal?.plan?.calculation;
      expect(calculation?.primaryMetricId).toBe('qualifying_sentences');
      expect(calculation?.minimumWordsPerSentence).toBe(2);
      expect(calculation?.requiredSessionCount).toBe(3);
      expect(calculation?.calculationVersion).toBe(2);
    });

    it('a goal target date survives a relaunch', async () => {
      const persistence = new MemoryPersistence();
      const store = await makeStore(persistence);
      addGoal(store, 'Dated goal');
      const id = store.goals.find(g => g.title === 'Dated goal')!.id;
      store.setGoalTargetDate(id, 1_800_000_000_000);
      await store.flush();

      const reloaded = await makeStore(persistence);
      expect(reloaded.goals.find(g => g.title === 'Dated goal')?.targetDateMs).toBe(1_800_000_000_000);
    });

    it('recorded sessions survive a relaunch', async () => {
      const persistence = new MemoryPersistence();
      const store = await makeStore(persistence);
      const session = store.startSession();
      const sentence = store.recordWordSelection({ word: 'I', pageId: 'core' });
      store.recordWordSelection({ word: 'want', pageId: 'core', sentenceId: sentence });
      store.completeSentence(sentence, ['I', 'want'], 'play');
      store.endActiveSession();
      await store.flush();

      const reloaded = await makeStore(persistence);
      expect(reloaded.sessions.some(s => s.id === session)).toBe(true);
      expect(reloaded.sentences.filter(s => s.sessionId === session)).toHaveLength(1);
      expect(reloaded.session(session)?.reviewState).toBe('finalized');
    });

    it('a goal added without a calculation is scorable before any relaunch', async () => {
      const store = await makeStore();
      const plan: GoalPlan = {
        goalTitle: 'No calculation',
        goalSummary: 'Child will create 5 sentences per session.',
        metrics: [
          {
            id: 'qualifying_sentences',
            name: 'Qualifying sentences',
            category: '',
            definition: '',
            measurementMethod: '',
            targetValue: 5,
            targetUnit: 'sentences',
          },
        ],
        condition: '',
        targetValue: 5,
        targetUnit: 'sentences',
        timeframe: 'per session',
        consecutiveSessions: null,
        dashboardTitle: '',
        dashboardTiles: [],
        confidenceNote: '',
        provider: 'test',
        calculation: null,
      };
      store.addGoal({ title: 'No calculation', description: plan.goalSummary, targetValue: 5, targetUnit: 'sentences', timeframe: 'per session', plan });
      const goal = store.goals.find(g => g.title === 'No calculation');
      expect(goal?.plan?.calculation?.primaryMetricId).toBe('qualifying_sentences');
    });

    it('display numbers are assigned once and never renumbered', async () => {
      const persistence = new MemoryPersistence();
      const store = await makeStore(persistence);
      addGoal(store, 'One');
      addGoal(store, 'Two');
      addGoal(store, 'Three');
      store.deleteGoal(store.goals.find(g => g.title === 'Two')!.id);
      await store.flush();
      const reloaded = await makeStore(persistence);
      expect(reloaded.goals.map(g => g.displayNumber)).toEqual([1, 3]);
    });
  });

  describe('when the file cannot be read', () => {
    it('an unreadable goals file is not overwritten with defaults', async () => {
      const persistence = new MemoryPersistence();
      const store = await makeStore(persistence);
      addGoal(store, 'Sentence work');
      addGoal(store, 'Turn taking');
      await store.flush();
      persistence.corruptGoals();
      const damaged = persistence.rawGoals();

      const reloaded = await makeStore(persistence);
      addGoal(reloaded, 'Should not be written');
      await reloaded.flush();

      expect(persistence.rawGoals()).toBe(damaged);
      expect(persistence.quarantined).toHaveLength(1);
    });

    it('an unreadable goals file is reported rather than hidden', async () => {
      const persistence = new MemoryPersistence();
      const store = await makeStore(persistence);
      addGoal(store, 'Sentence work');
      await store.flush();
      persistence.corruptGoals();

      const reloaded = await makeStore(persistence);
      expect(reloaded.storageFailure).not.toBeNull();
      expect(reloaded.storageFailure?.what).toBe('goals');
    });

    it('a first launch starts empty without reporting a failure', async () => {
      const store = await makeStore();
      expect(store.goals).toHaveLength(0);
      expect(store.storageFailure).toBeNull();
    });

    it('unreadable measurements are not overwritten on the next write', async () => {
      const persistence = new MemoryPersistence();
      const store = await makeStore(persistence);
      const session = store.startSession();
      const sentence = store.recordWordSelection({ word: 'help', pageId: 'core' });
      store.completeSentence(sentence, ['help'], 'play');
      store.endActiveSession();
      await store.flush();
      persistence.corruptSession(session);
      const damaged = persistence.rawSession(session);

      const reloaded = await makeStore(persistence);
      expect(reloaded.storageFailure?.what).toBe('measurements');

      reloaded.startSession();
      await reloaded.flush();
      expect(persistence.rawSession(session)).toBe(damaged);
      expect(persistence.sessionIds()).toEqual([session]);
    });
  });
});
