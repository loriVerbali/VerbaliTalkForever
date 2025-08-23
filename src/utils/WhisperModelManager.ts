import WhisperService from './WhisperService';
import {MODEL_CONFIG} from './constants';

interface WhisperModelStatus {
  available: boolean;
  lastChecked: number;
  reason?: string;
}

class WhisperModelManager {
  private static instance: WhisperModelManager;
  private isChecking: boolean = false;

  private constructor() {}

  public static getInstance(): WhisperModelManager {
    if (!WhisperModelManager.instance) {
      WhisperModelManager.instance = new WhisperModelManager();
    }
    return WhisperModelManager.instance;
  }

  /**
   * Check if we should perform a model availability check
   * Always check on app startup to ensure status is current
   */
  private shouldCheckModel(lastChecked: number): boolean {
    // Always check on app startup since users may manually add/remove the model
    return true;
  }

  /**
   * Perform model availability check and store results
   */
  public async checkModelAvailability<T extends string>(
    setItem: (key: T, value: string) => Promise<void>,
    getItem: (key: T) => Promise<string>,
  ): Promise<WhisperModelStatus> {
    // Prevent multiple simultaneous checks
    if (this.isChecking) {
      const available = await getItem('whisperModelAvailable');
      const lastChecked = await getItem('whisperModelLastChecked');
      return {
        available: available === '1',
        lastChecked: parseInt(lastChecked) || 0,
      };
    }

    this.isChecking = true;

    try {
      // Get last check time
      const lastCheckedStr = await getItem('whisperModelLastChecked');
      const lastChecked = parseInt(lastCheckedStr) || 0;

      // Always perform a check on app startup
      // Note: This ensures the status is current even if users manually add/remove the model

      // Perform the actual check
      const modelStatus = await WhisperService.getModelStatus();
      const now = Date.now();

      // Store results
      await setItem('whisperModelAvailable', modelStatus.available ? '1' : '0');
      await setItem('whisperModelLastChecked', now.toString());

      return {
        available: modelStatus.available,
        lastChecked: now,
        reason: modelStatus.reason,
      };
    } catch (error) {
      console.error('❌ Error checking Whisper model availability:', error);

      // Store error state
      const now = Date.now();
      await setItem('whisperModelAvailable', '0');
      await setItem('whisperModelLastChecked', now.toString());

      return {
        available: false,
        lastChecked: now,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Get cached model availability status
   */
  public async getCachedModelStatus<T extends string>(
    getItem: (key: T) => Promise<string>,
  ): Promise<WhisperModelStatus> {
    try {
      const available = await getItem('whisperModelAvailable' as T);
      const lastChecked = await getItem('whisperModelLastChecked' as T);

      return {
        available: available === '1',
        lastChecked: parseInt(lastChecked) || 0,
      };
    } catch (error) {
      console.error('Error getting cached model status:', error);
      return {
        available: false,
        lastChecked: 0,
      };
    }
  }

  /**
   * Force a fresh model availability check (ignores cache)
   */
  public async forceModelCheck<T extends string>(
    setItem: (key: T, value: string) => Promise<void>,
    getItem: (key: T) => Promise<string>,
  ): Promise<WhisperModelStatus> {
    // Reset last check time to force a new check
    await setItem('whisperModelLastChecked' as T, '0');

    return this.checkModelAvailability(setItem, getItem);
  }

  /**
   * Mark model as available (for when user manually downloads)
   */
  public async markModelAsAvailable<T extends string>(
    setItem: (key: T, value: string) => Promise<void>,
  ): Promise<void> {
    const now = Date.now();
    await setItem('whisperModelAvailable', '1');
    await setItem('whisperModelLastChecked', now.toString());
  }

  /**
   * Check model availability and automatically adjust useLocalWhisper setting
   * This is used during onboarding and app startup to ensure settings are consistent
   */
  public async checkModelAvailabilityAndAdjustSettings<T extends string>(
    setItem: (key: T, value: string) => Promise<void>,
    getItem: (key: T) => Promise<string>,
  ): Promise<WhisperModelStatus> {
    const modelStatus = await this.checkModelAvailability(setItem, getItem);

    // If model is not available, automatically set useLocalWhisper to false
    if (!modelStatus.available) {
      await setItem('useLocalWhisper' as T, '0');
    }

    return modelStatus;
  }

  /**
   * Check if local Whisper should be used based on configuration and availability
   */
  public async shouldUseLocalWhisper<T extends string>(
    getItem: (key: T) => Promise<string>,
  ): Promise<boolean> {
    // Get current Whisper setting
    const useLocalWhisper = await getItem('useLocalWhisper' as T);

    // First check if local Whisper is enabled in config
    if (!MODEL_CONFIG.shouldUseLocalWhisper(useLocalWhisper === '1')) {
      return false;
    }

    // Then check if model is available
    const cachedStatus = await this.getCachedModelStatus(getItem);
    return cachedStatus.available;
  }

  /**
   * Get detailed status for debugging
   */
  public async getDetailedStatus<T extends string>(
    setItem: (key: T, value: string) => Promise<void>,
    getItem: (key: T) => Promise<string>,
  ): Promise<{
    configEnabled: boolean;
    cachedAvailable: boolean;
    actualAvailable: boolean;
    lastChecked: number;
    shouldCheck: boolean;
    reason?: string;
  }> {
    // Get current Whisper setting for config check
    const useLocalWhisper = await getItem('useLocalWhisper' as T);

    const configEnabled = MODEL_CONFIG.shouldUseLocalWhisper(
      useLocalWhisper === '1',
    );
    const cachedStatus = await this.getCachedModelStatus(getItem);
    const shouldCheck = this.shouldCheckModel(cachedStatus.lastChecked);

    // Get the current model status without triggering another check
    const modelStatus = await WhisperService.getModelStatus();

    return {
      configEnabled,
      cachedAvailable: cachedStatus.available,
      actualAvailable: modelStatus.available,
      lastChecked: cachedStatus.lastChecked,
      shouldCheck,
      reason: modelStatus.reason,
    };
  }
}

export default WhisperModelManager.getInstance();
