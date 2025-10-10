import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import ParentalGate from './ParentalGate';
import {
  launchImageLibrary,
  launchCamera,
  ImagePickerResponse,
  MediaType,
} from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {useAppSettings} from '../utils/persistance';
import AppConfig from '../utils/config';
import {useAssistant} from '../contexts/AssistantContext';
import {useAdmin} from '../contexts/adminContext';

interface AddressDetails {
  address: string;
  address2: string;
  city: string;
  state: string;
  zipcode: string;
  country: 'USA' | 'Canada' | 'Other';
}

interface PepeItem {
  id: string;
  imageUri: string;
  name: string;
  aliases: string[];
  type?: string;
  relationship?: string;
  isFavorite?: boolean;
  // Places-only fields
  addressDetails?: AddressDetails;
  isCurrentLocation?: boolean;
}

interface PepesData {
  People: PepeItem[];
  Toys: PepeItem[];
  Pets: PepeItem[];
  TVShows: PepeItem[];
  Food: PepeItem[];
  Drinks: PepeItem[];
  Places: PepeItem[];
}

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

interface MyPepesAndStuffProps {
  resetSessionTrigger?: number; // When this changes, reset the session gates
}

const MyPepesAndStuff: React.FC<MyPepesAndStuffProps> = ({
  resetSessionTrigger,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<
    'People' | 'Toys' | 'Pets' | 'TVShows' | 'Food' | 'Drinks' | 'Places'
  >('People');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PepeItem | null>(null);
  const [pepesData, setPepesData] = useState<PepesData>({
    People: [],
    Toys: [],
    Pets: [],
    TVShows: [],
    Food: [],
    Drinks: [],
    Places: [],
  });

  // Modal form state
  const [itemName, setItemName] = useState('');
  const [itemAliases, setItemAliases] = useState('');
  const [itemImageUri, setItemImageUri] = useState<string>('');
  const [itemType, setItemType] = useState('');
  const [itemRelationship, setItemRelationship] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [itemIsFavorite, setItemIsFavorite] = useState<boolean>(false);

  // Places-specific form state
  const [placeAddress, setPlaceAddress] = useState<AddressDetails>({
    address: '',
    address2: '',
    city: '',
    state: '',
    zipcode: '',
    country: 'USA',
  });
  const [placeIsCurrentLocation, setPlaceIsCurrentLocation] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const geocodeTimerRef = useRef<any>(null);
  const lastGeocodeQueryRef = useRef<string>('');
  const [showAddGate, setShowAddGate] = useState(false);
  const [showAdminCodeModal, setShowAdminCodeModal] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isAdminCodeError, setIsAdminCodeError] = useState(false);
  const [sessionGatesShown, setSessionGatesShown] = useState(false);

  const {setItem, getItem} = useAppSettings();
  const {isTablet} = useAdmin();
  const {width, height} = useWindowDimensions();

  // Type and relationship options
  const typeOptions = {
    People: ['Family', 'Friends', 'Professionals', 'Other'],
    Pets: [
      'Dogs',
      'Cats',
      'Birds',
      'Fish',
      'Rabbits',
      'Hamsters',
      'Reptiles',
      'Farm Animals',
      'Wild Animals',
      'Other',
    ],
    Toys: [
      'Action Figures',
      'Dolls',
      'Building Blocks',
      'Puzzles',
      'Board Games',
      'Electronic Toys',
      'Educational Toys',
      'Outdoor Toys',
      'Art Supplies',
      'Musical Toys',
      'Other',
    ],
    Food: [
      'Fruits',
      'Vegetables',
      'Snacks',
      'Meals',
      'Desserts',
      'Breakfast Foods',
      'Lunch Foods',
      'Dinner Foods',
      'Other',
    ],
    TVShows: [
      'Cartoons',
      'Educational Shows',
      'Movies',
      'Documentaries',
      'Music Videos',
      'Live Action Shows',
      'Other',
    ],
    Drinks: [
      'Water',
      'Juice',
      'Milk',
      'Soda',
      'Hot Drinks',
      'Sports Drinks',
      'Other',
    ],
    Places: [
      'Home',
      'School',
      'Park',
      'Store',
      'Restaurant',
      'Hospital',
      'Library',
      'Playground',
      'Beach',
      'Zoo',
      'Museum',
      'Therapy',
      'Other',
    ],
  };

  const relationshipOptions: {[key: string]: string[]} = {
    Family: [
      'Mom',
      'Dad',
      'Sister',
      'Brother',
      'Grandpa',
      'Grandma',
      'Uncle',
      'Aunt',
      'Cousin',
      'Other',
    ],
    Friends: ['School Friends', 'Family Friends', 'Other'],
    Professionals: [
      'Speech Therapist',
      'Occupational Therapist',
      'Physical Therapist',
      'Teacher',
      'Doctor',
      'Other',
    ],
  };

  // Responsive values based on device type
  const responsiveValues = {
    // Header and navigation
    headerPaddingHorizontal: isTablet ? 30 : 20,
    headerPaddingVertical: isTablet ? 20 : 15,
    dropdownPaddingHorizontal: isTablet ? 20 : 15,
    dropdownPaddingVertical: isTablet ? 15 : 12,
    dropdownFontSize: isTablet ? 18 : 16,
    dropdownArrowFontSize: isTablet ? 14 : 12,
    addButtonPaddingHorizontal: isTablet ? 25 : 20,
    addButtonPaddingVertical: isTablet ? 12 : 10,
    addButtonFontSize: isTablet ? 18 : 16,

    // Grid layout
    gridItemWidth: isTablet ? width * 0.18 : width * 0.22,
    gridItemMarginRight: isTablet ? width * 0.01 : width * 0.02,
    gridItemMarginBottom: isTablet ? 20 : 15,
    gridImageBorderRadius: isTablet ? 16 : 12,
    gridItemNameFontSize: isTablet ? 14 : 12,
    gridItemAliasesFontSize: isTablet ? 12 : 10,
    gridActionButtonSize: isTablet ? 56 : 42,
    gridActionButtonFontSize: isTablet ? 32 : 24,

    // Modal
    modalContentWidth: isTablet ? width * 0.85 : width * 0.9,
    modalContentMaxHeight: isTablet ? height * 0.85 : height * 0.8,
    modalHeaderPadding: isTablet ? 25 : 20,
    modalTitleFontSize: isTablet ? 22 : 18,
    closeButtonFontSize: isTablet ? 28 : 24,
    modalBodyPadding: isTablet ? 25 : 20,
    sectionLabelFontSize: isTablet ? 18 : 16,
    textInputFontSize: isTablet ? 18 : 16,
    textInputPaddingHorizontal: isTablet ? 18 : 15,
    textInputPaddingVertical: isTablet ? 15 : 12,
    uploadedImageSize: isTablet ? 150 : 120,
    imagePlaceholderSize: isTablet ? 150 : 120,
    imagePlaceholderFontSize: isTablet ? 16 : 14,
    modalActionsPadding: isTablet ? 25 : 20,
    actionButtonFontSize: isTablet ? 18 : 16,
    actionButtonPaddingVertical: isTablet ? 15 : 12,

    // Typography
    emptyStateFontSize: isTablet ? 18 : 16,
    emptyAddButtonFontSize: isTablet ? 18 : 16,
    emptyAddButtonPaddingHorizontal: isTablet ? 35 : 30,
    emptyAddButtonPaddingVertical: isTablet ? 15 : 12,

    // Spacing
    itemsListPaddingHorizontal: isTablet ? 30 : 20,
    dropdownOptionsMarginHorizontal: isTablet ? 30 : 20,
    dropdownOptionPaddingVertical: isTablet ? 15 : 12,
    dropdownOptionPaddingHorizontal: isTablet ? 20 : 15,
    dropdownOptionFontSize: isTablet ? 18 : 16,

    // Scroll hint
    scrollHintFontSize: isTablet ? 14 : 12,

    // Favorites overlays
    favoriteOverlaySize: isTablet ? 54 : 44,
    favoriteOverlayHeartFontSize: isTablet ? 30 : 26,
    cardFavoriteSize: isTablet ? 34 : 28,
    cardFavoriteHeartFontSize: isTablet ? 18 : 16,
  };

  // Load saved data on component mount
  useEffect(() => {
    loadPepesData();
  }, []);

  // Reset session gates when resetSessionTrigger changes
  useEffect(() => {
    if (resetSessionTrigger !== undefined) {
      setSessionGatesShown(false);
    }
  }, [resetSessionTrigger]);

  const loadPepesData = async () => {
    try {
      const savedData = await getItem('pepes');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        // Ensure all categories exist in the loaded data
        const completeData = {
          People: parsedData.People || [],
          Toys: parsedData.Toys || [],
          Pets: parsedData.Pets || [],
          TVShows: parsedData.TVShows || [],
          Food: parsedData.Food || [],
          Drinks: parsedData.Drinks || [],
          Places: parsedData.Places || [],
        } as PepesData;
        setPepesData(completeData);
      }
    } catch (error) {
      console.error('Error loading pepes data:', error);
    }
  };

  const savePepesData = async (data: PepesData) => {
    try {
      await setItem('pepes', JSON.stringify(data));
      setPepesData(data);
    } catch (error) {
      console.error('Error saving pepes data:', error);
    }
  };

  const ensureCameraPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // iOS: check first so we only prompt once
        const currentStatus = await check(PERMISSIONS.IOS.CAMERA);
        if (currentStatus === RESULTS.GRANTED) {
          return true;
        }

        if (currentStatus === RESULTS.BLOCKED) {
          Linking.openURL('app-settings:');
          return false;
        }

        // Not granted yet (e.g., denied/not-determined) → request once
        const res = await request(PERMISSIONS.IOS.CAMERA);
        if (res === RESULTS.BLOCKED) {
          Linking.openURL('app-settings:');
          return false;
        }
        return res === RESULTS.GRANTED;
      }
    } catch (e) {
      console.warn('Camera permission error:', e);
      return false;
    }
  };

  const ensurePhotoLibraryPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const sdkInt = (Platform as any).Version as number;
        if (sdkInt >= 33) {
          const granted = await PermissionsAndroid.request(
            // @ts-ignore Android 13+ images permission
            (PermissionsAndroid as any).PERMISSIONS.READ_MEDIA_IMAGES,
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const res = await request(PERMISSIONS.IOS.PHOTO_LIBRARY);
        if (res === RESULTS.BLOCKED) {
          Linking.openURL('app-settings:');
        }
        return res === RESULTS.GRANTED;
      }
    } catch (e) {
      console.warn('Photo library permission error:', e);
      return false;
    }
  };

  const requestMediaPermissionsAfterGate = async (): Promise<void> => {
    try {
      await ensureCameraPermission();
      await ensurePhotoLibraryPermission();
    } catch (_) {
      // no-op
    }
  };

  const handleAdminCodeSubmit = async () => {
    try {
      const stored = await getItem('adminCode');
      if (
        stored &&
        (adminCodeInput === stored ||
          adminCodeInput === AppConfig.masterAdminCode)
      ) {
        setShowAdminCodeModal(false);
        setAdminCodeInput('');
        setIsAdminCodeError(false);
        setSessionGatesShown(true); // Mark gates as shown for this session
        await requestMediaPermissionsAfterGate();
        openAddModal();
      } else {
        setIsAdminCodeError(true);
        setTimeout(() => {
          setIsAdminCodeError(false);
          setAdminCodeInput('');
        }, 1000);
      }
    } catch (_) {
      setIsAdminCodeError(true);
    }
  };

  const handlePickerResponse = (response: ImagePickerResponse) => {
    if (response.didCancel || response.errorMessage) {
      return;
    }
    if (response.assets && response.assets[0]) {
      const imageUri = response.assets[0].uri;
      if (imageUri) {
        setItemImageUri(imageUri);
        if (errorMessage) setErrorMessage('');
      }
    }
  };

  const openLibrary = () => {
    const options = {
      mediaType: 'photo' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8 as const,
      selectionLimit: 1 as const,
    };
    launchImageLibrary(options, handlePickerResponse);
  };

  const openCamera = async () => {
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Camera Permission',
        'Please enable camera access in Settings to take a photo.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ],
      );
      return;
    }
    const options = {
      mediaType: 'photo' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8 as const,
      saveToPhotos: true,
    };
    launchCamera(options, handlePickerResponse);
  };

  const selectImage = () => {
    Alert.alert(
      'Add Photo',
      'Choose image source',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Camera', onPress: openCamera},
        {text: 'Photo Library', onPress: openLibrary},
      ],
      {cancelable: true},
    );
  };

  const openAddModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemAliases('');
    setItemImageUri('');
    setItemType('');
    setItemRelationship('');
    setErrorMessage('');
    setItemIsFavorite(false);
    // reset places fields
    setPlaceAddress({
      address: '',
      address2: '',
      city: '',
      state: '',
      zipcode: '',
      country: 'USA',
    });
    setPlaceIsCurrentLocation(false);
    setShowModal(true);
  };

  const handleAddPress = () => {
    if (sessionGatesShown) {
      // Gates already shown in this session, go directly to add modal
      openAddModal();
    } else {
      // First time in this session, show gates
      setShowAddGate(true);
    }
  };

  const resetSessionGates = () => {
    setSessionGatesShown(false);
  };

  const openEditModal = (item: PepeItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemAliases(item.aliases.join(', '));
    setItemImageUri(item.imageUri);
    setItemType(item.type || '');
    setItemRelationship(item.relationship || '');
    setErrorMessage('');
    setItemIsFavorite(!!item.isFavorite);

    if (selectedCategory === 'Places') {
      setPlaceAddress(
        item.addressDetails || {
          address: '',
          address2: '',
          city: '',
          state: '',
          zipcode: '',
          country: 'USA',
        },
      );
      setPlaceIsCurrentLocation(!!item.isCurrentLocation);
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setItemName('');
    setItemAliases('');
    setItemImageUri('');
    setItemType('');
    setItemRelationship('');
    setErrorMessage('');
    setItemIsFavorite(false);
    setPlaceAddress({
      address: '',
      address2: '',
      city: '',
      state: '',
      zipcode: '',
      country: 'USA',
    });
    setPlaceIsCurrentLocation(false);
  };

  const isFormValid = () => {
    if (!itemName.trim() || !itemImageUri) {
      return false;
    }

    // Check if relationship is required but missing
    if (
      selectedCategory === 'People' &&
      itemType &&
      relationshipOptions[itemType] &&
      !itemRelationship.trim()
    ) {
      return false;
    }

    return true;
  };

  const saveItem = () => {
    // Clear any previous error
    setErrorMessage('');

    if (!itemName.trim()) {
      setErrorMessage('Please enter a name');
      return;
    }

    if (!itemImageUri) {
      setErrorMessage('Please select an image');
      return;
    }

    // Check if relationship is required but missing
    if (
      selectedCategory === 'People' &&
      itemType &&
      relationshipOptions[itemType] &&
      !itemRelationship.trim()
    ) {
      setErrorMessage(`Please select a relationship for ${itemType}`);
      return;
    }

    const aliases = itemAliases
      .split(',')
      .map(alias => alias.trim())
      .filter(alias => alias.length > 0);

    const newItem: PepeItem = {
      id: editingItem?.id || Date.now().toString(),
      imageUri: itemImageUri,
      name: itemName.trim(),
      aliases,
      type: itemType,
      relationship: itemRelationship,
      isFavorite: itemIsFavorite,
      ...(selectedCategory === 'Places'
        ? {
            addressDetails: placeAddress,
            isCurrentLocation: placeIsCurrentLocation,
          }
        : {}),
    };

    const updatedData = {...pepesData};

    if (editingItem) {
      // Update existing item
      const categoryItems = updatedData[selectedCategory];
      const itemIndex = categoryItems.findIndex(
        item => item.id === editingItem.id,
      );
      if (itemIndex !== -1) {
        categoryItems[itemIndex] = newItem;
      }
    } else {
      // Add new item
      updatedData[selectedCategory] = [
        ...updatedData[selectedCategory],
        newItem,
      ];
    }

    savePepesData(updatedData);
    // Send updated pepes to the current thread as learning feedback
    // Sync SpecialPlaces persistence when relevant
    if (selectedCategory === 'Places') {
      syncSpecialPlacesFromItem(newItem);
    }
    closeModal();
  };

  const deleteItem = (itemId: string) => {
    Alert.alert('Delete Item', 'Are you sure you want to delete this item?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const updatedData = {...pepesData};
          updatedData[selectedCategory] = updatedData[selectedCategory].filter(
            item => item.id !== itemId,
          );
          savePepesData(updatedData);
        },
      },
    ]);
  };

  const clearPlaceAddress = () => {
    setPlaceAddress({
      address: '',
      address2: '',
      city: '',
      state: '',
      zipcode: '',
      country: 'USA',
    });
    setPlaceIsCurrentLocation(false);
  };

  const toggleFavorite = (itemId: string) => {
    const updatedData = {...pepesData};
    updatedData[selectedCategory] = updatedData[selectedCategory].map(item =>
      item.id === itemId ? {...item, isFavorite: !item.isFavorite} : item,
    );
    savePepesData(updatedData);
  };

  const formatAddressToString = (addressDetails?: AddressDetails): string => {
    if (!addressDetails) return '';
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

  const toSpecialType = (t?: string): 'home' | 'school' | 'therapy' | null => {
    if (!t) return null;
    const v = t.trim().toLowerCase();
    if (v === 'home') return 'home';
    if (v === 'school') return 'school';
    if (v === 'therapy') return 'therapy';
    return null;
  };

  const emptyAddress: AddressDetails = {
    address: '',
    address2: '',
    city: '',
    state: '',
    zipcode: '',
    country: 'USA',
  };

  const ensureSpecialPlacesArray = (
    input: any,
  ): Array<{
    type: 'home' | 'school' | 'therapy';
    addressDetails: AddressDetails;
    isCurrentLocation: boolean;
  }> => {
    const base = [
      {
        type: 'home' as const,
        addressDetails: emptyAddress,
        isCurrentLocation: false,
      },
      {
        type: 'school' as const,
        addressDetails: emptyAddress,
        isCurrentLocation: false,
      },
      {
        type: 'therapy' as const,
        addressDetails: emptyAddress,
        isCurrentLocation: false,
      },
    ];
    if (!Array.isArray(input)) return base;
    // Merge keeping existing if present
    const out = [...base];
    input.forEach((p: any) => {
      if (p?.type === 'home' || p?.type === 'school' || p?.type === 'therapy') {
        const idx = out.findIndex(x => x.type === p.type);
        if (idx >= 0) {
          out[idx] = {
            type: p.type,
            addressDetails: {
              address: p.addressDetails?.address || '',
              address2: p.addressDetails?.address2 || '',
              city: p.addressDetails?.city || '',
              state: p.addressDetails?.state || '',
              zipcode: p.addressDetails?.zipcode || '',
              country:
                p.addressDetails?.country === 'Canada'
                  ? 'Canada'
                  : p.addressDetails?.country === 'USA'
                  ? 'USA'
                  : 'USA',
            },
            isCurrentLocation: !!p.isCurrentLocation,
          };
        }
      }
    });
    return out;
  };

  const syncSpecialPlacesFromItem = async (item: PepeItem) => {
    const sType = toSpecialType(item.type);
    if (!sType) return; // Only sync Home/School/Therapy

    try {
      const current = await getItem('specialPlaces');
      const parsed = current ? JSON.parse(current) : [];
      const list = ensureSpecialPlacesArray(parsed);
      const idx = list.findIndex(p => p.type === sType);

      const details = item.addressDetails || emptyAddress;
      const isCurr = !!item.isCurrentLocation;

      list[idx] = {
        type: sType,
        addressDetails: details,
        isCurrentLocation: isCurr,
      };

      await setItem('specialPlaces', JSON.stringify(list));
      const formatted = formatAddressToString(details);
      await setItem(`${sType}Address`, formatted);
      await setItem(`${sType}IsCurrentLocation`, isCurr.toString());
    } catch (e) {
      console.warn('Failed syncing special places:', e);
    }
  };

  const parseLocationToAddressDetails = (
    locationString: string,
  ): AddressDetails => {
    const parts = locationString.split(', ');

    let address = '';
    let city = '';
    let state = '';
    let zipcode = '';
    let country: 'USA' | 'Canada' | 'Other' = 'USA';

    if (parts.length >= 8) {
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
      address = `${parts[0]} ${parts[1]}`.trim();
      city = parts[2] || '';
      state = parts[3] || '';
      country = parts[4] === 'Canada' ? 'Canada' : 'USA';
    } else if (parts.length === 4) {
      address = parts[0] || '';
      city = parts[1] || '';
      state = parts[2] || '';
      country = parts[3] === 'Canada' ? 'Canada' : 'USA';
    } else if (parts.length === 3) {
      address = parts[0] || '';
      city = parts[1] || '';
      state = parts[2] || '';
    } else if (parts.length === 2) {
      address = parts[0] || '';
      city = parts[1] || '';
    } else {
      address = parts[0] || '';
    }

    const validStates = country === 'Canada' ? CANADIAN_PROVINCES : US_STATES;
    const normalizedState = state.trim();
    // we keep parsed state even if not in list

    return {
      address: address.trim(),
      address2: '',
      city: city.trim(),
      state: normalizedState,
      zipcode: zipcode.trim(),
      country,
    };
  };

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok && data) {
        return {
          display_name: data.display_name as string,
        };
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err);
    }
    return null;
  };

  const countryLabelForQuery = (country: 'USA' | 'Canada' | 'Other') => {
    if (country === 'USA') return 'United States';
    if (country === 'Canada') return 'Canada';
    return '';
  };

  const buildAddressQuery = (details: AddressDetails) => {
    const parts = [
      details.address,
      details.city,
      details.state,
      details.zipcode,
      countryLabelForQuery(details.country),
    ].filter(Boolean);
    return parts.join(', ');
  };

  const forwardGeocodeAndNormalize = async (details: AddressDetails) => {
    const query = buildAddressQuery(details);
    if (!query || query === lastGeocodeQueryRef.current) return;
    lastGeocodeQueryRef.current = query;
    setIsGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query,
      )}`;
      const resp = await fetch(url);
      const results = await resp.json();
      if (Array.isArray(results) && results.length > 0) {
        const best = results[0];
        if (best?.display_name) {
          const parsed = parseLocationToAddressDetails(best.display_name);
          // Preserve address2 and country preference normalization (USA/Canada)
          setPlaceAddress(prev => ({
            ...parsed,
            address2: prev.address2,
            country:
              parsed.country === 'Canada'
                ? 'Canada'
                : parsed.country === 'USA'
                ? 'USA'
                : prev.country,
          }));
        }
      }
    } catch (e) {
      // silent fail; keep user-entered values
    } finally {
      setIsGeocoding(false);
    }
  };

  const ensureLocationPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        // First check if permission is already granted
        const fineLocationStatus = await check(
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
        );
        const coarseLocationStatus = await check(
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
        );

        if (
          fineLocationStatus === RESULTS.GRANTED &&
          coarseLocationStatus === RESULTS.GRANTED
        ) {
          return true;
        }

        // If not granted, try using PermissionsAndroid as fallback
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );

        if (granted) {
          return true;
        }

        // As last resort, request permission
        const requestResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return requestResult === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const status = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        if (status === RESULTS.GRANTED) {
          return true;
        }
        const requestStatus = await request(
          PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
        );
        return requestStatus === RESULTS.GRANTED;
      }
    } catch (e) {
      console.warn('Location permission error:', e);
      return false;
    }
  };

  const useCurrentLocationForPlace = async () => {
    const hasPermission = await ensureLocationPermission();
    if (!hasPermission) {
      Alert.alert(
        'Location Permission',
        'Please enable location permissions in Settings to use current location.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ],
      );
      return;
    }

    Geolocation.getCurrentPosition(
      async (position: any) => {
        try {
          const {latitude, longitude} = position.coords;
          const rg = await reverseGeocode(latitude, longitude);
          if (rg?.display_name) {
            const parsed = parseLocationToAddressDetails(rg.display_name);
            setPlaceAddress(parsed);
            setPlaceIsCurrentLocation(true);
          } else {
            Alert.alert('Location Error', 'Unable to resolve your location.');
          }
        } catch (e) {
          Alert.alert('Location Error', 'Unable to get your location.');
        }
      },
      (error: any) => {
        console.warn('Location error:', error);
        Alert.alert('Location Error', 'Unable to get your location.');
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 10000,
      },
    );
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

  // Auto-geocode manual address edits for Places (debounced)
  useEffect(() => {
    if (selectedCategory !== 'Places') return;
    if (placeIsCurrentLocation) return; // skip when bound to current location

    // Require minimum fields to reduce bad geocoding
    if (!placeAddress.address.trim() || !placeAddress.city.trim()) return;

    if (geocodeTimerRef.current) {
      clearTimeout(geocodeTimerRef.current);
    }
    geocodeTimerRef.current = setTimeout(() => {
      forwardGeocodeAndNormalize(placeAddress);
    }, 800);

    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [
    selectedCategory,
    placeIsCurrentLocation,
    placeAddress.address,
    placeAddress.city,
    placeAddress.state,
    placeAddress.zipcode,
    placeAddress.country,
  ]);

  const renderItem = (item: PepeItem) => (
    <View
      key={item.id}
      style={[
        styles.gridItem,
        {
          width: responsiveValues.gridItemWidth,
          marginRight: responsiveValues.gridItemMarginRight,
          marginBottom: responsiveValues.gridItemMarginBottom,
        },
      ]}>
      <View
        style={[
          styles.gridImageContainer,
          {borderRadius: responsiveValues.gridImageBorderRadius},
        ]}>
        <FastImage
          source={{uri: item.imageUri}}
          style={styles.gridImage}
          resizeMode={FastImage.resizeMode.cover}
        />
        <View style={styles.gridItemActions}>
          <TouchableOpacity
            style={[
              styles.gridEditButton,
              {
                width: responsiveValues.gridActionButtonSize,
                height: responsiveValues.gridActionButtonSize,
                borderRadius: responsiveValues.gridActionButtonSize / 2,
              },
            ]}
            onPress={() => openEditModal(item)}>
            <Text
              style={[
                styles.gridEditButtonText,
                {fontSize: responsiveValues.gridActionButtonFontSize},
              ]}>
              ✏️
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.gridDeleteButton,
              {
                width: responsiveValues.gridActionButtonSize,
                height: responsiveValues.gridActionButtonSize,
                borderRadius: responsiveValues.gridActionButtonSize / 2,
              },
            ]}
            onPress={() => deleteItem(item.id)}>
            <Text
              style={[
                styles.gridDeleteButtonText,
                {fontSize: responsiveValues.gridActionButtonFontSize},
              ]}>
              🗑️
            </Text>
          </TouchableOpacity>
        </View>
        {/* Favorite heart at bottom-right of the image */}
        <Pressable
          style={[
            styles.cardFavoriteOverlay,
            {
              width: responsiveValues.cardFavoriteSize,
              height: responsiveValues.cardFavoriteSize,
              borderRadius: responsiveValues.cardFavoriteSize / 2,
            },
          ]}
          onPress={() => toggleFavorite(item.id)}>
          <Text
            style={[
              styles.cardFavoriteHeart,
              {fontSize: responsiveValues.cardFavoriteHeartFontSize},
            ]}>
            {item.isFavorite ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.gridItemInfo}>
        <Text
          style={[
            styles.gridItemName,
            {fontSize: responsiveValues.gridItemNameFontSize},
          ]}
          numberOfLines={1}>
          {item.name}
        </Text>
        {item.aliases.length > 0 && (
          <Text
            style={[
              styles.gridItemAliases,
              {fontSize: responsiveValues.gridItemAliasesFontSize},
            ]}
            numberOfLines={1}>
            {item.aliases.join(', ')}
          </Text>
        )}
        {item.type && selectedCategory !== 'Places' && (
          <Text
            style={[
              styles.gridItemType,
              {fontSize: responsiveValues.gridItemAliasesFontSize},
            ]}
            numberOfLines={1}>
            {selectedCategory === 'People' ? item.type : `Type: ${item.type}`}
          </Text>
        )}
        {selectedCategory === 'Places' && item.addressDetails && (
          <Text
            style={[
              styles.gridItemType,
              {fontSize: responsiveValues.gridItemAliasesFontSize},
            ]}
            numberOfLines={1}>
            {formatAddressToString(item.addressDetails)}
          </Text>
        )}
        {item.relationship && selectedCategory === 'People' && (
          <Text
            style={[
              styles.gridItemRelationship,
              {fontSize: responsiveValues.gridItemAliasesFontSize},
            ]}
            numberOfLines={1}>
            {item.relationship}
          </Text>
        )}
      </View>
    </View>
  );

  const currentItems = pepesData[selectedCategory];

  // // Debug logging
  // console.log('Selected category:', selectedCategory);
  // console.log('Current items:', currentItems);
  // console.log('Current items length:', currentItems?.length);

  const getCategoryLabel = (
    c: 'People' | 'Toys' | 'Pets' | 'TVShows' | 'Food' | 'Drinks' | 'Places',
  ) => (c === 'TVShows' ? 'TV Shows' : c);

  const getSingularLabel = (
    c: 'People' | 'Toys' | 'Pets' | 'TVShows' | 'Food' | 'Drinks' | 'Places',
  ): string => {
    switch (c) {
      case 'People':
        return 'Person';
      case 'Toys':
        return 'Toy';
      case 'Pets':
        return 'Pet';
      case 'TVShows':
        return 'TV Show';
      case 'Food':
        return 'Food';
      case 'Drinks':
        return 'Drink';
      case 'Places':
        return 'Place';
      default:
        return 'Item';
    }
  };

  const categories: Array<
    'People' | 'Toys' | 'Pets' | 'TVShows' | 'Food' | 'Drinks' | 'Places'
  > = ['People', 'Toys', 'Pets', 'TVShows', 'Food', 'Drinks', 'Places'];

  const handleCategorySelect = (
    category:
      | 'People'
      | 'Toys'
      | 'Pets'
      | 'TVShows'
      | 'Food'
      | 'Drinks'
      | 'Places',
  ) => {
    setSelectedCategory(category);
    setShowDropdown(false);
  };

  return (
    <View style={styles.container}>
      {/* Header with dropdown and add button */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: responsiveValues.headerPaddingHorizontal,
            paddingVertical: responsiveValues.headerPaddingVertical,
          },
        ]}>
        <View style={styles.dropdownContainer}>
          <TouchableOpacity
            style={[
              styles.dropdown,
              {
                paddingHorizontal: responsiveValues.dropdownPaddingHorizontal,
                paddingVertical: responsiveValues.dropdownPaddingVertical,
              },
            ]}
            onPress={() => setShowDropdown(!showDropdown)}>
            <Text
              style={[
                styles.dropdownText,
                {fontSize: responsiveValues.dropdownFontSize},
              ]}>
              {getCategoryLabel(selectedCategory)}
            </Text>
            <Text
              style={[
                styles.dropdownArrow,
                {fontSize: responsiveValues.dropdownArrowFontSize},
              ]}>
              ▼
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[
            styles.addButton,
            {
              paddingHorizontal: responsiveValues.addButtonPaddingHorizontal,
              paddingVertical: responsiveValues.addButtonPaddingVertical,
            },
          ]}
          onPress={handleAddPress}>
          <Text
            style={[
              styles.addButtonText,
              {fontSize: responsiveValues.addButtonFontSize},
            ]}>
            Add
          </Text>
        </TouchableOpacity>
      </View>

      {/* Dropdown Options */}
      {showDropdown && (
        <View
          style={[
            styles.dropdownOptions,
            {
              marginHorizontal:
                responsiveValues.dropdownOptionsMarginHorizontal,
            },
          ]}>
          {categories.map(category => (
            <TouchableOpacity
              key={category}
              style={[
                styles.dropdownOption,
                {
                  paddingVertical:
                    responsiveValues.dropdownOptionPaddingVertical,
                  paddingHorizontal:
                    responsiveValues.dropdownOptionPaddingHorizontal,
                },
                selectedCategory === category && styles.selectedDropdownOption,
              ]}
              onPress={() => handleCategorySelect(category)}>
              <Text
                style={[
                  styles.dropdownOptionText,
                  {fontSize: responsiveValues.dropdownOptionFontSize},
                  selectedCategory === category &&
                    styles.selectedDropdownOptionText,
                ]}>
                {getCategoryLabel(category)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Items list */}
      <ScrollView
        style={[
          styles.itemsList,
          {paddingHorizontal: responsiveValues.itemsListPaddingHorizontal},
        ]}>
        {!currentItems || currentItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text
              style={[
                styles.emptyStateText,
                {fontSize: responsiveValues.emptyStateFontSize},
              ]}>
              No{' '}
              {selectedCategory === 'TVShows'
                ? 'TV shows'
                : selectedCategory.toLowerCase()}{' '}
              added yet
            </Text>
            <TouchableOpacity
              style={[
                styles.emptyAddButton,
                {
                  paddingHorizontal:
                    responsiveValues.emptyAddButtonPaddingHorizontal,
                  paddingVertical:
                    responsiveValues.emptyAddButtonPaddingVertical,
                },
              ]}
              onPress={handleAddPress}>
              <Text
                style={[
                  styles.emptyAddButtonText,
                  {fontSize: responsiveValues.emptyAddButtonFontSize},
                ]}>
                Add
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {currentItems.map(renderItem)}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                width: responsiveValues.modalContentWidth,
                maxHeight: responsiveValues.modalContentMaxHeight,
              },
            ]}>
            <View
              style={[
                styles.modalHeader,
                {padding: responsiveValues.modalHeaderPadding},
              ]}>
              <Text
                style={[
                  styles.modalTitle,
                  {fontSize: responsiveValues.modalTitleFontSize},
                ]}>
                {editingItem
                  ? 'Edit Item'
                  : 'Add New ' + getSingularLabel(selectedCategory)}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Text
                  style={[
                    styles.closeButton,
                    {fontSize: responsiveValues.closeButtonFontSize},
                  ]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={[
                styles.modalBody,
                {padding: responsiveValues.modalBodyPadding},
              ]}
              contentContainerStyle={{
                paddingBottom:
                  responsiveValues.modalBodyPadding + (isTablet ? 160 : 240),
              }}
              keyboardShouldPersistTaps="handled">
              {/* Image Upload Section */}
              <View style={styles.imageSection}>
                <View style={styles.imageHeaderContainer}>
                  <Text
                    style={[
                      styles.sectionLabel,
                      {fontSize: responsiveValues.sectionLabelFontSize},
                    ]}>
                    {selectedCategory === 'People'
                      ? 'Photo'
                      : selectedCategory === 'Food' ||
                        selectedCategory === 'Drinks'
                      ? 'Picture'
                      : 'Image'}
                  </Text>
                  {!isTablet && (
                    <Text
                      style={[
                        styles.scrollHintText,
                        {fontSize: responsiveValues.scrollHintFontSize},
                      ]}>
                      Scroll down to add name and alias
                    </Text>
                  )}
                </View>
                <View style={styles.imageContainer}>
                  <TouchableOpacity onPress={selectImage}>
                    {itemImageUri ? (
                      <FastImage
                        source={{uri: itemImageUri}}
                        style={[
                          styles.uploadedImage,
                          {
                            width: responsiveValues.uploadedImageSize,
                            height: responsiveValues.uploadedImageSize,
                          },
                        ]}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    ) : (
                      <View
                        style={[
                          styles.imagePlaceholder,
                          {
                            width: responsiveValues.imagePlaceholderSize,
                            height: responsiveValues.imagePlaceholderSize,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.imagePlaceholderText,
                            {
                              fontSize:
                                responsiveValues.imagePlaceholderFontSize,
                            },
                          ]}>
                          Tap to select image
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {/* Favorite heart overlay in form */}
                  <Pressable
                    style={[
                      styles.favoriteOverlay,
                      {
                        width: responsiveValues.favoriteOverlaySize,
                        height: responsiveValues.favoriteOverlaySize,
                        borderRadius: responsiveValues.favoriteOverlaySize / 2,
                      },
                    ]}
                    onPress={() => setItemIsFavorite(prev => !prev)}>
                    <Text
                      style={[
                        styles.favoriteHeart,
                        {
                          fontSize:
                            responsiveValues.favoriteOverlayHeartFontSize,
                        },
                      ]}>
                      {itemIsFavorite ? '♥' : '♡'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Error Message */}
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Text
                    style={[
                      styles.errorText,
                      {fontSize: responsiveValues.sectionLabelFontSize},
                    ]}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {/* Name Input */}
              <View style={styles.inputSection}>
                <Text
                  style={[
                    styles.sectionLabel,
                    {fontSize: responsiveValues.sectionLabelFontSize},
                  ]}>
                  Name
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      fontSize: responsiveValues.textInputFontSize,
                      paddingHorizontal:
                        responsiveValues.textInputPaddingHorizontal,
                      paddingVertical:
                        responsiveValues.textInputPaddingVertical,
                    },
                  ]}
                  value={itemName}
                  onChangeText={text => {
                    setItemName(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Enter name"
                  placeholderTextColor="#888"
                />
              </View>

              {/* Aliases Input */}
              <View style={styles.inputSection}>
                <Text
                  style={[
                    styles.sectionLabel,
                    {fontSize: responsiveValues.sectionLabelFontSize},
                  ]}>
                  Aliases (comma-separated)
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      fontSize: responsiveValues.textInputFontSize,
                      paddingHorizontal:
                        responsiveValues.textInputPaddingHorizontal,
                      paddingVertical:
                        responsiveValues.textInputPaddingVertical,
                    },
                  ]}
                  value={itemAliases}
                  onChangeText={setItemAliases}
                  placeholder="Enter aliases separated by commas"
                  placeholderTextColor="#888"
                />
              </View>

              {/* Sub-entity Input */}
              {(selectedCategory === 'People' ||
                selectedCategory === 'Pets' ||
                selectedCategory === 'Toys' ||
                selectedCategory === 'Food' ||
                selectedCategory === 'TVShows' ||
                selectedCategory === 'Drinks' ||
                selectedCategory === 'Places') && (
                <View style={styles.inputSection}>
                  <Text
                    style={[
                      styles.sectionLabel,
                      {fontSize: responsiveValues.sectionLabelFontSize},
                    ]}>
                    Type
                  </Text>
                  <TouchableOpacity
                    style={styles.dropdownContainer}
                    onPress={() => {
                      const options = typeOptions[selectedCategory];
                      Alert.alert(
                        selectedCategory === 'People'
                          ? 'Select Type'
                          : 'Select Type',
                        '',
                        options.map((option: string) => ({
                          text: option,
                          onPress: () => {
                            setItemType(option);
                            // Reset relationship when type changes
                            setItemRelationship('');
                            if (errorMessage) setErrorMessage('');
                          },
                        })),
                        {cancelable: true},
                      );
                    }}>
                    <View
                      style={[
                        styles.dropdown,
                        {
                          paddingHorizontal:
                            responsiveValues.textInputPaddingHorizontal,
                          paddingVertical:
                            responsiveValues.textInputPaddingVertical,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.dropdownText,
                          {fontSize: responsiveValues.textInputFontSize},
                        ]}>
                        {itemType ||
                          (selectedCategory === 'People'
                            ? 'Select Type'
                            : 'Select Type')}
                      </Text>
                      <Text
                        style={[
                          styles.dropdownArrow,
                          {fontSize: responsiveValues.textInputFontSize},
                        ]}>
                        ▼
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* Relationship Input */}
              {selectedCategory === 'People' &&
                itemType &&
                relationshipOptions[itemType] && (
                  <View style={styles.inputSection}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        {fontSize: responsiveValues.sectionLabelFontSize},
                      ]}>
                      Relationship
                    </Text>
                    <TouchableOpacity
                      style={styles.dropdownContainer}
                      onPress={() => {
                        const options = relationshipOptions[itemType] || [];
                        Alert.alert(
                          'Select Relationship',
                          '',
                          options.map((option: string) => ({
                            text: option,
                            onPress: () => {
                              setItemRelationship(option);
                              if (errorMessage) setErrorMessage('');
                            },
                          })),
                          {cancelable: true},
                        );
                      }}>
                      <View
                        style={[
                          styles.dropdown,
                          {
                            paddingHorizontal:
                              responsiveValues.textInputPaddingHorizontal,
                            paddingVertical:
                              responsiveValues.textInputPaddingVertical,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.dropdownText,
                            {fontSize: responsiveValues.textInputFontSize},
                          ]}>
                          {itemRelationship || 'Select Relationship'}
                        </Text>
                        <Text
                          style={[
                            styles.dropdownArrow,
                            {fontSize: responsiveValues.textInputFontSize},
                          ]}>
                          ▼
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

              {/* Places: address section */}
              {selectedCategory === 'Places' && (
                <View>
                  <View style={styles.inputSection}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        {fontSize: responsiveValues.sectionLabelFontSize},
                      ]}>
                      Location
                    </Text>
                    <View style={{flexDirection: 'row', gap: 10}}>
                      <TouchableOpacity
                        style={[
                          styles.currentLocationButton,
                          placeIsCurrentLocation &&
                            styles.currentLocationButtonActive,
                        ]}
                        onPress={useCurrentLocationForPlace}>
                        <Text
                          style={[
                            styles.currentLocationText,
                            placeIsCurrentLocation &&
                              styles.currentLocationTextActive,
                          ]}>
                          {placeIsCurrentLocation
                            ? '✓ Current Location'
                            : 'Use Current Location'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={clearPlaceAddress}>
                        <Text style={styles.deleteButtonText}>
                          Clear Address
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.inputSection}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Address"
                      placeholderTextColor="#888"
                      value={placeAddress.address}
                      onChangeText={text => {
                        setPlaceAddress(prev => ({...prev, address: text}));
                        setPlaceIsCurrentLocation(false);
                      }}
                    />
                    <TextInput
                      style={[styles.textInput, {marginTop: 10}]}
                      placeholder="Address 2 (Optional)"
                      placeholderTextColor="#888"
                      value={placeAddress.address2}
                      onChangeText={text => {
                        setPlaceAddress(prev => ({...prev, address2: text}));
                        setPlaceIsCurrentLocation(false);
                      }}
                    />
                    <TextInput
                      style={[styles.textInput, {marginTop: 10}]}
                      placeholder="City"
                      placeholderTextColor="#888"
                      value={placeAddress.city}
                      onChangeText={text => {
                        setPlaceAddress(prev => ({...prev, city: text}));
                        setPlaceIsCurrentLocation(false);
                      }}
                    />

                    <TouchableOpacity
                      style={[styles.dropdown, {marginTop: 10}]}
                      onPress={() => setShowCountryPicker(true)}>
                      <Text style={styles.dropdownText}>
                        {placeAddress.country === 'Other'
                          ? 'Other'
                          : placeAddress.country}
                      </Text>
                      <Text style={styles.dropdownArrow}>▼</Text>
                    </TouchableOpacity>

                    {placeAddress.country !== 'Other' && (
                      <TouchableOpacity
                        style={[styles.dropdown, {marginTop: 10}]}
                        onPress={() => setShowStatePicker(true)}>
                        <Text
                          style={[
                            styles.dropdownText,
                            !placeAddress.state && styles.placeholder,
                          ]}>
                          {placeAddress.state || 'State/Province'}
                        </Text>
                        <Text style={styles.dropdownArrow}>▼</Text>
                      </TouchableOpacity>
                    )}

                    <TextInput
                      style={[styles.textInput, {marginTop: 10}]}
                      placeholder={
                        placeAddress.country === 'Canada'
                          ? 'Postal Code'
                          : 'ZIP Code'
                      }
                      placeholderTextColor="#888"
                      value={placeAddress.zipcode}
                      onChangeText={text => {
                        setPlaceAddress(prev => ({...prev, zipcode: text}));
                        setPlaceIsCurrentLocation(false);
                      }}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Modal Actions */}
            <View
              style={[
                styles.modalActions,
                {padding: responsiveValues.modalActionsPadding},
              ]}>
              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  {
                    paddingVertical:
                      responsiveValues.actionButtonPaddingVertical,
                  },
                ]}
                onPress={closeModal}>
                <Text
                  style={[
                    styles.cancelButtonText,
                    {fontSize: responsiveValues.actionButtonFontSize},
                  ]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  {
                    paddingVertical:
                      responsiveValues.actionButtonPaddingVertical,
                  },
                  !isFormValid() && styles.saveButtonDisabled,
                ]}
                onPress={saveItem}
                disabled={!isFormValid()}>
                <Text
                  style={[
                    styles.saveButtonText,
                    {fontSize: responsiveValues.actionButtonFontSize},
                  ]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* State picker modal */}
      <Modal
        visible={showStatePicker}
        transparent
        animationType="slide"
        supportedOrientations={['landscape-left', 'landscape-right']}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select{' '}
                {placeAddress.country === 'Canada' ? 'Province' : 'State'}
              </Text>
              <TouchableOpacity onPress={() => setShowStatePicker(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {(getStatesForCountry(placeAddress.country) || []).map(item => (
                <TouchableOpacity
                  key={item}
                  style={styles.modalItem}
                  onPress={() => {
                    setPlaceAddress(prev => ({...prev, state: item}));
                    setShowStatePicker(false);
                  }}>
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Country picker modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        supportedOrientations={['landscape-left', 'landscape-right']}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            {(['USA', 'Canada', 'Other'] as const).map(country => (
              <TouchableOpacity
                key={country}
                style={styles.modalItem}
                onPress={() => {
                  setPlaceAddress(prev => ({...prev, country, state: ''}));
                  setShowCountryPicker(false);
                }}>
                <Text style={styles.modalItemText}>
                  {country === 'Other' ? 'Other' : country}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {showAddGate && (
        <ParentalGate
          onSuccess={async () => {
            setShowAddGate(false);
            setShowAdminCodeModal(true);
          }}
          isSettingsContext={false}
          message="Making sure you are an adult as there is camera usage . All images stay local"
        />
      )}

      {/* Admin Code Modal (second gate) */}
      <Modal
        visible={showAdminCodeModal}
        animationType="fade"
        transparent
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={() => {
          setShowAdminCodeModal(false);
          setAdminCodeInput('');
          setIsAdminCodeError(false);
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Admin Code</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAdminCodeModal(false);
                  setAdminCodeInput('');
                  setIsAdminCodeError(false);
                }}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.modalBody, {paddingBottom: 20}]}>
              <TextInput
                style={[
                  styles.textInput,
                  isAdminCodeError && {
                    borderColor: '#ff3b30',
                    backgroundColor: '#fff0f0',
                  },
                ]}
                value={adminCodeInput}
                onChangeText={text => {
                  const numeric = text.replace(/[^0-9]/g, '');
                  if (numeric.length <= 4) setAdminCodeInput(numeric);
                }}
                placeholder="4-digit code"
                placeholderTextColor="#888"
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (adminCodeInput.length === 4) handleAdminCodeSubmit();
                }}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelButton, {paddingVertical: 12}]}
                  onPress={() => {
                    setShowAdminCodeModal(false);
                    setAdminCodeInput('');
                    setIsAdminCodeError(false);
                  }}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    {paddingVertical: 12},
                    adminCodeInput.length !== 4 && styles.saveButtonDisabled,
                  ]}
                  onPress={handleAdminCodeSubmit}
                  disabled={adminCodeInput.length !== 4}>
                  <Text style={styles.saveButtonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  dropdownContainer: {
    flex: 1,
    marginRight: 15,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
  },
  dropdownOptions: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginHorizontal: 20,
    marginTop: -1,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedDropdownOption: {
    backgroundColor: '#f0f8ff',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#333',
  },
  selectedDropdownOptionText: {
    color: '#8E24AA',
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#8E24AA',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  itemsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  gridItem: {
    alignItems: 'center',
  },
  gridImageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridItemActions: {
    position: 'absolute',
    top: 5,
    right: 5,
    flexDirection: 'row',
    gap: 5,
  },
  favoriteOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteHeart: {
    color: '#ff0000',
    fontSize: 26,
    fontWeight: 'bold',
  },
  gridEditButton: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 21,
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridEditButtonText: {
    fontSize: 24,
    color: '#000',
  },
  gridDeleteButton: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 21,
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridDeleteButtonText: {
    fontSize: 24,
    color: '#000',
  },
  cardFavoriteOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFavoriteHeart: {
    color: '#ff0000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gridItemInfo: {
    width: '100%',
    alignItems: 'center',
  },
  gridItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  gridItemAliases: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  gridItemType: {
    fontSize: 10,
    color: '#8E24AA',
    textAlign: 'center',
    fontWeight: '500',
  },
  gridItemRelationship: {
    fontSize: 10,
    color: '#4CAF50',
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  emptyAddButton: {
    backgroundColor: '#8E24AA',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyAddButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  itemAliases: {
    fontSize: 14,
    color: '#666',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    padding: 8,
    marginRight: 8,
  },
  editButtonText: {
    fontSize: 18,
  },
  deleteButton: {
    backgroundColor: '#FF5757',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 0,
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
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
  imageSection: {
    marginBottom: 20,
  },
  imageHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  scrollHintText: {
    fontSize: 12,
    color: 'blue',
    fontStyle: 'italic',
    fontWeight: 'bold',
  },
  imageContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  uploadedImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  imagePlaceholderText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#ff4444',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 10,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#d32f2f',
    fontWeight: '600',
    textAlign: 'center',
  },
  currentLocationButton: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2196F3',
    alignSelf: 'flex-start',
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
  modalItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalItemText: {
    fontSize: 16,
    color: '#333',
  },
  placeholder: {
    color: '#888',
  },
});

export default MyPepesAndStuff;
