import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VerbiSuggestion, VerbiFolder } from '../state/verbiTypes';
import VerbiSuggestionTile from './VerbiSuggestionTile';

/** Kept in sync with VerbiGroup: margins + borders + padding taken from the column. */
const GROUP_INSET = 3 * 2 + 1.5 * 2 + 3 * 2;

interface VerbiFolderViewProps {
  folder: VerbiFolder;
  suggestions: VerbiSuggestion[];
  cardWidth: number;
  cardHeight: number;
  onSuggestionPress: (suggestion: VerbiSuggestion) => void;
}

/**
 * Displays word-only suggestions when inside a Verbi folder.
 * Folder-type suggestions are filtered out (folders inside folders are not supported).
 */
const VerbiFolderView: React.FC<VerbiFolderViewProps> = ({
  folder,
  suggestions,
  cardWidth,
  cardHeight,
  onSuggestionPress,
}) => {
  const wordSuggestions = suggestions.filter(s => s.type === 'word');

  // Matches VerbiGroup: title scales with the column, tiles inset to fit the box.
  const titleFontSize = Math.round(Math.min(16, Math.max(11, cardWidth * 0.11)));
  const tileWidth = Math.max(40, cardWidth - GROUP_INSET);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text
          style={[styles.folderTitle, { fontSize: titleFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}>
          {folder.label}
        </Text>
      </View>
      {wordSuggestions.length === 0 ? (
        <Text style={styles.emptyText}>No suggestions</Text>
      ) : (
        <View style={styles.tiles}>
          {wordSuggestions.map(suggestion => (
            <VerbiSuggestionTile
              key={suggestion.id}
              suggestion={suggestion}
              cardWidth={tileWidth}
              cardHeight={cardHeight}
              onPress={onSuggestionPress}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: 3,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.6)',
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(139, 92, 246, 0.32)',
  },
  tiles: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  folderTitle: {
    fontWeight: '800',
    color: '#6D28D9',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 8,
  },
});

export default VerbiFolderView;
