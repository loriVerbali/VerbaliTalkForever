import React, { useState, useRef } from 'react';
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
import { MagicPreviewResponse, MagicBuildRequest } from '../../types/HeroContext';

interface MagicBuildModalProps {
  visible: boolean;
  heroName: string;
  currentFreeText: string;
  onCancel: () => void;
  /** Called when user taps "Save Raw Text" (no AI) */
  onSaveRaw: (text: string) => void;
  /** Called with the AI preview result for the parent to show PreviewModal */
  onPreviewReady: (preview: MagicPreviewResponse, rawInput: string) => void;
}

type ModalPhase = 'input' | 'loading' | 'error';

/**
 * MagicBuildModal — Onboarding intake for new heroes.
 * Caregiver types (or dictates) free-form context, then taps ✨ Magic Build.
 * On success, fires onPreviewReady so the parent can show PreviewModal.
 */
const MagicBuildModal: React.FC<MagicBuildModalProps> = ({
  visible,
  heroName,
  currentFreeText,
  onCancel,
  onSaveRaw,
  onPreviewReady,
}) => {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<ModalPhase>('input');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<TextInput>(null);

  const heroDisplay = heroName || 'your child';

  const reset = () => {
    setInput('');
    setPhase('input');
    setErrorMessage('');
  };

  const handleCancel = () => {
    if (input.trim()) {
      Alert.alert('Discard changes?', 'Your typed text will be lost.', [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            reset();
            onCancel();
          },
        },
      ]);
    } else {
      reset();
      onCancel();
    }
  };

  const handleSaveRaw = () => {
    if (!input.trim()) return;
    onSaveRaw(input.trim());
    reset();
  };

  const handleMagicBuild = async () => {
    if (!input.trim()) return;
    setPhase('loading');
    setErrorMessage('');

    try {
      const req: MagicBuildRequest = {
        transcriptOrInput: input.trim(),
        currentFreeText: currentFreeText || '',
        locale: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const response: MagicPreviewResponse = await fetchHelper(
        'magicBuild',
        {},
        req,
      );

      setPhase('input'); // Reset phase before closing
      onPreviewReady(response, input.trim());
      // Don't reset input yet — keep it in case user cancels preview
    } catch (err: any) {
      const isOffline =
        err?.message?.toLowerCase().includes('network') ||
        err?.message?.toLowerCase().includes('offline') ||
        err?.message?.toLowerCase().includes('failed to fetch');

      setErrorMessage(
        isOffline
          ? 'You appear to be offline. You can save the text now and run Magic Build later.'
          : 'Magic is busy right now. Your text is safe; try again in a moment.',
      );
      setPhase('error');
    }
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
              <View>
                <Text style={styles.title}>
                  Tell us about {heroDisplay}
                </Text>
                <Text style={styles.subtitle}>
                  Information is saved locally on this device
                </Text>
              </View>
              {phase !== 'loading' && (
                <TouchableOpacity
                  onPress={handleCancel}
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
                    Building {heroDisplay}'s profile…
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

                  <Text style={styles.helperText}>
                    The more context you share, the better the AI suggestions become.
                  </Text>

                  <TextInput
                    ref={inputRef}
                    style={styles.textInput}
                    multiline
                    value={input}
                    onChangeText={setInput}
                    placeholder={`e.g., What ${heroDisplay} likes or dislikes, special dates, inside jokes, routines, and more… Type 'done' when finished.`}
                    placeholderTextColor="#aaa"
                    autoFocus
                    textAlignVertical="top"
                    editable={phase !== 'loading'}
                  />

                  <Text style={styles.footerHint}>
                    ✨ AI will organize this into {heroDisplay}'s profile and tiles.
                  </Text>
                </>
              )}
            </ScrollView>

            {/* Actions */}
            {phase !== 'loading' && (
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancel}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.rawBtn,
                    !input.trim() && styles.btnDisabled,
                  ]}
                  onPress={handleSaveRaw}
                  disabled={!input.trim()}>
                  <Text style={styles.rawBtnText}>Save Raw Text</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.magicBtn,
                    !input.trim() && styles.btnDisabled,
                  ]}
                  onPress={phase === 'error' ? handleMagicBuild : handleMagicBuild}
                  disabled={!input.trim()}>
                  <Text style={styles.magicBtnText}>
                    {phase === 'error' ? '🔄 Try Again' : '✨ Magic Build'}
                  </Text>
                </TouchableOpacity>
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
    height: '90%', // Use height instead of maxHeight to prevent layout collapse
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
    padding: 20,
    paddingBottom: 10,
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
  helperText: {
    fontSize: 14,
    color: '#777',
    lineHeight: 20,
    marginBottom: 14,
  },
  textInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    flex: 1,
    minHeight: 300,
    padding: 14,
    fontSize: 16,
    color: '#222',
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  footerHint: {
    fontSize: 13,
    color: '#8E24AA',
    marginTop: 12,
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
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#555',
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
    fontSize: 14,
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

export default MagicBuildModal;
