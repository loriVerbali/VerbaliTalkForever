import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {useAppSettings} from '../../utils/persistance';
import {useAdmin} from '../../contexts/adminContext';
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
  | 'context_add'
  | 'context_view'
  | 'preview';

/**
 * TellUsMoreSection
 *
 * Orchestrates all Tell Us More UI states:
 *   • Empty state  → Magic Build CTA or Add Manually
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
  const {preferences, setItem, getItem} = useAppSettings();
  const {isTablet} = useAdmin();

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

  const handleAcceptPreview = async () => {
    if (!pendingPreview) return;

    try {
      // Try the backend finalize endpoint first
      await fetchHelper('finalizePreview', {}, {
        tiles: pendingPreview.tiles,
        free_text_form: pendingPreview.free_text_form,
      } as FinalizePreviewRequest);
    } catch {
      // If backend is unavailable, do client-side finalization
    }

    // Always apply locally so the UI updates immediately
    const finalText = resolveStrikethrough(
      pendingPreview.free_text_form || savedContext,
    );
    await setItem('tellUsMore', finalText);

    if (pendingPreview.tiles) {
      await mergeTilesIntoPepes(pendingPreview.tiles);
    }

    setPendingPreview(null);
    close();
  };

  const handlePreviewCancel = () => {
    setPendingPreview(null);
    close();
  };

  // ─── Render helpers ───────────────────────────────────────────────────────



  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <View
      style={[
        styles.section,
        {paddingHorizontal: horizontalPadding},
      ]}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, isTablet && styles.sectionTitleTablet]}>
          Tell Us More
        </Text>

        {hasContext && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.iconBtn}
              accessibilityLabel="Edit Tell Us More"
              onPress={() => setActiveModal('context_edit')}>
              <Text style={styles.iconBtnText}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, styles.iconBtnMagic]}
              accessibilityLabel="Magic Update"
              onPress={() => setActiveModal('context_edit')}>
              <Text style={styles.iconBtnMagicText}>✨</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Helper text */}
      <Text style={[styles.helper, isTablet && styles.helperTablet]}>
        Help MaTalk AI be more relevant for {heroName}. What should it know
        about them? Drop in any free-form notes, preferences, or details that
        will help the AI understand what they're trying to say. The more context
        you share, the better the AI suggestions become.
      </Text>

      {/* Empty state */}
      {!hasContext ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyPlaceholder}>
            e.g., What they like or dislike, special dates in their life, inside
            jokes, routines, and more…
          </Text>

          <TouchableOpacity
            style={styles.magicBuildCta}
            onPress={() => setActiveModal('magicBuild')}
            accessibilityLabel="Start with Magic Build">
            <Text style={styles.magicBuildCtaText}>✨ Start with Magic Build</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.manualLink}
            onPress={() => setActiveModal('context_add')}
            accessibilityLabel="Add manually">
            <Text style={styles.manualLinkText}>Add manually</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Idle state — read-only */
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
          activeModal === 'context_add' ||
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
        onCancel={handlePreviewCancel}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  sectionTitleTablet: {
    fontSize: 24,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: {
    fontSize: 18,
    color: '#8E24AA',
  },
  iconBtnMagic: {
    backgroundColor: '#F3E5F5',
  },
  iconBtnMagicText: {
    fontSize: 18,
  },
  helper: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 14,
  },
  helperTablet: {
    fontSize: 16,
  },
  // Empty state
  emptyBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e1e1e1',
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
    gap: 14,
  },
  emptyPlaceholder: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  magicBuildCta: {
    backgroundColor: '#8E24AA',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  magicBuildCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  manualLink: {
    paddingVertical: 6,
  },
  manualLinkText: {
    color: '#8E24AA',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Idle state
  idleBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
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
    color: '#8E24AA',
    fontWeight: '600',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});

export default TellUsMoreSection;
