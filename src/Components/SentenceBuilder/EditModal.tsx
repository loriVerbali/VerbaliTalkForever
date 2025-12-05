import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Switch,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {searchWordImages, WordImageResult} from '../../utils/wordImageApi';
import {Node, WordType, DEFAULT_COLOR_MAP} from '../../types/sentenceBuilder';
import {downloadSentenceBuilderImage} from '../../utils/sentenceBuilderImageDownloader';

const {width, height} = Dimensions.get('window');

interface EditModalProps {
  isVisible: boolean;
  node?: Node; // undefined for new node
  parentId: string | null;
  position: number;
  onClose: () => void;
  onSave: (nodeData: Partial<Node>) => void;
  onDelete?: (nodeId: string) => void;
  currentFolders?: Node[]; // Current folders for search
  allFolders?: Node[]; // All existing folders for copying
}

// Color options from the current palette
const COLOR_OPTIONS = [
  {name: 'Green', value: '#4CAF50', type: 'noun' as WordType},
  {name: 'Blue', value: '#2196F3', type: 'verb' as WordType},
  {name: 'Orange', value: '#FF9800', type: 'adjective' as WordType},
  {name: 'Purple', value: '#9C27B0', type: 'adverb' as WordType},
  {name: 'Red', value: '#F44336', type: 'pronoun' as WordType},
  {name: 'Blue Grey', value: '#607D8B', type: 'preposition' as WordType},
  {name: 'Brown', value: '#795548', type: 'conjunction' as WordType},
  {name: 'Pink', value: '#E91E63', type: 'interjection' as WordType},
  {name: 'Cyan', value: '#00BCD4', type: 'article' as WordType},
  {name: 'Grey', value: '#9E9E9E', type: 'other' as WordType},
  {name: 'Deep Purple', value: '#673AB7', type: 'other' as WordType}, // Folder color
];

const EditModal: React.FC<EditModalProps> = ({
  isVisible,
  node,
  parentId,
  position,
  onClose,
  onSave,
  onDelete,
  currentFolders = [],
  allFolders = [],
}) => {
  const [isFolder, setIsFolder] = useState(false);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]); // Default to Green (noun)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WordImageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isNewNode, setIsNewNode] = useState(false);
  const [selectedWordFromApi, setSelectedWordFromApi] =
    useState<WordImageResult | null>(null);
  const [selectedFolderImage, setSelectedFolderImage] =
    useState<WordImageResult | null>(null);
  const [useExistingFolder, setUseExistingFolder] = useState(false);
  const [selectedExistingFolder, setSelectedExistingFolder] =
    useState<Node | null>(null);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');

  // Initialize form when modal opens
  useEffect(() => {
    if (isVisible) {
      setIsNewNode(!node);
      if (node) {
        setName(node.title);
        setIsFolder(node.kind === 'folder');
        // Find matching color for existing node
        const matchingColor =
          COLOR_OPTIONS.find(
            color =>
              color.value ===
              (node.kind === 'folder'
                ? '#673AB7'
                : DEFAULT_COLOR_MAP[node.type || 'other']),
          ) || COLOR_OPTIONS[0];
        setSelectedColor(matchingColor);
        // Clear API selections for existing nodes
        setSelectedWordFromApi(null);
        setSelectedFolderImage(null);
      } else {
        setName('');
        setIsFolder(false);
        setSelectedColor(COLOR_OPTIONS[0]); // Default to Green (noun)
        setSelectedWordFromApi(null);
        setSelectedFolderImage(null);
      }
      setSearchQuery('');
      setSearchResults([]);
      setUseExistingFolder(false);
      setSelectedExistingFolder(null);
      setFolderSearchQuery('');
    }
  }, [isVisible, node]);

  // Search for words and folders with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch(searchQuery.trim());
      } else if (searchQuery.trim().length === 0) {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      // Only search API words
      const apiResults = await searchWordImages(query);
      setSearchResults(apiResults.results);
    } catch (error) {
      console.error('Error searching words:', error);
      Alert.alert('Error', 'Failed to search for words. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async () => {
    // Handle normal add/edit mode
    if (isFolder) {
      // For folders, check if using existing folder or creating new one
      if (useExistingFolder) {
        if (!selectedExistingFolder) {
          Alert.alert('Error', 'Please select an existing folder to copy');
          return;
        }
      } else {
        // For new folders, require a name
        if (!name.trim()) {
          Alert.alert('Error', 'Please enter a folder name');
          return;
        }
      }
    } else {
      // For words, require selection from API
      if (!selectedWordFromApi) {
        Alert.alert('Error', 'Please search and select a word from the API');
        return;
      }
    }

    try {
      let localImagePath: string | undefined;

      // Download image if one is selected
      if (selectedWordFromApi || selectedFolderImage) {
        const imageToDownload = selectedWordFromApi || selectedFolderImage!;
        const filename = `${isFolder ? 'folder' : 'word'}_${
          imageToDownload.id
        }`;

        try {
          localImagePath = await downloadSentenceBuilderImage(
            imageToDownload.imageUrl,
            filename,
          );
        } catch (error) {
          console.error('Error downloading image:', error);
          Alert.alert(
            'Warning',
            'Failed to download image. The item will be saved without an image.',
          );
        }
      }

      const nodeData: Partial<Node> = {
        title: isFolder
          ? useExistingFolder
            ? selectedExistingFolder!.title
            : name.trim()
          : selectedWordFromApi!.word,
        kind: isFolder ? 'folder' : 'word',
        type: isFolder ? undefined : selectedColor.type,
        parentId,
        orderIndex: position,
        // Add local image path if available, otherwise use URL as fallback
        ...(localImagePath && {
          imageUri: localImagePath,
          imageHash: (selectedWordFromApi || selectedFolderImage!)?.id,
        }),
        // Fallback to URL if download failed
        ...(!localImagePath &&
          (selectedWordFromApi || selectedFolderImage) && {
            imageUri: (selectedWordFromApi || selectedFolderImage!)!.imageUrl,
            imageHash: (selectedWordFromApi || selectedFolderImage!)!.id,
          }),
        // For existing folders, include the source folder ID for copying
        ...(isFolder &&
          useExistingFolder && {
            sourceFolderId: selectedExistingFolder!.id,
          }),
      };

      onSave(nodeData);
    } catch (error) {
      console.error('Error in handleSave:', error);
      Alert.alert('Error', 'Failed to save item. Please try again.');
    }
  };

  const handleDelete = () => {
    if (!node || !onDelete) return;

    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${node.title}"?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(node.id);
            onClose();
          },
        },
      ],
    );
  };

  const handleSearchResultSelect = (searchResult: WordImageResult) => {
    if (isFolder) {
      // For folders, this is selecting an image
      setSelectedFolderImage(searchResult);
    } else {
      // For words, this is selecting the word itself
      setSelectedWordFromApi(searchResult);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleExistingFolderSelect = (folder: Node) => {
    setSelectedExistingFolder(folder);
  };

  // Filter folders based on search query
  const filteredFolders = allFolders.filter(folder =>
    folder.title.toLowerCase().includes(folderSearchQuery.toLowerCase()),
  );

  const renderSearchResult = ({item}: {item: WordImageResult}) => (
    <TouchableOpacity
      style={[
        styles.searchResult,
        (isFolder
          ? selectedFolderImage?.id === item.id
          : selectedWordFromApi?.id === item.id) && styles.searchResultSelected,
      ]}
      onPress={() => handleSearchResultSelect(item)}>
      <FastImage
        source={{uri: item.imageUrl}}
        style={styles.searchResultImage}
        resizeMode={FastImage.resizeMode.cover}
      />
      <Text style={styles.searchResultText}>{item.word}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {isNewNode ? 'Add New Item' : 'Edit Item'}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveButton}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Word</Text>
              <Switch
                value={isFolder}
                onValueChange={setIsFolder}
                trackColor={{false: '#767577', true: '#81b0ff'}}
                thumbColor={isFolder ? '#f5dd4b' : '#f4f3f4'}
              />
              <Text style={styles.switchLabel}>Folder</Text>
            </View>
          </View>

          {/* Folder Creation Mode Selection - Only for folders */}
          {isFolder && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Folder Creation</Text>
              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Create New</Text>
                <Switch
                  value={useExistingFolder}
                  onValueChange={value => {
                    setUseExistingFolder(value);
                  }}
                  trackColor={{false: '#767577', true: '#81b0ff'}}
                  thumbColor={useExistingFolder ? '#f5dd4b' : '#f4f3f4'}
                />
                <Text style={styles.switchLabel}>Use Existing</Text>
              </View>
            </View>
          )}

          {/* Name Input - Only for new folders */}
          {isFolder && !useExistingFolder && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Folder Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter folder name..."
                placeholderTextColor="#999"
              />
            </View>
          )}

          {/* Selected Word Display - Only for words */}
          {!isFolder && selectedWordFromApi && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Selected Word</Text>
              <View style={styles.selectedWordContainer}>
                <FastImage
                  source={{uri: selectedWordFromApi.imageUrl}}
                  style={styles.selectedWordImage}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={styles.selectedWordText}>
                  {selectedWordFromApi.word}
                </Text>
              </View>
            </View>
          )}

          {/* Selected Folder Image Display - Only for new folders */}
          {isFolder && !useExistingFolder && selectedFolderImage && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Selected Image</Text>
              <View style={styles.selectedWordContainer}>
                <FastImage
                  source={{uri: selectedFolderImage.imageUrl}}
                  style={styles.selectedWordImage}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={styles.selectedWordText}>
                  {selectedFolderImage.word}
                </Text>
              </View>
            </View>
          )}

          {/* Existing Folder Selection - Only for existing folders */}
          {isFolder && useExistingFolder && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Existing Folder</Text>
              <Text style={styles.sectionSubtitle}>
                Choose a folder to copy to this location
              </Text>

              <View style={styles.searchInputContainer}>
                <TextInput
                  style={styles.searchInput}
                  value={folderSearchQuery}
                  onChangeText={setFolderSearchQuery}
                  placeholder="Search folders..."
                  placeholderTextColor="#999"
                  returnKeyType="search"
                />
              </View>

              {selectedExistingFolder && (
                <View style={styles.selectedWordContainer}>
                  <FastImage
                    source={
                      selectedExistingFolder.imageUri
                        ? {uri: selectedExistingFolder.imageUri}
                        : require('../../assets/welcome.png')
                    }
                    style={styles.selectedWordImage}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                  <Text style={styles.selectedWordText}>
                    📁 {selectedExistingFolder.title}
                  </Text>
                </View>
              )}

              {filteredFolders.length > 0 && (
                <View style={styles.searchResultsContainer}>
                  <Text style={styles.searchResultsTitle}>
                    Available Folders:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.searchResultsList}>
                    {filteredFolders.map(folder => (
                      <View key={folder.id} style={styles.searchResultWrapper}>
                        <TouchableOpacity
                          style={[
                            styles.searchResult,
                            selectedExistingFolder?.id === folder.id &&
                              styles.searchResultSelected,
                          ]}
                          onPress={() => handleExistingFolderSelect(folder)}>
                          <FastImage
                            source={
                              folder.imageUri
                                ? {uri: folder.imageUri}
                                : require('../../assets/welcome.png')
                            }
                            style={styles.searchResultImage}
                            resizeMode={FastImage.resizeMode.cover}
                          />
                          <Text style={styles.searchResultText}>
                            📁 {folder.title}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Color Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Color</Text>
            <View style={styles.colorGrid}>
              {COLOR_OPTIONS.map((color, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.colorButton,
                    {backgroundColor: color.value},
                    selectedColor.value === color.value &&
                      styles.colorButtonSelected,
                  ]}
                  onPress={() => setSelectedColor(color)}>
                  <Text style={styles.colorButtonText}>{color.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Search Section - Only for new folders or words */}
          {(!isFolder || (isFolder && !useExistingFolder)) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isFolder ? 'Search for Folder Image' : 'Search for Word'}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {isFolder
                  ? 'Search for an image from the API to use for this folder'
                  : 'Search for a word from the API to add to the current folder'}
              </Text>

              <View style={styles.searchInputContainer}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={
                    isFolder ? 'Search for an image...' : 'Search for a word...'
                  }
                  placeholderTextColor="#999"
                  returnKeyType="search"
                />
                {isSearching && (
                  <ActivityIndicator
                    size="small"
                    color="#007bff"
                    style={styles.searchLoader}
                  />
                )}
              </View>

              {searchQuery.trim().length > 0 &&
                searchQuery.trim().length < 2 && (
                  <Text style={styles.hintText}>
                    Type at least 2 characters to search
                  </Text>
                )}

              {searchResults.length > 0 && (
                <View style={styles.searchResultsContainer}>
                  <Text style={styles.searchResultsTitle}>Search Results:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.searchResultsList}>
                    {searchResults.map((item, index) => (
                      <View key={item.id} style={styles.searchResultWrapper}>
                        {renderSearchResult({item})}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Delete Button */}
          {!isNewNode && onDelete && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}>
                <Text style={styles.deleteButtonText}>Delete Item</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#6c757d',
  },
  saveButton: {
    fontSize: 16,
    color: '#007bff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 12,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginHorizontal: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20, // Makes it a perfect circle/pill
    marginBottom: 8,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorButtonSelected: {
    borderColor: '#333',
    borderWidth: 3,
    transform: [{scale: 1.1}], // Slightly larger when selected
  },
  colorButtonText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  searchLoader: {
    marginLeft: 8,
  },
  hintText: {
    fontSize: 14,
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  searchResultsContainer: {
    marginTop: 8,
  },
  searchResultsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  searchResultsList: {
    maxHeight: 120,
  },
  searchResultWrapper: {
    marginRight: 8,
  },
  searchResult: {
    width: 80,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
  },
  searchResultSelected: {
    borderWidth: 3,
    borderColor: '#007bff',
    shadowColor: '#007bff',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  selectedWordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  selectedWordImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  selectedWordText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  searchResultImage: {
    width: '70%',
    height: '60%',
    borderRadius: 4,
    marginBottom: 2,
  },
  searchResultText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EditModal;
