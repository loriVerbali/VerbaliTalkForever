import React, {useState, useEffect} from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
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

const CATEGORY_LABELS: Record<keyof AITilesMap, string> = {
  people: 'People',
  toys: 'Toys',
  pets: 'Pets',
  tv_shows: 'TV Shows',
  food: 'Food',
  drinks: 'Drinks',
  places: 'Places',
};

/**
 * PreviewModal — Renders the Magic Build / Magic Update diff before the
 * caregiver accepts. Tiles are color-coded by _action; free text
 * renders strikethrough for deleted content.
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

  useEffect(() => {
    if (visible) {
      setEditedFreeText(freeText);
      setLocalTiles(tiles);
      setIsEditingText(false);
    }
  }, [visible, freeText, tiles]);

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
    (Object.keys(localTiles) as (keyof AITilesMap)[]).forEach(cat => {
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

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Tile changes */}
            {changedTiles.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Tile Changes</Text>
                {changedTiles.map(tile => {
                  const badge = actionBadge(tile._action);
                  return (
                    <View
                      key={tile.id}
                      style={[styles.tileRow, actionStyle(tile._action)]}>
                      <View style={styles.tileMeta}>
                        {tile._action === 'delete' ? (
                          <Text style={[styles.tileName, styles.tileNameDeleted]}>
                            {tile.name}
                          </Text>
                        ) : (
                          <TextInput
                            style={styles.tileNameInput}
                            value={tile.name}
                            onChangeText={txt =>
                              handleUpdateTileName(tile.categoryKey, tile.id, txt)
                            }
                            placeholder="Tile name"
                          />
                        )}
                        <Text style={styles.tileCategory}>
                          {tile.categoryLabel}
                        </Text>
                        {tile.aliases.length > 0 && (
                          <Text style={styles.tileAliases}>
                            aka {tile.aliases.join(', ')}
                          </Text>
                        )}
                      </View>
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
              <Text style={styles.acceptBtnText}>✓ Accept & Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 10,
  },
  sheet: {
    width: '98%',
    height: '90%', // Fill most of the screen
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
    paddingVertical: 12,
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
  tileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
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
  },
  tileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  tileNameInput: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    padding: 0,
    margin: 0,
  },
  tileNameDeleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  tileCategory: {
    fontSize: 12,
    color: '#8E24AA',
    fontWeight: '500',
    marginTop: 2,
  },
  tileAliases: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  badgeCreate: {backgroundColor: '#C8E6C9'},
  badgeUpdate: {backgroundColor: '#BBDEFB'},
  badgeDelete: {backgroundColor: '#FFCDD2'},
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
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
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fafafa',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  cancelBtnText: {
    fontSize: 16,
    color: '#555',
    fontWeight: '600',
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
});

export default PreviewModal;
