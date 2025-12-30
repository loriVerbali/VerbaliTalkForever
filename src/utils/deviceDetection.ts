import DeviceInfo from 'react-native-device-info';

export interface DeviceCapabilities {
  isLowEndDevice: boolean;
  deviceModel: string;
  deviceBrand: string;
  totalMemoryMB: number;
}

/**
 * Detect if device is low-end and should use smaller models
 * Pi-3 tablets and similar low-end devices benefit from smaller models
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  try {
    const deviceModel = await DeviceInfo.getModel();
    const deviceBrand = await DeviceInfo.getBrand();
    const totalMemory = await DeviceInfo.getTotalMemory();

    // Convert to MB for easier comparison
    const totalMemoryMB = totalMemory / (1024 * 1024);

    // Check for known low-end devices or devices with limited resources
    const lowEndIndicators = [
      'P3_8', // Pi-3 tablet
      'p3_8', // Alternative naming
      'raspberry', // Raspberry Pi devices
    ];

    const deviceInfoLower = `${deviceModel} ${deviceBrand}`.toLowerCase();
    const isKnownLowEnd = lowEndIndicators.some(indicator =>
      deviceInfoLower.includes(indicator),
    );

    // Consider device low-end if:
    // 1. Known low-end device model, OR
    // 2. Less than 2GB RAM (common threshold for low-end devices)
    const isLowEndDevice = isKnownLowEnd || totalMemoryMB < 2048;

    return {
      isLowEndDevice,
      deviceModel,
      deviceBrand,
      totalMemoryMB,
    };
  } catch (error) {
    // Default to low-end on error to be safe
    return {
      isLowEndDevice: true,
      deviceModel: 'Unknown',
      deviceBrand: 'Unknown',
      totalMemoryMB: 0,
    };
  }
}
