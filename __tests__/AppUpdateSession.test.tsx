/**
 * @format
 *
 * Root-level once-per-session behaviour of the update popup in App.tsx:
 *  - shows once when the installation is eligible
 *  - a second render / remount in the same session does not show it again
 *  - background → foreground does not show it again
 *  - a network failure does not block startup
 */
import React from 'react';
import {AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

jest.mock('react-native-gesture-handler', () => {
  const {View} = require('react-native');
  return {GestureHandlerRootView: View};
});

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-device-info', () =>
  require('react-native-device-info/jest/react-native-device-info-mock'),
);

const mockCheck = jest.fn();
jest.mock('../src/utils/appUpdateService', () => {
  const actual = jest.requireActual('../src/utils/appUpdateService');
  return {...actual, checkForUpdatePopup: () => mockCheck()};
});

// Keep the bootstrap cheap and deterministic for this test.
jest.mock('../src/utils/fetcher', () => () => Promise.resolve({}));
jest.mock('../src/utils/wakewordService', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      initializeAndPause: jest.fn(),
      resumeDetection: jest.fn(),
      pauseDetection: jest.fn(),
    }),
  },
}));
jest.mock('../src/utils/TTSService', () => ({
  __esModule: true,
  default: {initialize: jest.fn()},
}));
jest.mock('../src/services/PersonalMemoryService', () => ({
  personalMemoryService: {
    init: jest.fn().mockResolvedValue(undefined),
    onAppForeground: jest.fn(),
  },
}));
jest.mock('../src/utils/sessionManager', () => ({
  sessionManager: {ensureValidSession: jest.fn().mockResolvedValue('t')},
}));
jest.mock('../src/utils/mixpanelInstance', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    identify: jest.fn(),
    registerSuperProperties: jest.fn(),
    track: jest.fn(),
  },
}));
const mockPreferenceGet = jest.fn();
jest.mock('react-native-default-preference', () => ({
  get: (key: string) => mockPreferenceGet(key),
}));
jest.mock('react-native-fast-image', () => {
  const {View} = require('react-native');
  const FastImage = (props: any) => <View {...props} />;
  FastImage.resizeMode = {contain: 'contain'};
  return FastImage;
});
jest.mock('posthog-react-native', () => ({
  PostHogProvider: ({children}: any) => children,
}));
jest.mock('../src/Navigation/RootControllerView', () => () => null);
jest.mock('../src/utils/persistance', () => ({
  AppSettingsProvider: ({children}: any) => children,
}));
jest.mock('../src/contexts/adminContext', () => ({
  AdminProvider: ({children}: any) => children,
}));
jest.mock('../src/contexts/ChatContextProvider', () => ({
  ChatContextProvider: ({children}: any) => children,
}));
jest.mock('../src/utils/connection', () => ({
  ConnectionProvider: ({children}: any) => children,
}));
jest.mock('../src/contexts/ToastContext', () => ({
  ToastProvider: ({children}: any) => children,
}));
jest.mock('../src/contexts/DatabaseContext', () => ({
  DatabaseProvider: ({children}: any) => children,
}));

import App from '../src/App';
import AppUpdateModal from '../src/Components/AppUpdateModal';
import {__resetUpdatePopupSessionForTests} from '../src/utils/appUpdateService';

const eligible = {
  importance: 'important' as const,
  title: 'Update',
  message: 'Please update',
  storeUrl: 'https://apps.apple.com/app/id0',
  minimumPopupBuild: 33,
  latestBuild: 35,
  installedBuild: 31,
};

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>(resolve => setImmediate(() => resolve()));
  }
};

const renderApp = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await flush();
  });
  return renderer;
};

const modalVisible = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findByType(AppUpdateModal).props.visible === true;

beforeEach(() => {
  __resetUpdatePopupSessionForTests();
  mockCheck.mockReset();
  // Default: onboarding already completed.
  mockPreferenceGet.mockReset().mockResolvedValue('1');
});

describe('App start-up update popup', () => {
  it('shows the popup once for an eligible installation', async () => {
    mockCheck.mockResolvedValue(eligible);
    const renderer = await renderApp();
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(modalVisible(renderer)).toBe(true);
  });

  it('does not show again on a root remount in the same session', async () => {
    mockCheck.mockResolvedValue(eligible);
    const first = await renderApp();
    expect(modalVisible(first)).toBe(true);
    await act(async () => {
      first.unmount();
    });

    const second = await renderApp();
    expect(modalVisible(second)).toBe(false);
    // The guard short-circuits the request entirely.
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it('does not show again after background → foreground', async () => {
    mockCheck.mockResolvedValue(eligible);
    const renderer = await renderApp();
    expect(modalVisible(renderer)).toBe(true);

    // Dismiss, then cycle app state.
    await act(async () => {
      renderer.root.findByType(AppUpdateModal).props.onClose();
    });
    expect(modalVisible(renderer)).toBe(false);

    const listeners = (AppState.addEventListener as jest.Mock).mock.calls
      .filter(([event]) => event === 'change')
      .map(([, handler]) => handler);
    expect(listeners.length).toBeGreaterThan(0);
    await act(async () => {
      for (const l of listeners) await l('background');
      for (const l of listeners) await l('active');
      await flush();
    });
    expect(modalVisible(renderer)).toBe(false);
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it('does not run the check or show the popup before onboarding is complete', async () => {
    mockPreferenceGet.mockResolvedValue(undefined);
    mockCheck.mockResolvedValue(eligible);
    const renderer = await renderApp();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(modalVisible(renderer)).toBe(false);
  });

  it('does not show when the installation is not eligible', async () => {
    mockCheck.mockResolvedValue(null);
    const renderer = await renderApp();
    expect(modalVisible(renderer)).toBe(false);
  });

  it('does not block startup when the update check fails', async () => {
    mockCheck.mockRejectedValue(new Error('offline'));
    const renderer = await renderApp();
    // Root UI rendered (splash replaced by the modal-bearing tree).
    expect(renderer.root.findAllByType(AppUpdateModal).length).toBe(1);
    expect(modalVisible(renderer)).toBe(false);
  });
});
