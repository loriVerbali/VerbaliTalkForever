import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VerbiSuggestion } from '../state/verbiTypes';
import { getTheme } from '../utils/categoryTheme';
import VerbiSuggestionTile from './VerbiSuggestionTile';

/** Horizontal space the group box takes from the column: margins + borders + padding. */
const GROUP_INSET = 3 * 2 + 1.5 * 2 + 3 * 2;

interface VerbiGroupProps {
  /** Heading, already resolved by `buildVerbiGroups` (engine label preferred). */
  label: string;
  /** Engine-supplied hex; falls back to the members' POS colour when absent. */
  color?: string;
  suggestions: VerbiSuggestion[];
  cardWidth: number;
  cardHeight: number;
  onSuggestionPress: (suggestion: VerbiSuggestion) => void;
}

const VerbiGroup: React.FC<VerbiGroupProps> = ({
  label,
  color,
  suggestions,
  cardWidth,
  cardHeight,
  onSuggestionPress,
}) => {
  if (suggestions.length === 0) return null;

  const theme = getTheme(color ?? suggestions[0].color, suggestions[0].category);

  // Header scales with the column so it stays prominent on every grid size,
  // clamped so it never crowds the tiles or shrinks to unreadable on phones.
  const headerFontSize = Math.round(Math.min(16, Math.max(11, cardWidth * 0.11)));

  // Tiles sit inside the group box: subtract its margins (3+3), borders
  // (1.5+1.5) and inner padding (3+3) so they never overflow the column.
  const tileWidth = Math.max(40, cardWidth - GROUP_INSET);

  return (
    <View
      style={[
        styles.container,
        { borderColor: theme.border, backgroundColor: theme.fill },
      ]}>
      <View style={[styles.header, { backgroundColor: theme.headerFill }]}>
        <Text
          style={[styles.groupLabel, { color: theme.text, fontSize: headerFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}>
          {label}
        </Text>
      </View>

      <View style={styles.tiles}>
        {suggestions.map(suggestion => (
          <VerbiSuggestionTile
            key={suggestion.id}
            suggestion={suggestion}
            cardWidth={tileWidth}
            cardHeight={cardHeight}
            onPress={onSuggestionPress}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
    marginHorizontal: 3,
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  groupLabel: {
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tiles: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
});

export default VerbiGroup;
