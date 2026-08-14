import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  VerbiClientState,
  VerbiSuggestion,
  VerbiFolder,
} from '../state/verbiTypes';
import { buildVerbiGroups } from '../utils/buildVerbiGroups';
import VerbiHeader from './VerbiHeader';
import VerbiGroup from './VerbiGroup';
import VerbiFolderView from './VerbiFolderView';
import VerbiStatus from './VerbiStatus';

interface VerbiColumnProps {
  state: VerbiClientState;
  cardWidth: number;
  cardHeight: number;
  /** Right-edge spacing so the column isn't clipped by the screen boundary. */
  gutter?: number;
  onSuggestionSelected: (suggestion: VerbiSuggestion) => void;
  onFolderOpened: (folder: VerbiFolder) => void;
  onFolderBack: () => void;
}

const VerbiColumn: React.FC<VerbiColumnProps> = ({
  state,
  cardWidth,
  cardHeight,
  gutter = 0,
  onSuggestionSelected,
  onFolderOpened,
  onFolderBack,
}) => {
  const {
    suggestions,
    groups,
    folderStack,
    predictionStatus,
    listeningState,
    isOnline,
  } = state;

  // Sections are always parts of speech (Verbs, Nouns, …), built from each
  // suggestion's `category`; the engine's topical `groups` only lend colours.
  const orderedGroups = useMemo(
    () => buildVerbiGroups(suggestions, groups),
    [suggestions, groups],
  );

  const handleSuggestionPress = (suggestion: VerbiSuggestion) => {
    if (suggestion.type === 'folder') {
      onFolderOpened({
        id: suggestion.id,
        label: suggestion.label,
        category: suggestion.category,
      });
    } else {
      onSuggestionSelected(suggestion);
    }
  };

  const activeFolder =
    folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;

  return (
    <View style={[styles.container, { width: cardWidth, marginRight: gutter }]}>
      {/* Header */}
      <VerbiHeader
        folderStack={folderStack}
        listeningState={listeningState}
        onFolderBack={onFolderBack}
      />

      {/* Status indicator */}
      <VerbiStatus
        predictionStatus={predictionStatus}
        listeningState={listeningState}
        isOnline={isOnline}
      />

      {/* Suggestions stay fully tappable while a fresh prediction is in
          flight — the previous set is still valid, and yanking the board away
          mid-reach is worse than serving it a beat late. VerbiStatus shows the
          in-flight spinner. */}
      <View style={{ flex: 1, position: 'relative' }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}>
          {activeFolder ? (
            <VerbiFolderView
              folder={activeFolder}
              suggestions={suggestions}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              onSuggestionPress={handleSuggestionPress}
            />
          ) : (
            orderedGroups.map(({ key, label, color, items }) => {
              if (items.length === 0) return null;
              return (
                <VerbiGroup
                  key={key}
                  label={label}
                  color={color}
                  suggestions={items}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  onSuggestionPress={handleSuggestionPress}
                />
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Violet backdrop, a step darker than the page (#f8f9fa) so the column
    // reads as its own panel. Group tints composite on top of this.
    backgroundColor: '#EFEAFC',
    borderLeftWidth: 1,
    borderLeftColor: '#C4B5FD',
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
    paddingTop: 4,
  },
});

export default VerbiColumn;
