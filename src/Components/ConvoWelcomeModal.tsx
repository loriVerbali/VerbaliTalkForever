import React, {useEffect, useRef} from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Pressable,
} from 'react-native';
import mixpanel from '../utils/mixpanelInstance';
// import TTSService from '../utils/TTSService';

const {width, height} = Dimensions.get('window');

const ACCENT = '#4A3AFF';
const SWITCH_ON = '#8E24AA';

/** Every measurement below is authored at base size and scaled up by this factor. */
const SCALE = 1.65;
const s = (n: number) => n * SCALE;

/**
 * The Verbi-column illustration is per-avatar (skin tone + boy/girl) so the
 * guide matches the child shown elsewhere in the app. Only white/black
 * variants were produced, so any other avatar falls back to the white set.
 */
const VERBI_ILLUSTRATIONS = {
  W: {
    boy: require('../assets/welcomefolder/col_2_W_boy.jpg'),
    girl: require('../assets/welcomefolder/col_2_W_girl.jpg'),
  },
  B: {
    boy: require('../assets/welcomefolder/col_2_B_boy.jpg'),
    girl: require('../assets/welcomefolder/col_2_B_girl.jpg'),
  },
};

/** preferences.gender is stored as e.g. "black girl" / "white boy" / "asian boy". */
const getVerbiIllustration = (gender: string) => {
  const value = (gender || '').toLowerCase();
  const tone = value.includes('black') ? 'B' : 'W';
  const kind = value.includes('girl') ? 'girl' : 'boy';
  return VERBI_ILLUSTRATIONS[tone][kind];
};

/**
 * Spoken summary of the guide, trimmed to roughly 15 seconds of speech
 * (~45 words at the voice's normal rate).
 */
// const WELCOME_SPEECH =
//   'Welcome to your Communication area! A quick over view of the features and settings.' +
//   'The Verbi column suggests words as you ' +
//   'build a sentence — just tap one to add it. You can turn the microphone off, ' +
//   'hide the Verbi column, or change the grid size anytime in the settings on ' +
//   'this screen.';

interface ConvoWelcomeModalProps {
  visible: boolean;
  /** preferences.gender - picks the matching Verbi column illustration. */
  gender?: string;
  onClose: () => void;
  /** Opens the settings panel hosted on this screen (admin-code gated). */
  onOpenSettings: () => void;
}

/** Non-interactive switch illustration. */
const MockSwitch: React.FC<{on: boolean}> = ({on}) => (
  <View style={[styles.mockSwitch, on && styles.mockSwitchOn]}>
    <View style={[styles.mockSwitchThumb, on && styles.mockSwitchThumbOn]} />
  </View>
);

const ConvoWelcomeModal: React.FC<ConvoWelcomeModalProps> = ({
  visible,
  gender = '',
  onClose,
  onOpenSettings,
}) => {
  const verbiIllustration = getVerbiIllustration(gender);

  // Stamped when the guide appears, so both exit paths can report how long it
  // was on screen.
  const openedAtRef = useRef<number | null>(null);

  useEffect(() => {
    openedAtRef.current = visible ? Date.now() : null;
  }, [visible]);

  const secondsOpen = () =>
    openedAtRef.current === null
      ? 0
      : Math.round((Date.now() - openedAtRef.current) / 1000);

  // Spoken guide disabled for now — the modal is read-only.
  // useEffect(() => {
  //   if (!visible) return;
  //
  //   TTSService.speak(WELCOME_SPEECH, true);
  //   return () => {
  //     TTSService.stop();
  //   };
  // }, [visible]);

  const handleCancel = () => {
    mixpanel.track('Convo Welcome Guide Cancelled', {
      secondsOpen: secondsOpen(),
    });
    onClose();
  };

  // Hands off to the settings panel on this screen, which runs its own
  // admin-code gate before opening.
  const handleSettingsPress = () => {
    mixpanel.track('Convo Welcome Guide Settings Pressed', {
      secondsOpen: secondsOpen(),
    });
    onClose();
    onOpenSettings();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={handleCancel}>
      {/* Tapping the dimmed backdrop dismisses the guide; the card below claims
          the touch itself, so taps inside it never reach this handler. */}
      <Pressable style={styles.overlay} onPress={handleCancel}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleCancel}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>
              Welcome to your Communication Page!
            </Text>
            <Text style={styles.subtitle}>
              Here's a quick guide to help you get started.
            </Text>

            <View style={styles.stepsRow}>
              {/* ── 1. Verbi Column ─────────────────────────────────── */}
              <View style={styles.step}>
                <View style={styles.stepHeader}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>1</Text>
                  </View>
                  <Text style={styles.stepTitle}>Verbi Column</Text>
                </View>

                <View style={styles.illustration}>
                  <Image
                    source={verbiIllustration}
                    style={styles.illustrationImage}
                    resizeMode="contain"
                  />
                </View>

                <Text style={styles.stepBody}>
                  The Verbi column gives you AI-powered word suggestions based
                  on your sentence and conversation. Tap a suggestion to build
                  your sentence faster.
                </Text>
              </View>

              {/* ── 2. Customize Your View ──────────────────────────── */}
              <View style={styles.step}>
                <View style={styles.stepHeader}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>2</Text>
                  </View>
                  <Text style={styles.stepTitle}>Customize Your View</Text>
                </View>

                <View style={styles.illustration}>
                  <View style={styles.toggleColumn}>
                    <View style={styles.toggleRow}>
                      <Image
                        source={require('../assets/microphone.png')}
                        style={styles.toggleIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.toggleLabel}>Microphone</Text>
                      <MockSwitch on={false} />
                    </View>
                    <View style={styles.toggleRow}>
                      <Image
                        source={require('../assets/verbiPoseTransparent.png')}
                        style={styles.toggleIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.toggleLabel}>Verbi Column</Text>
                      <MockSwitch on={true} />
                    </View>
                  </View>
                </View>

                <Text style={styles.stepBody}>
                  You can turn off the Microphone or hide the Verbi Column
                  anytime via the settings in this screen.
                </Text>
              </View>

              {/* ── 3. Change Grid Size ─────────────────────────────── */}
              <View style={styles.step}>
                <View style={styles.stepHeader}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>3</Text>
                  </View>
                  <Text style={styles.stepTitle}>Change Grid Size</Text>
                </View>

                <View style={styles.illustration}>
                  <Image
                    source={require('../assets/welcomefolder/grid_transparent.jpg')}
                    style={styles.gridIllustrationImage}
                    resizeMode="contain"
                  />
                </View>

                <Text style={styles.stepBody}>
                  Make the grid bigger or smaller to find the layout that works
                  best for you. You can change the grid size anytime in
                  Settings.
                </Text>
              </View>
            </View>

            {/* ── Footer ────────────────────────────────────────────── */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                ✨ You can change these settings anytime by tapping the{' '}
                <Text style={styles.footerTextEmphasis}>Settings</Text> button.
              </Text>
              {/* Drawn rather than a "→" glyph so the shaft can run long enough
                  to visually connect the sentence to the gear button. */}
              <View style={styles.footerArrow}>
                <View style={styles.footerArrowLine} />
                <View style={styles.footerArrowHead} />
              </View>
              <TouchableOpacity
                style={styles.footerSettingsButton}
                onPress={handleSettingsPress}>
                <Image
                  source={require('../assets/edit.png')}
                  style={styles.footerSettingsIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: s(10),
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: s(22),
    width: Math.min(width * 0.98, s(880)),
    maxHeight: height * 0.9,
    paddingVertical: s(20),
    paddingHorizontal: s(22),
    shadowColor: '#000',
    shadowOffset: {width: 0, height: s(6)},
    shadowOpacity: 0.25,
    shadowRadius: s(12),
    elevation: 10,
  },
  scrollContent: {
    paddingBottom: s(4),
  },
  closeButton: {
    position: 'absolute',
    top: s(-10),
    right: s(-10),
    width: s(34),
    height: s(34),
    borderRadius: s(17),
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: s(16),
    fontWeight: '700',
    lineHeight: s(18),
  },
  title: {
    fontSize: s(22),
    fontWeight: '800',
    color: ACCENT,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: s(13),
    color: '#555',
    textAlign: 'center',
    marginTop: s(6),
    marginBottom: s(16),
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  step: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2DEF7',
    borderRadius: s(14),
    backgroundColor: '#FBFAFF',
    padding: s(12),
    marginHorizontal: s(5),
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(10),
  },
  stepBadge: {
    width: s(22),
    height: s(22),
    borderRadius: s(11),
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: s(8),
  },
  stepBadgeText: {
    color: '#fff',
    fontSize: s(12),
    fontWeight: '700',
  },
  stepTitle: {
    flex: 1,
    fontSize: s(14),
    fontWeight: '700',
    color: '#2C2C54',
  },
  illustration: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECEAF8',
    paddingVertical: s(10),
    paddingHorizontal: s(8),
    height: s(120),
    marginBottom: s(10),
    overflow: 'hidden',
  },
  // The source art carries wide white margins, so it reads small inside the
  // frame. Scaling up crops into those margins rather than the drawing, and
  // the frame is white too, so the crop is invisible.
  illustrationImage: {
    width: '100%',
    height: '100%',
    transform: [{scale: 1.5}],
  },
  gridIllustrationImage: {
    width: '100%',
    height: '100%',
    transform: [{scale: 1.35}],
  },
  stepBody: {
    fontSize: s(12),
    lineHeight: s(17),
    color: '#4A4A63',
  },
  // Step 2 illustration
  toggleColumn: {
    width: '100%',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: s(6),
  },
  toggleIcon: {
    width: s(22),
    height: s(22),
    marginRight: s(8),
  },
  toggleLabel: {
    flex: 1,
    fontSize: s(12),
    color: '#444',
  },
  mockSwitch: {
    width: s(36),
    height: s(20),
    borderRadius: s(10),
    backgroundColor: '#C9C9D1',
    padding: s(2),
    justifyContent: 'center',
  },
  mockSwitchOn: {
    backgroundColor: SWITCH_ON,
  },
  mockSwitchThumb: {
    width: s(16),
    height: s(16),
    borderRadius: s(8),
    backgroundColor: '#fff',
  },
  mockSwitchThumbOn: {
    alignSelf: 'flex-end',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2DEF7',
    borderRadius: s(12),
    backgroundColor: '#F6F4FF',
    paddingVertical: s(10),
    paddingHorizontal: s(14),
    marginTop: s(14),
  },
  footerText: {
    flexShrink: 1,
    fontSize: s(12),
    color: '#3B3B5C',
  },
  footerTextEmphasis: {
    color: ACCENT,
    fontWeight: '700',
  },
  // Line + head instead of a glyph, so the shaft can be ~4x the old arrow.
  footerArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: s(10),
  },
  footerArrowLine: {
    width: s(64),
    height: s(3),
    borderRadius: s(1.5),
    backgroundColor: '#3B3B5C',
  },
  footerArrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: s(6),
    borderBottomWidth: s(6),
    borderLeftWidth: s(10),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#3B3B5C',
  },
  footerSettingsButton: {
    width: s(34),
    height: s(34),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: '#C9C2EE',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerSettingsIcon: {
    width: s(20),
    height: s(20),
  },
});

export default ConvoWelcomeModal;
