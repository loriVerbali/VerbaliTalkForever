import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';
import {useDatabase} from '../contexts/DatabaseContext';
import {useAppSettings} from '../utils/persistance';
import mixpanel from '../utils/mixpanelInstance';

const {width, height} = Dimensions.get('window');

interface QARound {
  roundNumber: number;
  answersAvailable: string[]; // List of answer options shown
  answerChosen: string | 'more_options'; // Selected answer or "more_options"
}

interface QALogEntry {
  id: string;
  question: string;
  timestamp: Date;
  source: 'Home' | 'Convo';
  round1: QARound;
  round2?: QARound;
  round3?: QARound;
}

interface TimeFilter {
  type: 'today' | 'last30Days' | 'thisWeek' | 'thisMonth';
}

interface QALogMetricProps {}

const InfoModal = ({
  visible,
  onClose,
  title,
  description,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
}) => {
  const bulletPoints = description
    .split('•')
    .map(point => point.trim())
    .filter(point => point.length > 0)
    .map(point => `• ${point}`);

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={styles.modalDescriptionContainer}>
            {bulletPoints.map((point, index) => (
              <Text key={index} style={styles.modalDescription}>
                {point.trim()}
              </Text>
            ))}
          </View>
          <TouchableOpacity style={styles.modalButton} onPress={onClose}>
            <Text style={styles.modalButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const QALogMetric: React.FC<QALogMetricProps> = () => {
  const {getAIResolvedData, isInitialized, isLoading} = useDatabase();
  const {preferences} = useAppSettings();
  const [qaLogs, setQaLogs] = useState<QALogEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>({
    type: 'last30Days',
  });
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Build filters based on time filter
  const buildFilters = useCallback(() => {
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    switch (timeFilter.type) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999,
        );
        break;
      case 'last30Days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        // Start of week (Sunday)
        startDate = new Date(now);
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        break;
    }

    return {
      startDate,
      endDate,
    };
  }, [timeFilter]);

  // Track when this metric component is viewed
  useEffect(() => {
    mixpanel.track('QALogMetric Viewed', {
      MetricKey: 'metric4',
    });
  }, []);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!isInitialized || isLoading) return;

      try {
        const filters = buildFilters();
        const data = await getAIResolvedData(filters);
        const formattedLogs: QALogEntry[] = data.map(item => {
          const parseAnswers = (answersStr?: string) => {
            if (!answersStr) return [];
            try {
              return JSON.parse(answersStr);
            } catch {
              return answersStr.split(',').map(a => a.trim());
            }
          };

          const round1: QARound = {
            roundNumber: 1,
            answersAvailable: parseAnswers(item.round1_answers),
            answerChosen: item.round1_picked || 'more_options',
          };

          const round2: QARound | undefined = item.round2_answers
            ? {
                roundNumber: 2,
                answersAvailable: parseAnswers(item.round2_answers),
                answerChosen: item.round2_picked || 'more_options',
              }
            : undefined;

          const round3: QARound | undefined = item.round3_answers
            ? {
                roundNumber: 3,
                answersAvailable: parseAnswers(item.round3_answers),
                answerChosen: item.round3_picked || 'more_options',
              }
            : undefined;

          return {
            id: item.id?.toString() || '0',
            question: item.question,
            timestamp: item.dateof,
            source: 'Home' as const, // Default to Home since we don't have source in AI resolved table
            round1,
            round2,
            round3,
          };
        });
        setQaLogs(formattedLogs);
      } catch (error) {
        setQaLogs([]);
      }
    };

    loadData();
  }, [timeFilter, isInitialized, isLoading, buildFilters, getAIResolvedData]);

  const handleTimeFilterChange = (type: TimeFilter['type']) => {
    setTimeFilter({type});
  };

  const getTimeFilterLabel = () => {
    switch (timeFilter.type) {
      case 'today':
        return 'Today';
      case 'last30Days':
        return 'Last 30 Days';
      case 'thisWeek':
        return 'This Week';
      case 'thisMonth':
        return 'This Month';
      default:
        return 'Last 30 Days';
    }
  };

  const renderRoundColumn = (round?: QARound) => {
    if (!round) {
      return (
        <View style={styles.roundCell}>
          <Text style={styles.emptyRoundText}>-</Text>
        </View>
      );
    }

    return (
      <View style={styles.roundCell}>
        <View style={styles.roundAnswersSection}>
          <Text style={styles.roundLabel}>Answers:</Text>
          <View style={styles.answersList}>
            {round.answersAvailable.map((answer, index) => (
              <View key={index} style={styles.answerTag}>
                <Text style={styles.answerTagText}>{answer}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.roundChosenSection}>
          <Text style={styles.roundLabel}>Chosen:</Text>
          <View
            style={[
              styles.chosenAnswerTag,
              round.answerChosen === 'more_options' && styles.moreOptionsTag,
            ]}>
            <Text
              style={[
                styles.chosenAnswerText,
                round.answerChosen === 'more_options' && styles.moreOptionsText,
              ]}>
              {round.answerChosen === 'more_options'
                ? 'More Options'
                : round.answerChosen}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Explanation Card */}
      <View style={styles.explanationCard}>
        <View style={styles.explanationHeader}>
          <Text style={styles.explanationText}>
            This view shows the questions {preferences.heroName || 'your child'}{' '}
            was asked using AI, the answers offered in each round, and the final
            answer chosen.
          </Text>
          <TouchableOpacity
            onPress={() => setShowInfoModal(true)}
            style={styles.infoButton}>
            <Text style={styles.infoIcon}>?</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters Section */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Time Frame:</Text>
        <View style={styles.timeFilterButtons}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              timeFilter.type === 'today' && styles.filterButtonActive,
            ]}
            onPress={() => handleTimeFilterChange('today')}>
            <Text
              style={[
                styles.filterButtonText,
                timeFilter.type === 'today' && styles.filterButtonTextActive,
              ]}>
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              timeFilter.type === 'last30Days' && styles.filterButtonActive,
            ]}
            onPress={() => handleTimeFilterChange('last30Days')}>
            <Text
              style={[
                styles.filterButtonText,
                timeFilter.type === 'last30Days' &&
                  styles.filterButtonTextActive,
              ]}>
              Last 30 Days
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              timeFilter.type === 'thisWeek' && styles.filterButtonActive,
            ]}
            onPress={() => handleTimeFilterChange('thisWeek')}>
            <Text
              style={[
                styles.filterButtonText,
                timeFilter.type === 'thisWeek' && styles.filterButtonTextActive,
              ]}>
              This Week
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              timeFilter.type === 'thisMonth' && styles.filterButtonActive,
            ]}
            onPress={() => handleTimeFilterChange('thisMonth')}>
            <Text
              style={[
                styles.filterButtonText,
                timeFilter.type === 'thisMonth' &&
                  styles.filterButtonTextActive,
              ]}>
              This Month
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.currentFilterText}>{getTimeFilterLabel()}</Text>
      </View>

      {/* Table */}
      <View style={styles.tableContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <View style={[styles.tableHeaderCell, styles.questionColumn]}>
                <Text style={styles.tableHeaderText}>Question Asked</Text>
              </View>
              <View style={[styles.tableHeaderCell, styles.roundColumn]}>
                <Text style={styles.tableHeaderText}>Round 1</Text>
              </View>
              <View style={[styles.tableHeaderCell, styles.roundColumn]}>
                <Text style={styles.tableHeaderText}>Round 2</Text>
              </View>
              <View style={[styles.tableHeaderCell, styles.roundColumn]}>
                <Text style={styles.tableHeaderText}>Round 3</Text>
              </View>
            </View>

            {/* Table Body */}
            <ScrollView style={styles.tableBody}>
              {qaLogs.length > 0 ? (
                qaLogs.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.tableRow,
                      index % 2 === 0 && styles.tableRowEven,
                    ]}>
                    <View style={[styles.tableCell, styles.questionColumn]}>
                      <Text style={styles.questionText}>{entry.question}</Text>
                      <Text style={styles.questionMeta}>
                        {entry.timestamp.toLocaleDateString()}
                      </Text>
                    </View>
                    {renderRoundColumn(entry.round1)}
                    {renderRoundColumn(entry.round2)}
                    {renderRoundColumn(entry.round3)}
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No Q&A logs available
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      {/* Info Modal */}
      <InfoModal
        visible={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="Additional information"
        description="• Rounds: A round is one set of answer options. • Moving to the next round: Tap More answers to see another set. • Maximum rounds: Up to 3 rounds per question."
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fe',
  },
  explanationCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    marginBottom: 16,
    marginTop: 16,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  explanationText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    flex: 1,
    marginRight: 12,
  },
  infoButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#8E24AA',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  infoIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
    margin: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalDescriptionContainer: {
    marginBottom: 16,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  modalButton: {
    backgroundColor: '#8E24AA',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  filterSection: {
    marginBottom: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  timeFilterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterButtonActive: {
    backgroundColor: '#8E24AA',
    borderColor: '#8E24AA',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  currentFilterText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  tableContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    overflow: 'hidden',
    marginBottom: 16,
  },
  table: {
    flexDirection: 'column',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#8E24AA',
    borderBottomWidth: 2,
    borderBottomColor: '#7a1f99',
  },
  tableHeaderCell: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#7a1f99',
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'left',
  },
  questionColumn: {
    width: width * 0.35,
    minWidth: 200,
  },
  roundColumn: {
    width: width * 0.22,
    minWidth: 150,
  },
  tableBody: {
    maxHeight: height * 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tableRowEven: {
    backgroundColor: '#f8f9fe',
  },
  tableCell: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  questionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  questionMeta: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  roundCell: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
    width: width * 0.22,
    minWidth: 150,
  },
  roundAnswersSection: {
    marginBottom: 8,
  },
  roundLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  answersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  answerTag: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  answerTagText: {
    fontSize: 11,
    color: '#666',
  },
  roundChosenSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
  },
  chosenAnswerTag: {
    backgroundColor: '#8E24AA',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  moreOptionsTag: {
    backgroundColor: '#FF9500',
  },
  chosenAnswerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  moreOptionsText: {
    color: '#fff',
  },
  emptyRoundText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default QALogMetric;
