/**
 * The session-tracking card's auto-stop controls. Typed minutes are the source of truth
 * until they are committed, a custom value that arrives after mount opens the custom row,
 * and an auto-stop longer than setTimeout's limit still waits the whole duration.
 * Renders the real screen over an in-memory store with the settings hook mocked, so a
 * preference can be replaced and the screen re-rendered as if the async write had landed.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockTrack = jest.fn();
jest.mock('../../../src/utils/mixpanelInstance', () => ({
  __esModule: true,
  default: { track: (...args: unknown[]) => mockTrack(...args) },
}));

const BASE_PREFERENCES: Record<string, string> = {
  iepMockMode: '0',
  iepMockDataset: 'standard',
  iepReportingPeriod: '12w',
  iepReportingStartMs: '',
  iepReportingEndMs: '',
  iepAutoStopEnabled: '1',
  iepAutoStopMinutes: '30',
  iepAchievedGoalsReported: '[]',
  heroName: 'Sam',
};
let mockPreferences: Record<string, string> = { ...BASE_PREFERENCES };
// The real setItem awaits the native write before updating preferences, so a write is
// "in flight" until the test lands it with landPreference.
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
import { MemoryPersistence, systemClock } from '../../../src/features/iep/store';
import { makeStore } from '../store/helpers';

const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const MINUTE_MS = 60_000;
const INPUT_LABEL = 'Session length in minutes';

type Renderer = ReactTestRenderer.ReactTestRenderer;

const tree = (persistence: MemoryPersistence) => (
  <IepStoreProvider persistence={persistence}>
    <IepDashboardScreen />
  </IepStoreProvider>
);

/** Lets the store load and effects settle; under fake timers that is a zero-length advance. */
async function settle(fakeTimers: boolean) {
  await act(async () => {
    if (fakeTimers) {
      await jest.advanceTimersByTimeAsync(0);
    } else {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });
}

async function renderDashboard(persistence: MemoryPersistence, fakeTimers = false) {
  let renderer!: Renderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(tree(persistence));
  });
  await settle(fakeTimers);
  return renderer;
}

/** A settings write landing (or a change made elsewhere): replaces the preferences and re-renders. */
async function landPreference(renderer: Renderer, persistence: MemoryPersistence, patch: Record<string, string>) {
  mockPreferences = { ...mockPreferences, ...patch };
  await act(async () => {
    renderer.update(tree(persistence));
  });
}

const minutesInputs = (renderer: Renderer) => renderer.root.findAll(n => n.props.accessibilityLabel === INPUT_LABEL && typeof n.props.onChangeText === 'function');
const minutesValue = (renderer: Renderer) => minutesInputs(renderer)[0].props.value as string;
const chip = (renderer: Renderer, label: string) => renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const chipSelected = (renderer: Renderer, label: string) => chip(renderer, label).props.accessibilityState.selected as boolean;
const textNodes = (renderer: Renderer, text: string) => renderer.root.findAll(n => n.props.children === text);
const eventsNamed = (name: string) => mockTrack.mock.calls.filter(([n]) => n === name).map(([, props]) => props);
const minutesWrites = () => mockSetItem.mock.calls.filter(([key]) => key === 'iepAutoStopMinutes').map(([, value]) => value);

async function press(renderer: Renderer, label: string) {
  const node = chip(renderer, label);
  expect(node).toBeDefined();
  await act(async () => {
    node.props.onPress();
  });
}

async function type(renderer: Renderer, text: string) {
  await act(async () => {
    minutesInputs(renderer)[0].props.onChangeText(text);
  });
}

async function fire(renderer: Renderer, handler: 'onBlur' | 'onSubmitEditing') {
  await act(async () => {
    minutesInputs(renderer)[0].props[handler]();
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  mockPreferences = { ...BASE_PREFERENCES };
  mockTrack.mockClear();
  mockSetItem.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('IEP dashboard auto-stop minutes', () => {
  it('writes and reports typed minutes once on commit, from the text as typed', async () => {
    const persistence = new MemoryPersistence();
    const renderer = await renderDashboard(persistence);
    await press(renderer, 'Custom');
    expect(minutesValue(renderer)).toBe('30');

    await type(renderer, '45');
    expect(minutesWrites()).toEqual([]);
    expect(minutesValue(renderer)).toBe('45');

    // The write is still in flight when the field loses focus: the field keeps 45 and the event says 45.
    await fire(renderer, 'onBlur');
    expect(minutesWrites()).toEqual(['45']);
    expect(eventsNamed(IEP_EVENTS.AUTO_STOP_CHANGED)).toEqual([{ feature: 'iep', enabled: true, minutes: 45, source: 'typed' }]);
    expect(minutesValue(renderer)).toBe('45');

    await landPreference(renderer, persistence, { iepAutoStopMinutes: '45' });
    expect(minutesValue(renderer)).toBe('45');
    expect(minutesWrites()).toEqual(['45']);
    expect(eventsNamed(IEP_EVENTS.AUTO_STOP_CHANGED)).toHaveLength(1);
  });

  it('keeps the text being typed when a settings value lands mid-edit', async () => {
    const persistence = new MemoryPersistence();
    const renderer = await renderDashboard(persistence);
    await press(renderer, 'Custom');

    await type(renderer, '60');
    await type(renderer, '600');
    await landPreference(renderer, persistence, { iepAutoStopMinutes: '50' });
    expect(minutesValue(renderer)).toBe('600');
    await type(renderer, '60');
    expect(minutesWrites()).toEqual([]);

    await fire(renderer, 'onSubmitEditing');
    expect(minutesWrites()).toEqual(['60']);
    expect(eventsNamed(IEP_EVENTS.AUTO_STOP_CHANGED)).toEqual([{ feature: 'iep', enabled: true, minutes: 60, source: 'typed' }]);
    expect(minutesValue(renderer)).toBe('60');

    // The blur that follows the keyboard's Done has nothing new to commit.
    await fire(renderer, 'onBlur');
    expect(minutesWrites()).toEqual(['60']);
    expect(eventsNamed(IEP_EVENTS.AUTO_STOP_CHANGED)).toHaveLength(1);

    // Once the write has landed, settings and field agree.
    await landPreference(renderer, persistence, { iepAutoStopMinutes: '60' });
    expect(minutesValue(renderer)).toBe('60');
  });

  it('clamps a committed value to the minimum and ignores an unchanged or empty one', async () => {
    const persistence = new MemoryPersistence();
    const renderer = await renderDashboard(persistence);
    await press(renderer, 'Custom');

    await type(renderer, '2');
    await fire(renderer, 'onBlur');
    expect(minutesWrites()).toEqual(['5']);
    expect(eventsNamed(IEP_EVENTS.AUTO_STOP_CHANGED)).toEqual([{ feature: 'iep', enabled: true, minutes: 5, source: 'typed' }]);
    expect(minutesValue(renderer)).toBe('5');
    await landPreference(renderer, persistence, { iepAutoStopMinutes: '5' });

    await type(renderer, '5');
    await fire(renderer, 'onBlur');
    await type(renderer, '');
    await fire(renderer, 'onBlur');
    expect(minutesWrites()).toEqual(['5']);
    expect(eventsNamed(IEP_EVENTS.AUTO_STOP_CHANGED)).toHaveLength(1);
    expect(minutesValue(renderer)).toBe('5');
  });

  it('opens the custom row when a custom value arrives after mount', async () => {
    const persistence = new MemoryPersistence();
    const renderer = await renderDashboard(persistence);
    expect(minutesInputs(renderer)).toHaveLength(0);
    expect(chipSelected(renderer, '30 min')).toBe(true);

    await landPreference(renderer, persistence, { iepAutoStopMinutes: '45' });
    expect(minutesValue(renderer)).toBe('45');
    expect(chipSelected(renderer, 'Custom · 45 min')).toBe(true);
    expect(chipSelected(renderer, '30 min')).toBe(false);

    // A preset chip still closes the custom row.
    await press(renderer, '30 min');
    expect(minutesWrites()).toEqual(['30']);
    expect(minutesInputs(renderer)).toHaveLength(0);
  });

  it('waits the whole auto-stop duration when it exceeds the setTimeout limit', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 12, 12, 0, 0));
    const minutes = 40_000;
    expect(minutes * MINUTE_MS).toBeGreaterThan(MAX_TIMEOUT_MS);
    mockPreferences = { ...BASE_PREFERENCES, iepAutoStopMinutes: String(minutes) };
    const persistence = new MemoryPersistence();
    const store = await makeStore(persistence, systemClock);
    store.startSession();
    await store.flush();

    const renderer = await renderDashboard(persistence, true);
    const stopped = () => eventsNamed(IEP_EVENTS.SESSION_STOPPED);
    expect(stopped()).toHaveLength(0);
    expect(textNodes(renderer, 'No session is active.')).toHaveLength(0);

    // An overflowed timer would have fired by now.
    await advance(1000);
    expect(stopped()).toHaveLength(0);

    // The first slice elapses and the wait is re-armed for the rest.
    await advance(MAX_TIMEOUT_MS);
    expect(stopped()).toHaveLength(0);

    await advance(minutes * MINUTE_MS - MAX_TIMEOUT_MS - 1000 - 1);
    expect(stopped()).toHaveLength(0);

    await advance(1);
    expect(stopped()).toEqual([expect.objectContaining({ reason: 'auto', duration_minutes: minutes })]);
    expect(textNodes(renderer, 'No session is active.').length).toBeGreaterThan(0);
  });
});
