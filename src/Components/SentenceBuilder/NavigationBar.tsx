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
import { useNavigation } from '@react-navigation/native';
import { Node, FolderStackItem } from '../../types/sentenceBuilder';
import { views } from '../../utils/constants';
import { resolveImageSource } from '../../utils/imageSourceResolver';
import { useAdmin } from '../../contexts/adminContext';

const { height } = Dimensions.get('window');

interface NavigationBarProps {
  isEditing: boolean;
  onEditPress: () => void;
  onCancelEditPress: () => void;
  onMicrophonePress: () => void;
  onTrashPress: () => void;
  onPlayPress: () => void;
  nodes: Node[];
  sentenceTokenIds: string[];
  onRemoveToken: (nodeId: string, index: number) => void;
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
  folderStack,
  onFolderPress,
  onBackPress,
}) => {
  const navigation = useNavigation();
  const { isTablet } = useAdmin();

  // Responsive values for circle sizes - tokens 15% smaller
  const responsiveValues = {
    tokenSize: isTablet ? height * 0.0612 : height * 0.068, // 15% smaller
    tokenBorderRadius: isTablet ? height * 0.0306 : height * 0.034,
    tokenImageBorderRadius: isTablet ? height * 0.0306 - 2 : height * 0.034 - 2,
    playButtonSize: isTablet ? height * 0.045 : height * 0.06,
    playButtonBorderRadius: isTablet ? height * 0.0225 : height * 0.025,
    // Total token height including label (token + label + spacing)
    tokenTotalHeight: isTablet ? height * 0.085 : height * 0.095,
    tokenLabelHeight: isTablet ? height * 0.018 : height * 0.02,
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
      const AudioSessionManager =
        require('../../utils/AudioSessionManager').default;

      await AudioSessionManager.prepareForTTS();
      TTSService.speak(sentenceText, true);
      onPlayPress();
    }
  };

  const getNodeById = (nodeId: string): Node | undefined => {
    return nodes.find(node => node.id === nodeId);
  };

  const renderToken = (nodeId: string, index: number) => {
    const node = getNodeById(nodeId);
    if (!node) return null;

    return (
      <View key={`${nodeId}-${index}`} style={styles.tokenContainer}>
        <TouchableOpacity
          style={[
            styles.token,
            {
              width: responsiveValues.tokenSize,
              height: responsiveValues.tokenSize,
              borderRadius: responsiveValues.tokenBorderRadius,
            },
            node.kind === 'word' && styles.wordToken,
            node.kind === 'folder' && styles.folderToken,
          ]}
          onPress={() => onRemoveToken(nodeId, index)}>
          {node.imageUri ? (
            <FastImage
              source={
                resolveImageSource(node.imageUri) ||
                require('../../assets/welcome.png')
              }
              style={[
                styles.tokenImage,
                { borderRadius: responsiveValues.tokenImageBorderRadius },
              ]}
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
        <Text
          style={[styles.tokenLabel, { maxWidth: responsiveValues.tokenSize }]}
          numberOfLines={1}>
          {node.title}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Microphone Button */}
      <TouchableOpacity style={styles.iconButton} onPress={onMicrophonePress}>
        <FastImage
          source={require('../../assets/michrophone.gif')}
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
      <View
        style={[
          styles.sentenceAreaWrapper,
          { minHeight: responsiveValues.tokenTotalHeight },
        ]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[
            styles.scrollView,
            { maxHeight: responsiveValues.tokenTotalHeight },
          ]}
          contentContainerStyle={styles.scrollContent}>
          {sentenceTokenIds.length === 0 ? (
            <Text style={styles.emptyText}>Tap words to build a sentence</Text>
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
    fontSize: 14,
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  token: {
    borderWidth: 2,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
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
    fontSize: height * 0.012,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
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
