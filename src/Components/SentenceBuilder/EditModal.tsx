import React, { useState, useEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import { searchWordImages, WordImageResult } from '../../utils/wordImageApi';
import { searchGoogleImages } from '../../utils/googleImageApi';
import { Node, WordType, DEFAULT_COLOR_MAP } from '../../types/sentenceBuilder';
import { downloadSentenceBuilderImage } from '../../utils/sentenceBuilderImageDownloader';
import { useAppSettings } from '../../utils/persistance';
import { isPlaceholderImage, resolveImageSource } from '../../utils/imageSourceResolver';
import { views } from '../../utils/constants';

const { width, height } = Dimensions.get('window');

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

// Color options - Modified Fitzgerald Key standard
const COLOR_OPTIONS = [
  { name: 'Pronoun', value: '#FBC02D', type: 'pronoun' as WordType },
  { name: 'Verb', value: '#4CAF50', type: 'verb' as WordType },
  { name: 'Noun', value: '#FF9800', type: 'noun' as WordType },
  { name: 'Adjective', value: '#2196F3', type: 'adjective' as WordType },
  { name: 'Adverb', value: '#2196F3', type: 'adverb' as WordType },
  { name: 'Preposition', value: '#E91E63', type: 'preposition' as WordType },
  { name: 'Conjunction', value: '#E91E63', type: 'conjunction' as WordType },
  { name: 'Interjection', value: '#E91E63', type: 'interjection' as WordType },
  { name: 'Question', value: '#9C27B0', type: 'question' as WordType },
  { name: 'Article', value: '#9E9E9E', type: 'article' as WordType },
  { name: 'Number', value: '#2196F3', type: 'number' as WordType },
  { name: 'Letter', value: '#9E9E9E', type: 'letter' as WordType },
  { name: 'Other', value: '#9E9E9E', type: 'other' as WordType },
  { name: 'Folder', value: '#673AB7', type: 'other' as WordType }, // Deep Purple for folders
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
  const { preferences } = useAppSettings();
  const navigation = useNavigation();
  const [isFolder, setIsFolder] = useState(false);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]); // Default to Green (noun)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WordImageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isNewNode, setIsNewNode] = useState(false);
  const [selectedWordFromApi, setSelectedWordFromApi] =
    useState<WordImageResult | null>(null);
  const [selectedFolderImage, setSelectedFolderImage] =
    useState<WordImageResult | null>(null);
  const [useExistingFolder, setUseExistingFolder] = useState(false);
  const [selectedExistingFolder, setSelectedExistingFolder] =
    useState<Node | null>(null);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  const [googleSearchResults, setGoogleSearchResults] = useState<WordImageResult[]>([]);
  const [isGoogleSearching, setIsGoogleSearching] = useState(false);
  const lastGoogleQueryRef = useRef('');

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
      setSearchError(null);
      setUseExistingFolder(false);
      setSelectedExistingFolder(null);
      setFolderSearchQuery('');
      setGoogleSearchResults([]);
      setIsGoogleSearching(false);
      lastGoogleQueryRef.current = '';
    }
  }, [isVisible, node]);

  // Search both our library and Google as the user types, with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const query = searchQuery.trim();
      if (query.length >= 2) {
        performSearch(query);
        performGoogleSearch(query);
      } else if (query.length === 0) {
        setSearchResults([]);
        setGoogleSearchResults([]);
        lastGoogleQueryRef.current = '';
      }
      setSearchError(null);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      // 1. Search in local pepes
      let localResults: WordImageResult[] = [];
      if (preferences.pepes) {
        try {
          const pepesData = JSON.parse(preferences.pepes);
          const queryLower = query.toLowerCase();

          // Collect all pepes from all categories
          const allPepes = Object.values(pepesData).flat() as any[];

          // Filter by name or aliases
          const matchingPepes = allPepes.filter((pepe: any) =>
            pepe.name?.toLowerCase().includes(queryLower) ||
            (pepe.aliases && pepe.aliases.some((alias: string) => alias.toLowerCase().includes(queryLower)))
          );

          // Map to WordImageResult
          localResults = matchingPepes.map((pepe: any) => ({
            word: pepe.name,
            imageUrl: pepe.imageUri,
            id: `pepe_${pepe.id}`,
          }));
        } catch (e) {
          console.error('Failed to parse pepes data', e);
        }
      }

      // 2. Search API words
      const apiResults = await searchWordImages(query);

      // 3. Combine results, local first
      setSearchResults([...localResults, ...apiResults.results]);
    } catch (error) {

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

      // Only the selection made in the current mode counts — a selection
      // left over from the other mode (e.g. a word tapped before switching
      // to Folder) must not override the image chosen afterwards.
      const selectedImage = isFolder
        ? useExistingFolder
          ? null
          : selectedFolderImage
        : selectedWordFromApi;

      // Download image if one is selected
      if (selectedImage) {
        const filename = `${isFolder ? 'folder' : 'word'}_${selectedImage.id}`;

        // Check if it's already a local image (e.g. from local pepes)
        const isLocalImage =
          selectedImage.imageUrl.startsWith('file://') ||
          selectedImage.imageUrl.startsWith('/');

        if (isLocalImage) {
          localImagePath = selectedImage.imageUrl;
        } else {
          try {
            localImagePath = await downloadSentenceBuilderImage(
              selectedImage.imageUrl,
              filename,
            );
          } catch (error) {
            console.error('Download failed:', error);
            Alert.alert(
              'Warning',
              'Failed to download image. The item will be saved without an image.',
            );
          }
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
          imageHash: selectedImage?.id,
        }),
        // Fallback to URL if download failed
        ...(!localImagePath &&
          selectedImage && {
          imageUri: selectedImage.imageUrl,
          imageHash: selectedImage.id,
        }),
        // For existing folders, include the source folder ID for copying
        ...(isFolder &&
          useExistingFolder && {
          sourceFolderId: selectedExistingFolder!.id,
        }),
      };

      onSave(nodeData);
    } catch (error) {

      Alert.alert('Error', 'Failed to save item. Please try again.');
    }
  };

  const handleDelete = () => {
    if (!node || !onDelete) return;

    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${node.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
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
    if (isPlaceholderImage(searchResult.imageUrl)) {
      setSearchError('No image is attached to this word, please go to settings and add an image to this word.');
      return;
    }
    setSearchError(null);

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

  const performGoogleSearch = async (query: string) => {
    if (lastGoogleQueryRef.current === query) return;
    lastGoogleQueryRef.current = query;

    setIsGoogleSearching(true);
    try {
      const apiResults = await searchGoogleImages(query, 5);
      // Use the searched word as the label/title — Google's own image
      // titles are arbitrary page titles.
      setGoogleSearchResults(
        apiResults.results.map(result => ({ ...result, word: query })),
      );
    } catch (error) {
      console.error('Google Image search error:', error);
      Alert.alert('Error', 'Failed to search Google Images. Please try again.');
    } finally {
      setIsGoogleSearching(false);
    }
  };

  const handleGoogleSearchResultSelect = (searchResult: WordImageResult) => {
    if (isPlaceholderImage(searchResult.imageUrl)) {
      setSearchError('No image is attached to this word, please go to settings and add an image to this word.');
      return;
    }
    setSearchError(null);

    if (isFolder) {
      setSelectedFolderImage(searchResult);
    } else {
      setSelectedWordFromApi(searchResult);
    }
    // We don't clear the search results here so the user can see what they selected
  };

  // Colorful New/Existing pill toggle, shown inline with the section title
  const renderFolderModeToggle = () => (
    <View style={styles.modeToggle}>
      <TouchableOpacity
        style={[
          styles.modeToggleButton,
          !useExistingFolder && styles.modeToggleButtonActive,
        ]}
        onPress={() => setUseExistingFolder(false)}>
        <Text
          style={[
            styles.modeToggleText,
            !useExistingFolder && styles.modeToggleTextActive,
          ]}>
          New
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.modeToggleButton,
          useExistingFolder && styles.modeToggleButtonActive,
        ]}
        onPress={() => setUseExistingFolder(true)}>
        <Text
          style={[
            styles.modeToggleText,
            useExistingFolder && styles.modeToggleTextActive,
          ]}>
          Existing
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSearchResult = ({ item }: { item: WordImageResult }) => (
    <TouchableOpacity
      style={[
        styles.searchResult,
        (isFolder
          ? selectedFolderImage?.id === item.id
          : selectedWordFromApi?.id === item.id) && styles.searchResultSelected,
      ]}
      onPress={() => handleSearchResultSelect(item)}>
      <FastImage
        source={{ uri: item.imageUrl }}
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>
              {isNewNode ? 'Add New Item' : 'Edit Item'}
            </Text>
            {/* Invisible spacer to keep the title centered */}
            <Text style={[styles.cancelButton, styles.headerSpacer]}>
              Cancel
            </Text>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {/* Type Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Type</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    !isFolder && styles.segmentButtonSelected,
                  ]}
                  onPress={() => {
                    setIsFolder(false);
                    setSelectedFolderImage(null);
                  }}>
                  <Text
                    style={[
                      styles.segmentButtonText,
                      !isFolder && styles.segmentButtonTextSelected,
                    ]}>
                    Word
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    isFolder && styles.segmentButtonSelected,
                  ]}
                  onPress={() => {
                    setIsFolder(true);
                    setSelectedWordFromApi(null);
                  }}>
                  <Text
                    style={[
                      styles.segmentButtonText,
                      isFolder && styles.segmentButtonTextSelected,
                    ]}>
                    Folder
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Unified Search Section - Only for words or new folders */}
            {(!isFolder || (isFolder && !useExistingFolder)) && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    {isFolder ? 'Search for Folder Image' : 'Search for Word'}
                  </Text>
                  {isFolder && renderFolderModeToggle()}
                </View>
                <Text style={styles.sectionSubtitle}>
                  {isFolder
                    ? 'Search for an image to use for this folder, from our library or Google'
                    : 'Search for a word from our library (including images you added in Pepes and Stuff) or Google'}
                </Text>

                <View style={styles.searchInputContainer}>
                  <TextInput
                    disableFullscreenUI
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={
                      isFolder ? 'Search for an image...' : 'Search for a word...'
                    }
                    placeholderTextColor="#999"
                    returnKeyType="search"
                  />
                  {(isSearching || isGoogleSearching) && (
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

                {searchError && (
                  <View style={styles.searchErrorContainer}>
                    <Text style={styles.searchErrorText}>{searchError}</Text>
                    <TouchableOpacity
                      style={styles.settingsLink}
                      onPress={() => {
                        onClose();
                        navigation.navigate(views.SETTINGS as never);
                      }}>
                      <Text style={styles.settingsLinkText}>Go to Settings</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {searchResults.length > 0 && (
                  <View style={styles.searchResultsContainer}>
                    <Text style={styles.searchResultsTitle}>Our Library:</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.searchResultsList}>
                      {searchResults.map(item => (
                        <View key={item.id} style={styles.searchResultWrapper}>
                          {renderSearchResult({ item })}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {googleSearchResults.length > 0 && (
                    <View style={styles.searchResultsContainer}>
                      <Text style={styles.searchResultsTitle}>
                        Google:
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.searchResultsList}>
                        {googleSearchResults.map(item => (
                          <View key={item.id} style={styles.searchResultWrapper}>
                            <TouchableOpacity
                              style={[
                                styles.searchResult,
                                (isFolder
                                  ? selectedFolderImage?.id === item.id
                                  : selectedWordFromApi?.id === item.id) &&
                                styles.searchResultSelected,
                              ]}
                              onPress={() => handleGoogleSearchResultSelect(item)}>
                              <FastImage
                                source={{ uri: item.imageUrl }}
                                style={styles.searchResultImage}
                                resizeMode={FastImage.resizeMode.cover}
                              />
                              <Text
                                style={styles.searchResultText}
                                numberOfLines={1}>
                                {item.word}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}
              </View>
            )}

            {/* Name Input - Only for new folders */}
            {isFolder && !useExistingFolder && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Folder Name</Text>
                <TextInput
                  disableFullscreenUI
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
                    source={{ uri: selectedWordFromApi.imageUrl }}
                    style={styles.selectedWordImage}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                  <Text style={styles.selectedWordText}>
                    {selectedWordFromApi.word}
                  </Text>
                  <TouchableOpacity
                    style={styles.clearSelectionButton}
                    onPress={() => setSelectedWordFromApi(null)}>
                    <Text style={styles.clearSelectionText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {isPlaceholderImage(selectedWordFromApi.imageUrl) && (
                  <Text style={styles.placeholderErrorText}>
                    No image is attached to this word, please go to settings and add an image to this word.
                  </Text>
                )}
              </View>
            )}

            {/* Selected Folder Image Display - Only for new folders */}
            {isFolder && !useExistingFolder && selectedFolderImage && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Selected Image</Text>
                <View style={styles.selectedWordContainer}>
                  <FastImage
                    source={{ uri: selectedFolderImage.imageUrl }}
                    style={styles.selectedWordImage}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                  <Text style={styles.selectedWordText}>
                    {selectedFolderImage.word}
                  </Text>
                  <TouchableOpacity
                    style={styles.clearSelectionButton}
                    onPress={() => setSelectedFolderImage(null)}>
                    <Text style={styles.clearSelectionText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {isPlaceholderImage(selectedFolderImage.imageUrl) && (
                  <Text style={styles.placeholderErrorText}>
                    No image is attached to this word, please go to settings and add an image to this word.
                  </Text>
                )}
              </View>
            )}

            {/* Existing Folder Selection - Only for existing folders */}
            {isFolder && useExistingFolder && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Select Existing Folder</Text>
                  {renderFolderModeToggle()}
                </View>
                <Text style={styles.sectionSubtitle}>
                  Choose a folder to copy to this location
                </Text>

                <View style={styles.searchInputContainer}>
                  <TextInput
                    disableFullscreenUI
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
                        resolveImageSource(selectedExistingFolder.imageUri) ||
                        require('../../assets/welcome.png')
                      }
                      style={styles.selectedWordImage}
                      resizeMode={FastImage.resizeMode.cover}
                    />
                    <Text style={styles.selectedWordText}>
                      📁 {selectedExistingFolder.title}
                    </Text>
                    <TouchableOpacity
                      style={styles.clearSelectionButton}
                      onPress={() => setSelectedExistingFolder(null)}>
                      <Text style={styles.clearSelectionText}>✕</Text>
                    </TouchableOpacity>
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
                                resolveImageSource(folder.imageUri) ||
                                require('../../assets/welcome.png')
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
                    style={styles.colorButtonContainer}
                    onPress={() => setSelectedColor(color)}>
                    <View
                      style={[
                        styles.colorButtonWrapper,
                        selectedColor.value === color.value &&
                        styles.colorButtonWrapperSelected,
                      ]}>
                      <View
                        style={[
                          styles.colorButton,
                          { backgroundColor: color.value },
                        ]}
                      />
                    </View>
                    <Text style={styles.colorButtonText}>{color.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerButton, styles.saveButtonLarge]}
              onPress={handleSave}>
              <Text style={styles.footerButtonText}>Save</Text>
            </TouchableOpacity>
            {!isNewNode && onDelete && (
              <TouchableOpacity
                style={[styles.footerButton, styles.deleteButton]}
                onPress={handleDelete}>
                <Text style={styles.footerButtonText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardAvoidingView: {
    flex: 1,
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
  headerSpacer: {
    opacity: 0,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#EDE7F6',
    borderRadius: 20,
    padding: 3,
  },
  modeToggleButton: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 17,
  },
  modeToggleButtonActive: {
    backgroundColor: '#673AB7',
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#673AB7',
  },
  modeToggleTextActive: {
    color: '#fff',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#e9ecef',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentButtonSelected: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6c757d',
  },
  segmentButtonTextSelected: {
    color: '#333',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  colorButtonContainer: {
    alignItems: 'center',
    marginBottom: 16,
    marginRight: 12,
    width: 90, // Slightly wider to accommodate text
  },
  colorButtonWrapper: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  colorButtonWrapperSelected: {
    borderColor: '#333',
    borderWidth: 4,
  },
  colorButton: {
    width: 80,
    height: 80,
    borderRadius: 40, // 2x bigger circle (was 40x40, now 80x80)
  },
  colorButtonText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
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
    maxHeight: 160,
  },
  searchResultWrapper: {
    marginRight: 10,
  },
  searchResult: {
    width: 110,
    height: 110,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
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
  clearSelectionButton: {
    marginLeft: 8,
    backgroundColor: '#fff',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff3b30',
  },
  clearSelectionText: {
    color: '#ff3b30',
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchResultImage: {
    width: '80%',
    height: '65%',
    borderRadius: 6,
    marginBottom: 4,
  },
  searchResultText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    gap: 12,
  },
  footerButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonLarge: {
    backgroundColor: '#28a745',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  footerButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  placeholderErrorText: {
    color: '#ff3b30',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  searchErrorContainer: {
    backgroundColor: '#fff1f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffa39e',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  searchErrorText: {
    color: '#ff3b30',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
    fontWeight: '600',
  },
  settingsLink: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#007bff',
  },
  settingsLinkText: {
    color: '#007bff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default EditModal;
