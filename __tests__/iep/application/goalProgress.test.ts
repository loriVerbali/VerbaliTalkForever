import {
  buildGoalProgress,
  dashboardInsightMessage,
  deterministicInsight,
  filterEvidenceRows,
  liveEvidenceSession,
  mockEvidenceSession,
  recentOutcomes,
  reportingPeriod,
  sessionRequirementText,
} from '../../../src/features/iep/application';
import { evidenceReconciles, measuredValue } from '../../../src/features/iep/core';
import { loadMockDataset } from '../../../src/features/iep/mock/mockDataset';
import { GoalPlan, IepGoal, sequentialIds } from '../../../src/features/iep/model';
import { IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();

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

function clockAt(startMs: number) {
  let now = startMs;
  return { now: () => (now += 1000), set: (ms: number) => { now = ms; } };
}

async function liveStore(sessionValues: number[][], goalPlan: GoalPlan = plan()) {
  const clock = clockAt(NOW - 30 * DAY);
  const store = new IepMeasurementStore(new MemoryPersistence(), { clock, ids: sequentialIds() });
  await store.load();
  const goal = store.addGoal({ title: goalPlan.goalTitle, description: goalPlan.goalSummary, targetValue: goalPlan.targetValue, targetUnit: goalPlan.targetUnit, timeframe: goalPlan.timeframe, plan: goalPlan }) as IepGoal;
  sessionValues.forEach((sentenceLengths, i) => {
    clock.set(NOW - (sessionValues.length - i) * 3 * DAY);
    store.startSession({ partnerType: i % 2 === 0 ? 'slp' : 'parent', treatmentContext: i % 2 === 0 ? 'therapy' : 'home', trackedGoalIds: [goal.id] });
    for (const len of sentenceLengths) {
      let id: string | null = null;
      for (let w = 0; w < len; w += 1) {
        id = store.recordWordSelection({ word: `w${w}`, pageId: 'core', sentenceId: id });
      }
      store.completeSentence(id, Array.from({ length: len }, (_, w) => `w${w}`), 'play');
    }
    store.endActiveSession();
  });
  return { store, goal };
}

describe('buildGoalProgress (live)', () => {
  it('scores sessions against the plan target with the goal\'s own word bar', async () => {
    const { store, goal } = await liveStore([[2, 1], [3, 2, 2], [2, 2]]);
    const p = buildGoalProgress(goal, reportingPeriod('12w', NOW), { kind: 'live', state: store.snapshot() });
    expect(p.primaryMetricId).toBe('qualifying_sentences');
    expect(p.target).toBe(2);
    expect(p.minimumWordsPerSentence).toBe(2);
    expect(p.sessions.map(s => measuredValue(s.result))).toEqual([1, 3, 2]);
    expect(p.sessions.map(s => s.metTarget)).toEqual([false, true, true]);
    expect(p.outcome.currentStreak).toBe(2);
    expect(p.status).toBe('achieved');
    expect(p.headline.percent).toBe(100);
    expect(p.headline.caption).toBe('2 of 2 consecutive sessions at target');
    expect(sessionRequirementText(p)).toBe('Target met in 2 consecutive sessions');
    expect(recentOutcomes(p)).toEqual([false, true, true]);
    expect(p.dataSourceLabel).toBe('live');
    expect(p.dependsOnAi).toBe(false);
  });

  it('shows no tracked sessions rather than zero and excludes sessions outside the period', async () => {
    const { store, goal } = await liveStore([[2, 2]]);
    const p = buildGoalProgress(goal, reportingPeriod('custom', NOW, { startMs: NOW - 400 * DAY, endMs: NOW - 300 * DAY }), { kind: 'live', state: store.snapshot() });
    expect(p.sessions).toHaveLength(0);
    expect(p.status).toBe('noTrackedSessions');
    expect(p.headline.percent).toBeNull();
    expect(sessionRequirementText(p)).toBe('No tracked sessions yet');
  });

  it('a goal without a target is tracking only', async () => {
    const noTarget = plan({
      targetValue: 0,
      metrics: [{ id: 'qualifying_sentences', name: 'Qualifying sentences', category: '', definition: '', measurementMethod: '', role: 'direct', constraints: { minimumWordsPerSentence: 2 } }],
    });
    const { store, goal } = await liveStore([[2, 2], [2]], noTarget);
    const p = buildGoalProgress(goal, reportingPeriod('12w', NOW), { kind: 'live', state: store.snapshot() });
    // A qualifying-sentence goal with a stated word bar counts one qualifying sentence as met.
    expect(p.target).toBe(1);
    expect(p.hasTarget).toBe(true);
  });

  it('an unsupported metric is not scorable and never a failure', async () => {
    const unsupported = plan({
      metrics: [{ id: 'eye_contact_duration', name: 'Eye contact', category: '', definition: '', measurementMethod: '', role: 'direct', targetValue: 5 }],
      calculation: { ...plan().calculation!, primaryMetricId: 'eye_contact_duration', minimumWordsPerSentence: null },
    });
    const { store, goal } = await liveStore([[2, 2]], unsupported);
    const p = buildGoalProgress(goal, reportingPeriod('12w', NOW), { kind: 'live', state: store.snapshot() });
    expect(p.status).toBe('notScorable');
    expect(p.unavailableReason).toContain('eye_contact_duration');
    expect(p.headline.percent).toBeNull();
  });

  it('builds evidence rows that reconcile with the count', async () => {
    const { store, goal } = await liveStore([[2, 1, 3]]);
    const p = buildGoalProgress(goal, reportingPeriod('12w', NOW), { kind: 'live', state: store.snapshot() });
    const session = liveEvidenceSession(store.snapshot(), p.sessions[0].sessionId, 'Sam')!;
    const completions = session.rows
      .filter(r => r.isCompletion && (r.wordCount ?? 0) >= 2)
      .map(r => ({ id: r.id, kind: 'sentence' as const, wordCount: r.wordCount, supportLevel: r.supportLevel }));
    expect(evidenceReconciles(measuredValue(p.sessions[0].result) as number, completions)).toBe(true);
    expect(session.rows.filter(r => !r.isCompletion && r.category === 'sentences')).toHaveLength(6);
    expect(filterEvidenceRows(session.rows, new Set(['independent']))).toHaveLength(0);
    expect(session.independentCount + session.promptedCount + session.assistedCount).toBe(0);
    // What the start sheet recorded, as the Evidence sidebar shows it.
    expect(session.sessionType).toBe('Therapy');
    expect(session.partner).toBe('SLP');
  });

  it('produces a deterministic comparison only with three sessions per group', async () => {
    const { store, goal } = await liveStore([[2, 2], [1], [2, 2], [1], [2, 2], [1]]);
    const p = buildGoalProgress(goal, reportingPeriod('12w', NOW), { kind: 'live', state: store.snapshot() });
    const insight = deterministicInsight(p);
    expect(insight.patternInsight).toBe('Sessions were more often successful during therapy (100%) than home (0/3 sessions).');
    expect(dashboardInsightMessage([p], null)).toContain('fell below target');
  });
});

describe('buildGoalProgress (mock)', () => {
  const dataset = loadMockDataset('standard');
  const goal: IepGoal = {
    id: 'g-mock', title: 'Meaningful 2-word sentences', description: dataset.goalsById.get('G04')!.statement,
    targetValue: 5, targetUnit: 'sentences', timeframe: 'per session', isActive: true, createdAtMs: NOW,
    plan: plan({ targetValue: 5, metrics: [{ id: 'qualifying_sentences', name: 'Qualifying sentences', category: '', definition: '', measurementMethod: '', role: 'direct', targetValue: 5, constraints: { minimumWordsPerSentence: 2 } }] }),
    displayNumber: 1, mockDataSourceId: 'G04', targetDateMs: null,
  };

  it('reads the dataset column for the goal\'s bar and labels provenance as mock', () => {
    const period = reportingPeriod('custom', NOW, { startMs: new Date(2026, 0, 1).getTime(), endMs: new Date(2026, 3, 1).getTime() });
    const p = buildGoalProgress(goal, period, { kind: 'mock', dataset });
    expect(p.isMock).toBe(true);
    expect(p.dataSourceLabel).toBe('mock');
    expect(p.sessions.length).toBeGreaterThan(0);
    const first = p.sessions[0];
    const row = dataset.sessionsByGoal.get('G04')!.find(r => r.sessionId === first.sessionId)!;
    expect(measuredValue(first.result)).toBe(row.columns.qualifying_sentences_2plus);
    expect(first.result.kind === 'value' && first.result.provenance.kind).toBe('mock');
  });

  it('refuses a contested metric in mock mode too', () => {
    const contested: IepGoal = { ...goal, plan: plan({ metrics: [{ id: 'conversation_turns', name: 'Conversation turns', category: '', definition: '', measurementMethod: '', role: 'direct', targetValue: 4 }], calculation: { ...plan().calculation!, primaryMetricId: 'conversation_turns', minimumWordsPerSentence: null } }) };
    const p = buildGoalProgress(contested, reportingPeriod('custom', NOW, { startMs: new Date(2026, 0, 1).getTime(), endMs: new Date(2026, 3, 1).getTime() }), { kind: 'mock', dataset });
    expect(p.status).toBe('notScorable');
    expect(p.unavailableReason).toContain('awaiting SLP approval');
  });

  it('builds mock evidence rows with the review overlay applied', () => {
    const session = mockEvidenceSession(dataset, 'S001', 'G04', 'qualifying_sentences', 'Sam', { support: {}, functions: {} })!;
    expect(session.rows.length).toBeGreaterThan(0);
    expect(session.rows.every(r => r.category === 'sentences')).toBe(true);
    expect(session.sessionType).toBe('Structured activity');
    expect(session.partner).toBe('Speech therapist');
    const completion = session.rows.find(r => r.isCompletion)!;
    const overlay = mockEvidenceSession(dataset, 'S001', 'G04', 'qualifying_sentences', 'Sam', {
      support: { [`standard/S001/${completion.sentenceId}`]: 'assisted' },
      functions: { [`standard/S001/${completion.sentenceId}`]: 'question' },
    })!;
    const edited = overlay.rows.find(r => r.id === completion.id)!;
    expect(edited.supportLevel).toBe('assisted');
    expect(edited.communicationFunction).toBe('question');
    expect(overlay.assistedCount).toBeGreaterThanOrEqual(1);
  });
});

describe('supporting metrics', () => {
  it('are measured on the latest session rather than reported as an invented zero', async () => {
    const { store, goal } = await liveStore([[2, 1], [3, 2, 2]]);
    const p = buildGoalProgress(goal, reportingPeriod('12w', NOW), { kind: 'live', state: store.snapshot() });
    const supporting = p.metricTargets.find(m => m.metric.id === 'total_sentences')!;
    expect(supporting.presentation.style).not.toBe('unsupported');
    expect(measuredValue(supporting.result)).toBe(3);
  });
});
