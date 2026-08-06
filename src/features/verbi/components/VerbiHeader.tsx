import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { VerbiFolder, ListeningState } from '../state/verbiTypes';

interface VerbiHeaderProps {
  folderStack: VerbiFolder[];
  listeningState: ListeningState;
  onFolderBack: () => void;
}

const VerbiHeader: React.FC<VerbiHeaderProps> = ({
  folderStack,
  listeningState,
  onFolderBack,
}) => {
  const isInFolder = folderStack.length > 0;
  const isListening = listeningState === 'listening';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Back button — visible when inside a folder.
            Absolutely positioned so it never pushes the centered title off-center. */}
        {isInFolder ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onFolderBack}
            accessibilityLabel="Back to Verbi suggestions"
            accessibilityRole="button">
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
        ) : null}

        {/* Centered logo + label */}
        <View style={styles.titleGroup}>
          <Image
            source={require('../../../assets/verbiPoseTransparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          {/* Shrinks rather than clips on narrow columns (small grids / phones) */}
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}>
            Verbi
          </Text>
        </View>

        {/* Listening indicator (Phase 2) — also absolute, keeps title centered */}
        {isListening && (
          <View
            style={styles.listeningIndicator}
            accessibilityLabel="Listening for conversation partner"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#C4B5FD',
    backgroundColor: '#E4DBFB',
  },
  row: {
    // Double the previous 24pt band so the Verbi branding reads clearly.
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 32,
    color: '#7C3AED',
    fontWeight: 'bold',
    lineHeight: 36,
  },
  logo: {
    // Source asset is 649x973 (portrait ~0.667 ratio) — sized to keep that ratio.
    width: 26,
    height: 39,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#5B21B6',
    letterSpacing: 0.3,
    marginLeft: 7,
  },
  listeningIndicator: {
    position: 'absolute',
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
  },
});

export default VerbiHeader;
