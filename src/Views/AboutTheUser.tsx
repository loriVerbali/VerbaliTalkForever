import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {personalMemoryDb} from '../utils/personalMemoryDb';
import {personalMemoryService} from '../services/PersonalMemoryService';
import {useAppSettings} from '../utils/persistance';
import {addPepesTile, PepesData} from '../utils/pepesUtils';
import type {KnowledgeItemRow} from '../types/personalMemory';

const CATEGORY_TITLES: Record<string, string> = {
  person: 'People',
  relationship: 'Relationships',
  place: 'Places',
  food: 'Food & Drinks',
  activity: 'Activities',
  object: 'Things',
  like: 'Likes',
  dislike: 'Dislikes',
  routine: 'Routines',
  fact: 'Other Facts',
};

const KNOWLEDGE_TO_PEPES: Record<string, string> = {
  person: 'People',
  relationship: 'People',
  place: 'Places',
  food: 'Food',
  object: 'Toys',
  like: 'People',
};

function badgeFor(fact: KnowledgeItemRow): {label: string; color: string} {
  if (fact.status === 'replaced') {
    return {label: 'Replaced', color: '#9E9E9E'};
  }
  if (fact.status === 'suggested') {
    return {label: 'Suggested', color: '#FB8C00'};
  }
  if (fact.status === 'possibly_outdated' || fact.review_flag === 'possibly_outdated') {
    return {label: 'May be outdated', color: '#E53935'};
  }
  if (fact.confirmed === 1) {
    return {label: 'Confirmed', color: '#43A047'};
  }
  return {label: 'Learned from repeated communication', color: '#1E88E5'};
}

function periodText(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return '';
  }
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return 'today';
  }
  if (days < 7) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`;
  }
  return `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} ago`;
}

/**
 * Personal-facts layer of the hero profile: knowledge items grouped by
 * category plus the caregiver review queue. Rendered as a tab inside
 * HeroProfile — brings its own ScrollView, no header.
 */
export const AboutTheUserContent: React.FC = () => {
  const {getItem, setItem} = useAppSettings();
  const [facts, setFacts] = useState<KnowledgeItemRow[]>([]);
  const [actionFact, setActionFact] = useState<KnowledgeItemRow | null>(null);
  const [editFact, setEditFact] = useState<KnowledgeItemRow | null>(null);
  const [editStatement, setEditStatement] = useState('');
  const [editValue, setEditValue] = useState('');

  const load = useCallback(async () => {
    if (!personalMemoryService.isReady()) {
      setFacts([]);
      return;
    }
    try {
      setFacts(await personalMemoryDb.getKnowledgeItems());
    } catch (e) {
      setFacts([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const caregiverAction = async (
    fact: KnowledgeItemRow,
    patch: Parameters<typeof personalMemoryDb.updateKnowledgeItem>[1],
  ) => {
    try {
      await personalMemoryDb.updateKnowledgeItem(fact.id, patch);
      await personalMemoryDb.insertEvidence(fact.id, 'caregiver', null, new Date());
      await load();
    } catch (e) {}
  };

  // ── Review-queue actions ──────────────────────────────────────────────────

  const handleConfirm = (fact: KnowledgeItemRow) =>
    caregiverAction(fact, {
      status: 'active',
      confirmed: 1,
      review_flag: null,
      last_reinforced: new Date().toISOString(),
    });

  const handleStillTrue = handleConfirm;

  // seedFromIntake() revives `inactive` intake-mirrored facts on every run —
  // that path exists for tiles removed and later restored. A caregiver
  // removal must stick, so mirrored facts land in `rejected` instead: never
  // revived by seeding, and blocklisted from being re-learned by AI.
  const removedStatus = (fact: KnowledgeItemRow): 'rejected' | 'inactive' =>
    fact.source === 'intake' && fact.pepes_item_id ? 'rejected' : 'inactive';

  const handleNotAnymore = async (fact: KnowledgeItemRow) => {
    await caregiverAction(fact, {
      status: removedStatus(fact),
      review_flag: null,
    });
    // Linked favorite tile: offer to unmark the heart
    if (fact.pepes_item_id && fact.category === 'like') {
      Alert.alert(
        'Update People & Stuff?',
        `Also remove the favorite heart from "${fact.subject}"?`,
        [
          {text: 'No', style: 'cancel'},
          {
            text: 'Yes',
            onPress: async () => {
              try {
                const raw = await getItem('pepes');
                if (!raw) {
                  return;
                }
                const pepes: PepesData = JSON.parse(raw);
                for (const items of Object.values(pepes)) {
                  for (const item of items || []) {
                    if (
                      item.name?.trim().toLowerCase() ===
                      fact.subject.trim().toLowerCase()
                    ) {
                      item.isFavorite = false;
                    }
                  }
                }
                await setItem('pepes', JSON.stringify(pepes));
                personalMemoryService.seedFromIntake().catch(() => {});
              } catch (e) {}
            },
          },
        ],
      );
    }
  };

  const handleDismissReview = (fact: KnowledgeItemRow) => {
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    caregiverAction(fact, {
      review_flag: null,
      review_dismissed_until: until.toISOString(),
    });
  };

  const handleRejectSuggested = (fact: KnowledgeItemRow) =>
    caregiverAction(fact, {status: 'rejected'});

  const handlePromote = async (fact: KnowledgeItemRow) => {
    try {
      const raw = await getItem('pepes');
      const category = KNOWLEDGE_TO_PEPES[fact.category] || 'People';
      const tileId = `mem_${fact.id}`;
      const updated = addPepesTile(raw, category, {
        id: tileId,
        name: fact.subject,
        aliases: [],
        imageUri: '',
        ...(fact.category === 'relationship' && fact.value
          ? {relationship: fact.value}
          : {}),
        ...(fact.category === 'like' ? {isFavorite: true} : {}),
      });
      await setItem('pepes', JSON.stringify(updated));
      await personalMemoryDb.updateKnowledgeItem(fact.id, {
        pepes_item_id: tileId,
        review_flag: null,
      });
      await personalMemoryDb.insertEvidence(fact.id, 'caregiver', null, new Date());
      personalMemoryService.seedFromIntake().catch(() => {});
      await load();
    } catch (e) {}
  };

  // ── Card actions (action sheet modal) ─────────────────────────────────────

  const openEdit = (fact: KnowledgeItemRow) => {
    setActionFact(null);
    setEditFact(fact);
    setEditStatement(fact.statement);
    setEditValue(fact.value ?? '');
  };

  const saveEdit = async () => {
    if (!editFact) {
      return;
    }
    await caregiverAction(editFact, {
      statement: editStatement.trim() || editFact.statement,
      value: editValue.trim() || null,
      confirmed: 1,
    });
    setEditFact(null);
  };

  const handleDelete = (fact: KnowledgeItemRow) => {
    setActionFact(null);
    Alert.alert('Delete this fact?', fact.statement, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => caregiverAction(fact, {status: removedStatus(fact)}),
      },
    ]);
  };

  const handleMarkIncorrect = (fact: KnowledgeItemRow) => {
    setActionFact(null);
    Alert.alert(
      'Mark as incorrect?',
      'This fact will be removed and Matalk will not learn it again automatically.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Mark incorrect',
          style: 'destructive',
          onPress: () => caregiverAction(fact, {status: 'rejected'}),
        },
      ],
    );
  };

  // ── Rendering ─────────────────────────────────────────────────────────────

  const visibleFacts = facts.filter(
    f => f.status !== 'inactive' && f.status !== 'rejected' && f.status !== 'replaced',
  );
  const nowIso = new Date().toISOString();
  const reviewQueue = visibleFacts.filter(
    f =>
      f.status === 'suggested' ||
      ((f.review_flag === 'possibly_outdated' ||
        f.review_flag === 'promotion_offer' ||
        f.status === 'possibly_outdated') &&
        (!f.review_dismissed_until || f.review_dismissed_until < nowIso)),
  );
  const regularFacts = visibleFacts.filter(f => !reviewQueue.includes(f));

  const grouped = Object.keys(CATEGORY_TITLES)
    .map(category => ({
      category,
      title: CATEGORY_TITLES[category],
      data: regularFacts.filter(f => f.category === category),
    }))
    .filter(group => group.data.length > 0);

  const renderReviewCard = (fact: KnowledgeItemRow) => {
    if (fact.status === 'suggested') {
      return (
        <View key={fact.id} style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>New suggestion</Text>
          <Text style={styles.cardStatement}>{fact.statement}</Text>
          <View style={styles.reviewButtons}>
            <TouchableOpacity
              style={[styles.reviewButton, styles.confirmButton]}
              onPress={() => handleConfirm(fact)}>
              <Text style={styles.reviewButtonText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewButton, styles.rejectButton]}
              onPress={() => handleRejectSuggested(fact)}>
              <Text style={styles.reviewButtonText}>Not right</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewButton, styles.laterButton]}
              onPress={() => handleDismissReview(fact)}>
              <Text style={styles.reviewButtonTextDark}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    if (fact.review_flag === 'promotion_offer') {
      return (
        <View key={fact.id} style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Add to People & Stuff?</Text>
          <Text style={styles.cardStatement}>{fact.statement}</Text>
          <View style={styles.reviewButtons}>
            <TouchableOpacity
              style={[styles.reviewButton, styles.confirmButton]}
              onPress={() => handlePromote(fact)}>
              <Text style={styles.reviewButtonText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewButton, styles.laterButton]}
              onPress={() => handleDismissReview(fact)}>
              <Text style={styles.reviewButtonTextDark}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    // Drift card
    return (
      <View key={fact.id} style={styles.reviewCard}>
        <Text style={styles.reviewTitle}>Still true?</Text>
        <Text style={styles.cardStatement}>
          {`"${fact.subject}" hasn't come up in a while. ${fact.statement} — still true?`}
        </Text>
        <View style={styles.reviewButtons}>
          <TouchableOpacity
            style={[styles.reviewButton, styles.confirmButton]}
            onPress={() => handleStillTrue(fact)}>
            <Text style={styles.reviewButtonText}>Still true</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reviewButton, styles.rejectButton]}
            onPress={() => handleNotAnymore(fact)}>
            <Text style={styles.reviewButtonText}>Not anymore</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reviewButton, styles.laterButton]}
            onPress={() => handleDismissReview(fact)}>
            <Text style={styles.reviewButtonTextDark}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFactCard = (fact: KnowledgeItemRow) => {
    const badge = badgeFor(fact);
    return (
      <TouchableOpacity
        key={fact.id}
        style={styles.card}
        onPress={() => setActionFact(fact)}>
        <Text style={styles.cardStatement}>{fact.statement}</Text>
        <View style={styles.cardFooter}>
          <View style={[styles.badge, {backgroundColor: badge.color}]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
          <Text style={styles.cardMeta}>
            {fact.source === 'intake' ? 'From intake' : 'Learned'} ·{' '}
            {periodText(fact.last_reinforced)}
          </Text>
        </View>
        {fact.ai_context_enabled === 0 && (
          <Text style={styles.excludedNote}>Excluded from AI context</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.listContent}>
        {reviewQueue.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>To review</Text>
            {reviewQueue.map(renderReviewCard)}
          </>
        )}

        {grouped.length === 0 && reviewQueue.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No personal facts yet. Complete "Tell Us More" in Settings, or
              let Matalk learn from communication over time.
            </Text>
          </View>
        ) : (
          grouped.map(group => (
            <View key={group.category}>
              <Text style={styles.sectionHeader}>{group.title}</Text>
              {group.data.map(renderFactCard)}
            </View>
          ))
        )}
      </ScrollView>

      {/* Fact action sheet */}
      <Modal
        visible={actionFact !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionFact(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionFact(null)}>
          {actionFact && (
            <View style={styles.actionSheet}>
              <Text style={styles.actionSheetTitle} numberOfLines={2}>
                {actionFact.statement}
              </Text>
              {actionFact.confirmed !== 1 && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    handleConfirm(actionFact);
                    setActionFact(null);
                  }}>
                  <Text style={styles.actionText}>✓ Confirm</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => openEdit(actionFact)}>
                <Text style={styles.actionText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  const next = actionFact.ai_context_enabled === 1 ? 0 : 1;
                  caregiverAction(actionFact, {ai_context_enabled: next});
                  setActionFact(null);
                }}>
                <Text style={styles.actionText}>
                  {actionFact.ai_context_enabled === 1
                    ? '🚫 Exclude from AI context'
                    : '✅ Include in AI context'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  caregiverAction(actionFact, {
                    review_flag: 'possibly_outdated',
                  });
                  setActionFact(null);
                }}>
                <Text style={styles.actionText}>🕐 Mark outdated</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => handleMarkIncorrect(actionFact)}>
                <Text style={styles.actionTextDestructive}>
                  ✗ Mark incorrect
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => handleDelete(actionFact)}>
                <Text style={styles.actionTextDestructive}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Edit modal */}
      <Modal
        visible={editFact !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditFact(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.actionSheetTitle}>Edit fact</Text>
            <Text style={styles.inputLabel}>Statement</Text>
            <TextInput
              disableFullscreenUI
              style={styles.input}
              value={editStatement}
              onChangeText={setEditStatement}
              multiline
            />
            <Text style={styles.inputLabel}>Value (optional)</Text>
            <TextInput
              disableFullscreenUI
              style={styles.input}
              value={editValue}
              onChangeText={setEditValue}
            />
            <View style={styles.reviewButtons}>
              <TouchableOpacity
                style={[styles.reviewButton, styles.confirmButton]}
                onPress={saveEdit}>
                <Text style={styles.reviewButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewButton, styles.laterButton]}
                onPress={() => setEditFact(null)}>
                <Text style={styles.reviewButtonTextDark}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 48,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 14,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  reviewCard: {
    backgroundColor: '#fff8e6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0dfae',
    padding: 12,
    marginBottom: 8,
  },
  reviewTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#8a6d1a',
    marginBottom: 4,
  },
  cardStatement: {
    fontSize: 15,
    color: '#333',
    lineHeight: 21,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
    marginBottom: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 12,
    color: '#888',
  },
  excludedNote: {
    fontSize: 12,
    color: '#c62828',
    marginTop: 6,
    fontStyle: 'italic',
  },
  reviewButtons: {
    flexDirection: 'row',
    marginTop: 10,
  },
  reviewButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  confirmButton: {
    backgroundColor: '#43A047',
  },
  rejectButton: {
    backgroundColor: '#E53935',
  },
  laterButton: {
    backgroundColor: '#e0e0e0',
  },
  reviewButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  reviewButtonTextDark: {
    color: '#444',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  actionSheetTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  actionRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionText: {
    fontSize: 15,
    color: '#333',
  },
  actionTextDestructive: {
    fontSize: 15,
    color: '#c62828',
  },
  editModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  inputLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
});

export default AboutTheUserContent;
