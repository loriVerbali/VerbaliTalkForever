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
  console.log('=== Testing Special Places Matching ===');

  // This would normally use the actual checkSpecialPlaces function
  // For now, we'll just log what we would test

  testAddresses.forEach((address, index) => {
    console.log(`\nTest ${index + 1}: ${address}`);
    console.log('Expected matches:');

    if (address.includes('123 Main Street')) {
      console.log('- Should match: Home');
    } else if (address.includes('Lincoln Elementary')) {
      console.log('- Should match: School');
    } else if (address.includes('Sunshine Therapy')) {
      console.log('- Should match: Therapy');
    } else {
      console.log('- Should match: None');
    }
  });

  console.log('\n=== Test Complete ===');
};

// Function to simulate saving special places (for testing)
export const saveTestSpecialPlaces = async (
  setItem: (key: string, value: string) => Promise<void>,
) => {
  try {
    await setItem('specialPlaces', JSON.stringify(mockSpecialPlaces));
    console.log('Test special places saved successfully');
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
    console.log('Special places cleared');
  } catch (error) {
    console.error('Error clearing special places:', error);
  }
};
