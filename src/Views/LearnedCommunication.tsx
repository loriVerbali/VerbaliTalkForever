import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {personalMemoryDb} from '../utils/personalMemoryDb';
import {personalMemoryService} from '../services/PersonalMemoryService';
import {decayedScore, qualitativeLabel} from '../utils/memoryRanking';
import type {MemoryItemRow, SequenceRow} from '../types/personalMemory';

const COLLAPSED_COUNT = 20;
const TIME_PATTERN_MIN_USES = 3;
const TIME_PATTERN_MIN_SHARE = 0.6;
const SEQUENCE_MIN_USES = 2;

const USAGE_LABELS: Record<string, string> = {
  often: 'Often',
  sometimes: 'Sometimes',
  recent: 'New',
  stale: 'Not recent',
};

const BUCKET_LABELS: Record<string, string> = {
  morning: 'mostly in the morning',
  afternoon: 'mostly in the afternoon',
  evening: 'mostly in the evening',
  night: 'mostly at night',
};

// PRD §15.1: qualitative labels only, no numeric scores/counts on this screen.
function lastUsedText(lastUsed: string): string {
  const ms = Date.parse(lastUsed);
  if (Number.isNaN(ms)) {
    return '';
  }
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return 'Used today';
  }
  if (days === 1) {
    return 'Used yesterday';
  }
  if (days < 7) {
    return `Used ${days} days ago`;
  }
  if (days < 30) {
    return `Used ${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`;
  }
  return `Used ${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} ago`;
}

interface TimeHighlight {
  text: string;
  bucket: string;
  total: number;
}

function sortByRelevance(items: MemoryItemRow[], now: number): MemoryItemRow[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return b.pinned - a.pinned;
    }
    return (
      decayedScore(b.use_count, Date.parse(b.last_used), now) -
      decayedScore(a.use_count, Date.parse(a.last_used), now)
    );
  });
}

/**
 * Communication layer of the hero profile: words/sentences with qualitative
 * usage, plus time-of-day and sequence patterns. Rendered as a tab inside
 * HeroProfile — brings its own ScrollView, no header.
 */
export const LearnedCommunicationContent: React.FC = () => {
  const [words, setWords] = useState<MemoryItemRow[]>([]);
  const [phrases, setPhrases] = useState<MemoryItemRow[]>([]);
  const [timeHighlights, setTimeHighlights] = useState<TimeHighlight[]>([]);
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [showAllWords, setShowAllWords] = useState(false);
  const [showAllPhrases, setShowAllPhrases] = useState(false);

  const load = useCallback(async () => {
    if (!personalMemoryService.isReady()) {
      setWords([]);
      setPhrases([]);
      setTimeHighlights([]);
      setSequences([]);
      return;
    }
    try {
      const now = Date.now();
      const items = await personalMemoryDb.getMemoryItems();
      setWords(sortByRelevance(items.filter(i => i.kind === 'word'), now));
      setPhrases(sortByRelevance(items.filter(i => i.kind !== 'word'), now));

      const patterns = await personalMemoryDb.getTimePatterns(
        items.map(i => i.id),
      );
      const byItem = new Map<number, {bucket: string; count: number}[]>();
      for (const p of patterns) {
        const list = byItem.get(p.item_id) || [];
        list.push({bucket: p.bucket, count: p.use_count});
        byItem.set(p.item_id, list);
      }
      const highlights: TimeHighlight[] = [];
      for (const item of items) {
        const buckets = byItem.get(item.id);
        if (!buckets) {
          continue;
        }
        const total = buckets.reduce((sum, b) => sum + b.count, 0);
        const top = buckets.reduce((a, b) => (b.count > a.count ? b : a));
        if (
          total >= TIME_PATTERN_MIN_USES &&
          top.count / total >= TIME_PATTERN_MIN_SHARE
        ) {
          highlights.push({text: item.text, bucket: top.bucket, total});
        }
      }
      highlights.sort((a, b) => b.total - a.total);
      setTimeHighlights(highlights.slice(0, 5));

      const topSequences = await personalMemoryDb.getTopSequences(12);
      setSequences(
        topSequences.filter(s => s.use_count >= SEQUENCE_MIN_USES).slice(0, 6),
      );
    } catch (e) {
      setWords([]);
      setPhrases([]);
      setTimeHighlights([]);
      setSequences([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleItemPress = (item: MemoryItemRow) => {
    const now = Date.now();
    const usage = qualitativeLabel(
      decayedScore(item.use_count, Date.parse(item.last_used), now),
      Date.parse(item.first_used),
      Date.parse(item.last_used),
      now,
    );
    Alert.alert(item.text, `${USAGE_LABELS[usage]} · ${lastUsedText(item.last_used)}`, [
      {
        text: item.pinned === 1 ? 'Unpin' : 'Pin',
        onPress: async () => {
          try {
            await personalMemoryDb.setPinned(item.id, item.pinned !== 1);
            load();
          } catch (e) {}
        },
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Remove from memory?',
            `"${item.text}" will be forgotten. It can be learned again through use.`,
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await personalMemoryDb.deleteMemoryItem(item.id);
                    load();
                  } catch (e) {}
                },
              },
            ],
          );
        },
      },
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  const renderColumnItem = (item: MemoryItemRow) => {
    const now = Date.now();
    const usage = qualitativeLabel(
      decayedScore(item.use_count, Date.parse(item.last_used), now),
      Date.parse(item.first_used),
      Date.parse(item.last_used),
      now,
    );
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        onPress={() => handleItemPress(item)}>
        <Text style={styles.cardText} numberOfLines={2}>
          {item.pinned === 1 ? '📌 ' : ''}
          {item.text}
        </Text>
        <Text style={styles.cardMeta}>{USAGE_LABELS[usage]}</Text>
      </TouchableOpacity>
    );
  };

  const renderColumn = (
    title: string,
    items: MemoryItemRow[],
    showAll: boolean,
    onToggle: () => void,
  ) => {
    const visible = showAll ? items : items.slice(0, COLLAPSED_COUNT);
    return (
      <View style={styles.column}>
        <Text style={styles.columnHeader}>
          {title} ({items.length})
        </Text>
        {items.length === 0 ? (
          <Text style={styles.columnEmpty}>None yet</Text>
        ) : (
          visible.map(renderColumnItem)
        )}
        {items.length > COLLAPSED_COUNT && (
          <TouchableOpacity style={styles.showAllButton} onPress={onToggle}>
            <Text style={styles.showAllText}>
              {showAll ? 'Show less' : `Show all ${items.length}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const hasItems = words.length > 0 || phrases.length > 0;
  const hasPatterns = timeHighlights.length > 0 || sequences.length > 0;
  const oftenCount = (() => {
    const now = Date.now();
    return [...words, ...phrases].filter(
      i =>
        qualitativeLabel(
          decayedScore(i.use_count, Date.parse(i.last_used), now),
          Date.parse(i.first_used),
          Date.parse(i.last_used),
          now,
        ) === 'often',
    ).length;
  })();

  if (!hasItems) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          Nothing learned yet. As words, answers, and sentences are used on
          this device, they will appear here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryNumber}>{words.length}</Text>
          <Text style={styles.summaryLabel}>Words</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryNumber}>{phrases.length}</Text>
          <Text style={styles.summaryLabel}>Sentences</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryNumber}>{oftenCount}</Text>
          <Text style={styles.summaryLabel}>Used often</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>Patterns</Text>
      {!hasPatterns ? (
        <Text style={styles.patternEmpty}>
          No patterns yet. Patterns appear once the same words are used
          together, or at consistent times of day.
        </Text>
      ) : (
        <View style={styles.patternCard}>
          {timeHighlights.map(h => (
            <View key={`t-${h.text}`} style={styles.patternRow}>
              <Text style={styles.patternIcon}>🕐</Text>
              <Text style={styles.patternText} numberOfLines={2}>
                "{h.text}" — {BUCKET_LABELS[h.bucket]}
              </Text>
            </View>
          ))}
          {sequences.map(s => (
            <View
              key={`s-${s.prev_normalized}-${s.next_normalized}`}
              style={styles.patternRow}>
              <Text style={styles.patternIcon}>🔗</Text>
              <Text style={styles.patternText} numberOfLines={2}>
                "{s.prev_normalized}" is often followed by "
                {s.next_normalized}"
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.columnsRow}>
        {renderColumn('Words', words, showAllWords, () =>
          setShowAllWords(v => !v),
        )}
        {renderColumn('Sentences', phrases, showAllPhrases, () =>
          setShowAllPhrases(v => !v),
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 48,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 18,
    marginBottom: 8,
  },
  patternCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
  },
  patternIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  patternText: {
    flex: 1,
    fontSize: 14,
    color: '#444',
    lineHeight: 19,
  },
  patternEmpty: {
    fontSize: 13,
    color: '#888',
    lineHeight: 19,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
  },
  columnHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 8,
  },
  columnEmpty: {
    fontSize: 13,
    color: '#999',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  cardText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  cardMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  showAllButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  showAllText: {
    fontSize: 13,
    color: '#4a5aa8',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
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
});

export default LearnedCommunicationContent;
