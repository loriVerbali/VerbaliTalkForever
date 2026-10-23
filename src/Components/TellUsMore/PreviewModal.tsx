import React, {useState, useEffect, useRef} from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import {AITile, AITilesMap, MagicPreviewSummary} from '../../types/HeroContext';

interface PreviewModalProps {
  visible: boolean;
  tiles: AITilesMap | null;
  freeText: string;
  summary?: MagicPreviewSummary;
  heroName: string;
  onAccept: (updatedText: string, updatedTiles: AITilesMap | null) => void;
  onBack: () => void;
  onCancel: () => void;
}

// All supported category keys in AITilesMap
const ALL_CATEGORY_KEYS: (keyof AITilesMap)[] = [
  'people',
  'toys',
  'pets',
  'tv_shows',
  'food',
  'drinks',
  'places',
];

const CATEGORY_LABELS: Record<keyof AITilesMap, string> = {
  people: 'People',
  toys: 'Toys',
  pets: 'Pets',
  tv_shows: 'TV Shows',
  food: 'Food',
  drinks: 'Drinks',
  places: 'Places',
};

/** Alias editing state map: tileId → raw comma-separated string */
type AliasInputMap = Record<string, string>;

/** Which tile is being reassigned to a new category */
interface CategoryPickerTarget {
  tileId: string;
  currentCategoryKey: keyof AITilesMap;
}

/**
 * PreviewModal — Renders the Magic Build / Magic Update diff before the
 * caregiver accepts. Tiles are color-coded by _action; free text
 * renders strikethrough for deleted content.
 *
 * Caregivers can now:
 *  • Edit a tile name inline
 *  • Edit aliases (comma-separated)
 *  • Reassign a tile to a different category via an overlay selector
 */
const PreviewModal: React.FC<PreviewModalProps> = ({
  visible,
  tiles,
  freeText,
  summary,
  heroName,
  onAccept,
  onBack,
  onCancel,
}) => {
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedFreeText, setEditedFreeText] = useState(freeText);
  const [localTiles, setLocalTiles] = useState<AITilesMap | null>(tiles);

  // Raw alias strings keyed by tile id — keeps cursor stable while typing
  const [aliasInputs, setAliasInputs] = useState<AliasInputMap>({});

  // Overlay selector state
  const [categoryPickerTarget, setCategoryPickerTarget] =
    useState<CategoryPickerTarget | null>(null);

  useEffect(() => {
    if (visible) {
      setEditedFreeText(freeText);
      setLocalTiles(tiles);
      setIsEditingText(false);
      setCategoryPickerTarget(null);

      // Seed alias inputs from incoming tiles
      const seed: AliasInputMap = {};
      if (tiles) {
        ALL_CATEGORY_KEYS.forEach(cat => {
          tiles[cat].forEach(t => {
            seed[t.id] = t.aliases.join(', ');
          });
        });
      }
      setAliasInputs(seed);
    }
  }, [visible, freeText, tiles]);

  // ─── Tile field updaters ────────────────────────────────────────────────────

  const handleUpdateTileName = (
    category: keyof AITilesMap,
    id: string,
    newName: string,
  ) => {
    if (!localTiles) return;
    const updated = {...localTiles};
    updated[category] = updated[category].map(t =>
      t.id === id ? {...t, name: newName} : t,
    );
    setLocalTiles(updated);
  };

  const handleAliasChange = (
    category: keyof AITilesMap,
    id: string,
    raw: string,
  ) => {
    // Keep raw string for display so cursor doesn't jump
    setAliasInputs(prev => ({...prev, [id]: raw}));
    // Parse & commit to localTiles
    const parsed = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!localTiles) return;
    const updated = {...localTiles};
    updated[category] = updated[category].map(t =>
      t.id === id ? {...t, aliases: parsed} : t,
    );
    setLocalTiles(updated);
  };

  /** Move tile from its current category key to a new one. */
  const handleReassignCategory = (
    newCategoryKey: keyof AITilesMap,
  ) => {
    if (!categoryPickerTarget || !localTiles) {
      setCategoryPickerTarget(null);
      return;
    }
    const {tileId, currentCategoryKey} = categoryPickerTarget;
    if (newCategoryKey === currentCategoryKey) {
      setCategoryPickerTarget(null);
      return;
    }
    const tile = localTiles[currentCategoryKey].find(t => t.id === tileId);
    if (!tile) {
      setCategoryPickerTarget(null);
      return;
    }
    const updated: AITilesMap = {...localTiles};
    // Remove from current category
    updated[currentCategoryKey] = updated[currentCategoryKey].filter(
      t => t.id !== tileId,
    );
    // Append to target category
    updated[newCategoryKey] = [...updated[newCategoryKey], tile];
    setLocalTiles(updated);
    setCategoryPickerTarget(null);
  };

  // ─── Display helpers ────────────────────────────────────────────────────────

  const actionStyle = (action: string) => {
    switch (action) {
      case 'create':
        return styles.tileCreate;
      case 'update':
        return styles.tileUpdate;
      case 'delete':
        return styles.tileDelete;
      default:
        return styles.tileNone;
    }
  };

  const actionBadge = (action: string) => {
    switch (action) {
      case 'create':
        return {label: '+ New', style: styles.badgeCreate};
      case 'update':
        return {label: '~ Updated', style: styles.badgeUpdate};
      case 'delete':
        return {label: '✕ Remove', style: styles.badgeDelete};
      default:
        return null;
    }
  };

  // Collect all changed tiles across categories
  const changedTiles: Array<
    AITile & {categoryLabel: string; categoryKey: keyof AITilesMap}
  > = [];
  if (localTiles) {
    ALL_CATEGORY_KEYS.forEach(cat => {
      localTiles[cat].forEach(tile => {
        if (tile._action !== 'none') {
          changedTiles.push({
            ...tile,
            categoryLabel: CATEGORY_LABELS[cat],
            categoryKey: cat,
          });
        }
      });
    });
  }

  // Render free text with ~~strikethrough~~ support
  const renderFreeText = (text: string) => {
    const parts = text.split(/(~~[^~]+~~)/g);
    return (
      <Text style={styles.freeText}>
        {parts.map((part, idx) => {
          if (part.startsWith('~~') && part.endsWith('~~')) {
            return (
              <Text key={idx} style={styles.strikethrough}>
                {part.slice(2, -2)}
              </Text>
            );
          }
          return <Text key={idx}>{part}</Text>;
        })}
      </Text>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Review Changes</Text>
                <Text style={styles.subtitle}>For {heroName}</Text>
              </View>
              <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Summary bar */}
            {summary && (
              <View style={styles.summaryBar}>
                {summary.createdCount > 0 && (
                  <View style={[styles.summaryChip, styles.summaryCreate]}>
                    <Text style={styles.summaryChipText}>
                      +{summary.createdCount} added
                    </Text>
                  </View>
                )}
                {summary.updatedCount > 0 && (
                  <View style={[styles.summaryChip, styles.summaryUpdate]}>
                    <Text style={styles.summaryChipText}>
                      ~{summary.updatedCount} updated
                    </Text>
                  </View>
                )}
                {summary.deletedCount > 0 && (
                  <View style={[styles.summaryChip, styles.summaryDelete]}>
                    <Text style={styles.summaryChipText}>
                      -{summary.deletedCount} removed
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Edit hint */}
            {changedTiles.length > 0 && (
              <View style={styles.editHintBar}>
                <Text style={styles.editHintText}>
                  ✏️ Tap a name or alias to edit. Tap the category chip to reassign.
                </Text>
              </View>
            )}

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled">
              {/* Tile changes */}
              {changedTiles.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Tile Changes</Text>
                  {changedTiles.map(tile => {
                    const badge = actionBadge(tile._action);
                    const isDeleted = tile._action === 'delete';
                    return (
                      <View
                        key={tile.id}
                        style={[styles.tileRow, actionStyle(tile._action)]}>
                        {/* Left: name + category chip + aliases */}
                        <View style={styles.tileMeta}>
                          {/* Tile Name */}
                          {isDeleted ? (
                            <Text
                              style={[styles.tileName, styles.tileNameDeleted]}>
                              {tile.name}
                            </Text>
                          ) : (
                            <TextInput
                              disableFullscreenUI
                              style={styles.tileNameInput}
                              value={tile.name}
                              onChangeText={txt =>
                                handleUpdateTileName(
                                  tile.categoryKey,
                                  tile.id,
                                  txt,
                                )
                              }
                              placeholder="Tile name"
                              placeholderTextColor="#bbb"
                              selectTextOnFocus
                            />
                          )}

                          {/* Category chip — tappable unless deleting */}
                          {isDeleted ? (
                            <Text style={styles.tileCategory}>
                              {tile.categoryLabel}
                            </Text>
                          ) : (
                            <TouchableOpacity
                              style={styles.categoryChip}
                              onPress={() =>
                                setCategoryPickerTarget({
                                  tileId: tile.id,
                                  currentCategoryKey: tile.categoryKey,
                                })
                              }
                              accessibilityLabel={`Change category from ${tile.categoryLabel}`}>
                              <Text style={styles.categoryChipText}>
                                🏷️ {tile.categoryLabel} ▾
                              </Text>
                            </TouchableOpacity>
                          )}

                          {/* Aliases */}
                          {!isDeleted && (
                            <TextInput
                              disableFullscreenUI
                              style={styles.aliasInput}
                              value={
                                aliasInputs[tile.id] !== undefined
                                  ? aliasInputs[tile.id]
                                  : tile.aliases.join(', ')
                              }
                              onChangeText={raw =>
                                handleAliasChange(tile.categoryKey, tile.id, raw)
                              }
                              placeholder="Aliases (comma-separated)"
                              placeholderTextColor="#bbb"
                            />
                          )}
                          {isDeleted && tile.aliases.length > 0 && (
                            <Text style={styles.tileAliases}>
                              aka {tile.aliases.join(', ')}
                            </Text>
                          )}
                        </View>

                        {/* Right: action badge */}
                        {badge && (
                          <View style={[styles.badge, badge.style]}>
                            <Text style={styles.badgeText}>{badge.label}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Free text preview */}
              {freeText ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionLabel}>Context Update</Text>
                    <TouchableOpacity
                      onPress={() => setIsEditingText(!isEditingText)}
                      style={styles.editBtn}>
                      <Text style={styles.editBtnText}>
                        {isEditingText ? 'Done' : 'Edit'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.freeTextBox}>
                    {isEditingText ? (
                      <TextInput
                        disableFullscreenUI
                        style={styles.freeTextInput}
                        multiline
                        value={editedFreeText}
                        onChangeText={setEditedFreeText}
                        autoFocus
                      />
                    ) : (
                      renderFreeText(editedFreeText)
                    )}
                  </View>
                </View>
              ) : null}

              {changedTiles.length === 0 && !freeText && (
                <Text style={styles.noChanges}>
                  No changes detected in this build.
                </Text>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.backBtn} onPress={onBack}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => onAccept(editedFreeText, localTiles)}>
                <Text style={styles.acceptBtnText}>✓ Accept &amp; Save</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Category Selector Overlay ─────────────────────────────────── */}
          {categoryPickerTarget && (
            <Pressable
              style={styles.selectorBackdrop}
              onPress={() => setCategoryPickerTarget(null)}>
              <View style={styles.selectorSheet}>
                <Text style={styles.selectorTitle}>Move to Category</Text>
                {ALL_CATEGORY_KEYS.map(key => {
                  const isCurrentCat =
                    key === categoryPickerTarget.currentCategoryKey;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.selectorOption,
                        isCurrentCat && styles.selectorOptionActive,
                      ]}
                      onPress={() => {
                        if (!isCurrentCat) {
                          handleReassignCategory(key);
                        } else {
                          setCategoryPickerTarget(null);
                        }
                      }}>
                      <Text
                        style={[
                          styles.selectorOptionText,
                          isCurrentCat && styles.selectorOptionTextActive,
                        ]}>
                        {CATEGORY_LABELS[key]}
                      </Text>
                      {isCurrentCat && (
                        <Text style={styles.selectorCheckmark}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={styles.selectorCancelBtn}
                  onPress={() => setCategoryPickerTarget(null)}>
                  <Text style={styles.selectorCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  kav: {flex: 1},
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
    shadowOffset: {width: 0, height: 6},
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
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: '#555',
    fontWeight: '700',
  },
  summaryBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  summaryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  summaryCreate: {backgroundColor: '#E8F5E9'},
  summaryUpdate: {backgroundColor: '#E3F2FD'},
  summaryDelete: {backgroundColor: '#FFEBEE'},
  summaryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  editHintBar: {
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#E1BEE7',
  },
  editHintText: {
    fontSize: 12,
    color: '#6A1B9A',
    fontStyle: 'italic',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  // ─── Tile row ───────────────────────────────────────────────────────────────
  tileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    gap: 8,
  },
  tileCreate: {
    backgroundColor: '#F1FFF4',
    borderColor: '#81C784',
  },
  tileUpdate: {
    backgroundColor: '#F0F8FF',
    borderColor: '#64B5F6',
  },
  tileDelete: {
    backgroundColor: '#FFF5F5',
    borderColor: '#EF9A9A',
  },
  tileNone: {
    backgroundColor: '#fafafa',
    borderColor: '#eee',
  },
  tileMeta: {
    flex: 1,
    gap: 5,
  },
  // Name display / input
  tileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  tileNameInput: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#c7d5e0',
    paddingVertical: 2,
    paddingHorizontal: 0,
    marginBottom: 2,
  },
  tileNameDeleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  // Category chip
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE7F6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginVertical: 2,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5E35B1',
  },
  // Fallback read-only category label (for deleted tiles)
  tileCategory: {
    fontSize: 12,
    color: '#8E24AA',
    fontWeight: '500',
  },
  // Alias TextInput
  aliasInput: {
    fontSize: 12,
    color: '#555',
    borderWidth: 1,
    borderColor: '#dde4ea',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fafafa',
    marginTop: 2,
  },
  tileAliases: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  badgeCreate: {backgroundColor: '#C8E6C9'},
  badgeUpdate: {backgroundColor: '#BBDEFB'},
  badgeDelete: {backgroundColor: '#FFCDD2'},
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
  // Free text section
  freeTextBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 14,
  },
  freeText: {
    fontSize: 15,
    color: '#2d2d2d',
    lineHeight: 24,
  },
  freeTextInput: {
    fontSize: 15,
    color: '#2d2d2d',
    lineHeight: 24,
    padding: 0,
    margin: 0,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E24AA',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    color: '#e57373',
  },
  noChanges: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 15,
    marginTop: 30,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fafafa',
  },
  backBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  backBtnText: {
    fontSize: 16,
    color: '#555',
    fontWeight: '600',
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#4CAF50',
  },
  acceptBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },

  // ─── Category Selector Overlay ─────────────────────────────────────────────
  selectorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  selectorSheet: {
    width: '78%',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 20,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 20,
  },
  selectorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  selectorOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  selectorOptionActive: {
    backgroundColor: '#F3E5F5',
  },
  selectorOptionText: {
    fontSize: 16,
    color: '#222',
  },
  selectorOptionTextActive: {
    color: '#6A1B9A',
    fontWeight: '700',
  },
  selectorCheckmark: {
    fontSize: 16,
    color: '#8E24AA',
    fontWeight: '700',
  },
  selectorCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  selectorCancelText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '600',
  },
});

export default PreviewModal;
