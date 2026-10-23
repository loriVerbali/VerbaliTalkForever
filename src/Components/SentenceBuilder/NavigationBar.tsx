import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import { useNavigation } from '@react-navigation/native';
import { Node, FolderStackItem } from '../../types/sentenceBuilder';
import { views } from '../../utils/constants';
import { useAdmin } from '../../contexts/adminContext';

const { height } = Dimensions.get('window');

interface NavigationBarProps {
  isEditing: boolean;
  onEditPress: () => void;
  onCancelEditPress: () => void;
  onMicrophonePress: () => void;
  /** When true, the mic icon animates to show active listening. */
  isListening?: boolean;
  onTrashPress: () => void;
  onPlayPress: () => void;
  nodes: Node[];
  sentenceTokenIds: string[];
  onRemoveToken: (nodeId: string, index: number) => void;
  folderStack: FolderStackItem[];
  onFolderPress: (index: number) => void;
  onBackPress?: () => void;
  /** Called just before TTS begins playing the sentence. Used by Verbi to pause partner STT. */
  onSentenceWillSpeak?: () => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({
  isEditing,
  onEditPress,
  onCancelEditPress,
  onMicrophonePress,
  isListening = false,
  onTrashPress,
  onPlayPress,
  nodes,
  sentenceTokenIds,
  onRemoveToken,
  folderStack,
  onFolderPress,
  onBackPress,
  onSentenceWillSpeak,
}) => {
  const navigation = useNavigation();
  const { isTablet } = useAdmin();
  const sentenceScrollRef = useRef<ScrollView>(null);

  // The app is landscape-only, so `height` is the short side of the screen.
  const responsiveValues = {
    playButtonSize: isTablet ? height * 0.045 : height * 0.06,
    playButtonBorderRadius: isTablet ? height * 0.0225 : height * 0.025,
    // Height of the sentence bar's content. Fixed so the grid below never
    // reflows; the word text is sized to fit inside it.
    tokenTotalHeight: isTablet ? height * 0.085 : height * 0.095,
    // Large print for adult readers: roughly 32-43pt on iPads, 18-20pt on
    // phones, where the bar height is what caps it.
    sentenceFontSize: isTablet ? height * 0.042 : height * 0.046,
    trashIconSize: isTablet ? height * 0.04 : height * 0.06,
    playIconSize: isTablet ? height * 0.04 : height * 0.06,
  };

  // Go to mainboard (root) - same as Breadcrumb behavior
  const handleMainboardPress = () => {
    onFolderPress(-1);
  };

  // Navigate to Open.tsx screen
  const handleOpenPress = () => {
    onTrashPress();
    navigation.navigate(views.OPEN as never);
  };

  const handlePlaySentence = async () => {
    if (sentenceTokenIds.length === 0) return;

    // Build the sentence text from the tokens
    const sentenceText = sentenceTokenIds
      .map(nodeId => {
        const node = getNodeById(nodeId);
        return node ? node.ttsText || node.title : '';
      })
      .filter(text => text.trim() !== '')
      .join(' ');

    if (sentenceText.trim()) {
      const TTSService = require('../../utils/TTSService').default;

      // Notify Verbi that TTS is about to start (pause partner STT)
      onSentenceWillSpeak?.();

      TTSService.speak(sentenceText, true);
      onPlayPress();
    }
  };

  const getNodeById = (nodeId: string): Node | undefined => {
    return nodes.find(node => node.id === nodeId);
  };

  // Text-only build: each word in the sentence is the word itself, in large
  // print, rather than a symbol with a caption. Tapping a word removes it.
  const renderToken = (nodeId: string, index: number) => {
    const node = getNodeById(nodeId);
    if (!node) return null;

    return (
      <TouchableOpacity
        key={`${nodeId}-${index}`}
        style={[
          styles.wordChip,
          { maxHeight: responsiveValues.tokenTotalHeight },
          node.kind === 'folder' && styles.folderChip,
        ]}
        onPress={() => onRemoveToken(nodeId, index)}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${node.title}`}>
        <Text
          style={[
            styles.wordChipText,
            {
              fontSize: responsiveValues.sentenceFontSize,
              lineHeight: responsiveValues.sentenceFontSize * 1.2,
            },
          ]}
          numberOfLines={1}>
          {node.title}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Microphone Button */}
      <TouchableOpacity style={styles.iconButton} onPress={onMicrophonePress}>
        <FastImage
          source={
            isListening
              ? require('../../assets/michrophone.gif')
              : require('../../assets/micstatic.png')
          }
          style={styles.trashIconSize}
          resizeMode={FastImage.resizeMode.contain}
        />
      </TouchableOpacity>

      {/* Back Button - go up one folder */}
      {folderStack.length > 0 && onBackPress && (
        <TouchableOpacity style={styles.iconButton} onPress={onBackPress}>
          <Text style={styles.navIconText}>↩️</Text>
        </TouchableOpacity>
      )}

      {/*  Icon - go to mainboard */}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={handleMainboardPress}>
        <Text style={styles.navIconText}>🏠</Text>
      </TouchableOpacity>

      {/* Sentence Building Area with Round Border */}
      {/* Fixed height, not minHeight: word chips are taller than the empty
          placeholder text, so a content-driven height makes the bar grow when
          the first word lands — which reflows the grid below it and remounts
          the whole board (itemHeight is part of the DraggableGrid key).
          +8 covers the wrapper's own vertical padding (4 each side). */}
      <View
        style={[
          styles.sentenceAreaWrapper,
          { height: responsiveValues.tokenTotalHeight + 8 },
        ]}>
        <ScrollView
          ref={sentenceScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Large words overflow the bar sooner; keep the newest word in view.
          onContentSizeChange={() =>
            sentenceScrollRef.current?.scrollToEnd({ animated: true })
          }
          style={[
            styles.scrollView,
            { maxHeight: responsiveValues.tokenTotalHeight },
          ]}
          contentContainerStyle={styles.scrollContent}>
          {sentenceTokenIds.length === 0 ? (
            <Text
              style={[
                styles.emptyText,
                { fontSize: Math.max(16, responsiveValues.sentenceFontSize * 0.7) },
              ]}>
              Tap words to build a sentence
            </Text>
          ) : (
            sentenceTokenIds.map((nodeId, index) => renderToken(nodeId, index))
          )}
        </ScrollView>

        {/* Play Button */}
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: '#4A90D9',
            flexDirection: 'row',
            paddingLeft: 10,
            paddingRight: 5,
          }}>
          {sentenceTokenIds.length > 0 && (
            <TouchableOpacity
              style={[
                styles.playButton,
                {
                  width: responsiveValues.playButtonSize,
                  height: responsiveValues.playButtonSize,
                  borderRadius: responsiveValues.playButtonBorderRadius,
                },
              ]}
              onPress={handlePlaySentence}>
              <FastImage
                source={require('../../assets/playKeyboard.png')}
                style={{
                  width: responsiveValues.playButtonSize,
                  height: responsiveValues.playButtonSize,
                }}
                resizeMode={FastImage.resizeMode.contain}
              />
            </TouchableOpacity>
          )}

          {/* Trashcan Icon */}

          <TouchableOpacity style={[
            styles.playButton,
            {
              width: responsiveValues.playButtonSize,
              height: responsiveValues.playButtonSize,
              borderRadius: responsiveValues.playButtonBorderRadius,
            },
          ]} onPress={onTrashPress}>
            <FastImage
              source={require('../../assets/trash.png')}
              style={{
                width: responsiveValues.trashIconSize,
                height: responsiveValues.trashIconSize,
              }}
              resizeMode={FastImage.resizeMode.contain}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Exit Button - navigates to Open.tsx */}
      <TouchableOpacity style={styles.exitButton} onPress={handleOpenPress}>
        <FastImage
          source={require('../../assets/open_door.png')}
          style={styles.iconSize}
          resizeMode={FastImage.resizeMode.contain}
        />
      </TouchableOpacity>

      {/* Edit Button */}
      <TouchableOpacity
        style={[styles.editButton, isEditing && styles.editButtonActive]}
        onPress={isEditing ? onCancelEditPress : onEditPress}>
        <FastImage
          source={require('../../assets/edit.png')}
          style={styles.editIconSize}
          resizeMode={FastImage.resizeMode.contain}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: height * 0.008,
    minHeight: height * 0.08,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  iconButton: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    borderRadius: 10,
    backgroundColor: '#f8f9fa',
  },
  iconSize: {
    width: 60,
    height: 60,
  },
  trashIconSize: {
    width: 48,
    height: 48,
  },
  navIconText: {
    fontSize: 32,
    color: '#333',
  },
  sentenceAreaWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: '#4A90D9',
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 8,
  },
  emptyText: {
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // One word of the sentence: a tappable pill holding the word in large print.
  wordChip: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginRight: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2196f3',
    backgroundColor: '#f3f8fe',
  },
  folderChip: {
    borderColor: '#9c27b0',
    backgroundColor: '#f9f1fc',
  },
  wordChipText: {
    fontWeight: '700',
    color: '#111',
    includeFontPadding: false,
  },
  playButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  playButtonText: {
    fontSize: height * 0.025,
    color: '#fff',
  },
  trashButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  exitButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    backgroundColor: '#f8f9fa',
  },

  editButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  editButtonActive: {
    backgroundColor: '#dc3545',
  },
  editIconSize: {
    width: 28,
    height: 28,
  },
});

export default NavigationBar;
