/**
 * @format
 */
import {Platform} from 'react-native';

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));

const mockGetBuildNumber = jest.fn();
jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {getVersion: () => mockGetBuildNumber()},
}));

import {
  __resetUpdatePopupSessionForTests,
  buildUpdatePolicyUrl,
  checkForUpdatePopup,
  evaluateUpdatePolicy,
  fetchUpdatePolicy,
  hasUpdatePopupBeenShownThisSession,
  markUpdatePopupShown,
  parseVersionNumber,
  parseUpdatePolicyResponse,
  UPDATE_POLICY_PATH,
} from '../src/utils/appUpdateService';
import {APP_KEY} from '../src/utils/appIdentity';
import type {UpdatePolicyResponse} from '../src/types/appUpdate';

const enabledPolicy = (
  overrides: Partial<UpdatePolicyResponse> = {},
): UpdatePolicyResponse => ({
  appKey: APP_KEY,
  platform: 'ios',
  enabled: true,
  minimumPopupBuild: 33,
  latestBuild: 35,
  importance: 'important',
  title: 'An important update is available',
  message: 'Please update to get the latest improvements.',
  storeUrl: 'https://apps.apple.com/app/id0000000000',
  ...overrides,
});

const mockFetchJson = (body: unknown, ok = true) => {
  (globalThis as any).fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
};

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  __resetUpdatePopupSessionForTests();
  mockGetBuildNumber.mockReset();
  Platform.OS = 'ios';
});

afterEach(() => {
  delete (globalThis as any).fetch;
  jest.restoreAllMocks();
});

describe('APP_KEY', () => {
  it('is the locked code-owned key for this repository', () => {
    expect(APP_KEY).toBe('matalk_forever');
  });
});

describe('parseVersionNumber', () => {
  it('parses plain integer strings from DeviceInfo.getVersion()', () => {
    expect(parseVersionNumber('31')).toBe(31);
    expect(parseVersionNumber(' 35 ')).toBe(35);
    expect(parseVersionNumber(0)).toBe(0);
  });

  it('rejects display/marketing versions and garbage', () => {
    expect(parseVersionNumber('6.2')).toBeNull();
    expect(parseVersionNumber('MatalkV2')).toBeNull();
    expect(parseVersionNumber('')).toBeNull();
    expect(parseVersionNumber(undefined)).toBeNull();
    expect(parseVersionNumber(-1)).toBeNull();
    expect(parseVersionNumber(1.5)).toBeNull();
  });
});

describe('evaluateUpdatePolicy (threshold 33)', () => {
  it('installed build 31 shows the popup', () => {
    expect(evaluateUpdatePolicy(enabledPolicy(), 31)).not.toBeNull();
  });

  it('installed build 32 shows the popup', () => {
    const result = evaluateUpdatePolicy(enabledPolicy(), 32);
    expect(result).toMatchObject({
      importance: 'important',
      minimumPopupBuild: 33,
      latestBuild: 35,
      installedBuild: 32,
      storeUrl: 'https://apps.apple.com/app/id0000000000',
    });
  });

  it('installed build 33 does not show the popup', () => {
    expect(evaluateUpdatePolicy(enabledPolicy(), 33)).toBeNull();
  });

  it('installed build 35 does not show the popup', () => {
    expect(evaluateUpdatePolicy(enabledPolicy(), 35)).toBeNull();
  });

  it('a disabled policy does not show the popup', () => {
    expect(
      evaluateUpdatePolicy(enabledPolicy({enabled: false}), 31),
    ).toBeNull();
  });

  it('a null policy or invalid build does not show the popup', () => {
    expect(evaluateUpdatePolicy(null, 31)).toBeNull();
    expect(evaluateUpdatePolicy(enabledPolicy(), null)).toBeNull();
  });
});

describe('parseUpdatePolicyResponse', () => {
  it('accepts a well-formed enabled policy', () => {
    expect(parseUpdatePolicyResponse(enabledPolicy(), APP_KEY, 'ios')).toEqual(
      enabledPolicy(),
    );
  });

  it('accepts a disabled policy without requiring content fields', () => {
    const parsed = parseUpdatePolicyResponse(
      {appKey: APP_KEY, platform: 'ios', enabled: false},
      APP_KEY,
      'ios',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.enabled).toBe(false);
  });

  it("rejects another app's policy", () => {
    expect(
      parseUpdatePolicyResponse(
        enabledPolicy({appKey: 'verbali_talk'}),
        APP_KEY,
        'ios',
      ),
    ).toBeNull();
  });

  it("rejects another platform's policy", () => {
    expect(
      parseUpdatePolicyResponse(
        enabledPolicy({platform: 'android'}),
        APP_KEY,
        'ios',
      ),
    ).toBeNull();
  });

  it('rejects invalid server data', () => {
    const bad: unknown[] = [
      null,
      'string',
      42,
      [],
      {},
      enabledPolicy({enabled: 'true' as any}),
      enabledPolicy({minimumPopupBuild: '33' as any}),
      enabledPolicy({minimumPopupBuild: -1}),
      enabledPolicy({minimumPopupBuild: 3.5}),
      enabledPolicy({latestBuild: undefined as any}),
      enabledPolicy({importance: 'mandatory' as any}),
      enabledPolicy({title: ''}),
      enabledPolicy({message: '   '}),
      enabledPolicy({storeUrl: ''}),
      enabledPolicy({storeUrl: undefined as any}),
    ];
    for (const payload of bad) {
      expect(parseUpdatePolicyResponse(payload, APP_KEY, 'ios')).toBeNull();
    }
  });
});

describe('buildUpdatePolicyUrl', () => {
  it('targets the public endpoint with appKey and platform', () => {
    expect(buildUpdatePolicyUrl('matalk', 'android', 'https://api.test')).toBe(
      `https://api.test${UPDATE_POLICY_PATH}?appKey=matalk&platform=android`,
    );
  });
});

describe('fetchUpdatePolicy', () => {
  it('returns the parsed policy on success and sends no auth header', async () => {
    mockFetchJson(enabledPolicy());
    const policy = await fetchUpdatePolicy(APP_KEY, 'ios');
    expect(policy).toEqual(enabledPolicy());
    const [, init] = (globalThis as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.signal).toBeDefined();
  });

  it('returns null on a non-2xx response', async () => {
    mockFetchJson({error: 'invalid_app_key'}, false);
    expect(await fetchUpdatePolicy(APP_KEY, 'ios')).toBeNull();
  });

  it('returns null (does not throw) on a network failure', async () => {
    (globalThis as any).fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetchUpdatePolicy(APP_KEY, 'ios')).resolves.toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    expect(await fetchUpdatePolicy(APP_KEY, 'ios')).toBeNull();
  });

  it('times out and returns null when the server never responds', async () => {
    jest.useFakeTimers();
    (globalThis as any).fetch = jest.fn(
      (_url: string, init: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('Aborted')),
          );
        }),
    );
    const promise = fetchUpdatePolicy(APP_KEY, 'ios', 50);
    jest.advanceTimersByTime(60);
    await expect(promise).resolves.toBeNull();
    jest.useRealTimers();
  });
});

describe('checkForUpdatePopup (end to end)', () => {
  it('shows for an eligible installation using the native build number', async () => {
    mockGetBuildNumber.mockReturnValue('31');
    mockFetchJson(enabledPolicy());
    const result = await checkForUpdatePopup();
    expect(result).toMatchObject({installedBuild: 31, minimumPopupBuild: 33});
    expect((globalThis as any).fetch.mock.calls[0][0]).toContain(
      `appKey=${APP_KEY}&platform=ios`,
    );
  });

  it('does not show when the installed build meets the threshold', async () => {
    mockGetBuildNumber.mockReturnValue('33');
    mockFetchJson(enabledPolicy());
    expect(await checkForUpdatePopup()).toBeNull();
  });

  it('requests the android policy on android', async () => {
    Platform.OS = 'android';
    mockGetBuildNumber.mockReturnValue('29');
    mockFetchJson(
      enabledPolicy({
        platform: 'android',
        storeUrl:
          'https://play.google.com/store/apps/details?id=com.verbali.matalkai',
      }),
    );
    const result = await checkForUpdatePopup();
    expect(result?.storeUrl).toContain('play.google.com');
    expect((globalThis as any).fetch.mock.calls[0][0]).toContain(
      'platform=android',
    );
  });

  it('does not show when the build number is not a plain integer', async () => {
    mockGetBuildNumber.mockReturnValue('6.2');
    mockFetchJson(enabledPolicy());
    expect(await checkForUpdatePopup()).toBeNull();
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('does not block or throw when the network fails', async () => {
    mockGetBuildNumber.mockReturnValue('31');
    (globalThis as any).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline'));
    await expect(checkForUpdatePopup()).resolves.toBeNull();
  });

  it('does not throw when DeviceInfo itself throws', async () => {
    mockGetBuildNumber.mockImplementation(() => {
      throw new Error('native module missing');
    });
    await expect(checkForUpdatePopup()).resolves.toBeNull();
  });
});

describe('once-per-session guard', () => {
  it('starts unset and is set only when explicitly marked', () => {
    expect(hasUpdatePopupBeenShownThisSession()).toBe(false);
    markUpdatePopupShown();
    expect(hasUpdatePopupBeenShownThisSession()).toBe(true);
    // Re-marking is idempotent (re-render / remount / foreground).
    markUpdatePopupShown();
    expect(hasUpdatePopupBeenShownThisSession()).toBe(true);
  });
});
