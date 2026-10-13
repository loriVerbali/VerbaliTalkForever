/**
 * The dashboard reports what the user does without what they wrote: the viewed event
 * carries counts and settings, filter chips report their key, and nothing in any payload is
 * a goal title or the hero's name. Mock goals never count as achieved.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockTrack = jest.fn();
jest.mock('../../../src/utils/mixpanelInstance', () => ({
  __esModule: true,
  default: { track: (...args: unknown[]) => mockTrack(...args) },
}));

const HERO = 'Quentin';
const mockPreferences: Record<string, string> = {
  iepMockMode: '1',
  iepMockDataset: 'standard',
  iepReportingPeriod: 'custom',
  iepReportingStartMs: String(new Date(2026, 0, 1).getTime()),
  iepReportingEndMs: String(new Date(2026, 11, 31).getTime()),
  iepAutoStopEnabled: '0',
  iepAutoStopMinutes: '30',
  iepAchievedGoalsReported: '[]',
  heroName: HERO,
};
const mockSetItem = jest.fn();
jest.mock('../../../src/utils/persistance', () => ({
  useAppSettings: () => ({ preferences: mockPreferences, setItem: mockSetItem }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('react-native-config', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-default-preference', () => ({ get: jest.fn(), set: jest.fn() }));
jest.mock('react-native-device-info', () => ({ __esModule: true, default: { getBuildNumber: () => '1', getVersion: () => '1.0' } }));
jest.mock('react-native-fast-image', () => {
  const { View } = require('react-native');
  const FastImage = (props: any) => <View {...props} />;
  FastImage.resizeMode = { contain: 'contain' };
  return FastImage;
});

import IepDashboardScreen from '../../../src/features/iep/screens/IepDashboardScreen';
import { IEP_EVENTS } from '../../../src/features/iep/analytics/iepAnalytics';
import { IepStoreProvider } from '../../../src/features/iep/hooks/IepStoreProvider';
import { GoalPlan } from '../../../src/features/iep/model';
import { MemoryPersistence } from '../../../src/features/iep/store';
import { StatusBadge } from '../../../src/features/iep/ui/primitives';
import { makeStore } from '../store/helpers';

const TITLE_WORD = 'Xylophone';
const FORBIDDEN = [TITLE_WORD, HERO, 'kumquat'];

function sentencePlan(target: number): GoalPlan {
  return {
    goalTitle: `${TITLE_WORD} sentences of ${target}`,
    goalSummary: `Child will create ${target} sentences at the kumquat table.`,
    metrics: [{ id: 'qualifying_sentences', name: 'Qualifying sentences', category: '', definition: '', measurementMethod: '', role: 'direct', targetValue: target, targetUnit: 'sentences', constraints: { minimumWordsPerSentence: 2 } }],
    condition: 'Each sentence has at least 2 words.',
    targetValue: target,
    targetUnit: 'sentences',
    timeframe: 'per session',
    consecutiveSessions: 2,
    dashboardTitle: '',
    dashboardTiles: [],
    confidenceNote: '',
    provider: 'gemini',
  };
}

/** One goal the G04 mock column reaches (target 1) and one it never can (900). */
async function seededPersistence(): Promise<MemoryPersistence> {
  const persistence = new MemoryPersistence();
  const store = await makeStore(persistence);
  for (const target of [1, 900]) {
    const goal = store.addGoal({ title: `${TITLE_WORD} sentences of ${target}`, description: 'kumquat', targetValue: target, targetUnit: 'sentences', timeframe: 'per session', plan: sentencePlan(target) })!;
    store.setMockDataSource(goal.id, 'G04');
  }
  await store.flush();
  return persistence;
}

async function renderDashboard(persistence: MemoryPersistence) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <IepStoreProvider persistence={persistence}>
        <IepDashboardScreen />
      </IepStoreProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return renderer;
}

async function pressByLabel(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const node = renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  expect(node).toBeDefined();
  await act(async () => {
    node.props.onPress();
  });
}

const eventsNamed = (name: string) => mockTrack.mock.calls.filter(([n]) => n === name).map(([, props]) => props);

beforeEach(() => {
  mockTrack.mockClear();
  mockSetItem.mockClear();
});

describe('IEP dashboard analytics', () => {
  it('reports one viewed event with counts and settings, never wording', async () => {
    const renderer = await renderDashboard(await seededPersistence());
    expect(renderer.root.findAllByType(StatusBadge)).toHaveLength(2);

    const viewed = eventsNamed(IEP_EVENTS.DASHBOARD_VIEWED);
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({
      feature: 'iep',
      goal_count: 2,
      achieved_goal_count: 1,
      mock_mode: true,
      period_preset: 'custom',
      auto_stop_enabled: false,
      auto_stop_minutes: 30,
      has_active_session: false,
      storage_failure: false,
    });

    const json = JSON.stringify(mockTrack.mock.calls);
    for (const word of FORBIDDEN) {
      expect(json).not.toContain(word);
    }
  });

  it('reports filter chips by key', async () => {
    const renderer = await renderDashboard(await seededPersistence());
    await pressByLabel(renderer, 'Show achieved goals');
    await pressByLabel(renderer, 'Show all goals');
    expect(eventsNamed(IEP_EVENTS.DASHBOARD_FILTER_CHANGED)).toEqual([
      { feature: 'iep', filter: 'achieved', goal_count: 2 },
      { feature: 'iep', filter: 'all', goal_count: 2 },
    ]);
  });

  it('never reports a mock goal as achieved', async () => {
    await renderDashboard(await seededPersistence());
    expect(eventsNamed(IEP_EVENTS.GOAL_ACHIEVED)).toHaveLength(0);
    expect(mockSetItem).not.toHaveBeenCalledWith('iepAchievedGoalsReported', expect.anything());
  });
});
