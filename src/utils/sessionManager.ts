import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useAppSettings } from './persistance';
import AppConfig from './config';
import CryptoJS from 'crypto-js';

const API_BASE_URL = AppConfig.baseUrl;

class SessionManager {
  private refreshInFlight = false;
  private refreshInterval = 24 * 60 * 60 * 1000; // 24 hours
  private appSettings: ReturnType<typeof useAppSettings> | null = null;

  // Initialize with app settings context
  setAppSettings(appSettings: ReturnType<typeof useAppSettings>) {
    this.appSettings = appSettings;
  }

  private async getAppSettings() {
    if (!this.appSettings) {
      throw new Error('SessionManager not initialized with app settings');
    }
    return this.appSettings;
  }

  async initializeSession(): Promise<string | null> {
    try {
      const { getItem, setItem } = await this.getAppSettings();

      // Get or create installation GUID (legacy)
      let installationGuid = await getItem('installationGuid');
      if (installationGuid === 'init.NotSet' || !installationGuid) {
        installationGuid = this.generateGuid();
        await setItem('installationGuid', installationGuid);
      }

      // Get or create Device ID (Stable per install)
      await this.ensureDeviceId();

      // Initialize guest session with installation GUID
      const response = await fetch(`${API_BASE_URL}/api/session/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guid: installationGuid }),
      });

      const data = await response.json();

      if (data.ok && data.token) {
        await setItem('sessionToken', data.token);

        return data.token;
      }

      throw new Error('Failed to initialize session');
    } catch (error) {
      return null;
    }
  }

  async getSessionToken(): Promise<string | null> {
    try {
      const { getItem } = await this.getAppSettings();
      const token = await getItem('sessionToken');
      return token === 'init.NotSet' ? null : token;
    } catch (error) {
      return null;
    }
  }

  async getInstallationGuid(): Promise<string | null> {
    try {
      const { getItem } = await this.getAppSettings();
      const guid = await getItem('installationGuid');
      return guid === 'init.NotSet' ? null : guid;
    } catch (error) {
      return null;
    }
  }

  async ensureValidSession(): Promise<string | null> {
    const token = await this.getSessionToken();

    if (!token) {
      // No token, initialize new session
      return await this.initializeSession();
    }

    // Check if we need to validate (once per day)
    const { getItem, setItem } = await this.getAppSettings();
    const lastCheck = await getItem('lastRefreshCheck');
    const now = Date.now();

    if (!lastCheck || now - parseInt(lastCheck) > this.refreshInterval) {
      await setItem('lastRefreshCheck', now.toString());

      try {
        const needsRefresh = await this.checkIfRefreshNeeded(token);
        if (needsRefresh) {
          return await this.refreshSession(token);
        }
      } catch (error) {
        // If validation fails, try to refresh anyway
        return await this.refreshSession(token);
      }
    }

    return token;
  }

  private async checkIfRefreshNeeded(token: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/api/session/validate`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      return data.session?.needsRefresh || false;
    }

    return true; // If validation fails, assume refresh needed
  }

  async refreshSession(currentToken?: string): Promise<string | null> {
    if (this.refreshInFlight) {
      // Wait for existing refresh to complete
      while (this.refreshInFlight) {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 100));
      }
      return await this.getSessionToken();
    }

    this.refreshInFlight = true;

    try {
      const token = currentToken || (await this.getSessionToken());
      if (!token) {
        return await this.initializeSession();
      }

      const response = await fetch(`${API_BASE_URL}/api/session/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.ok && data.token) {
        const { setItem } = await this.getAppSettings();
        await setItem('sessionToken', data.token);
        return data.token;
      }

      // If refresh fails, initialize new session
      return await this.initializeSession();
    } catch (error) {
      return await this.initializeSession();
    } finally {
      this.refreshInFlight = false;
    }
  }

  async clearSession(): Promise<void> {
    // Clear session token but keep installation GUID
    const { setItem } = await this.getAppSettings();
    await setItem('sessionToken', 'init.NotSet');
    await setItem('lastRefreshCheck', '0');
  }

  async resetInstallation(): Promise<void> {
    // Clear everything including installation GUID (for testing or app reset)
    const { setItem } = await this.getAppSettings();
    await setItem('installationGuid', 'init.NotSet');
    await setItem('deviceId', 'init.NotSet');
    await setItem('sessionToken', 'init.NotSet');
    await setItem('lastRefreshCheck', '0');
    await setItem('isEnrolled', '0');
    await setItem('orgName', '');
  }

  async getDeviceId(): Promise<string | null> {
    try {
      const { getItem } = await this.getAppSettings();
      const deviceId = await getItem('deviceId');
      return deviceId === 'init.NotSet' ? null : deviceId;
    } catch (error) {
      return null;
    }
  }

  async ensureDeviceId(): Promise<string> {
    const { getItem, setItem } = await this.getAppSettings();
    let deviceId = await getItem('deviceId');

    if (deviceId === 'init.NotSet' || !deviceId) {
      deviceId = await this.generateDeviceId();
      await setItem('deviceId', deviceId);
    }

    return deviceId;
  }

  private async generateDeviceId(): Promise<string> {
    try {
      const deviceName = await DeviceInfo.getDeviceName();
      const installTimestamp = await DeviceInfo.getFirstInstallTime();
      const randomSeed = Math.random().toString(36).substring(7);

      const combined = `${deviceName}${installTimestamp}${randomSeed}`;
      return CryptoJS.SHA256(combined).toString();
    } catch (error) {
      // Fallback to GUID if DeviceInfo fails
      return this.generateGuid();
    }
  }

  async bootstrapDevice(): Promise<{
    success: boolean;
    enrolled?: boolean;
    organization?: any;
    features?: any;
    error?: string;
  }> {
    try {
      const { setItem } = await this.getAppSettings();
      const deviceId = await this.ensureDeviceId();
      const token = await this.ensureValidSession();

      if (!token) {
        return { success: false, error: 'session_init_failed' };
      }

      const response = await fetch(`${API_BASE_URL}/device/bootstrap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceIdentifier: deviceId,
          platform: Platform.OS,
          appVersion: DeviceInfo.getVersion(),
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error(`Bootstrap failed with status ${response.status}:`, responseText);

        if (response.status === 403) {
          try {
            const data = JSON.parse(responseText);
            if (data.error === 'device_revoked' || data.error === 'organization_inactive') {
              const { setItem } = await this.getAppSettings();
              await setItem('deviceRevoked', '1');
              return { success: false, error: data.error };
            }
          } catch (e) {
            console.error('Failed to parse 403 bootstrap response:', e);
          }
        }
        return { success: false, error: `server_error_${response.status}` };
      }

      let data;
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse bootstrap response as JSON:', responseText);
        return { success: false, error: 'invalid_json' };
      }

      if (data.success) {
        const { setItem } = await this.getAppSettings();
        await setItem('deviceRevoked', '0'); // Clear if it was previously revoked
        if (data.enrolled) {
          await setItem('isEnrolled', '1');
          if (data.organization?.name) {
            await setItem('orgName', data.organization.name);
          }
        } else {
          await setItem('isEnrolled', '0');
        }
        return data;
      } else if (data.error) {
        if (data.error === 'device_revoked' || data.error === 'organization_inactive') {
          const { setItem } = await this.getAppSettings();
          await setItem('deviceRevoked', '1');
        }
        return { success: false, error: data.error };
      }

      return { success: false, error: 'unknown_error' };
    } catch (error) {
      console.error('Bootstrap error:', error);
      return { success: false, error: 'network_error' };
    }
  }

  private generateGuid(): string {
    // Generate a proper GUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }
}

export const sessionManager = new SessionManager();
