/**
 * One metric for one session, measured under the goal's plan options exactly as the goal's
 * own sessions are scored. The goal screen reads every supporting series through this, so
 * a trend card or panel figure can never disagree with the headline.
 */

import { buildGoalProgress, measureSessionMetric, reportingPeriod } from '../../../src/features/iep/application';
import { MetricCatalogue, measuredValue } from '../../../src/features/iep/core';
import { loadMockDataset } from '../../../src/features/iep/mock/mockDataset';
import { GoalPlan, IepGoal, sequentialIds } from '../../../src/features/iep/model';
import { IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';
import { DEFAULT_LIVE_MINIMUM_WORDS, liveMeasurement } from '../../../src/features/iep/store/liveMeasurement';

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();
const QUALIFYING = MetricCatalogue.qualifyingSentences.id;

/** A two-word bar, below the live default of three. */
function plan(overrides: Partial<GoalPlan> = {}): GoalPlan {
  return {
    goalTitle: 'Sentence Complexity',
    goalSummary: 'Child will create 2 sentences with 2 or more words during a session.',
    metrics: [
      { id: 'qualifying_sentences', name: 'Qualifying sentences', category: '', definition: '', measurementMethod: '', role: 'direct', targetValue: 2, targetUnit: 'sentences', constraints: { minimumWordsPerSentence: 2 } },
      { id: 'total_sentences', name: 'Total sentences', category: '', definition: '', measurementMethod: '', role: 'supporting' },
    ],
    condition: 'Each sentence has at least 2 words.',
    targetValue: 2,
    targetUnit: 'sentences',
    timeframe: 'per session',
    consecutiveSessions: 2,
    dashboardTitle: '',
    dashboardTiles: [],
    confidenceNote: '',
    provider: 'gemini',
    calculation: {
      primaryMetricId: 'qualifying_sentences',
      comparisonOperator: 'atLeast',
      requiredConditions: ['Each sentence has at least 2 words.'],
      requiredSessionCount: 2,
      eligibleEvidenceTypes: ['qualifying_sentences', 'total_sentences'],
      calculationVersion: 3,
      minimumWordsPerSentence: 2,
    },
    ...overrides,
  };
}

/** One recorded session of the given sentence lengths, tracked for a goal with the plan. */
async function liveSession(sentenceLengths: number[], goalPlan: GoalPlan = plan()) {
  let now = NOW - 3 * DAY;
  const store = new IepMeasurementStore(new MemoryPersistence(), { clock: { now: () => (now += 1000) }, ids: sequentialIds() });
  await store.load();
  const goal = store.addGoal({ title: goalPlan.goalTitle, description: goalPlan.goalSummary, targetValue: goalPlan.targetValue, targetUnit: goalPlan.targetUnit, timeframe: goalPlan.timeframe, plan: goalPlan }) as IepGoal;
  const sessionId = store.startSession({ partnerType: 'slp', treatmentContext: 'therapy', trackedGoalIds: [goal.id] });
  for (const len of sentenceLengths) {
    let id: string | null = null;
    for (let w = 0; w < len; w += 1) {
      id = store.recordWordSelection({ word: `w${w}`, pageId: 'core', sentenceId: id });
    }
    store.completeSentence(id, Array.from({ length: len }, (_, w) => `w${w}`), 'play');
  }
  store.endActiveSession();
  return { goal, sessionId, context: { kind: 'live' as const, state: store.snapshot() } };
}

describe('measureSessionMetric (live)', () => {
  it("counts qualifying sentences against the plan's word bar, not the live default", async () => {
    const { goal, sessionId, context } = await liveSession([2, 1, 3]);
    expect(DEFAULT_LIVE_MINIMUM_WORDS).toBe(3);
    // Without the plan's options the two-word sentence would be dropped.
    expect(measuredValue(liveMeasurement(context.state, QUALIFYING, sessionId))).toBe(1);
    expect(measuredValue(measureSessionMetric(goal, context, QUALIFYING, sessionId))).toBe(2);
  });

  it('gives the same result buildGoalProgress scores the session with', async () => {
    const { goal, sessionId, context } = await liveSession([2, 1, 3]);
    const p = buildGoalProgress(goal, reportingPeriod('12w', NOW), context);
    expect(p.minimumWordsPerSentence).toBe(2);
    expect(measureSessionMetric(goal, context, p.primaryMetricId, sessionId)).toEqual(p.sessions[0].result);
    expect(measuredValue(measureSessionMetric(goal, context, MetricCatalogue.totalSentences.id, sessionId))).toBe(3);
    expect(measuredValue(measureSessionMetric(goal, context, MetricCatalogue.averageWordsPerSentence.id, sessionId))).toBe(2);
  });

  it("applies the plan's support-level restriction", async () => {
    const restricted = plan({ calculation: { ...plan().calculation!, allowedSupportLevels: ['independent'] } });
    const { goal, sessionId, context } = await liveSession([2, 2], restricted);
    // Nobody has rated the sentences yet: pending, never a count.
    expect(measuredValue(liveMeasurement(context.state, QUALIFYING, sessionId, { minimumWordsPerSentence: 2 }))).toBe(2);
    expect(measureSessionMetric(goal, context, QUALIFYING, sessionId).kind).toBe('pending');
  });
});

describe('measureSessionMetric (mock)', () => {
  const dataset = loadMockDataset('standard');
  const goalWithBar = (bar: number): IepGoal => ({
    id: 'g-mock', title: 'Meaningful 2-word sentences', description: dataset.goalsById.get('G04')!.statement,
    targetValue: 5, targetUnit: 'sentences', timeframe: 'per session', isActive: true, createdAtMs: NOW,
    plan: plan({ targetValue: 5, calculation: { ...plan().calculation!, minimumWordsPerSentence: bar } }),
    displayNumber: 1, mockDataSourceId: 'G04', targetDateMs: null,
  });
  const context = { kind: 'mock' as const, dataset };

  it("reads the dataset column for the goal's own bar", () => {
    const row = dataset.sessionsByGoal.get('G04')!.find(r => r.columns.qualifying_sentences_2plus !== r.columns.qualifying_sentences_3plus)!;
    expect(row).toBeDefined();
    expect(measuredValue(measureSessionMetric(goalWithBar(2), context, QUALIFYING, row.sessionId))).toBe(row.columns.qualifying_sentences_2plus);
    expect(measuredValue(measureSessionMetric(goalWithBar(3), context, QUALIFYING, row.sessionId))).toBe(row.columns.qualifying_sentences_3plus);
  });

  it('refuses what the goal itself refuses rather than reading a raw column', () => {
    const row = dataset.sessionsByGoal.get('G04')![0];
    expect(measureSessionMetric(goalWithBar(2), context, MetricCatalogue.conversationTurns.id, row.sessionId).kind).toBe('unsupported');
  });
});
