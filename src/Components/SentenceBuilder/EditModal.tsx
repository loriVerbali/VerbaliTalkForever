import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Node, WordType, DEFAULT_COLOR_MAP } from '../../types/sentenceBuilder';

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
  const [isFolder, setIsFolder] = useState(false);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]); // Default to Green (noun)
  const [isNewNode, setIsNewNode] = useState(false);
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
      } else {
        setName('');
        setIsFolder(false);
        setSelectedColor(COLOR_OPTIONS[0]); // Default to Green (noun)
      }
      setUseExistingFolder(false);
      setSelectedExistingFolder(null);
      setFolderSearchQuery('');
    }
  }, [isVisible, node]);

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
      // Text-only build: words are typed, not picked from the image library
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter a word');
        return;
      }
    }

    try {
      const nodeData: Partial<Node> = {
        title: isFolder
          ? useExistingFolder
            ? selectedExistingFolder!.title
            : name.trim()
          : name.trim(),
        kind: isFolder ? 'folder' : 'word',
        type: isFolder ? undefined : selectedColor.type,
        parentId,
        orderIndex: position,
        // Text-only build: no imageUri is stored on new nodes
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

  const handleExistingFolderSelect = (folder: Node) => {
    setSelectedExistingFolder(folder);
  };

  // Filter folders based on search query
  const filteredFolders = allFolders.filter(folder =>
    folder.title.toLowerCase().includes(folderSearchQuery.toLowerCase()),
  );

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
                  onPress={() => setIsFolder(false)}>
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
                  onPress={() => setIsFolder(true)}>
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

            {/* Name Input - words are typed in this text-only build */}
            {(!isFolder || !useExistingFolder) && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    {isFolder ? 'Folder Name' : 'Word'}
                  </Text>
                  {isFolder && renderFolderModeToggle()}
                </View>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={
                    isFolder ? 'Enter folder name...' : 'Enter a word...'
                  }
                  placeholderTextColor="#999"
                  autoCorrect={false}
                />
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
