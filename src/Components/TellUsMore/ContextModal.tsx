import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import fetchHelper from '../../utils/fetcher';
import { MagicPreviewResponse, MagicUpdateRequest } from '../../types/HeroContext';

export type ContextModalMode = 'view' | 'edit';

interface ContextModalProps {
  visible: boolean;
  heroName: string;
  currentFreeText: string;
  initialMode?: ContextModalMode;
  onCancel: () => void;
  /** Save raw text — no AI */
  onSaveRaw: (text: string) => void;
  /** Called with AI preview for parent to show PreviewModal */
  onPreviewReady: (preview: MagicPreviewResponse) => void;
}

type Phase = 'input' | 'loading' | 'error';

/**
 * ContextModal — Unified View & Edit.
 *
 * View mode: Read-only display with strikethrough support.
 * Edit mode: Single TextInput for Quick Add & Brain Dump.
 */
const ContextModal: React.FC<ContextModalProps> = ({
  visible,
  heroName,
  currentFreeText,
  initialMode = 'edit',
  onCancel,
  onSaveRaw,
  onPreviewReady,
}) => {
  const [mode, setMode] = useState<ContextModalMode>(initialMode);
  const [text, setText] = useState(currentFreeText);
  const [phase, setPhase] = useState<Phase>('input');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<TextInput>(null);

  const heroDisplay = heroName || 'your child';

  // Sync state when modal becomes visible or props change
  useEffect(() => {
    if (visible) {
      setText(currentFreeText);
      setMode(initialMode);
      setPhase('input');
      setErrorMessage('');

      if (initialMode === 'edit') {
        setTimeout(() => inputRef.current?.focus(), 300);
      }
    }
  }, [visible, currentFreeText, initialMode]);

  // Focus input when switching to edit mode manually
  useEffect(() => {
    if (visible && mode === 'edit' && phase === 'input') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, mode, phase]);

  const hasUnsavedChanges = () => text !== currentFreeText;

  const handleCancel = () => {
    if (hasUnsavedChanges()) {
      Alert.alert('Discard changes?', 'Your edits will be lost.', [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: onCancel,
        },
      ]);
    } else {
      onCancel();
    }
  };

  const handleSaveRaw = () => {
    if (!text.trim()) {
      Alert.alert(
        'Remove all information?',
        'Are you sure you want to remove all Tell Us More information?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove Information',
            style: 'destructive',
            onPress: () => onSaveRaw(''),
          },
        ],
      );
      return;
    }
    onSaveRaw(text);
  };

  const handleMagicUpdate = async () => {
    setPhase('loading');
    setErrorMessage('');

    try {
      const req: MagicUpdateRequest = {
        currentFreeText: currentFreeText, // Original context as baseline
        newInput: text.trim(),           // Modified text as the new info
        locale: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const response: MagicPreviewResponse = await fetchHelper(
        'magicUpdate',
        {},
        req,
      );
      debugger;
      setPhase('input');
      onPreviewReady(response);
    } catch (err: any) {
      console.log("Error in handleMagicUpdate: ", err);
      debugger;
      const isOffline =
        err?.message?.toLowerCase().includes('network') ||
        err?.message?.toLowerCase().includes('offline') ||
        err?.message?.toLowerCase().includes('failed to fetch');

      setErrorMessage(
        isOffline
          ? 'You appear to be offline. You can save the text now and run Magic Update later.'
          : 'Magic is busy right now. Your text is safe; try again in a moment.',
      );
      setPhase('error');
    }
  };

  const renderStrikethrough = (val: string) => {
    const parts = val.split(/(~~[^~]+~~)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('~~') && part.endsWith('~~')) {
        return (
          <Text key={idx} style={styles.strikethrough}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      return <Text key={idx}>{part}</Text>;
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  Context about {heroDisplay}
                </Text>
                <Text style={styles.subtitle}>
                  Information is saved locally on this device
                </Text>
              </View>
              {phase !== 'loading' && (
                <TouchableOpacity
                  onPress={onCancel}
                  style={styles.closeBtn}
                  accessibilityLabel="Close">
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Body */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={[styles.bodyContent, { flexGrow: 1 }]}
              keyboardShouldPersistTaps="handled">
              {phase === 'loading' ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#8E24AA" />
                  <Text style={styles.loadingText}>
                    Updating {heroDisplay}'s context…
                  </Text>
                  <Text style={styles.loadingSubText}>
                    This usually takes a few seconds.
                  </Text>
                </View>
              ) : (
                <>
                  {phase === 'error' && (
                    <View style={styles.errorBanner}>
                      <Text style={styles.errorIcon}>⚠️</Text>
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  )}

                  {mode === 'view' ? (
                    <View style={styles.viewSection}>
                      <Text style={styles.contentText}>
                        {renderStrikethrough(text || 'No context saved yet.')}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.fieldSection}>
                      <Text style={styles.fieldLabel}>
                        Quick Add &amp; Brain Dump
                      </Text>
                      <Text style={styles.helperText}>
                        Edit {heroDisplay}'s info below or just add new details at the bottom. The AI will clean it up and merge it into their profile.
                      </Text>
                      <TextInput
                        ref={inputRef}
                        style={styles.textInput}
                        multiline
                        value={text}
                        onChangeText={setText}
                        placeholder={`Tell us about ${heroDisplay}…`}
                        placeholderTextColor="#bbb"
                        textAlignVertical="top"
                      />
                      <Text style={styles.footerHint}>
                        ✨ Use Magic: Let AI organize your updates for you
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Actions */}
            {phase !== 'loading' && (
              <View style={styles.footer}>
                {mode === 'view' ? (
                  <>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => setMode('edit')}>
                      <Text style={styles.editBtnText}>✎  Edit / Magic Update</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={onCancel}>
                      <Text style={styles.cancelBtnText}>Close</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={initialMode === 'view' ? () => setMode('view') : handleCancel}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rawBtn}
                      onPress={handleSaveRaw}>
                      <Text style={styles.rawBtnText}>Just Save it</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.magicBtn,
                        !text.trim() && styles.btnDisabled,
                      ]}
                      onPress={handleMagicUpdate}
                      disabled={!text.trim()}>
                      <Text style={styles.magicBtnText}>
                        {phase === 'error' ? '🔄 Try Again' : '✨ Magic Update'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  kav: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 10,
  },

  sheet: {
    width: '98%',
    height: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fafafa',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#555',
    fontWeight: '700',
  },
  body: { flex: 1 },
  bodyContent: {
    padding: 18,
    paddingBottom: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 14,
  },
  loadingText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#8E24AA',
    textAlign: 'center',
  },
  loadingSubText: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFB74D',
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  errorIcon: { fontSize: 18 },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#E65100',
    lineHeight: 20,
  },
  viewSection: {
    flex: 1,
    paddingVertical: 10,
  },
  contentText: {
    fontSize: 16,
    color: '#2d2d2d',
    lineHeight: 26,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  fieldSection: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 6,
  },
  helperText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 19,
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#EEF4FF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#90CAF9',
    flex: 1,
    minHeight: 300,
    padding: 14,
    fontSize: 15,
    color: '#1a237e',
    lineHeight: 23,
    textAlignVertical: 'top',
  },
  footerHint: {
    fontSize: 12,
    color: '#8E24AA',
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fafafa',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  editBtn: {
    flex: 2,
    backgroundColor: '#8E24AA',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  editBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rawBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  rawBtnText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  magicBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#8E24AA',
  },
  magicBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});

export default ContextModal;
