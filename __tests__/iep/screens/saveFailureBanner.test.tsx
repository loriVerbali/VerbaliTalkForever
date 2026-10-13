/**
 * A write that fails after the change is already applied in memory is surfaced on the
 * dashboard. Renders the real screen over an in-memory store whose goals write rejects,
 * adds a goal through the provider's store the way the Add goal screen would, and looks
 * for the amber "could not be saved" banner, which goes away once a write lands.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockPreferences: Record<string, string> = {
  iepMockMode: '0',
  iepMockDataset: 'standard',
  iepReportingPeriod: '12w',
  iepReportingStartMs: '',
  iepReportingEndMs: '',
  iepAutoStopEnabled: '0',
  iepAutoStopMinutes: '30',
  iepAchievedGoalsReported: '[]',
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
import { IepStoreProvider, useIepStore } from '../../../src/features/iep/hooks/IepStoreProvider';
import { IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';

const BANNER_TITLE = '⚠ Changes could not be saved';

/** A persistence whose goals writes reject while `control.fail` is set; sessions always land. */
function failingGoalsPersistence() {
  const persistence = new MemoryPersistence();
  const saveGoals = persistence.saveGoals.bind(persistence);
  const control = { fail: true };
  persistence.saveGoals = async goals => {
    if (control.fail) {
      throw new Error('ENOSPC');
    }
    return saveGoals(goals);
  };
  return { persistence, control };
}

/** Hands out the provider's store so the test can change it the way the Add goal screen does. */
const StoreProbe: React.FC<{ onStore: (store: IepMeasurementStore) => void }> = ({ onStore }) => {
  onStore(useIepStore().store);
  return null;
};

async function renderDashboard(persistence: MemoryPersistence) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  let store!: IepMeasurementStore;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <IepStoreProvider persistence={persistence}>
        <StoreProbe onStore={s => { store = s; }} />
        <IepDashboardScreen />
      </IepStoreProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return { renderer, store };
}

const textNodes = (renderer: ReactTestRenderer.ReactTestRenderer, text: string) => renderer.root.findAll(n => n.props.children === text);

async function addGoalAndFlush(store: IepMeasurementStore, title: string) {
  await act(async () => {
    store.addGoal({ title, description: '', targetValue: 5, targetUnit: 'sentences', timeframe: 'per session' });
    await store.flush();
  });
}

describe('IEP dashboard save-failure banner', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('shows the banner when a goal cannot be saved and hides it once a goals write lands', async () => {
    const { persistence, control } = failingGoalsPersistence();
    const { renderer, store } = await renderDashboard(persistence);
    expect(textNodes(renderer, BANNER_TITLE)).toHaveLength(0);

    await addGoalAndFlush(store, 'Sentences of 5');
    expect(store.saveFailure?.what).toBe('goals');
    expect(store.saveFailure?.message).toContain('ENOSPC');
    expect(textNodes(renderer, BANNER_TITLE).length).toBeGreaterThan(0);
    expect(textNodes(renderer, store.saveFailure!.message).length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(1);
    // The goal itself is still on screen: only the write failed.
    expect(store.goals.map(g => g.title)).toEqual(['Sentences of 5']);

    control.fail = false;
    await addGoalAndFlush(store, 'Sentences of 6');
    expect(store.saveFailure).toBeNull();
    expect(textNodes(renderer, BANNER_TITLE)).toHaveLength(0);
    expect(persistence.rawGoals()).toContain('Sentences of 5');
    expect(persistence.rawGoals()).toContain('Sentences of 6');
  });
});
