import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { VerbiSuggestion } from '../state/verbiTypes';
import { getTheme } from '../utils/categoryTheme';

interface VerbiSuggestionTileProps {
  suggestion: VerbiSuggestion;
  cardWidth: number;
  cardHeight: number;
  onPress: (suggestion: VerbiSuggestion) => void;
}

const PREDICTION_THEME_COLOR = '#8B5CF6'; // Violet prediction theme color from app

const VerbiSuggestionTile: React.FC<VerbiSuggestionTileProps> = ({
  suggestion,
  cardWidth,
  cardHeight,
  onPress,
}) => {
  const isFolder = suggestion.type === 'folder';

  // Engine colour first; `category` (a POS tag) is only a fallback hue.
  const theme = getTheme(suggestion.color, suggestion.category);
  const accentColor = isFolder ? PREDICTION_THEME_COLOR : theme.base;

  const accessibilityLabel = isFolder
    ? `${suggestion.label}, folder, double tap to open`
    : `${suggestion.label}, word suggestion, double tap to add`;

  return (
    <TouchableOpacity
      style={[styles.touchable, { width: cardWidth, height: cardHeight }]}
      onPress={() => onPress(suggestion)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.75}>
      {/* Text-only build: the word fills the tile — no artwork, no label strip. */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: accentColor,
            borderColor: isFolder ? PREDICTION_THEME_COLOR : theme.border,
            borderWidth: isFolder ? 2.5 : 1.5,
          },
        ]}>
        <Text
          style={[
            styles.label,
            {
              fontSize: cardWidth * 0.2,
              fontWeight: isFolder ? '800' : '700',
            },
          ]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.4}>
          {isFolder ? suggestion.label.toUpperCase() : suggestion.label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    marginVertical: 3,
  },
  card: {
    flex: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  label: {
    textAlign: 'center',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});

export default VerbiSuggestionTile;
