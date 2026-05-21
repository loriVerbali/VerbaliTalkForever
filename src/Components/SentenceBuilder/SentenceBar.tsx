import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {Node} from '../../types/sentenceBuilder';
import {resolveImageSource} from '../../utils/imageSourceResolver';

const {width, height} = Dimensions.get('window');

interface SentenceBarProps {
  nodes: Node[];
  sentenceTokenIds: string[];
  isEditing: boolean;
  onRemoveToken: (nodeId: string) => void;
  onEditToken?: (nodeId: string) => void;
  onReset: () => void;
}

const SentenceBar: React.FC<SentenceBarProps> = ({
  nodes,
  sentenceTokenIds,
  isEditing,
  onRemoveToken,
  onEditToken,
  onReset,
}) => {
  const getNodeById = (nodeId: string): Node | undefined => {
    return nodes.find(node => node.id === nodeId);
  };

  const handleTokenLongPress = (nodeId: string) => {
    if (isEditing && onEditToken) {
      onEditToken(nodeId);
    } else {
      onRemoveToken(nodeId);
    }
  };

  const renderToken = (nodeId: string, index: number) => {
    const node = getNodeById(nodeId);
    if (!node) return null;

    return (
      <View key={`${nodeId}-${index}`} style={styles.tokenContainer}>
        <TouchableOpacity
          style={[
            styles.token,
            node.kind === 'word' && styles.wordToken,
            node.kind === 'folder' && styles.folderToken,
          ]}
          onPress={() => onRemoveToken(nodeId)}
          onLongPress={() => handleTokenLongPress(nodeId)}
          delayLongPress={500}>
          {node.kind === 'word' && node.imageUri ? (
            <FastImage
              source={
                resolveImageSource(node.imageUri) ||
                require('../../assets/welcome.png')
              }
              style={styles.tokenImage}
              resizeMode={FastImage.resizeMode.cover}
            />
          ) : (
            <View style={[styles.tokenImage, styles.tokenPlaceholder]}>
              <Text style={styles.tokenPlaceholderText}>
                {node.kind === 'folder'
                  ? '📁'
                  : node.title.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.tokenLabel} numberOfLines={1}>
          {node.title}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.sentenceContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}>
          {sentenceTokenIds.length === 0 ? (
            <Text style={styles.emptyText}>Tap words to build a sentence</Text>
          ) : (
            sentenceTokenIds.map((nodeId, index) => renderToken(nodeId, index))
          )}
        </ScrollView>
      </View>

      {sentenceTokenIds.length > 0 && (
        <TouchableOpacity style={styles.resetButton} onPress={onReset}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: height * 0.075, // 7.5% of screen height for landscape
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  sentenceContainer: {
    flex: 1,
    marginRight: 12,
  },
  scrollView: {
    maxHeight: height * 0.06, // 6% of screen height for landscape
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  token: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
    overflow: 'hidden',
  },
  wordToken: {
    borderColor: '#2196f3',
  },
  folderToken: {
    borderColor: '#9c27b0',
  },
  tokenImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  tokenPlaceholder: {
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenPlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  tokenContainer: {
    alignItems: 'center',
    marginRight: 8,
  },
  tokenLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
    marginTop: 2,
    maxWidth: 50,
  },
  resetButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SentenceBar;
