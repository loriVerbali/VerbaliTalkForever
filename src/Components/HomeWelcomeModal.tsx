import React, {useEffect, useMemo, useRef} from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import mixpanel from '../utils/mixpanelInstance';
// import TTSService from '../utils/TTSService';

const ACCENT = '#4A3AFF';
const HIGHLIGHT = '#8B5CF6';

/**
 * Each of the three steps carries its own colour: the headings and badge use
 * it solid, the column behind them a washed-out tint of the same hue.
 */
const stepTheme = (r: number, g: number, b: number) => ({
  accent: `rgb(${r}, ${g}, ${b})`,
  fill: `rgba(${r}, ${g}, ${b}, 0.1)`,
  border: `rgba(${r}, ${g}, ${b}, 0.3)`,
});

const THEME_QA = stepTheme(66, 136, 76); // #42884c
const THEME_BOARD = stepTheme(22, 75, 205); // #164bcd
const THEME_DASHBOARD = stepTheme(105, 83, 200); // #6953c8

/**
 * Everything below scales with the window, so it is computed from the live
 * window size rather than captured at module load: on Android the size seeded
 * at startup can still be the pre-rotation (portrait) one, and a release
 * bundle evaluates this file before the corrected size arrives.
 */
const createLayout = (width: number, height: number) => ({
  /** Card is kept narrow on purpose so the highlighted Home buttons stay visible. */
  CARD_WIDTH: Math.min(width * 0.62, 860),

  // ─── Positions of the Home screen elements this guide points at ──────────────
  // Mirrors the absolute layout in Views/Open.tsx (microphoneButton /
  // topButtonsContainer / the "Start Talking" tile). The overlay dims those real
  // controls, so each one is re-drawn here at the same spot, undimmed, and its
  // arrow is anchored to that copy.
  RING_PAD: width * 0.012,
  MIC_TOP: height * 0.04,
  MIC_LEFT: width * 0.015,
  MIC_SIZE: width * 0.05,
  SETTINGS_TOP: height * 0.04,
  SETTINGS_RIGHT: width * 0.02,
  SETTINGS_SIZE: width * 0.04,
  // The "Start Talking" label is the bottom strip of the first tile. The header
  // runs to ~0.102 of the screen, `wrapper` adds a 0.01 margin and is 0.38 tall,
  // and contentContainer's 0.02 padding plus the 48%-of-50% column puts the tile
  // at 0.02..0.2504 of the width.
  TALK_LEFT: width * 0.02,
  TALK_WIDTH: width * 0.2304,
  TALK_HEIGHT: height * 0.05,
  TALK_TOP: height * 0.445,

  /** Distance from the bottom of a highlighted control to its arrow tip. */
  ARROW_GAP: height * 0.012,

  /**
   * Neon halo for the highlighted controls, so their borders glow like the
   * arrows do. Two passes: a tight bright one that hugs the border and a wide
   * faint one that fades into the dimmed screen.
   */
  BORDER_GLOW: [
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: height * 0.016,
      spreadDistance: 1,
      color: 'rgba(139, 92, 246, 0.95)',
    },
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: height * 0.04,
      spreadDistance: height * 0.006,
      color: 'rgba(139, 92, 246, 0.5)',
    },
  ],
});

/**
 * Illustrations are per-avatar (skin tone + boy/girl) because the guide talks
 * about the child by name. Only white/black variants were produced, so any
 * other avatar falls back to the white set.
 */
const ILLUSTRATIONS = {
  W: {
    boy: {
      qa: require('../assets/welcomefolder/col_1_W_boy.jpg'),
      board: require('../assets/welcomefolder/col_2_W_boy.jpg'),
    },
    girl: {
      qa: require('../assets/welcomefolder/col_1_W_girl.jpg'),
      board: require('../assets/welcomefolder/col_2_W_girl.jpg'),
    },
  },
  B: {
    boy: {
      qa: require('../assets/welcomefolder/col_1_B_boy.jpg'),
      board: require('../assets/welcomefolder/col_2_B_boy.jpg'),
    },
    girl: {
      qa: require('../assets/welcomefolder/col_1_B_girl.jpg'),
      board: require('../assets/welcomefolder/col_2_B_girl.jpg'),
    },
  },
};

/**
 * Hand-drawn glowing arrows, matted onto transparency so they can sit over the
 * dimmed Home screen. Each one is named for the direction its head points.
 *
 * `ratio` is the source aspect ratio, and `tipX` / `tipY` locate the point of
 * the arrowhead as a fraction of the image, so an arrow can be positioned by
 * its tip rather than by its bounding box.
 */
const ARROWS = {
  mic: {
    source: require('../assets/welcomefolder/arrow_left_microphone.png'),
    ratio: 559 / 472,
    tipX: 0.1,
    tipY: 0.03,
  },
  settings: {
    source: require('../assets/welcomefolder/arrow_right.png'),
    ratio: 806 / 528,
    tipX: 0.99,
    tipY: 0.15,
  },
  talk: {
    source: require('../assets/welcomefolder/arrow_left.png'),
    ratio: 848 / 416,
    tipX: 0.04,
    tipY: 0.02,
  },
};

/**
 * Places an arrow so its tip lands on (`tipX`, `tipY`), pushed away from that
 * point by `gap`. `edge` picks which side the returned offset is measured
 * from, since the settings callout is anchored to the right of the screen —
 * for it, a positive `gap.x` moves the arrow further left.
 */
const anchorArrow = (
  arrow: {ratio: number; tipX: number; tipY: number},
  arrowWidth: number,
  tipX: number,
  tipY: number,
  edge: 'left' | 'right',
  gap: {x: number; y: number},
) => {
  const arrowHeight = arrowWidth / arrow.ratio;
  const anchorX = tipX + gap.x;
  const offset =
    edge === 'left'
      ? anchorX - arrow.tipX * arrowWidth
      : anchorX - (1 - arrow.tipX) * arrowWidth;
  return {
    position: 'absolute' as const,
    top: tipY + gap.y - arrow.tipY * arrowHeight,
    [edge]: offset,
    width: arrowWidth,
    height: arrowHeight,
  };
};

/** preferences.gender is stored as e.g. "black girl" / "white boy" / "asian boy". */
const getIllustrations = (gender: string) => {
  const value = (gender || '').toLowerCase();
  const tone = value.includes('black') ? 'B' : 'W';
  const kind = value.includes('girl') ? 'girl' : 'boy';
  return ILLUSTRATIONS[tone][kind];
};

/**
 * Spoken summary of the guide, trimmed to roughly 15 seconds of speech
 * (~45 words at the voice's normal rate).
 */
// const buildSpeech = (heroName: string) =>
//   `Welcome to ${
//     heroName ? `${heroName}'s` : 'your'
//   } home screen.Lets go over some features and settings! ` +
//   'Tap the microphone, or say Hey Verbi, to ask a question and get answer ' +
//   'suggestions. To see the board , Tap Start Talking and build sentences yourself or with the help of Verbi word ' +
//   'predictions. Open Settings to personalize the app and to see the data dashboard.';

interface HomeWelcomeModalProps {
  visible: boolean;
  /** preferences.heroName - may be empty on a fresh install. */
  heroName: string;
  /** preferences.gender - picks the matching illustrations. */
  gender: string;
  onClose: () => void;
  /** Opens the Home settings flow (admin-code gated). */
  onOpenSettings: () => void;
}

/** Small mock dashboard used by the "Data Dashboard" step. */
type Styles = ReturnType<typeof createStyles>;

const MiniDashboard: React.FC<{styles: Styles}> = ({styles}) => (
  <View style={styles.dashboard}>
    <View style={styles.dashboardScreen}>
      <View style={styles.dashboardBars}>
        {[0.4, 0.7, 0.5, 0.9, 0.65].map((barHeight, index) => (
          <View
            key={index}
            style={[styles.dashboardBar, {height: `${barHeight * 100}%`}]}
          />
        ))}
      </View>
      <View style={styles.dashboardStats}>
        <View style={styles.dashboardStat} />
        <View style={styles.dashboardStat} />
      </View>
    </View>
    <View style={styles.dashboardGear}>
      <Image
        source={require('../assets/settings.png')}
        style={styles.dashboardGearIcon}
        resizeMode="contain"
      />
    </View>
  </View>
);

const HomeWelcomeModal: React.FC<HomeWelcomeModalProps> = ({
  visible,
  heroName,
  gender,
  onClose,
  onOpenSettings,
}) => {
  const name = (heroName || '').trim();
  const illustrations = getIllustrations(gender);
  const {width, height} = useWindowDimensions();
  const styles = useMemo(() => createStyles(width, height), [width, height]);

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
  //   TTSService.speak(buildSpeech(name), true);
  //   return () => {
  //     TTSService.stop();
  //   };
  // }, [visible, name]);

  const handleCancel = () => {
    mixpanel.track('Home Welcome Guide Cancelled', {
      secondsOpen: secondsOpen(),
    });
    onClose();
  };

  // Hands off to the Home settings flow, which runs its own admin-code gate.
  const handleSettingsPress = () => {
    mixpanel.track('Home Welcome Guide Settings Pressed', {
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
      <View style={styles.overlay}>
        {/* The "Start Talking" tile sits underneath the card, so its callout is
            drawn first and the card paints over whatever would collide. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.talkTile}>
            <Text style={styles.talkTileText}>Start Talking</Text>
          </View>
          <Image
            source={ARROWS.talk.source}
            style={styles.talkArrow}
            resizeMode="contain"
          />
        </View>

        <View style={styles.card}>
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
              Welcome to {name ? `${name}'s` : 'your'} Home!
            </Text>
            <Text style={styles.subtitle}>
              Here's a quick guide to help you get started.
            </Text>

            <View style={styles.stepsRow}>
              {/* ── 1. Q&A Page ─────────────────────────────────────── */}
              <View
                style={[
                  styles.step,
                  {
                    backgroundColor: THEME_QA.fill,
                    borderColor: THEME_QA.border,
                  },
                ]}>
                <View style={styles.illustration}>
                  <Image
                    source={illustrations.qa}
                    style={styles.illustrationImage}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.stepHeader}>
                  <View
                    style={[
                      styles.stepBadge,
                      {backgroundColor: THEME_QA.accent},
                    ]}>
                    <Text style={styles.stepBadgeText}>1</Text>
                  </View>
                  <Text style={[styles.stepTitle, {color: THEME_QA.accent}]}>
                    Q&A Page
                  </Text>
                </View>

                <Text style={styles.stepBody}>
                  Ask {name || 'your child'} anything! Click the mic or say{' '}
                  <Text
                    style={[styles.stepBodyEmphasis, {color: THEME_QA.accent}]}>
                    "Hey Verbi."
                  </Text>{' '}
                  Verbi will offer the most relevant words for that situation.
                </Text>
              </View>

              {/* ── 2. AI Enhanced Word Board ───────────────────────── */}
              <View
                style={[
                  styles.step,
                  {
                    backgroundColor: THEME_BOARD.fill,
                    borderColor: THEME_BOARD.border,
                  },
                ]}>
                <View style={styles.illustration}>
                  <Image
                    source={illustrations.board}
                    style={styles.illustrationImage}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.stepHeader}>
                  <View
                    style={[
                      styles.stepBadge,
                      {backgroundColor: THEME_BOARD.accent},
                    ]}>
                    <Text style={styles.stepBadgeText}>2</Text>
                  </View>
                  <Text style={[styles.stepTitle, {color: THEME_BOARD.accent}]}>
                    AI Enhanced Word Board
                  </Text>
                </View>

                <Text style={styles.stepBody}>
                  Start any conversation! Click on{' '}
                  <Text
                    style={[
                      styles.stepBodyEmphasis,
                      {color: THEME_BOARD.accent},
                    ]}>
                    Start Talking.
                  </Text>{' '}
                  Verbi, your AI assistant, predicts the best words to continue
                  the sentence based on the situation.
                </Text>
              </View>

              {/* ── 3. Data Dashboard ───────────────────────────────── */}
              <View
                style={[
                  styles.step,
                  {
                    backgroundColor: THEME_DASHBOARD.fill,
                    borderColor: THEME_DASHBOARD.border,
                  },
                ]}>
                <View style={styles.illustration}>
                  <MiniDashboard styles={styles} />
                </View>

                <View style={styles.stepHeader}>
                  <View
                    style={[
                      styles.stepBadge,
                      {backgroundColor: THEME_DASHBOARD.accent},
                    ]}>
                    <Text style={styles.stepBadgeText}>3</Text>
                  </View>
                  <Text
                    style={[styles.stepTitle, {color: THEME_DASHBOARD.accent}]}>
                    Data Dashboard
                  </Text>
                </View>

                <Text style={styles.stepBody}>
                  Click the{' '}
                  <Text
                    style={[
                      styles.stepBodyEmphasis,
                      {color: THEME_DASHBOARD.accent},
                    ]}>
                    Settings
                  </Text>{' '}
                  page to customize the app with AI assistance and access the
                  Data Dashboard to get real insights on{' '}
                  {name ? `${name}'s` : "your child's"} progress and usage.
                </Text>
              </View>
            </View>

            {/* ── Footer ────────────────────────────────────────────── */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                ✨ You can change these settings anytime in{' '}
                <Text style={styles.footerTextEmphasis}>Settings</Text>.
              </Text>
              <View style={styles.footerArrow}>
                <View style={styles.footerArrowLine} />
                <View style={styles.footerArrowHead} />
              </View>
              <TouchableOpacity
                style={styles.footerSettingsButton}
                onPress={handleSettingsPress}>
                <Image
                  source={require('../assets/settings.png')}
                  style={styles.footerSettingsIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Callouts for the two top-corner buttons. These live outside the
            card's footprint, so they are drawn on top of it. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.micRing}>
            <Image
              source={require('../assets/micstatic.png')}
              style={styles.micIcon}
              resizeMode="contain"
            />
          </View>
          <Image
            source={ARROWS.mic.source}
            style={styles.micArrow}
            resizeMode="contain"
          />

          <View style={styles.settingsRing}>
            <Image
              source={require('../assets/settings.png')}
              style={styles.settingsIcon}
              resizeMode="contain"
            />
          </View>
          <Image
            source={ARROWS.settings.source}
            style={styles.settingsArrow}
            resizeMode="contain"
          />
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (width: number, height: number) => {
  const {
    CARD_WIDTH,
    RING_PAD,
    MIC_TOP,
    MIC_LEFT,
    MIC_SIZE,
    SETTINGS_TOP,
    SETTINGS_RIGHT,
    SETTINGS_SIZE,
    TALK_LEFT,
    TALK_WIDTH,
    TALK_HEIGHT,
    TALK_TOP,
    ARROW_GAP,
    BORDER_GLOW,
  } = createLayout(width, height);
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      backgroundColor: '#fff',
      borderRadius: 22,
      width: CARD_WIDTH,
      maxHeight: height * 0.9,
      paddingVertical: height * 0.03,
      paddingHorizontal: width * 0.02,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 6},
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 10,
    },
    scrollContent: {
      paddingBottom: 4,
    },
    closeButton: {
      position: 'absolute',
      top: height * 0.02,
      right: width * 0.015,
      width: height * 0.055,
      height: height * 0.055,
      borderRadius: height * 0.0275,
      backgroundColor: ACCENT,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
    },
    closeButtonText: {
      color: '#fff',
      fontSize: height * 0.026,
      fontWeight: '700',
    },
    title: {
      fontSize: height * 0.05,
      fontWeight: '800',
      color: '#2C2C54',
      textAlign: 'center',
    },
    subtitle: {
      fontSize: height * 0.024,
      color: '#555',
      textAlign: 'center',
      marginTop: height * 0.008,
      marginBottom: height * 0.022,
    },
    stepsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    // Colours below are per-step: each column supplies its own from THEME_*.
    step: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 14,
      padding: width * 0.008,
      marginHorizontal: width * 0.005,
    },
    illustration: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fff',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#ECEAF8',
      height: height * 0.2,
      padding: height * 0.008,
      marginBottom: height * 0.014,
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
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: height * 0.01,
    },
    stepBadge: {
      width: height * 0.038,
      height: height * 0.038,
      borderRadius: height * 0.019,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: width * 0.006,
    },
    stepBadgeText: {
      color: '#fff',
      fontSize: height * 0.022,
      fontWeight: '700',
    },
    stepTitle: {
      flex: 1,
      fontSize: height * 0.026,
      fontWeight: '700',
    },
    stepBody: {
      fontSize: height * 0.021,
      lineHeight: height * 0.03,
      color: '#4A4A63',
    },
    stepBodyEmphasis: {
      fontWeight: '700',
    },
    // Step 3 illustration
    dashboard: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dashboardScreen: {
      width: '78%',
      height: '80%',
      borderWidth: 2,
      borderColor: '#3B3B5C',
      borderRadius: 10,
      backgroundColor: '#fff',
      padding: height * 0.012,
      justifyContent: 'space-between',
    },
    dashboardBars: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    dashboardBar: {
      width: '13%',
      borderRadius: 3,
      backgroundColor: '#9AA7E8',
    },
    dashboardStats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: height * 0.008,
    },
    dashboardStat: {
      width: '46%',
      height: height * 0.012,
      borderRadius: 4,
      backgroundColor: '#E6E3F7',
    },
    dashboardGear: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: height * 0.05,
      height: height * 0.05,
      borderRadius: height * 0.025,
      borderWidth: 2,
      borderColor: HIGHLIGHT,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dashboardGearIcon: {
      width: '60%',
      height: '60%',
    },
    // Footer
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E2DEF7',
      borderRadius: 12,
      backgroundColor: '#F6F4FF',
      paddingVertical: height * 0.014,
      paddingHorizontal: width * 0.014,
      marginTop: height * 0.02,
    },
    footerText: {
      flexShrink: 1,
      fontSize: height * 0.022,
      color: '#3B3B5C',
    },
    footerTextEmphasis: {
      color: ACCENT,
      fontWeight: '700',
    },
    // Drawn rather than typed so it can run roughly 4x the length of the "→"
    // glyph it replaces and still sit centred against the gear button.
    footerArrow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: width * 0.012,
    },
    footerArrowLine: {
      width: height * 0.112,
      height: height * 0.005,
      borderRadius: height * 0.0025,
      backgroundColor: '#3B3B5C',
    },
    footerArrowHead: {
      width: 0,
      height: 0,
      borderTopWidth: height * 0.012,
      borderBottomWidth: height * 0.012,
      borderLeftWidth: height * 0.018,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: '#3B3B5C',
    },
    footerSettingsButton: {
      width: height * 0.06,
      height: height * 0.06,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#C9C2EE',
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
    },
    footerSettingsIcon: {
      width: '55%',
      height: '55%',
    },
    // Callouts. Each ring repeats a real Home control at its real position with
    // an opaque backdrop, so the control reads clearly through the dimmed
    // overlay and the arrow below it has something to point at.
    micRing: {
      position: 'absolute',
      top: MIC_TOP - RING_PAD,
      left: MIC_LEFT - RING_PAD,
      width: MIC_SIZE + RING_PAD * 2,
      height: MIC_SIZE + RING_PAD * 2,
      borderRadius: 14,
      borderWidth: 3,
      borderColor: HIGHLIGHT,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: BORDER_GLOW,
    },
    micIcon: {
      width: MIC_SIZE * 0.8,
      height: MIC_SIZE * 0.8,
    },
    micArrow: anchorArrow(
      ARROWS.mic,
      width * 0.065,
      MIC_LEFT + MIC_SIZE / 2,
      MIC_TOP + MIC_SIZE + RING_PAD,
      'left',
      {x: 0, y: ARROW_GAP},
    ),
    settingsRing: {
      position: 'absolute',
      top: SETTINGS_TOP - RING_PAD,
      right: SETTINGS_RIGHT - RING_PAD,
      width: SETTINGS_SIZE + RING_PAD * 2,
      height: SETTINGS_SIZE + RING_PAD * 2,
      borderRadius: 14,
      borderWidth: 3,
      borderColor: HIGHLIGHT,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: BORDER_GLOW,
    },
    settingsIcon: {
      width: SETTINGS_SIZE * 0.7,
      height: SETTINGS_SIZE * 0.7,
    },
    // This one comes in from the side rather than from below: its tip sits level
    // with the middle of the gear, just clear of the ring's left edge.
    settingsArrow: anchorArrow(
      ARROWS.settings,
      width * 0.06,
      SETTINGS_RIGHT + SETTINGS_SIZE + RING_PAD,
      SETTINGS_TOP + SETTINGS_SIZE / 2,
      'right',
      {x: width * 0.008, y: 0},
    ),
    // The label strip of the "Start Talking" tile. Its right end runs under the
    // card, so the text is pinned left to stay readable.
    talkTile: {
      position: 'absolute',
      top: TALK_TOP,
      left: TALK_LEFT,
      width: TALK_WIDTH,
      height: TALK_HEIGHT,
      borderRadius: 12,
      borderWidth: 3,
      borderColor: HIGHLIGHT,
      backgroundColor: '#DEE9FB',
      justifyContent: 'center',
      paddingLeft: width * 0.02,
      boxShadow: BORDER_GLOW,
    },
    talkTileText: {
      fontSize: height * 0.028,
      fontWeight: 'bold',
      color: '#333',
    },
    talkArrow: anchorArrow(
      ARROWS.talk,
      width * 0.095,
      TALK_LEFT + TALK_WIDTH * 0.3,
      TALK_TOP + TALK_HEIGHT,
      'left',
      {x: 0, y: ARROW_GAP},
    ),
  });
};

export default HomeWelcomeModal;
