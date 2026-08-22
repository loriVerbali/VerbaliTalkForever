import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useAppSettings } from '../../utils/persistance';
import { useAdmin } from '../../contexts/adminContext';
import fetchHelper from '../../utils/fetcher';
import {
  MagicPreviewResponse,
  AITile,
  AITilesMap,
  FinalizePreviewRequest,
} from '../../types/HeroContext';

import { AI_PLACEHOLDER_IMAGE_URI } from '../../utils/imageSourceResolver';
import MagicBuildModal from './MagicBuildModal';
import ContextModal from './ContextModal';
import PreviewModal from './PreviewModal';
import IntakeChatModal from './IntakeChatModal';
import FastImage from 'react-native-fast-image';
import {personalMemoryService} from '../../services/PersonalMemoryService';

// Mapping from AITilesMap keys to PepesData keys
const CATEGORY_MAP: Record<keyof AITilesMap, string> = {
  people: 'People',
  toys: 'Toys',
  pets: 'Pets',
  tv_shows: 'TVShows',
  food: 'Food',
  drinks: 'Drinks',
  places: 'Places',
};


interface TellUsMoreSectionProps {
  /** Padding applied to the section container */
  horizontalPadding?: number;
  /** Called after Accept & Save so parent can refresh pepesData display */
  onPepesUpdated?: (updatedPepes: any) => void;
}

type ActiveModal =
  | 'none'
  | 'magicBuild'
  | 'context_edit'
  | 'context_view'
  | 'preview'
  | 'intake_chat';

/**
 * TellUsMoreSection
 *
 * Orchestrates all Tell Us More UI states:
 *   • Empty state  → two side-by-side cards (Free-Form Notes, Chat with Verbi)
 *   • Idle state   → Read-only display, Expand, Edit, Magic Update
 *   • All modals   → Expand, MagicBuild, Context, Preview
 *
 * Save / accept flows write back to the local pepes store and
 * the tellUsMore preference key.
 */
const TellUsMoreSection: React.FC<TellUsMoreSectionProps> = ({
  horizontalPadding = 20,
  onPepesUpdated,
}) => {
  const { preferences, setItem, getItem } = useAppSettings();
  const { isTablet } = useAdmin();

  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [pendingPreview, setPendingPreview] =
    useState<MagicPreviewResponse | null>(null);

  const heroName = preferences.heroName || 'your child';
  const savedContext = preferences.tellUsMore || '';
  const hasContext = savedContext.trim().length > 0;

  // ─── helpers ────────────────────────────────────────────────────────────────

  const close = () => setActiveModal('none');

  /** Merge AI tiles into the existing local pepes store */
  const mergeTilesIntoPepes = async (tiles: AITilesMap) => {
    try {
      const raw = await getItem('pepes');
      const pepesData: any = raw
        ? JSON.parse(raw)
        : {
          People: [],
          Toys: [],
          Pets: [],
          TVShows: [],
          Food: [],
          Drinks: [],
          Places: [],
        };

      (Object.keys(tiles) as (keyof AITilesMap)[]).forEach(cat => {
        const localKey = CATEGORY_MAP[cat];
        tiles[cat].forEach((aiTile: AITile) => {
          const list: any[] = pepesData[localKey] || [];

          if (aiTile._action === 'delete') {
            pepesData[localKey] = list.filter(
              (p: any) => p.id !== aiTile.id && p.name !== aiTile.name,
            );
          } else if (aiTile._action === 'create') {
            // Only add if no tile with same name already exists
            const exists = list.some(
              (p: any) =>
                p.name.toLowerCase() === aiTile.name.toLowerCase(),
            );
            if (!exists) {
              pepesData[localKey] = [
                ...list,
                {
                  id: aiTile.id || Date.now().toString() + Math.random(),
                  imageUri: aiTile.imageUri || AI_PLACEHOLDER_IMAGE_URI,
                  name: aiTile.name,
                  aliases: aiTile.aliases || [],
                  type: aiTile.type || '',
                  relationship: aiTile.relationship || '',
                  isFavorite: false,
                },
              ];
            }
          } else if (aiTile._action === 'update') {
            // Update name/aliases for matching tile; preserve image
            pepesData[localKey] = list.map((p: any) => {
              if (p.id === aiTile.id || p.name === aiTile.name) {
                return {
                  ...p,
                  name: aiTile.name,
                  aliases: aiTile.aliases ?? p.aliases,
                  type: aiTile.type ?? p.type,
                  relationship: aiTile.relationship ?? p.relationship,
                };
              }
              return p;
            });
          }
          // 'none' → no change
        });
      });

      await setItem('pepes', JSON.stringify(pepesData));
      onPepesUpdated?.(pepesData);
    } catch (e) {
      // Silent fail; local data is unchanged
    }
  };

  /** Strip ~~strikethrough~~ markdown for final save */
  const resolveStrikethrough = (text: string): string =>
    text.replace(/~~[^~]+~~/g, '').replace(/\n{3,}/g, '\n\n').trim();

  // ─── Magic Build handlers ─────────────────────────────────────────────────

  const handleMagicBuildPreviewReady = (
    preview: MagicPreviewResponse,
    _rawInput: string,
  ) => {
    setPendingPreview(preview);
    setActiveModal('preview');
  };

  const handleIntakeChatComplete = async (transcript: string) => {
    try {
      const req = {
        transcriptOrInput: transcript,
        currentFreeText: savedContext || '',
        locale: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const response: MagicPreviewResponse = await fetchHelper(
        'magicBuild',
        {},
        req,
      );

      setPendingPreview(response);
      setActiveModal('preview');
    } catch (err: any) {
      Alert.alert(
        'Error',
        'Could not generate the profile from the conversation. Please try again.'
      );
    }
  };

  const handleMagicBuildSaveRaw = async (text: string) => {
    // Append to any existing context
    const current = savedContext.trim();
    const updated = current
      ? `${current}\n\n---\n\n${text}`
      : text;
    await setItem('tellUsMore', updated);
    close();
  };

  // ─── Context modal handlers ───────────────────────────────────────────────

  const handleContextPreviewReady = (preview: MagicPreviewResponse) => {
    setPendingPreview(preview);
    setActiveModal('preview');
  };

  const handleContextSaveRaw = async (text: string) => {
    await setItem('tellUsMore', text);
    close();
  };

  // ─── Preview accept ───────────────────────────────────────────────────────

  const handleAcceptPreview = async (
    updatedText?: string,
    updatedTiles?: AITilesMap | null,
  ) => {
    if (!pendingPreview) return;

    const finalTiles = updatedTiles !== undefined ? updatedTiles : pendingPreview.tiles;
    const finalFreeText = updatedText !== undefined ? updatedText : pendingPreview.free_text_form;

    try {
      // Try the backend finalize endpoint first
      await fetchHelper('finalizePreview', {}, {
        tiles: finalTiles,
        free_text_form: finalFreeText,
      } as FinalizePreviewRequest);
    } catch {
      // If backend is unavailable, do client-side finalization
    }

    // Always apply locally so the UI updates immediately
    const finalText = resolveStrikethrough(
      finalFreeText || savedContext,
    );
    await setItem('tellUsMore', finalText);

    if (finalTiles) {
      await mergeTilesIntoPepes(finalTiles);
    }

    // Personal Memory: mirror the updated tiles into Personal Knowledge
    personalMemoryService.seedFromIntake().catch(() => {});

    setPendingPreview(null);
    close();
  };

  const handlePreviewCancel = () => {
    setPendingPreview(null);
    close();
  };

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <View style={[styles.section, { paddingHorizontal: horizontalPadding }]}>

      {/* AI-ASSISTED SETUP badge */}
      <View style={styles.badgeRow}>
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>✦ AI-ASSISTED SETUP</Text>
        </View>
      </View>

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, isTablet && styles.sectionTitleTablet]}>
          Tell Us About {heroName}
        </Text>

        {hasContext && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.iconBtn}
              accessibilityLabel="Guided Intake Session"
              onPress={() => setActiveModal('intake_chat')}>
              <Text style={styles.iconBtnText}>💬</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconBtn}
              accessibilityLabel="Edit Tell Us More"
              onPress={() => setActiveModal('context_edit')}>
              <Text style={styles.iconBtnText}>✎</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Helper text */}
      <Text style={[styles.helper, isTablet && styles.helperTablet]}>
        Help MaTalk AI be more relevant for {heroName.trim()}. Drop in free-form notes, preferences, or details — the more context you share, the better the AI suggestions become.
      </Text>

      {/* Empty state box with placeholder */}
      {!hasContext ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyPlaceholder}>
            e.g., What they like or dislike, special dates in their life, inside jokes, routines, and more…
          </Text>

          {/* Two side-by-side CTA cards */}
          <View style={styles.ctaRow}>
            {/* Share Free-Form Notes — solid purple */}
            <TouchableOpacity
              style={styles.ctaCardSolid}
              onPress={() => setActiveModal('magicBuild')}
              accessibilityLabel="Share Free-Form Notes">
              <Text style={styles.ctaCardSolidIcon}>✦</Text>
              <Text style={styles.ctaCardSolidTitle}>Share Free-Form Notes</Text>
              <Text style={styles.ctaCardSolidDesc}>
                Type or dictate anything — AI will organize it for you.
              </Text>
            </TouchableOpacity>

            {/* -OR- divider */}
            <View style={styles.orDivider}>
              <Text style={styles.orDividerText}>-OR-</Text>
            </View>

            {/* Chat with Verbi — outlined */}
            <TouchableOpacity
              style={styles.ctaCardOutlined}
              onPress={() => setActiveModal('intake_chat')}
              accessibilityLabel="Chat with Verbi">
              <FastImage
                source={require('../../assets/movie/recording.gif')}
                style={{ width: 40, height: 40 }}
                resizeMode={FastImage.resizeMode.contain}
              />
              <Text style={styles.ctaCardOutlinedTitle}>Chat with Verbi</Text>
              <Text style={styles.ctaCardOutlinedDesc}>
                Verbi, your AI assistant, does the work. Chat with him and see it organize everything for you.
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Idle state — read-only with edit options */
        <View>
          <View style={styles.idleBox}>
            <Text style={styles.idleText} numberOfLines={5}>
              {savedContext}
            </Text>

            <View style={styles.idleFooter}>
              {(savedContext.split('\n').length > 5 ||
                savedContext.length > 200) && (
                  <TouchableOpacity
                    onPress={() => setActiveModal('context_view')}
                    accessibilityLabel="Expand full context">
                    <Text style={styles.expandLink}>Expand ↗</Text>
                  </TouchableOpacity>
                )}
            </View>
          </View>

          {/* Two side-by-side update cards (shown when context exists) */}
          <View style={[styles.ctaRow, styles.ctaRowUpdate]}>
            <TouchableOpacity
              style={styles.ctaCardSolid}
              onPress={() => setActiveModal('magicBuild')}
              accessibilityLabel="Share Free-Form Notes">
              <Text style={styles.ctaCardSolidIcon}>✦</Text>
              <Text style={styles.ctaCardSolidTitle}>Share Free-Form Notes</Text>
              <Text style={styles.ctaCardSolidDesc}>
                Type or dictate anything — AI will organize it for you.
              </Text>
            </TouchableOpacity>

            {/* -OR- divider */}
            <View style={styles.orDivider}>
              <Text style={styles.orDividerText}>-OR-</Text>
            </View>

            <TouchableOpacity
              style={styles.ctaCardOutlined}
              onPress={() => setActiveModal('intake_chat')}
              accessibilityLabel="Chat with Verbi">
              <FastImage
                source={require('../../assets/movie/recording.gif')}
                style={{ width: 40, height: 40 }}
                resizeMode={FastImage.resizeMode.contain}
              />
              <Text style={styles.ctaCardOutlinedTitle}>Chat with Verbi</Text>
              <Text style={styles.ctaCardOutlinedDesc}>
                Verbi, your AI assistant, does the work. Chat with him and see it organize everything for you.
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}

      <MagicBuildModal
        visible={activeModal === 'magicBuild'}
        heroName={heroName}
        currentFreeText={savedContext}
        onCancel={close}
        onSaveRaw={handleMagicBuildSaveRaw}
        onPreviewReady={handleMagicBuildPreviewReady}
      />

      <ContextModal
        visible={
          activeModal === 'context_edit' ||
          activeModal === 'context_view'
        }
        heroName={heroName}
        currentFreeText={savedContext}
        initialMode={activeModal === 'context_view' ? 'view' : 'edit'}
        onCancel={close}
        onSaveRaw={handleContextSaveRaw}
        onPreviewReady={handleContextPreviewReady}
      />

      <PreviewModal
        visible={activeModal === 'preview'}
        tiles={pendingPreview?.tiles ?? null}
        freeText={pendingPreview?.free_text_form ?? ''}
        summary={pendingPreview?.summary}
        heroName={heroName}
        onAccept={handleAcceptPreview}
        onBack={() => setActiveModal('magicBuild')}
        onCancel={handlePreviewCancel}
      />

      <IntakeChatModal
        visible={activeModal === 'intake_chat'}
        childName={heroName}
        onCancel={close}
        onComplete={handleIntakeChatComplete}
      />
    </View>
  );
};

const PURPLE = '#7B2FBE';
const PURPLE_LIGHT = '#EDE7F6';
const PURPLE_BORDER = '#9C27B0';

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 20,
    paddingBottom: 20,
  },

  // ── Badge ────────────────────────────────────────────────────────────
  badgeRow: {
    marginBottom: 12,
  },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  aiBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Header ───────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  sectionTitleTablet: {
    fontSize: 24,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: {
    fontSize: 36,
    lineHeight: 40,
    color: PURPLE,
  },

  // ── Helper text ───────────────────────────────────────────────────────
  helper: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 14,
  },
  helperTablet: {
    fontSize: 16,
  },

  // ── Empty state outer box (dashed border) ─────────────────────────────
  emptyBox: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#c8b4e8',
    borderStyle: 'dashed',
    padding: 16,
    gap: 14,
  },
  emptyPlaceholder: {
    color: '#aaa',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // ── CTA row (two cards side by side) ─────────────────────────────────
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctaRowUpdate: {
    marginTop: 14,
  },
  orDivider: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  orDividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.5,
  },

  // Solid purple card (Share Free-Form Notes) — now matches outlined style
  ctaCardSolid: {
    flex: 1,
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: PURPLE_BORDER,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
  },
  ctaCardSolidIcon: {
    fontSize: 28,
    color: PURPLE,
  },
  ctaCardSolidTitle: {
    color: PURPLE,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaCardSolidDesc: {
    color: PURPLE,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    opacity: 0.8,
  },

  // Outlined light-purple card (Chat with Verbi)
  ctaCardOutlined: {
    flex: 1,
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: PURPLE_BORDER,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
  },
  ctaCardOutlinedIcon: {
    fontSize: 28,
  },
  ctaCardOutlinedTitle: {
    color: PURPLE,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaCardOutlinedDesc: {
    color: PURPLE,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    opacity: 0.8,
  },

  // ── Idle state ────────────────────────────────────────────────────────
  idleBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  idleText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 24,
  },
  idleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  expandLink: {
    color: PURPLE,
    fontWeight: '600',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});

export default TellUsMoreSection;
