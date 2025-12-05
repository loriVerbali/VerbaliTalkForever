import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  Modal,
  ScrollView,
  FlatList,
} from 'react-native';
import {useAppSettings} from '../utils/persistance';
import {useChatContext} from '../contexts/ChatContextProvider';

const {width, height} = Dimensions.get('window');

interface AddressDetails {
  address: string;
  address2: string;
  city: string;
  state: string;
  zipcode: string;
  country: 'USA' | 'Canada' | 'Other';
}

interface SpecialPlace {
  type: 'home' | 'school' | 'therapy';
  addressDetails: AddressDetails;
  isCurrentLocation: boolean;
}

interface SpecialPlacesProps {
  onComplete?: () => void;
  isSettingsMode?: boolean;
}

// US States
const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
];

// Canadian Provinces
const CANADIAN_PROVINCES = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon',
];

const SpecialPlaces: React.FC<SpecialPlacesProps> = ({
  onComplete,
  isSettingsMode = false,
}) => {
  const {setItem, getItem} = useAppSettings();
  const {location} = useChatContext();

  const [places, setPlaces] = useState<SpecialPlace[]>([
    {
      type: 'home',
      addressDetails: {
        address: '',
        address2: '',
        city: '',
        state: '',
        zipcode: '',
        country: 'USA',
      },
      isCurrentLocation: false,
    },
    {
      type: 'school',
      addressDetails: {
        address: '',
        address2: '',
        city: '',
        state: '',
        zipcode: '',
        country: 'USA',
      },
      isCurrentLocation: false,
    },
    {
      type: 'therapy',
      addressDetails: {
        address: '',
        address2: '',
        city: '',
        state: '',
        zipcode: '',
        country: 'USA',
      },
      isCurrentLocation: false,
    },
  ]);

  const [showStateModal, setShowStateModal] = useState<{
    show: boolean;
    placeType: 'home' | 'school' | 'therapy' | null;
  }>({show: false, placeType: null});

  const [showCountryModal, setShowCountryModal] = useState<{
    show: boolean;
    placeType: 'home' | 'school' | 'therapy' | null;
  }>({show: false, placeType: null});

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
          addressDetails: place.isCurrentLocation
            ? parseLocationToAddressDetails(location.display_name || '')
            : place.addressDetails,
        })),
      );
    }
  }, [location]);

  const parseLocationToAddressDetails = (
    locationString: string,
  ): AddressDetails => {
    // Parse location string - handle different formats
    const parts = locationString.split(', ');

    // Handle various formats:
    // Format 1: "Place Name, 7000, Old Gate Road, Neighborhood, City, County, State, Zip, Country"
    // Format 2: "123, Main Street, City, State, Country"
    // Format 3: "123 Main Street, City, State, Country"
    // Format 4: "Main Street, City, State, Country"

    let address = '';
    let city = '';
    let state = '';
    let zipcode = '';
    let country = 'USA';

    if (parts.length >= 8) {
      // Format: "Place Name, 7000, Old Gate Road, Neighborhood, City, County, State, Zip, Country"
      // Skip the first part (place name) and combine street number and name
      address = `${parts[1]} ${parts[2]}`.trim();
      city = parts[4] || '';
      state = parts[6] || '';
      zipcode = parts[7] || '';
      country =
        parts[8] === 'United States'
          ? 'USA'
          : parts[8] === 'Canada'
          ? 'Canada'
          : 'USA';
    } else if (parts.length >= 5) {
      // Format: "123, Main Street, City, State, Country"
      address = `${parts[0]} ${parts[1]}`.trim();
      city = parts[2] || '';
      state = parts[3] || '';
      country = parts[4] === 'Canada' ? 'Canada' : 'USA';
    } else if (parts.length === 4) {
      // Format: "123 Main Street, City, State, Country"
      address = parts[0] || '';
      city = parts[1] || '';
      state = parts[2] || '';
      country = parts[3] === 'Canada' ? 'Canada' : 'USA';
    } else if (parts.length === 3) {
      // Format: "Address, City, State"
      address = parts[0] || '';
      city = parts[1] || '';
      state = parts[2] || '';
    } else if (parts.length === 2) {
      // Format: "Address, City"
      address = parts[0] || '';
      city = parts[1] || '';
    } else {
      // Single part - use as address
      address = parts[0] || '';
    }

    // Validate state against our known states
    const validStates = country === 'Canada' ? CANADIAN_PROVINCES : US_STATES;
    const normalizedState = state.trim();
    const isValidState = validStates.includes(normalizedState);

    // If state is not valid, log a warning but keep the parsed value
    if (normalizedState && !isValidState) {
      console.warn(
        `Parsed state "${normalizedState}" is not in the ${country} states list`,
      );
    }

    return {
      address: address.trim(),
      address2: '',
      city: city.trim(),
      state: normalizedState,
      zipcode: zipcode.trim(),
      country: country as 'USA' | 'Canada' | 'Other',
    };
  };

  const formatAddressToString = (addressDetails: AddressDetails): string => {
    const parts = [
      addressDetails.address,
      addressDetails.address2,
      addressDetails.city,
      addressDetails.state,
      addressDetails.zipcode,
      addressDetails.country,
    ].filter(part => part.trim() !== '');

    return parts.join(', ');
  };

  const loadSavedPlaces = async () => {
    try {
      const savedPlaces = await getItem('specialPlaces');
      if (savedPlaces) {
        const parsedPlaces = JSON.parse(savedPlaces);
        // Handle backward compatibility with old format
        const migratedPlaces = parsedPlaces.map((place: any) => {
          if (typeof place.address === 'string') {
            // Old format - migrate to new format
            return {
              ...place,
              addressDetails: parseLocationToAddressDetails(
                place.address || '',
              ),
            };
          }
          return place;
        });
        setPlaces(migratedPlaces);
      }
    } catch (error) {
      console.error('Error loading saved places:', error);
    }
  };

  const handleAddressFieldChange = (
    type: 'home' | 'school' | 'therapy',
    field: keyof AddressDetails,
    value: string,
  ) => {
    setPlaces(prev =>
      prev.map(place =>
        place.type === type
          ? {
              ...place,
              addressDetails: {
                ...place.addressDetails,
                [field]: value,
              },
              isCurrentLocation: false,
            }
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
              addressDetails: !place.isCurrentLocation
                ? parseLocationToAddressDetails(location.display_name || '')
                : place.addressDetails,
            }
          : place,
      ),
    );
  };

  const handleSave = async (type: 'home' | 'school' | 'therapy') => {
    const place = places.find(p => p.type === type);
    if (
      !place?.addressDetails.address.trim() ||
      !place?.addressDetails.city.trim()
    ) {
      Alert.alert(
        'Required Fields',
        'Please enter at least an address and city.',
      );
      return;
    }

    try {
      const fullAddress = formatAddressToString(place.addressDetails);

      // Save individual place (maintain backward compatibility)
      await setItem(`${type}Address`, fullAddress);
      await setItem(
        `${type}IsCurrentLocation`,
        place.isCurrentLocation.toString(),
      );

      // Save all places with new format
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
              const emptyAddressDetails: AddressDetails = {
                address: '',
                address2: '',
                city: '',
                state: '',
                zipcode: '',
                country: 'USA',
              };

              setPlaces(prev =>
                prev.map(place =>
                  place.type === type
                    ? {
                        ...place,
                        addressDetails: emptyAddressDetails,
                        isCurrentLocation: false,
                      }
                    : place,
                ),
              );

              // Remove from storage
              await setItem(`${type}Address`, '');
              await setItem(`${type}IsCurrentLocation`, 'false');

              // Update all places in storage
              const updatedPlaces = places.map(place =>
                place.type === type
                  ? {
                      ...place,
                      addressDetails: emptyAddressDetails,
                      isCurrentLocation: false,
                    }
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

  const getStatesForCountry = (country: 'USA' | 'Canada' | 'Other') => {
    switch (country) {
      case 'USA':
        return US_STATES;
      case 'Canada':
        return CANADIAN_PROVINCES;
      default:
        return [];
    }
  };

  const isAddressComplete = (addressDetails: AddressDetails) => {
    return (
      addressDetails.address.trim() !== '' && addressDetails.city.trim() !== ''
    );
  };

  const renderAddressForm = (place: SpecialPlace) => {
    return (
      <View style={styles.addressForm}>
        <TextInput
          style={styles.input}
          placeholder="Address *"
          value={place.addressDetails.address}
          onChangeText={text =>
            handleAddressFieldChange(place.type, 'address', text)
          }
        />

        <TextInput
          style={styles.input}
          placeholder="Address 2 (Optional)"
          value={place.addressDetails.address2}
          onChangeText={text =>
            handleAddressFieldChange(place.type, 'address2', text)
          }
        />

        <TextInput
          style={styles.input}
          placeholder="City *"
          value={place.addressDetails.city}
          onChangeText={text =>
            handleAddressFieldChange(place.type, 'city', text)
          }
        />

        <TouchableOpacity
          style={[styles.input, styles.dropdown]}
          onPress={() =>
            setShowCountryModal({show: true, placeType: place.type})
          }>
          <Text style={styles.dropdownText}>
            {place.addressDetails.country === 'Other'
              ? 'Other'
              : place.addressDetails.country}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>

        <View style={styles.rowContainer}>
          {place.addressDetails.country !== 'Other' && (
            <TouchableOpacity
              style={[styles.input, styles.dropdown, {flex: 1, marginRight: 8}]}
              onPress={() =>
                setShowStateModal({show: true, placeType: place.type})
              }>
              <Text
                style={[
                  styles.dropdownText,
                  !place.addressDetails.state && styles.placeholder,
                ]}>
                {place.addressDetails.state || 'State/Province'}
              </Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </TouchableOpacity>
          )}

          <TextInput
            style={[styles.input, {flex: 1}]}
            placeholder={
              place.addressDetails.country === 'Canada'
                ? 'Postal Code'
                : 'ZIP Code'
            }
            value={place.addressDetails.zipcode}
            onChangeText={text =>
              handleAddressFieldChange(place.type, 'zipcode', text)
            }
          />
        </View>
      </View>
    );
  };

  const renderStateModal = () => {
    if (!showStateModal.show || !showStateModal.placeType) return null;

    const place = places.find(p => p.type === showStateModal.placeType);
    if (!place) return null;

    const states = getStatesForCountry(place.addressDetails.country);

    return (
      <Modal
        visible={true}
        transparent
        animationType="slide"
        supportedOrientations={['landscape-left', 'landscape-right']}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select{' '}
                {place.addressDetails.country === 'Canada'
                  ? 'Province'
                  : 'State'}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setShowStateModal({show: false, placeType: null})
                }>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={states}
              keyExtractor={item => item}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    handleAddressFieldChange(
                      showStateModal.placeType!,
                      'state',
                      item,
                    );
                    setShowStateModal({show: false, placeType: null});
                  }}>
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    );
  };

  const renderCountryModal = () => {
    if (!showCountryModal.show || !showCountryModal.placeType) return null;

    const countries = ['USA', 'Canada', 'Other'];

    return (
      <Modal
        visible={true}
        transparent
        animationType="slide"
        supportedOrientations={['landscape-left', 'landscape-right']}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity
                onPress={() =>
                  setShowCountryModal({show: false, placeType: null})
                }>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {countries.map(country => (
              <TouchableOpacity
                key={country}
                style={styles.modalItem}
                onPress={() => {
                  handleAddressFieldChange(
                    showCountryModal.placeType!,
                    'country',
                    country as any,
                  );
                  // Clear state when changing country
                  handleAddressFieldChange(
                    showCountryModal.placeType!,
                    'state',
                    '',
                  );
                  setShowCountryModal({show: false, placeType: null});
                }}>
                <Text style={styles.modalItemText}>
                  {country === 'Other' ? 'Other' : country}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={isSettingsMode ? styles.settingsContainer : styles.container}>
      {!isSettingsMode && (
        <Text style={styles.headerText}>
          Help MaTalk provide better suggestions by setting up your special
          places. You can skip this step and set them up later.
        </Text>
      )}

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}>
        <View style={styles.columnsContainer}>
          {places.map(place => (
            <View key={place.type} style={styles.column}>
              <View style={styles.columnHeader}>
                <Text style={styles.iconText}>{getPlaceIcon(place.type)}</Text>
                <Text style={styles.columnTitle}>
                  {getPlaceTitle(place.type)}
                </Text>
              </View>

              <View style={styles.topButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.currentLocationButton,
                    place.isCurrentLocation &&
                      styles.currentLocationButtonActive,
                  ]}
                  onPress={() => handleCurrentLocationToggle(place.type)}>
                  <Text
                    style={[
                      styles.currentLocationText,
                      place.isCurrentLocation &&
                        styles.currentLocationTextActive,
                    ]}>
                    {place.isCurrentLocation
                      ? '✓ Current Location'
                      : 'Use Current Location'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    !isAddressComplete(place.addressDetails) &&
                      styles.saveButtonDisabled,
                  ]}
                  onPress={() => handleSave(place.type)}
                  disabled={!isAddressComplete(place.addressDetails)}>
                  <Text
                    style={[
                      styles.saveButtonText,
                      !isAddressComplete(place.addressDetails) &&
                        styles.saveButtonTextDisabled,
                    ]}>
                    Save
                  </Text>
                </TouchableOpacity>
              </View>

              {renderAddressForm(place)}

              {isAddressComplete(place.addressDetails) && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(place.type)}>
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {renderStateModal()}
      {renderCountryModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: height * 0.8,
    paddingHorizontal: 20,
  },
  settingsContainer: {
    width: '100%',
    paddingHorizontal: 0,
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  headerText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  settingsHeaderText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  columnsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 20,
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
  addressForm: {
    marginBottom: 12,
  },
  topButtonsContainer: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 44,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  placeholder: {
    color: '#999',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  modalItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalItemText: {
    fontSize: 16,
    color: '#333',
  },
});

export default SpecialPlaces;
