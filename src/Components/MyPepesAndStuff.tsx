import React, {useState, useEffect} from 'react';
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
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {
  launchImageLibrary,
  ImagePickerResponse,
  MediaType,
} from 'react-native-image-picker';
import {useAppSettings} from '../utils/persistance';
import {useAdmin} from '../contexts/adminContext';

interface PepeItem {
  id: string;
  imageUri: string;
  name: string;
  aliases: string[];
  type?: string;
  relationship?: string;
  isFavorite?: boolean;
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

const MyPepesAndStuff: React.FC = () => {
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
        };
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

  const selectImage = () => {
    const options = {
      mediaType: 'photo' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8 as const,
    };

    launchImageLibrary(options, (response: ImagePickerResponse) => {
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
    });
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
    setShowModal(true);
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

  const toggleFavorite = (itemId: string) => {
    const updatedData = {...pepesData};
    updatedData[selectedCategory] = updatedData[selectedCategory].map(item =>
      item.id === itemId ? {...item, isFavorite: !item.isFavorite} : item,
    );
    savePepesData(updatedData);
  };

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
        {item.type && (
          <Text
            style={[
              styles.gridItemType,
              {fontSize: responsiveValues.gridItemAliasesFontSize},
            ]}
            numberOfLines={1}>
            {selectedCategory === 'People' ? item.type : `Type: ${item.type}`}
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
              {selectedCategory}
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
          onPress={openAddModal}>
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
                {category}
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
              onPress={openAddModal}>
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
                  : 'Add New ' +
                    (selectedCategory === 'TVShows'
                      ? 'TV Show'
                      : selectedCategory.slice(0, -1))}
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
              ]}>
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
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 18,
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
});

export default MyPepesAndStuff;
