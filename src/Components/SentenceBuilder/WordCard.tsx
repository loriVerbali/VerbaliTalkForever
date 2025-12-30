import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {Node, FOLDER_COLOR} from '../../types/sentenceBuilder';

const {width} = Dimensions.get('window');

interface WordCardProps {
  node: Node;
  isEditing: boolean;
  onPress: (node: Node) => void;
  onEditPress?: (node: Node) => void;
  cardSize: number;
  color: string;
}

const WordCard: React.FC<WordCardProps> = ({
  node,
  isEditing,
  onPress,
  onEditPress,
  cardSize,
  color,
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
          backgroundColor: color,
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

      {/* Word text */}
      <Text style={styles.text} numberOfLines={2}>
        {node.title}
      </Text>

      {/* TTS indicator */}
      {node.ttsText && (
        <View style={styles.ttsIndicator}>
          <Text style={styles.ttsText}>🔊</Text>
        </View>
      )}
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
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
  ttsIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  ttsText: {
    fontSize: 10,
  },
});

export default WordCard;
