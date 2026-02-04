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
  Switch,
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
}

// Color options conforming to Modified Fitzgerald Key standard
const COLOR_OPTIONS = [
  { name: 'Pronoun', value: '#FBC02D', type: 'pronoun' as WordType },      // Yellow - People/Pronouns
  { name: 'Verb', value: '#4CAF50', type: 'verb' as WordType },            // Green - Actions
  { name: 'Noun', value: '#FF9800', type: 'noun' as WordType },            // Orange - Things
  { name: 'Adjective', value: '#2196F3', type: 'adjective' as WordType },  // Blue - Descriptors
  { name: 'Adverb', value: '#2196F3', type: 'adverb' as WordType },        // Blue - Descriptors
  { name: 'Preposition', value: '#E91E63', type: 'preposition' as WordType }, // Pink - Function
  { name: 'Conjunction', value: '#E91E63', type: 'conjunction' as WordType }, // Pink - Function
  { name: 'Interjection', value: '#E91E63', type: 'interjection' as WordType }, // Pink - Social
  { name: 'Question', value: '#9C27B0', type: 'question' as WordType },    // Purple - Questions
  { name: 'Article', value: '#9E9E9E', type: 'article' as WordType },      // Grey - Determiners
  { name: 'Number', value: '#2196F3', type: 'number' as WordType },        // Blue - Quantifiers
  { name: 'Letter', value: '#9E9E9E', type: 'letter' as WordType },        // Grey - Other
  { name: 'Other', value: '#9E9E9E', type: 'other' as WordType },          // Grey - Other
  { name: 'Folder', value: '#673AB7', type: 'other' as WordType },         // Deep Purple - Folder
];

const EditModal: React.FC<EditModalProps> = ({
  isVisible,
  node,
  parentId,
  position,
  onClose,
  onSave,
  onDelete,
}) => {
  const [isFolder, setIsFolder] = useState(false);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]); // Default to Green (noun)
  const [isNewNode, setIsNewNode] = useState(false);

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
    }
  }, [isVisible, node]);

  const handleSave = async () => {
    // Validate input
    if (!name.trim()) {
      Alert.alert('Error', `Please enter a ${isFolder ? 'folder' : 'word'} name`);
      return;
    }

    try {
      const nodeData: Partial<Node> = {
        title: name.trim(),
        kind: isFolder ? 'folder' : 'word',
        type: isFolder ? undefined : selectedColor.type,
        parentId,
        orderIndex: position,
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
          <View style={{ width: 50 }} />
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
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={isFolder ? '#f5dd4b' : '#f4f3f4'}
              />
              <Text style={styles.switchLabel}>Folder</Text>
            </View>
          </View>

          {/* Name Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isFolder ? 'Folder Name' : 'Word'}
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={`Enter ${isFolder ? 'folder' : 'word'} name...`}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Color Selection - Only for words */}
          {!isFolder && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Word Type / Color</Text>
              <View style={styles.colorGrid}>
                {COLOR_OPTIONS.filter(c => c.value !== '#673AB7').map((color, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.colorButton,
                      { backgroundColor: color.value },
                      selectedColor.value === color.value &&
                      styles.colorButtonSelected,
                    ]}
                    onPress={() => setSelectedColor(color)}>
                    <Text style={styles.colorButtonText}>{color.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Save Button */}
          <View style={styles.section}>
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.saveButtonLarge}
                onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Delete Button */}
          {!isNewNode && onDelete && (
            <View style={styles.section}>
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}>
                  <Text style={styles.deleteButtonText}>Delete Item</Text>
                </TouchableOpacity>
              </View>
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
    color: '#c5231eff',
    fontWeight: '800',
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
    justifyContent: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  colorButton: {
    width: 80,
    height: 80,
    borderRadius: 40, // Makes it a perfect circle
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorButtonSelected: {
    borderColor: '#333',
  },
  colorButtonText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    width: '100%',
  },
  saveButtonLarge: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    width: '40%',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    width: '20%',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EditModal;
