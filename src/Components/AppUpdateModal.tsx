/**
 * AppUpdateModal
 *
 * Root-level, dismissible popup driven by the backend update policy.
 * Shows the database-provided title and message with:
 *   - "Update now" → opens the platform-specific store URL
 *   - "Not now"    → dismisses
 *
 * Both `recommended` and `important` policies are dismissible; a mandatory
 * (non-dismissible) update is a separate product rule and is not implemented.
 */
import React, {useCallback, useState} from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {DisplayableUpdatePolicy} from '../types/appUpdate';

export interface AppUpdateModalProps {
  visible: boolean;
  policy: DisplayableUpdatePolicy | null;
  onClose: () => void;
}

const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

export const openStoreUrl = async (storeUrl: string): Promise<boolean> => {
  try {
    const supported = await Linking.canOpenURL(storeUrl);
    if (!supported) {
      return false;
    }
    await Linking.openURL(storeUrl);
    return true;
  } catch {
    return false;
  }
};

const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  visible,
  policy,
  onClose,
}) => {
  const [opening, setOpening] = useState(false);

  const handleUpdateNow = useCallback(async () => {
    if (!policy || opening) {
      return;
    }
    setOpening(true);
    const opened = await openStoreUrl(policy.storeUrl);
    setOpening(false);
    if (opened) {
      onClose();
      return;
    }
    Alert.alert(
      'Could not open the store',
      `Please open ${STORE_NAME} and search for the app to update.`,
      [{text: 'OK'}],
    );
  }, [policy, opening, onClose]);

  if (!policy) {
    return null;
  }

  const isImportant = policy.importance === 'important';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessibilityViewIsModal
          accessibilityLabel="Update available">
          <View
            style={[styles.badge, isImportant && styles.badgeImportant]}
            accessible={false}>
            <Text
              style={[
                styles.badgeText,
                isImportant && styles.badgeTextImportant,
              ]}>
              {isImportant ? 'Important update' : 'Update available'}
            </Text>
          </View>

          <Text style={styles.title} accessibilityRole="header">
            {policy.title}
          </Text>
          <Text style={styles.message}>{policy.message}</Text>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleUpdateNow}
            disabled={opening}
            accessibilityRole="button"
            accessibilityLabel="Update now"
            accessibilityHint={`Opens ${STORE_NAME} to update the app`}
            testID="app-update-modal-update-now">
            <Text style={styles.primaryButtonText}>Update now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            accessibilityHint="Closes this message"
            testID="app-update-modal-not-now">
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3E5F5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeImportant: {
    backgroundColor: '#FFF3E0',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E24AA',
  },
  badgeTextImportant: {
    color: '#E65100',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    color: '#444444',
    marginBottom: 20,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: '#8E24AA',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#F2F2F2',
  },
  secondaryButtonText: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AppUpdateModal;
