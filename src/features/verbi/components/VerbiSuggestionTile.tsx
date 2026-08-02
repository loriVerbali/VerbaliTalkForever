import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import FastImage from 'react-native-fast-image';
import { VerbiSuggestion } from '../state/verbiTypes';
import { getTheme } from '../utils/categoryTheme';

interface VerbiSuggestionTileProps {
  suggestion: VerbiSuggestion;
  cardWidth: number;
  cardHeight: number;
  onPress: (suggestion: VerbiSuggestion) => void;
}

const FOLDER_COLOR = '#673AB7'; // Deep Purple from app
const PREDICTION_THEME_COLOR = '#8B5CF6'; // Violet prediction theme color from app

const VerbiSuggestionTile: React.FC<VerbiSuggestionTileProps> = ({
  suggestion,
  cardWidth,
  cardHeight,
  onPress,
}) => {
  const [imageError, setImageError] = useState(false);
  const isFolder = suggestion.type === 'folder';

  // Engine colour first; `category` (a POS tag) is only a fallback hue.
  const theme = getTheme(suggestion.color, suggestion.category);
  const accentColor = isFolder ? PREDICTION_THEME_COLOR : theme.base;

  // Extract candidate image URL from imageUrl or icon.value
  const rawValue = suggestion.icon?.value;
  const isValueUrl =
    typeof rawValue === 'string' &&
    (rawValue.startsWith('http://') ||
      rawValue.startsWith('https://') ||
      rawValue.startsWith('file://') ||
      rawValue.startsWith('data:image'));

  const isImageIcon =
    suggestion.icon?.kind === 'image' ||
    suggestion.icon?.kind === 'remoteImage' ||
    suggestion.icon?.kind === 'existingAsset' ||
    isValueUrl;

  const imageUri =
    !imageError &&
    (suggestion.localImagePath ||
      suggestion.imageUrl ||
      (isImageIcon ? rawValue : undefined));

  const iconEmoji =
    !imageUri && suggestion.icon?.kind === 'emoji' && suggestion.icon.value
      ? suggestion.icon.value
      : isFolder
      ? '📂'
      : undefined;

  const accessibilityLabel = isFolder
    ? `${suggestion.label}, folder, double tap to open`
    : `${suggestion.label}, word suggestion, double tap to add`;

  // Label sits below the artwork (not overlaid), and stays smaller than the
  // group header above it so the category name reads as the dominant label.
  const labelFontSize = Math.round(Math.min(14, Math.max(9, cardWidth * 0.085)));

  return (
    <TouchableOpacity
      style={[styles.touchable, { width: cardWidth, height: cardHeight }]}
      onPress={() => onPress(suggestion)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.75}>
      <View
        style={[
          styles.card,
          {
            borderColor: isFolder ? PREDICTION_THEME_COLOR : theme.border,
            borderWidth: isFolder ? 2.5 : 1.5,
          },
        ]}>
        {/* Artwork — contained with breathing room rather than full-bleed */}
        <View style={styles.imageArea}>
          {imageUri ? (
            <FastImage
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode={FastImage.resizeMode.contain}
              onError={() => setImageError(true)}
            />
          ) : (
            <View
              style={[
                styles.placeholder,
                { backgroundColor: isFolder ? PREDICTION_THEME_COLOR : accentColor },
              ]}>
              <Text style={[styles.placeholderText, { fontSize: cardWidth * 0.22 }]}>
                {iconEmoji ?? suggestion.label.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Label strip */}
        <View
          style={[
            styles.labelStrip,
            isFolder && { backgroundColor: '#FFF8E7', borderTopColor: PREDICTION_THEME_COLOR },
          ]}>
          <Text
            style={[
              styles.label,
              {
                fontSize: labelFontSize,
                fontWeight: isFolder ? '800' : '600',
                color: isFolder ? FOLDER_COLOR : '#1F2937',
              },
            ]}
            numberOfLines={2}>
            {isFolder ? suggestion.label.toUpperCase() : suggestion.label}
          </Text>
        </View>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  imageArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  image: {
    width: '86%',
    height: '86%',
  },
  placeholder: {
    width: '80%',
    height: '80%',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#fff',
  },
  labelStrip: {
    paddingVertical: 3,
    paddingHorizontal: 3,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEF0F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    textAlign: 'center',
  },
});

export default VerbiSuggestionTile;
