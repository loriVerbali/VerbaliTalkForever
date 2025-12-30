import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {useNavigation} from '@react-navigation/native';
import {Node, FolderStackItem, DEFAULT_COLOR_MAP, FOLDER_COLOR} from '../../types/sentenceBuilder';
import {views} from '../../utils/constants';
import {useAdmin} from '../../contexts/adminContext';
import Breadcrumb from './Breadcrumb';

const {width, height} = Dimensions.get('window');

interface NavigationBarProps {
  isEditing: boolean;
  onEditPress: () => void;
  onCancelEditPress: () => void;
  onMicrophonePress: () => void;
  onTrashPress: () => void;
  onPlayPress: () => void;
  nodes: Node[];
  sentenceTokenIds: string[];
  onRemoveToken: (nodeId: string) => void;
  onEditToken?: (nodeId: string) => void;
  folderStack: FolderStackItem[];
  onFolderPress: (index: number) => void;
  onBackPress?: () => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({
  isEditing,
  onEditPress,
  onCancelEditPress,
  onMicrophonePress,
  onTrashPress,
  onPlayPress,
  nodes,
  sentenceTokenIds,
  onRemoveToken,
  onEditToken,
  folderStack,
  onFolderPress,
  onBackPress,
}) => {
  const navigation = useNavigation();
  const {isTablet} = useAdmin();

  // Responsive values for pill sizes - 10% smaller for tablets
  const responsiveValues = {
    tokenHeight: isTablet ? height * 0.05 : height * 0.055, // Pill height
    tokenPaddingHorizontal: isTablet ? 12 : 14, // Horizontal padding for text
    tokenBorderRadius: isTablet ? height * 0.0275 : height * 0.0275, // Pill border radius (half of height)
    playButtonSize: isTablet ? height * 0.054 : height * 0.06, // 10% reduction for tablets
    playButtonBorderRadius: isTablet ? height * 0.027 : height * 0.03, // Half of play button size
  };

  const handleHomePress = () => {
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
      // Import services
      const TTSService = require('../../utils/TTSService').default;
      const AudioSessionManager = require('../../utils/AudioSessionManager').default;
      
      // Prepare audio session for TTS to ensure consistent volume
      await AudioSessionManager.prepareForTTS();
      
      // Speak the sentence
      TTSService.speak(sentenceText, true);

      // Call the onPlayPress handler to delete the sentence after playing
      onPlayPress();
    }
  };
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

    // Get color based on node type
    const backgroundColor = node.kind === 'folder' 
      ? FOLDER_COLOR 
      : DEFAULT_COLOR_MAP[node.type || 'other'];

    return (
      <View key={`${nodeId}-${index}`} style={styles.tokenContainer}>
        <TouchableOpacity
          style={[
            styles.tokenPill,
            {
              height: responsiveValues.tokenHeight,
              borderRadius: responsiveValues.tokenBorderRadius,
              backgroundColor: backgroundColor,
              paddingHorizontal: responsiveValues.tokenPaddingHorizontal,
            },
          ]}
          onPress={() => onRemoveToken(nodeId)}
          onLongPress={() => handleTokenLongPress(nodeId)}
          delayLongPress={500}>
          <Text
            style={styles.tokenPillText}
            numberOfLines={1}>
            {node.kind === 'folder' && (
              <Text style={styles.folderIconInline}>📁 </Text>
            )}
            {node.title}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Breadcrumb */}
      <Breadcrumb
        folderStack={folderStack}
        onFolderPress={onFolderPress}
        onBackPress={onBackPress}
      />

      {/* Main Navigation Bar */}
      <View style={styles.container}>
        {/* Microphone Button */}
        <TouchableOpacity style={styles.iconButton} onPress={onMicrophonePress}>
          <FastImage
            source={require('../../assets/michrophone.gif')}
            style={styles.iconSize}
            resizeMode={FastImage.resizeMode.contain}
          />
        </TouchableOpacity>

        {/* Sentence Building Area */}
        <View style={styles.sentenceContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}>
            {sentenceTokenIds.length === 0 ? (
              <Text style={styles.emptyText}>
                Tap words to build a sentence
              </Text>
            ) : (
              sentenceTokenIds.map((nodeId, index) =>
                renderToken(nodeId, index),
              )
            )}
          </ScrollView>
        </View>

        {/* Play Button - only show if there are tokens */}
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
            <Text style={styles.playButtonText}>▶️</Text>
          </TouchableOpacity>
        )}

        {/* Trashcan Icon */}
        <TouchableOpacity style={styles.iconButton} onPress={onTrashPress}>
          <FastImage
            source={require('../../assets/trash.png')}
            style={styles.iconSize}
            resizeMode={FastImage.resizeMode.contain}
          />
        </TouchableOpacity>

        {/* Spacer between trash and edit */}
        <View style={styles.iconSpacer} />

        {/* Edit Icon */}
        <TouchableOpacity
          style={[styles.iconButton, isEditing && styles.editButtonActive]}
          onPress={isEditing ? onCancelEditPress : onEditPress}>
          <FastImage
            source={require('../../assets/edit.png')}
            style={styles.iconSize}
            resizeMode={FastImage.resizeMode.contain}
          />
        </TouchableOpacity>

        {/* Home Icon - navigates to Open.tsx */}
        <TouchableOpacity style={styles.iconButton} onPress={handleHomePress}>
          <Text style={styles.homeIconText}>🏠</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: height * 0.01, // 1% of screen height for mobile
    minHeight: height * 0.055, // 7.5% of screen height for landscape
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  iconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
  },
  editButtonActive: {
    backgroundColor: '#dc3545', // Red background when in edit mode
  },
  iconSize: {
    width: 24,
    height: 24,
  },
  sentenceContainer: {
    flex: 1,
    marginHorizontal: 8,
    maxHeight: height * 0.1, // 10% of screen height for landscape
  },
  scrollView: {
    maxHeight: height * 0.1, // 10% of screen height for landscape
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 0,
  },
  emptyText: {
    fontSize: 14,
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  tokenPill: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
    minWidth: 40, // Minimum width for very short words
  },
  tokenPillText: {
    fontSize: height * 0.018, // Responsive font size
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  tokenContainer: {
    alignItems: 'center',
    marginRight: 8,
  },
  folderIconInline: {
    fontSize: height * 0.018, // Match token text size
    color: '#fff',
  },
  homeIconText: {
    fontSize: 18,
    color: '#333',
  },
  playButton: {
    // width, height, and borderRadius are now handled dynamically
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: height * 0.02, // Reduced margin to prevent cutoff
    backgroundColor: '#28a745',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
  },
  playButtonText: {
    fontSize: height * 0.025, // Responsive font size
    color: '#fff',
  },
  iconSpacer: {
    width: 16,
  },
});

export default NavigationBar;
