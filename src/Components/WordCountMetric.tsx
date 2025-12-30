import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import {useDatabase} from '../contexts/DatabaseContext';
import {Mixpanel} from 'mixpanel-react-native';

const {width, height} = Dimensions.get('window');

interface WordCountData {
  word: string;
  count: number;
}

interface TimeFilter {
  type: 'today' | 'thisWeek' | 'thisMonth' | 'dateRange';
  startDate?: Date;
  endDate?: Date;
}

interface AdditionalFilters {
  timeOfDayStart?: string; // HH:mm format
  timeOfDayEnd?: string; // HH:mm format
  daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
  source?: 'AI Only' | 'Classic Board' | 'all';
}

interface WordCountMetricProps {
  // This will be populated with real data later from the database
}

const WordCountMetric: React.FC<WordCountMetricProps> = () => {
  const {getWordCountData, isInitialized, isLoading} = useDatabase();
  const [wordCounts, setWordCounts] = useState<WordCountData[]>([]);
  const [topX, setTopX] = useState<number>(10);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>({type: 'today'});
  const [filters, setFilters] = useState<AdditionalFilters>({
    source: 'all',
  });
  const [showTimeRangeModal, setShowTimeRangeModal] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [timeStart, setTimeStart] = useState('07:00');
  const [timeEnd, setTimeEnd] = useState('08:00');

  // Track when this metric component is viewed
  useEffect(() => {
    const mixpanel = new Mixpanel('48186fefd3c06e4f4b0c4ad87d1555d2', true);
    mixpanel.track('WordCountMetric Viewed', {
      MetricKey: 'metric1',
    });
  }, []);

  // Days of week state
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  // Days of week labels
  const daysOfWeek = [
    {label: 'Sun', value: 0},
    {label: 'Mon', value: 1},
    {label: 'Tue', value: 2},
    {label: 'Wed', value: 3},
    {label: 'Thu', value: 4},
    {label: 'Fri', value: 5},
    {label: 'Sat', value: 6},
  ];

  // Sync selected days and time filters when modal opens or filters change
  useEffect(() => {
    if (filters.daysOfWeek) {
      setSelectedDays(filters.daysOfWeek);
    } else {
      setSelectedDays([]);
    }
    if (filters.timeOfDayStart) {
      setTimeStart(filters.timeOfDayStart);
    }
    if (filters.timeOfDayEnd) {
      setTimeEnd(filters.timeOfDayEnd);
    }
  }, [filters.daysOfWeek, filters.timeOfDayStart, filters.timeOfDayEnd]);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!isInitialized || isLoading) return;

      try {
        const filters = buildFilters();
        const data = await getWordCountData(filters);
        setWordCounts(data.slice(0, topX));
      } catch (error) {
        // Fallback to empty data on error
        setWordCounts([]);
      }
    };

    loadData();
  }, [topX, timeFilter, filters, isInitialized, isLoading]);

  const buildFilters = () => {
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    switch (timeFilter.type) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
        );
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
      case 'dateRange':
        startDate = timeFilter.startDate;
        endDate = timeFilter.endDate;
        break;
    }

    // Map UI source values to database values
    let dbSource: 'Home' | 'Convo' | undefined = undefined;
    if (filters.source === 'AI Only') {
      dbSource = 'Convo';
    } else if (filters.source === 'Classic Board') {
      dbSource = 'Home';
    }

    return {
      startDate,
      endDate,
      source: dbSource,
      daysOfWeek: filters.daysOfWeek,
      timeOfDayStart: filters.timeOfDayStart,
      timeOfDayEnd: filters.timeOfDayEnd,
      limit: topX,
    };
  };

  const handleTimeFilterChange = (type: TimeFilter['type']) => {
    setTimeFilter({type});
  };

  const handleDateRangeSubmit = () => {
    // Parse dates and set filter
    // TODO: Add date validation
    if (dateRangeStart && dateRangeEnd) {
      setTimeFilter({
        type: 'dateRange',
        startDate: new Date(dateRangeStart),
        endDate: new Date(dateRangeEnd),
      });
      setShowTimeRangeModal(false);
    }
  };

  const handleTimeOfDaySubmit = () => {
    setFilters({
      ...filters,
      timeOfDayStart: timeStart,
      timeOfDayEnd: timeEnd,
    });
    setShowFiltersModal(false);
  };

  const toggleDayOfWeek = (dayValue: number) => {
    setSelectedDays(prev => {
      if (prev.includes(dayValue)) {
        return prev.filter(d => d !== dayValue);
      } else {
        return [...prev, dayValue];
      }
    });
  };

  const applyDayOfWeekFilter = () => {
    setFilters({
      ...filters,
      daysOfWeek: selectedDays.length > 0 ? selectedDays : undefined,
    });
    setShowFiltersModal(false);
  };

  const clearFilters = () => {
    setFilters({source: 'all'});
    setSelectedDays([]);
    setTimeStart('07:00');
    setTimeEnd('08:00');
  };

  const getTimeFilterLabel = () => {
    switch (timeFilter.type) {
      case 'today':
        return 'Today';
      case 'thisWeek':
        return 'This Week';
      case 'thisMonth':
        return 'This Month';
      case 'dateRange':
        return `${timeFilter.startDate?.toLocaleDateString() || 'Start'} - ${
          timeFilter.endDate?.toLocaleDateString() || 'End'
        }`;
      default:
        return 'Today';
    }
  };

  const hasActiveFilters = () => {
    return (
      filters.timeOfDayStart ||
      filters.daysOfWeek?.length ||
      filters.source !== 'all'
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={true}>
        {/* Time Frame Filter Section */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Explanation:</Text>
          <View style={styles.timeFilterButtons}>
            <Text>
              {' '}
              This view gives a detailed analysis of the different utterances
              used. It includes both AI and Classic Board utterances.
            </Text>
          </View>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterLabel}>Time Frame & Filters:</Text>
            {hasActiveFilters() && (
              <TouchableOpacity onPress={clearFilters}>
                <Text style={styles.clearFiltersText}>Clear Filters</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.sideBySideFilters}>
            {/* Time Frame Column */}
            <View style={styles.filterColumn}>
              <Text style={styles.filterLabelSmall}>Time Frame:</Text>
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
                      timeFilter.type === 'today' &&
                        styles.filterButtonTextActive,
                    ]}>
                    Today
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
                      timeFilter.type === 'thisWeek' &&
                        styles.filterButtonTextActive,
                    ]}>
                    This Week
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filterButton,
                    timeFilter.type === 'thisMonth' &&
                      styles.filterButtonActive,
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
              <Text style={styles.currentFilterText}>
                {getTimeFilterLabel()}
              </Text>
            </View>

            {/* Additional Filters Column */}
            <View style={styles.filterColumn}>
              <Text style={styles.filterLabelSmall}>Additional Filters:</Text>
              <TouchableOpacity
                style={styles.filtersButton}
                onPress={() => setShowFiltersModal(true)}>
                <Text style={styles.filtersButtonText}>
                  {hasActiveFilters() ? 'Filters Applied' : 'Add Filters'}
                </Text>
                <Text style={styles.linkArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Source and Show Top Selector */}
        <View style={styles.filterSection}>
          <View style={styles.combinedFiltersRow}>
            {/* Source Filter */}
            <View style={styles.sourceFilterInline}>
              <Text style={styles.filterLabelInline}>Source:</Text>
              <View style={styles.sourceButtons}>
                <TouchableOpacity
                  style={[
                    styles.sourceButton,
                    filters.source === 'all' && styles.sourceButtonActive,
                  ]}
                  onPress={() => setFilters({...filters, source: 'all'})}>
                  <Text
                    style={[
                      styles.sourceButtonText,
                      filters.source === 'all' && styles.sourceButtonTextActive,
                    ]}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sourceButton,
                    filters.source === 'AI Only' && styles.sourceButtonActive,
                  ]}
                  onPress={() => setFilters({...filters, source: 'AI Only'})}>
                  <Text
                    style={[
                      styles.sourceButtonText,
                      filters.source === 'AI Only' &&
                        styles.sourceButtonTextActive,
                    ]}>
                    AI Only
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sourceButton,
                    filters.source === 'Classic Board' &&
                      styles.sourceButtonActive,
                  ]}
                  onPress={() =>
                    setFilters({...filters, source: 'Classic Board'})
                  }>
                  <Text
                    style={[
                      styles.sourceButtonText,
                      filters.source === 'Classic Board' &&
                        styles.sourceButtonTextActive,
                    ]}>
                    Classic Board
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Top X Selector */}
            <View style={styles.topXFilterInline}>
              <Text style={styles.filterLabelInline}>Show Top:</Text>
              <View style={styles.topXButtons}>
                {[5, 10, 20, 50].map(num => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.topXButton,
                      topX === num && styles.topXButtonActive,
                    ]}
                    onPress={() => setTopX(num)}>
                    <Text
                      style={[
                        styles.topXButtonText,
                        topX === num && styles.topXButtonTextActive,
                      ]}>
                      {num}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Table */}
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.wordColumn]}>
              Words
            </Text>
            <Text style={[styles.tableHeaderText, styles.usageColumn]}>
              Usage Count
            </Text>
          </View>
          <View style={styles.tableBody}>
            {wordCounts.length > 0 ? (
              wordCounts.map((item, index) => (
                <View
                  key={index}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 && styles.tableRowEven,
                  ]}>
                  <Text style={[styles.tableCell, styles.wordColumn]}>
                    {item.word}
                  </Text>
                  <Text style={[styles.tableCell, styles.usageColumn]}>
                    {item.count}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No data available</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Date Range Modal */}
      <Modal
        visible={showTimeRangeModal}
        transparent={true}
        animationType="slide"
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={() => setShowTimeRangeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Date Range</Text>
            <Text style={styles.modalLabel}>Start Date (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.modalInput}
              value={dateRangeStart}
              onChangeText={setDateRangeStart}
              placeholder="2024-01-01"
            />
            <Text style={styles.modalLabel}>End Date (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.modalInput}
              value={dateRangeEnd}
              onChangeText={setDateRangeEnd}
              placeholder="2024-01-31"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowTimeRangeModal(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSubmit]}
                onPress={handleDateRangeSubmit}>
                <Text
                  style={[
                    styles.modalButtonText,
                    styles.modalButtonTextSubmit,
                  ]}>
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Additional Filters Modal */}
      <Modal
        visible={showFiltersModal}
        transparent={true}
        animationType="slide"
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={() => setShowFiltersModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalTitle}>Additional Filters</Text>

            {/* Time of Day Filter */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Time of Day (HH:mm):</Text>
              <View style={styles.timeInputRow}>
                <TextInput
                  style={[styles.modalInput, styles.timeInput]}
                  value={timeStart}
                  onChangeText={setTimeStart}
                  placeholder="07:00"
                />
                <Text style={styles.timeSeparator}>to</Text>
                <TextInput
                  style={[styles.modalInput, styles.timeInput]}
                  value={timeEnd}
                  onChangeText={setTimeEnd}
                  placeholder="08:00"
                />
                <TouchableOpacity
                  style={styles.applyTimeButton}
                  onPress={handleTimeOfDaySubmit}>
                  <Text style={styles.applyTimeButtonText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Day of Week Filter */}
            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Day of Week:</Text>
              <View style={styles.daysOfWeekContainer}>
                {daysOfWeek.map(day => (
                  <TouchableOpacity
                    key={day.value}
                    style={[
                      styles.dayButton,
                      selectedDays.includes(day.value) &&
                        styles.dayButtonActive,
                    ]}
                    onPress={() => toggleDayOfWeek(day.value)}>
                    <Text
                      style={[
                        styles.dayButtonText,
                        selectedDays.includes(day.value) &&
                          styles.dayButtonTextActive,
                      ]}>
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.applyDayButton}
                onPress={applyDayOfWeekFilter}>
                <Text style={styles.applyDayButtonText}>Apply Days</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowFiltersModal(false)}>
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fe',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 20,
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
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearFiltersText: {
    fontSize: 14,
    color: '#8E24AA',
    fontWeight: '600',
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
  sideBySideFilters: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  filterColumn: {
    flex: 1,
    minWidth: 0,
  },
  filterLabelSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fe',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    marginBottom: 12,
  },
  filtersButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  linkArrow: {
    fontSize: 16,
    color: '#8E24AA',
    fontWeight: '500',
  },
  combinedFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  sourceFilterInline: {
    flex: 1,
    minWidth: 200,
  },
  topXFilterInline: {
    flex: 1,
    minWidth: 200,
  },
  filterLabelInline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  sourceFilter: {
    marginTop: 12,
  },
  sourceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sourceButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sourceButtonActive: {
    backgroundColor: '#8E24AA',
    borderColor: '#8E24AA',
  },
  sourceButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  sourceButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  topXButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  topXButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  topXButtonActive: {
    backgroundColor: '#8E24AA',
    borderColor: '#8E24AA',
  },
  topXButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  topXButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  tableContainer: {
    minHeight: 300,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    overflow: 'hidden',
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#8E24AA',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tableHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  wordColumn: {
    width: '70%',
  },
  usageColumn: {
    width: '30%',
  },
  tableBody: {
    // Content will size naturally within the ScrollView
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tableRowEven: {
    backgroundColor: '#f8f9fe',
  },
  tableCell: {
    fontSize: 14,
    color: '#333',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: width * 0.8,
    maxHeight: height * 0.8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  modalInput: {
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonSubmit: {
    backgroundColor: '#8E24AA',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  modalButtonTextSubmit: {
    color: '#fff',
  },
  modalSection: {
    marginBottom: 20,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    flex: 1,
  },
  timeSeparator: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  applyTimeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#8E24AA',
  },
  applyTimeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  daysOfWeekContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  dayButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dayButtonActive: {
    backgroundColor: '#8E24AA',
    borderColor: '#8E24AA',
  },
  dayButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  dayButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  applyDayButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#8E24AA',
    alignSelf: 'flex-start',
  },
  applyDayButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

export default WordCountMetric;
