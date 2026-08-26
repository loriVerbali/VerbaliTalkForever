/**
 * App Update Service
 *
 * Decides whether the start-up "update available" popup should be shown for
 * this installation:
 *
 *   showPopup = policy.enabled && installedBuild < policy.minimumPopupBuild
 *
 * - `installedBuild` is the native, monotonically increasing build number
 *   (Android versionCode / iOS CFBundleVersion) via DeviceInfo.getBuildNumber().
 * - The policy is fetched from the public backend endpoint for this app's
 *   compile-time APP_KEY and the current Platform.OS.
 * - Every failure path (network, timeout, malformed response, disabled policy,
 *   invalid build number) resolves to `null` — never throws, never blocks startup.
 * - A module-scoped guard guarantees the popup is shown at most once per native
 *   app session (survives re-renders, remounts and background/foreground).
 */
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import AppConfig from './config';
import {APP_KEY} from './appIdentity';
import type {
  DisplayableUpdatePolicy,
  UpdateImportance,
  UpdatePlatform,
  UpdatePolicyResponse,
} from '../types/appUpdate';

export const UPDATE_POLICY_PATH = '/api/app-update';
export const UPDATE_POLICY_TIMEOUT_MS = 5000;

const IMPORTANCE_VALUES: readonly UpdateImportance[] = [
  'recommended',
  'important',
];

// ─── Once-per-session guard ──────────────────────────────────────────────────
// In-memory only. Deliberately NOT persisted (AsyncStorage / DefaultPreference /
// DB) so a fresh native launch may show the popup again.
let updatePopupShownThisSession = false;

export const hasUpdatePopupBeenShownThisSession = (): boolean =>
  updatePopupShownThisSession;

/** Call only when the modal is actually displayed. */
export const markUpdatePopupShown = (): void => {
  updatePopupShownThisSession = true;
};

/** Test-only helper. */
export const __resetUpdatePopupSessionForTests = (): void => {
  updatePopupShownThisSession = false;
};

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export const getCurrentPlatform = (): UpdatePlatform | null => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }
  return null;
};

/**
 * Parse the native build number into a non-negative integer.
 * Returns null for anything that is not a plain integer string.
 */
export const parseBuildNumber = (raw: unknown): number | null => {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Strictly validate a raw server payload. Returns null unless every field is
 * present, well-typed and the appKey/platform match this installation.
 * A disabled policy is returned as-is (enabled=false) so callers can decide.
 */
export const parseUpdatePolicyResponse = (
  json: unknown,
  expectedAppKey: string,
  expectedPlatform: UpdatePlatform,
): UpdatePolicyResponse | null => {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const data = json as Record<string, unknown>;

  if (data.appKey !== expectedAppKey) {
    return null;
  }
  if (data.platform !== expectedPlatform) {
    return null;
  }
  if (typeof data.enabled !== 'boolean') {
    return null;
  }

  if (!data.enabled) {
    return {
      appKey: expectedAppKey,
      platform: expectedPlatform,
      enabled: false,
      minimumPopupBuild: 0,
      latestBuild: 0,
      importance: 'recommended',
      title: '',
      message: '',
      storeUrl: '',
    };
  }

  if (!isNonNegativeInteger(data.minimumPopupBuild)) {
    return null;
  }
  if (!isNonNegativeInteger(data.latestBuild)) {
    return null;
  }
  if (
    typeof data.importance !== 'string' ||
    !IMPORTANCE_VALUES.includes(data.importance as UpdateImportance)
  ) {
    return null;
  }
  if (!isNonEmptyString(data.title) || !isNonEmptyString(data.message)) {
    return null;
  }
  if (!isNonEmptyString(data.storeUrl)) {
    return null;
  }

  return {
    appKey: expectedAppKey,
    platform: expectedPlatform,
    enabled: true,
    minimumPopupBuild: data.minimumPopupBuild,
    latestBuild: data.latestBuild,
    importance: data.importance as UpdateImportance,
    title: data.title.trim(),
    message: data.message.trim(),
    storeUrl: data.storeUrl.trim(),
  };
};

/**
 * The single authoritative eligibility rule.
 */
export const evaluateUpdatePolicy = (
  policy: UpdatePolicyResponse | null,
  installedBuild: number | null,
): DisplayableUpdatePolicy | null => {
  if (!policy || !policy.enabled) {
    return null;
  }
  if (installedBuild === null) {
    return null;
  }
  if (!(installedBuild < policy.minimumPopupBuild)) {
    return null;
  }
  return {
    importance: policy.importance,
    title: policy.title,
    message: policy.message,
    storeUrl: policy.storeUrl,
    minimumPopupBuild: policy.minimumPopupBuild,
    latestBuild: policy.latestBuild,
    installedBuild,
  };
};

// ─── Network ─────────────────────────────────────────────────────────────────

export const buildUpdatePolicyUrl = (
  appKey: string,
  platform: UpdatePlatform,
  baseUrl: string = AppConfig.baseUrl,
): string =>
  `${baseUrl}${UPDATE_POLICY_PATH}?appKey=${encodeURIComponent(
    appKey,
  )}&platform=${encodeURIComponent(platform)}`;

/**
 * Fetch and validate the policy for this app/platform. Resolves to null on any
 * failure. Public endpoint — no session token required.
 */
export const fetchUpdatePolicy = async (
  appKey: string,
  platform: UpdatePlatform,
  timeoutMs: number = UPDATE_POLICY_TIMEOUT_MS,
): Promise<UpdatePolicyResponse | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildUpdatePolicyUrl(appKey, platform), {
      method: 'GET',
      headers: {Accept: 'application/json'},
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const json = await response.json();
    return parseUpdatePolicyResponse(json, appKey, platform);
  } catch (error) {
    if (__DEV__) {
      console.warn('[AppUpdate] policy fetch failed:', error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Full start-up check. Returns a displayable policy when this installation is
 * eligible for the popup, otherwise null. Never throws.
 */
export const checkForUpdatePopup =
  async (): Promise<DisplayableUpdatePolicy | null> => {
    try {
      const platform = getCurrentPlatform();
      if (!platform) {
        return null;
      }
      const installedBuild = parseBuildNumber(DeviceInfo.getBuildNumber());
      if (installedBuild === null) {
        return null;
      }
      const policy = await fetchUpdatePolicy(APP_KEY, platform);
      return evaluateUpdatePolicy(policy, installedBuild);
    } catch {
      return null;
    }
  };
