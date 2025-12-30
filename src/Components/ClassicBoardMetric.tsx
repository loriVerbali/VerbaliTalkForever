import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import {useDatabase} from '../contexts/DatabaseContext';
import {useAppSettings} from '../utils/persistance';
import {Mixpanel} from 'mixpanel-react-native';

const {width, height} = Dimensions.get('window');

interface ClassicBoardEntry {
  id: string;
  sentence: string;
  wordCount: number;
  timeToBuild: number; // in seconds
  timestamp: Date;
}

interface TimeFilter {
  type: 'last30Days' | 'thisWeek' | 'thisMonth';
}

interface ClassicBoardMetricProps {}

const ClassicBoardMetric: React.FC<ClassicBoardMetricProps> = () => {
  const {getClassicData, isInitialized, isLoading} = useDatabase();
  const {preferences} = useAppSettings();
  const [entries, setEntries] = useState<ClassicBoardEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>({
    type: 'last30Days',
  });

  // Track when this metric component is viewed
  useEffect(() => {
    const mixpanel = new Mixpanel('48186fefd3c06e4f4b0c4ad87d1555d2', true);
    mixpanel.track('ClassicBoardMetric Viewed', {
      MetricKey: 'metric3',
    });
  }, []);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!isInitialized || isLoading) return;

      try {
        const filters = buildFilters();
        const data = await getClassicData(filters);
        const formattedEntries: ClassicBoardEntry[] = data.map(item => ({
          id: item.id?.toString() || '0',
          sentence: item.sentence,
          wordCount: item.wordcount,
          timeToBuild: item.timetobuild,
          timestamp: item.dateof,
        }));
        setEntries(formattedEntries);
      } catch (error) {
        
        setEntries([]);
      }
    };

    loadData();
  }, [timeFilter, isInitialized, isLoading]);

  const buildFilters = () => {
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    switch (timeFilter.type) {
      case 'last30Days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        break;
    }

    return {
      startDate,
      endDate,
    };
  };

  const handleTimeFilterChange = (type: TimeFilter['type']) => {
    setTimeFilter({type});
  };

  const getTimeFilterLabel = () => {
    switch (timeFilter.type) {
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

  const formatTime = (seconds: number) => {
    if (seconds >= 300) {
      // 5 minutes timeout
      return 'Timeout (>5min)';
    }
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* Explanation Card */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Explanation:</Text>
        <View style={styles.explanationContent}>
          <Text style={styles.explanationText}>
            This view gives a detailed analysis of how{' '}
            {preferences.heroName || 'your child'} used the Classic Words Board.
            You can see which sentences were created, how many words they used,
            and how long each sentence took to build.
          </Text>
        </View>
      </View>

      {/* Filters Section */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Time Frame:</Text>
        <View style={styles.timeFilterButtons}>
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
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={[styles.tableHeaderCell, styles.sentenceHeader]}>
              <Text style={styles.headerText}>Sentence Made</Text>
            </View>
            <View style={[styles.tableHeaderCell, styles.wordCountHeader]}>
              <Text style={styles.headerText}>Number of Words</Text>
            </View>
            <View style={[styles.tableHeaderCell, styles.timeHeader]}>
              <Text style={styles.headerText}>Time to Build</Text>
            </View>
          </View>

          {/* Table Body */}
          <ScrollView style={styles.tableBody}>
            {entries.length > 0 ? (
              entries.map((entry, index) => (
                <View
                  key={entry.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 && styles.tableRowEven,
                  ]}>
                  <View style={[styles.tableCell, styles.sentenceColumn]}>
                    <Text style={styles.sentenceText}>{entry.sentence}</Text>
                    <Text style={styles.timestampText}>
                      {entry.timestamp.toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[styles.tableCell, styles.wordCountColumn]}>
                    <Text style={styles.wordCountText}>{entry.wordCount}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.timeColumn]}>
                    <Text style={styles.timeText}>
                      {formatTime(entry.timeToBuild)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  VerbaliTalk Forever will gather information once you use the different
                  features, or you haven't used this feature in the last 30
                  days.
                </Text>
                <Text style={styles.emptyStateSubtext}>
                  To gather data go to the Main screen of the app and press
                  Start Talking and build a sentence.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fe',
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
  explanationContent: {
    marginTop: 4,
  },
  explanationText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
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
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  tableHeaderCell: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sentenceHeader: {
    flex: 2,
  },
  wordCountHeader: {
    flex: 1,
  },
  timeHeader: {
    flex: 1,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
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
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  sentenceColumn: {
    flex: 2,
  },
  wordCountColumn: {
    flex: 1,
  },
  timeColumn: {
    flex: 1,
  },
  sentenceText: {
    fontSize: 14,
    color: '#333',
  },
  timestampText: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  wordCountText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  timeText: {
    fontSize: 14,
    color: '#333',
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
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#8E24AA',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },
});

export default ClassicBoardMetric;
