import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import {useAppSettings} from '../utils/persistance';
import {useChatContext} from '../contexts/ChatContextProvider';
import FastImage from 'react-native-fast-image';

const {width, height} = Dimensions.get('window');

interface SpecialPlace {
  type: 'home' | 'school' | 'therapy';
  address: string;
  isCurrentLocation: boolean;
}

interface SpecialPlacesProps {
  onComplete?: () => void;
  isSettingsMode?: boolean;
}

const SpecialPlaces: React.FC<SpecialPlacesProps> = ({
  onComplete,
  isSettingsMode = false,
}) => {
  const {setItem, getItem} = useAppSettings();
  const {location} = useChatContext();

  const [places, setPlaces] = useState<SpecialPlace[]>([
    {type: 'home', address: '', isCurrentLocation: false},
    {type: 'school', address: '', isCurrentLocation: false},
    {type: 'therapy', address: '', isCurrentLocation: false},
  ]);

  // Load saved places on component mount
  useEffect(() => {
    loadSavedPlaces();
  }, []);

  // Set current location address when location data is available
  useEffect(() => {
    if (location?.display_name) {
      setPlaces(prev =>
        prev.map(place => ({
          ...place,
          address: place.isCurrentLocation
            ? location.display_name || ''
            : place.address,
        })),
      );
    }
  }, [location]);

  const loadSavedPlaces = async () => {
    try {
      const savedPlaces = await getItem('specialPlaces');
      if (savedPlaces) {
        const parsedPlaces = JSON.parse(savedPlaces);
        setPlaces(parsedPlaces);
      }
    } catch (error) {
      console.error('Error loading saved places:', error);
    }
  };

  const handleAddressChange = (
    type: 'home' | 'school' | 'therapy',
    address: string,
  ) => {
    setPlaces(prev =>
      prev.map(place =>
        place.type === type
          ? {...place, address, isCurrentLocation: false}
          : place,
      ),
    );
  };

  const handleCurrentLocationToggle = (type: 'home' | 'school' | 'therapy') => {
    if (!location?.display_name) {
      Alert.alert(
        'Location Required',
        'Please enable location services to use current location.',
      );
      return;
    }

    setPlaces(prev =>
      prev.map(place =>
        place.type === type
          ? {
              ...place,
              isCurrentLocation: !place.isCurrentLocation,
              address: !place.isCurrentLocation
                ? location.display_name || ''
                : place.address,
            }
          : place,
      ),
    );
  };

  const handleSave = async (type: 'home' | 'school' | 'therapy') => {
    const place = places.find(p => p.type === type);
    if (!place?.address.trim()) {
      Alert.alert('Address Required', `Please enter an address for ${type}.`);
      return;
    }

    try {
      // Save individual place
      await setItem(`${type}Address`, place.address);
      await setItem(
        `${type}IsCurrentLocation`,
        place.isCurrentLocation.toString(),
      );

      // Save all places
      await setItem('specialPlaces', JSON.stringify(places));

      Alert.alert(
        'Success',
        `${type.charAt(0).toUpperCase() + type.slice(1)} address saved!`,
      );

      // Call onComplete if provided (for onboarding flow)
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error saving place:', error);
      Alert.alert('Error', 'Failed to save address. Please try again.');
    }
  };

  const handleDelete = async (type: 'home' | 'school' | 'therapy') => {
    Alert.alert(
      'Delete Address',
      `Are you sure you want to delete the ${type} address?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear the place data
              setPlaces(prev =>
                prev.map(place =>
                  place.type === type
                    ? {...place, address: '', isCurrentLocation: false}
                    : place,
                ),
              );

              // Remove from storage
              await setItem(`${type}Address`, '');
              await setItem(`${type}IsCurrentLocation`, 'false');

              // Update all places in storage
              const updatedPlaces = places.map(place =>
                place.type === type
                  ? {...place, address: '', isCurrentLocation: false}
                  : place,
              );
              await setItem('specialPlaces', JSON.stringify(updatedPlaces));

              Alert.alert(
                'Deleted',
                `${
                  type.charAt(0).toUpperCase() + type.slice(1)
                } address deleted.`,
              );
            } catch (error) {
              console.error('Error deleting place:', error);
              Alert.alert(
                'Error',
                'Failed to delete address. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const getPlaceIcon = (type: 'home' | 'school' | 'therapy') => {
    switch (type) {
      case 'home':
        return '🏠';
      case 'school':
        return '🏫';
      case 'therapy':
        return '🏥';
      default:
        return '📍';
    }
  };

  const getPlaceTitle = (type: 'home' | 'school' | 'therapy') => {
    switch (type) {
      case 'home':
        return 'Home';
      case 'school':
        return 'School';
      case 'therapy':
        return 'Therapy';
      default:
        return 'Place';
    }
  };

  return (
    <View style={isSettingsMode ? styles.settingsContainer : styles.container}>
      {!isSettingsMode && (
        <Text style={styles.headerText}>
          Help Matalk provide better suggestions by setting up your special
          places. You can skip this step and set them up later.
        </Text>
      )}

      <View style={styles.columnsContainer}>
        {places.map(place => (
          <View key={place.type} style={styles.column}>
            <View style={styles.columnHeader}>
              <Text style={styles.iconText}>{getPlaceIcon(place.type)}</Text>
              <Text style={styles.columnTitle}>
                {getPlaceTitle(place.type)}
              </Text>
            </View>

            <TextInput
              style={styles.addressInput}
              placeholder={`Enter ${place.type} address`}
              value={place.address}
              onChangeText={text => handleAddressChange(place.type, text)}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[
                styles.currentLocationButton,
                place.isCurrentLocation && styles.currentLocationButtonActive,
              ]}
              onPress={() => handleCurrentLocationToggle(place.type)}>
              <Text
                style={[
                  styles.currentLocationText,
                  place.isCurrentLocation && styles.currentLocationTextActive,
                ]}>
                {place.isCurrentLocation
                  ? '✓ Current Location'
                  : 'Use Current Location'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                !place.address.trim() && styles.saveButtonDisabled,
              ]}
              onPress={() => handleSave(place.type)}
              disabled={!place.address.trim()}>
              <Text
                style={[
                  styles.saveButtonText,
                  !place.address.trim() && styles.saveButtonTextDisabled,
                ]}>
                Save
              </Text>
            </TouchableOpacity>

            {place.address.trim() && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(place.type)}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: height * 0.6,
    paddingHorizontal: 20,
  },
  settingsContainer: {
    width: '100%',
    paddingHorizontal: 0,
  },
  headerText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  columnsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
  },
  column: {
    width: '31%',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  columnHeader: {
    alignItems: 'center',
    marginBottom: 15,
  },
  iconText: {
    fontSize: 32,
    marginBottom: 8,
  },
  columnTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  addressInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  currentLocationButton: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  currentLocationButtonActive: {
    backgroundColor: '#2196F3',
  },
  currentLocationText: {
    fontSize: 12,
    color: '#2196F3',
    textAlign: 'center',
    fontWeight: '600',
  },
  currentLocationTextActive: {
    color: '#FFF',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveButtonTextDisabled: {
    color: '#999',
  },
  deleteButton: {
    backgroundColor: '#FF5757',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default SpecialPlaces;
