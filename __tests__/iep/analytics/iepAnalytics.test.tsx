/**
 * IEP analytics never carry text a clinician or child typed. These tests build a live goal
 * from distinctive wording and check that no event property contains any of it, and that
 * achievement is reported once per live goal and never for mock goals.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockTrack = jest.fn();
jest.mock('../../../src/utils/mixpanelInstance', () => ({
  __esModule: true,
  default: { track: (...args: unknown[]) => mockTrack(...args) },
}));

const mockPreferences: Record<string, string> = { iepAchievedGoalsReported: '[]' };
const mockSetItem = jest.fn(async (key: string, value: string) => {
  mockPreferences[key] = value;
});
jest.mock('../../../src/utils/persistance', () => ({
  useAppSettings: () => ({ preferences: mockPreferences, setItem: mockSetItem }),
}));

import { buildGoalProgress, reportingPeriod } from '../../../src/features/iep/application';
import { GoalProgress } from '../../../src/features/iep/application/goalProgress';
import {
  ACHIEVED_GOALS_REPORTED_KEY,
  IEP_EVENTS,
  daysBetween,
  goalEventProps,
  goalTextStats,
  minutesBetween,
  parseReportedGoalIds,
  planEventProps,
  planSource,
  trackIep,
  useIepGoalAchievementTracking,
} from '../../../src/features/iep/analytics/iepAnalytics';
import { GoalPlan, IepGoal, sequentialIds } from '../../../src/features/iep/model';
import { IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();

// Wording that must never show up in any event payload.
const SECRET_TITLE = 'Zebra Quartz Title';
const SECRET_SUMMARY = 'Ollie will request xylophone snacks in a session.';
const SECRET_CONDITION = 'Only when Ollie is at the kumquat table.';
const FORBIDDEN = ['Zebra', 'Quartz', 'Ollie', 'xylophone', 'kumquat', 'w0', 'w1'];

function plan(overrides: Partial<GoalPlan> = {}): GoalPlan {
  return {
    goalTitle: SECRET_TITLE,
    goalSummary: SECRET_SUMMARY,
    metrics: [
      { id: 'qualifying_sentences', name: 'Qualifying sentences', category: '', definition: SECRET_SUMMARY, measurementMethod: '', role: 'direct', targetValue: 2, targetUnit: 'sentences', constraints: { minimumWordsPerSentence: 2 } },
      { id: 'total_sentences', name: 'Total sentences', category: '', definition: '', measurementMethod: '', role: 'supporting' },
    ],
    condition: SECRET_CONDITION,
    targetValue: 2,
    targetUnit: 'sentences',
    timeframe: 'per session',
    consecutiveSessions: 2,
    dashboardTitle: SECRET_TITLE,
    dashboardTiles: [],
    confidenceNote: SECRET_CONDITION,
    provider: 'gemini',
    calculation: {
      primaryMetricId: 'qualifying_sentences',
      comparisonOperator: 'atLeast',
      requiredConditions: [SECRET_CONDITION],
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

/** A live goal with the given sentence lengths per session; [[2, 2], [2, 2]] reaches the target twice. */
async function liveProgress(sessionValues: number[][]): Promise<GoalProgress> {
  const clock = clockAt(NOW - 30 * DAY);
  const store = new IepMeasurementStore(new MemoryPersistence(), { clock, ids: sequentialIds() });
  await store.load();
  const goalPlan = plan();
  const goal = store.addGoal({ title: goalPlan.goalTitle, description: SECRET_SUMMARY, targetValue: goalPlan.targetValue, targetUnit: goalPlan.targetUnit, timeframe: goalPlan.timeframe, plan: goalPlan }) as IepGoal;
  sessionValues.forEach((sentenceLengths, i) => {
    clock.set(NOW - (sessionValues.length - i) * 3 * DAY);
    store.startSession({ partnerType: 'slp', treatmentContext: 'therapy', trackedGoalIds: [goal.id] });
    for (const len of sentenceLengths) {
      let id: string | null = null;
      for (let w = 0; w < len; w += 1) {
        id = store.recordWordSelection({ word: `w${w}`, pageId: 'core', sentenceId: id });
      }
      store.completeSentence(id, Array.from({ length: len }, (_, w) => `w${w}`), 'play');
    }
    store.endActiveSession();
  });
  return buildGoalProgress(goal, reportingPeriod('12w', NOW), { kind: 'live', state: store.snapshot() });
}

function expectClean(props: unknown) {
  const json = JSON.stringify(props);
  for (const word of FORBIDDEN) {
    expect(json).not.toContain(word);
  }
}

/** Every value is a primitive, null, or a list of strings: no nested objects that could smuggle text. */
function expectFlat(props: Record<string, unknown>) {
  for (const value of Object.values(props)) {
    if (Array.isArray(value)) {
      value.forEach(v => expect(typeof v).toBe('string'));
    } else {
      expect(['string', 'number', 'boolean'].includes(typeof value) || value === null).toBe(true);
    }
  }
}

const Tracker: React.FC<{ all: GoalProgress[] }> = ({ all }) => {
  useIepGoalAchievementTracking(all);
  return null;
};

async function renderTracker(all: GoalProgress[]) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Tracker all={all} />);
  });
  return renderer;
}

beforeEach(() => {
  mockTrack.mockClear();
  mockSetItem.mockClear();
  mockPreferences[ACHIEVED_GOALS_REPORTED_KEY] = '[]';
});

describe('IEP analytics properties', () => {
  it('describes a goal by structure and status only', async () => {
    const p = await liveProgress([[2, 2], [2, 2]]);
    expect(p.status).toBe('achieved');
    const props = goalEventProps(p, NOW);
    expectClean(props);
    expectFlat(props);
    expect(props).toMatchObject({
      status: 'achieved',
      has_target: true,
      session_count: 2,
      sessions_required: 2,
      session_rule: 'consecutive',
      primary_metric_id: 'qualifying_sentences',
      metric_ids: ['qualifying_sentences', 'total_sentences'],
      metric_count: 2,
      plan_source: 'ai',
      is_mock: false,
      goal_age_days: 30,
    });
    expect(Object.keys(props)).not.toEqual(expect.arrayContaining(['title', 'statement', 'description', 'percent']));
  });

  it('describes a plan by catalogue ids, counts and rules only', () => {
    const props = planEventProps(plan());
    expectClean(props);
    expectFlat(props);
    expect(props).toEqual({
      metric_ids: ['qualifying_sentences', 'total_sentences'],
      metric_count: 2,
      targeted_metric_count: 1,
      unsupported_metric_count: 0,
      primary_metric_id: 'qualifying_sentences',
      sessions_required: 2,
      consecutive_sessions: true,
      has_sentence_length_rule: true,
      plan_source: 'ai',
    });
  });

  it('reduces goal text to its size', () => {
    expect(goalTextStats(`  ${SECRET_SUMMARY}  `)).toEqual({ goal_text_length: SECRET_SUMMARY.length, goal_text_word_count: 8 });
    expect(goalTextStats('   ')).toEqual({ goal_text_length: 0, goal_text_word_count: 0 });
    expectClean(goalTextStats(SECRET_SUMMARY));
  });

  it('classifies the plan source like the AI tag does', () => {
    expect(planSource(plan())).toBe('ai');
    expect(planSource(plan({ provider: 'fallback' }))).toBe('fallback');
    expect(planSource(plan({ provider: '  ' }))).toBe('fallback');
    expect(planSource(null)).toBe('none');
  });

  it('rounds durations to whole days and minutes', () => {
    expect(daysBetween(NOW, NOW + 2.6 * DAY)).toBe(3);
    expect(daysBetween(NOW, NOW - DAY)).toBe(-1);
    expect(minutesBetween(NOW, NOW + 90_000)).toBe(2);
    expect(minutesBetween(NOW, NOW - 90_000)).toBe(0);
  });

  it('tags every event, drops undefined properties and survives a failing client', () => {
    trackIep(IEP_EVENTS.DASHBOARD_FILTER_CHANGED, { filter: 'all', goal_count: undefined, mock_mode: false });
    expect(mockTrack).toHaveBeenCalledWith(IEP_EVENTS.DASHBOARD_FILTER_CHANGED, { feature: 'iep', filter: 'all', mock_mode: false });

    mockTrack.mockImplementationOnce(() => {
      throw new Error('native module missing');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => trackIep(IEP_EVENTS.EXPORT_SCREEN_VIEWED)).not.toThrow();
    warn.mockRestore();
  });

  it('reads the reported-goal list defensively', () => {
    expect([...parseReportedGoalIds('["a","b",3]')]).toEqual(['a', 'b']);
    expect([...parseReportedGoalIds('not json')]).toEqual([]);
    expect([...parseReportedGoalIds(undefined)]).toEqual([]);
    expect([...parseReportedGoalIds('{"a":1}')]).toEqual([]);
  });
});

describe('useIepGoalAchievementTracking', () => {
  it('reports a live goal once when it first reads as achieved, and remembers it', async () => {
    const achieved = await liveProgress([[2, 2], [2, 2]]);
    const renderer = await renderTracker([achieved]);
    const calls = mockTrack.mock.calls.filter(([name]) => name === IEP_EVENTS.GOAL_ACHIEVED);
    expect(calls).toHaveLength(1);
    expectClean(calls[0][1]);
    expect(calls[0][1]).toMatchObject({ feature: 'iep', status: 'achieved', is_mock: false, sessions_measured: 2, days_to_achieve: expect.any(Number) });
    expect(mockSetItem).toHaveBeenCalledWith(ACHIEVED_GOALS_REPORTED_KEY, JSON.stringify([achieved.goalId]));

    // The same list again, and a fresh list with the same goal, add nothing.
    await act(async () => {
      renderer.update(<Tracker all={[achieved]} />);
    });
    await act(async () => {
      renderer.update(<Tracker all={[{ ...achieved }]} />);
    });
    expect(mockTrack.mock.calls.filter(([name]) => name === IEP_EVENTS.GOAL_ACHIEVED)).toHaveLength(1);

    // A later visit reads the stored ids and stays quiet.
    mockTrack.mockClear();
    await renderTracker([achieved]);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('ignores goals that are not achieved and synthetic mock goals', async () => {
    const achieved = await liveProgress([[2, 2], [2, 2]]);
    const inProgress = await liveProgress([[2, 1], [1]]);
    expect(inProgress.status).not.toBe('achieved');
    const mock: GoalProgress = { ...achieved, goalId: 'mock-goal', isMock: true, dataSourceLabel: 'mock' };
    await renderTracker([inProgress, mock]);
    expect(mockTrack).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});
