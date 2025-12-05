import {useAppSettings} from './persistance';
import AppConfig from './config';

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
      const {getItem, setItem} = await this.getAppSettings();

      // Get or create installation GUID
      let installationGuid = await getItem('installationGuid');
      if (installationGuid === 'init.NotSet' || !installationGuid) {
        installationGuid = this.generateGuid();
        await setItem('installationGuid', installationGuid);
        console.log('Generated new installation GUID:', installationGuid);
      }

      // Initialize guest session with installation GUID
      const response = await fetch(`${API_BASE_URL}/api/session/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({guid: installationGuid}),
      });

      const data = await response.json();

      if (data.ok && data.token) {
        await setItem('sessionToken', data.token);
        console.log(
          'Guest session initialized for installation:',
          installationGuid,
        );
        return data.token;
      }

      throw new Error('Failed to initialize session');
    } catch (error) {
      console.error('Session initialization failed:', error);
      return null;
    }
  }

  async getSessionToken(): Promise<string | null> {
    try {
      const {getItem} = await this.getAppSettings();
      const token = await getItem('sessionToken');
      return token === 'init.NotSet' ? null : token;
    } catch (error) {
      console.error('Error getting session token:', error);
      return null;
    }
  }

  async getInstallationGuid(): Promise<string | null> {
    try {
      const {getItem} = await this.getAppSettings();
      const guid = await getItem('installationGuid');
      return guid === 'init.NotSet' ? null : guid;
    } catch (error) {
      console.error('Error getting installation GUID:', error);
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
    const {getItem, setItem} = await this.getAppSettings();
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
        console.error('Session validation failed:', error);
        // If validation fails, try to refresh anyway
        return await this.refreshSession(token);
      }
    }

    return token;
  }

  private async checkIfRefreshNeeded(token: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/api/session/validate`, {
      headers: {Authorization: `Bearer ${token}`},
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
        await new Promise(resolve => setTimeout(resolve, 100));
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
        headers: {Authorization: `Bearer ${token}`},
      });

      const data = await response.json();

      if (data.ok && data.token) {
        const {setItem} = await this.getAppSettings();
        await setItem('sessionToken', data.token);
        console.log(
          'Session refreshed for installation:',
          await this.getInstallationGuid(),
        );
        return data.token;
      }

      // If refresh fails, initialize new session
      return await this.initializeSession();
    } catch (error) {
      console.error('Session refresh failed:', error);
      return await this.initializeSession();
    } finally {
      this.refreshInFlight = false;
    }
  }

  async clearSession(): Promise<void> {
    // Clear session token but keep installation GUID
    const {setItem} = await this.getAppSettings();
    await setItem('sessionToken', 'init.NotSet');
    await setItem('lastRefreshCheck', '0');
    console.log('Session cleared, installation GUID preserved');
  }

  async resetInstallation(): Promise<void> {
    // Clear everything including installation GUID (for testing or app reset)
    const {setItem} = await this.getAppSettings();
    await setItem('installationGuid', 'init.NotSet');
    await setItem('sessionToken', 'init.NotSet');
    await setItem('lastRefreshCheck', '0');
    console.log('Installation reset - new GUID will be generated on next init');
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
