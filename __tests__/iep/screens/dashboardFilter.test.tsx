/**
 * The dashboard's All / Achieved / In progress chips narrow the goal cards.
 * Renders the real screen over an in-memory store in mock-data mode, with one goal the
 * mock data reaches and one it never can.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockPreferences: Record<string, string> = {
  iepMockMode: '1',
  iepMockDataset: 'standard',
  iepReportingPeriod: 'custom',
  iepReportingStartMs: String(new Date(2026, 0, 1).getTime()),
  iepReportingEndMs: String(new Date(2026, 11, 31).getTime()),
  iepAutoStopEnabled: '0',
  iepAutoStopMinutes: '30',
  heroName: 'Sam',
};
jest.mock('../../../src/utils/persistance', () => ({
  useAppSettings: () => ({ preferences: mockPreferences, setItem: jest.fn() }),
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
import { IepStoreProvider } from '../../../src/features/iep/hooks/IepStoreProvider';
import { GoalPlan } from '../../../src/features/iep/model';
import { MemoryPersistence } from '../../../src/features/iep/store';
import { StatusBadge } from '../../../src/features/iep/ui/primitives';
import { makeStore } from '../store/helpers';

function sentencePlan(target: number): GoalPlan {
  return {
    goalTitle: 'Sentence Complexity',
    goalSummary: `Child will create ${target} sentences with 2 or more words during a session.`,
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

/** Seeds goals read from the G04 mock column; a target of 1 is reached, 900 never is. */
async function seededPersistence(targets: number[]): Promise<MemoryPersistence> {
  const persistence = new MemoryPersistence();
  const store = await makeStore(persistence);
  for (const target of targets) {
    const goal = store.addGoal({ title: `Sentences of ${target}`, description: '', targetValue: target, targetUnit: 'sentences', timeframe: 'per session', plan: sentencePlan(target) })!;
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

const badgeStatuses = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findAllByType(StatusBadge).map(b => b.props.status as string);

async function pressChip(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const chip = renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  expect(chip).toBeDefined();
  await act(async () => {
    chip.props.onPress();
  });
}

const textNodes = (renderer: ReactTestRenderer.ReactTestRenderer, text: string) => renderer.root.findAll(n => n.props.children === text);

describe('IEP dashboard goal filter', () => {
  it('narrows the goal cards to achieved or in-progress goals', async () => {
    const renderer = await renderDashboard(await seededPersistence([1, 900]));
    const initial = badgeStatuses(renderer);
    expect(initial).toHaveLength(2);
    expect(initial).toContain('achieved');
    expect(initial.some(s => s !== 'achieved')).toBe(true);

    await pressChip(renderer, 'Show achieved goals');
    expect(badgeStatuses(renderer)).toEqual(['achieved']);

    await pressChip(renderer, 'Show in progress goals');
    const inProgress = badgeStatuses(renderer);
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0]).not.toBe('achieved');

    await pressChip(renderer, 'Show all goals');
    expect(badgeStatuses(renderer)).toHaveLength(2);
  });

  it('keeps the chips with a single goal and says when a filter has nothing to show', async () => {
    const renderer = await renderDashboard(await seededPersistence([900]));
    expect(badgeStatuses(renderer)).toHaveLength(1);

    await pressChip(renderer, 'Show achieved goals');
    expect(badgeStatuses(renderer)).toHaveLength(0);
    expect(textNodes(renderer, 'No achieved goals yet.').length).toBeGreaterThan(0);

    await pressChip(renderer, 'Show in progress goals');
    expect(badgeStatuses(renderer)).toHaveLength(1);
    expect(textNodes(renderer, 'No achieved goals yet.')).toHaveLength(0);
  });

  it('shows no AI tag on the dashboard', async () => {
    const renderer = await renderDashboard(await seededPersistence([1, 900]));
    expect(renderer.root.findAll(n => n.props.accessibilityLabel === 'This place uses AI')).toHaveLength(0);
  });
});
