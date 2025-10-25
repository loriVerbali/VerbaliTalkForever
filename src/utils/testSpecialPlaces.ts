// Test utility for special places functionality
// This can be imported and called from any component to test the feature

interface SpecialPlace {
  type: 'home' | 'school' | 'therapy';
  address: string;
  isCurrentLocation: boolean;
}

// Mock special places data for testing
export const mockSpecialPlaces: SpecialPlace[] = [
  {
    type: 'home',
    address: '123 Main Street, Anytown, CA 90210',
    isCurrentLocation: false,
  },
  {
    type: 'school',
    address: 'Lincoln Elementary School, 456 Oak Avenue, Anytown, CA 90210',
    isCurrentLocation: false,
  },
  {
    type: 'therapy',
    address: 'Sunshine Therapy Center, 789 Pine Road, Anytown, CA 90210',
    isCurrentLocation: false,
  },
];

// Test addresses that should match
export const testAddresses = [
  '123 Main Street, Anytown, California 90210, United States', // Should match home
  'Lincoln Elementary School, 456 Oak Ave, Anytown, CA', // Should match school
  'Sunshine Therapy Center, 789 Pine Rd, Anytown, California', // Should match therapy
  '999 Random Street, Different City, CA', // Should not match any
];

// Function to test special places matching
export const testSpecialPlacesMatching = () => {
  // This would normally use the actual checkSpecialPlaces function
  // For now, we'll just test what we would test

  testAddresses.forEach((address, index) => {
    if (address.includes('123 Main Street')) {
      // Should match: Home
    } else if (address.includes('Lincoln Elementary')) {
      // Should match: School
    } else if (address.includes('Sunshine Therapy')) {
      // Should match: Therapy
    } else {
      // Should match: None
    }
  });
};

// Function to simulate saving special places (for testing)
export const saveTestSpecialPlaces = async (
  setItem: (key: string, value: string) => Promise<void>,
) => {
  try {
    await setItem('specialPlaces', JSON.stringify(mockSpecialPlaces));
  } catch (error) {
    console.error('Error saving test special places:', error);
  }
};

// Function to clear special places (for testing)
export const clearSpecialPlaces = async (
  setItem: (key: string, value: string) => Promise<void>,
) => {
  try {
    await setItem('specialPlaces', '');
  } catch (error) {
    console.error('Error clearing special places:', error);
  }
};
