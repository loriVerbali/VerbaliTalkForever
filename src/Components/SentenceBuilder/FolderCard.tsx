import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {Node, FOLDER_COLOR} from '../../types/sentenceBuilder';

interface FolderCardProps {
  node: Node;
  isEditing: boolean;
  onPress: (node: Node) => void;
  onEditPress?: (node: Node) => void;
  cardSize: number;
}

const FolderCard: React.FC<FolderCardProps> = ({
  node,
  isEditing,
  onPress,
  onEditPress,
  cardSize,
}) => {
  const handlePress = () => {
    onPress(node);
  };

  const handleEditPress = (e: any) => {
    e.stopPropagation();
    if (onEditPress) {
      onEditPress(node);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          width: cardSize,
          height: cardSize,
          backgroundColor: FOLDER_COLOR,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}>
      {/* Edit button - only visible in editing mode */}
      {isEditing && (
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEditPress}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={styles.editButtonText}>✏️</Text>
        </TouchableOpacity>
      )}

      {/* Folder icon */}
      <View style={styles.folderIcon}>
        <Text style={styles.folderIconText}>📁</Text>
      </View>

      {/* Folder title with inline folder icon */}
      <Text style={styles.text} numberOfLines={2}>
        <Text style={styles.folderIconInline}>📁 </Text>
        {node.title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    position: 'relative',
  },
  editButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  editButtonText: {
    fontSize: 12,
    color: '#fff',
  },
  folderIcon: {
    marginBottom: 8,
  },
  folderIconText: {
    fontSize: 32,
  },
  folderIconInline: {
    fontSize: 14,
    color: '#FFD700', // Yellow color
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
});

export default FolderCard;
