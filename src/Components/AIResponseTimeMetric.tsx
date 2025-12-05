import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useNavigation} from '@react-navigation/native';
import {useDatabase} from '../contexts/DatabaseContext';
import {Mixpanel} from 'mixpanel-react-native';

const {width, height} = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40;

interface ResponseTimeStats {
  observations: number;
  median: number; // in seconds
  average: number; // in seconds
  p90: number; // in seconds
}

interface DistributionBucket {
  range: string;
  count: number;
}

interface AIResponseTimeMetricProps {}

const AIResponseTimeMetric: React.FC<AIResponseTimeMetricProps> = () => {
  const navigation = useNavigation<any>();
  const {getAIResponseTimeData, isInitialized, isLoading} = useDatabase();
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);
  const [stats, setStats] = useState<ResponseTimeStats>({
    observations: 0,
    median: 0,
    average: 0,
    p90: 0,
  });
  const [distribution, setDistribution] = useState<DistributionBucket[]>([]);
  const [timeFrame, setTimeFrame] = useState('thisWeek');

  // Track section entry
  useEffect(() => {
    mixpanel.track('Metric Detail - Overview of answering questions using AI Section Entered', {
      screen: 'MetricDetail',
      action: 'section_entered',
      metric_key: 'metric2',
      section_name: 'Overview of answering questions using AI',
    });
  }, []);
  const [responseTimeData, setResponseTimeData] = useState<
    {id: number; responseTime: number; timestamp: string}[]
  >([]);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!isInitialized || isLoading) return;

      try {
        const filters = buildFilters();
        const data = await getAIResponseTimeData(filters);
        const formattedData = data.map(item => ({
          id: item.id || 0,
          responseTime: item.timetotap / 1000, // Convert milliseconds to seconds
          timestamp: item.dateof.toISOString(),
        }));
        setResponseTimeData(formattedData);
      } catch (error) {
        console.error('Error loading AI response time data:', error);
        setResponseTimeData([]);
      }
    };

    loadData();
  }, [timeFrame, isInitialized, isLoading]);

  const buildFilters = () => {
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    switch (timeFrame) {
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
      case 'thisWeek':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
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
      default:
        // Default to this week if unknown timeFrame
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    return {
      startDate,
      endDate,
    };
  };

  const timeFrames = [
    {key: 'today', label: 'Today'},
    {key: 'thisWeek', label: 'This Week'},
    {key: 'thisMonth', label: 'This Month'},
  ];

  useEffect(() => {
    calculateStats();
    calculateDistribution();
  }, [responseTimeData]);

  const calculateStats = () => {
    const responseTimes = responseTimeData.map(item => item.responseTime);

    if (responseTimes.length === 0) {
      setStats({observations: 0, median: 0, average: 0, p90: 0});
      return;
    }

    // Sort for median calculation
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);

    // Calculate median
    const mid = Math.floor(sortedTimes.length / 2);
    const median =
      sortedTimes.length % 2 === 0
        ? (sortedTimes[mid - 1] + sortedTimes[mid]) / 2
        : sortedTimes[mid];

    // Calculate average
    const average =
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;

    // Calculate P90 (90th percentile)
    const p90Index = Math.ceil(sortedTimes.length * 0.9) - 1;
    const p90 = sortedTimes[p90Index] || 0;

    setStats({
      observations: responseTimes.length,
      median: Math.round(median * 10) / 10,
      average: Math.round(average * 10) / 10,
      p90: Math.round(p90 * 10) / 10,
    });
  };

  const calculateDistribution = () => {
    const responseTimes = responseTimeData.map(item => item.responseTime);

    const buckets = [
      {range: '0-3s', min: 0, max: 3},
      {range: '3-5s', min: 3, max: 5},
      {range: '5-10s', min: 5, max: 10},
      {range: '10-15s', min: 10, max: 15},
      {range: '15-20s', min: 15, max: 20},
      {range: '20s+', min: 20, max: Infinity},
    ];

    const distribution = buckets.map(bucket => ({
      range: bucket.range,
      count: responseTimes.filter(
        time => time >= bucket.min && time < bucket.max,
      ).length,
    }));

    setDistribution(distribution);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getMaxCount = () => {
    return Math.max(...distribution.map(bucket => bucket.count));
  };

  const renderBarChart = () => {
    const maxCount = getMaxCount();

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Response Time Distribution</Text>
        <View style={styles.chart}>
          {distribution.map((bucket, index) => (
            <View key={index} style={styles.barContainer}>
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    {
                      height:
                        maxCount > 0 ? (bucket.count / maxCount) * 120 : 0,
                      backgroundColor: bucket.count > 0 ? '#8E24AA' : '#e0e0e0',
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{bucket.range}</Text>
              <Text style={styles.barCount}>{bucket.count}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Response Time Analysis</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}>
        {/* Content Header */}
        <View style={styles.contentHeader}>
          <Text style={styles.subtitle}>
            Start: images shown · Stop: any answer tap · Excludes 'More answers'
          </Text>
        </View>

        {/* Filters */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Time Frame:</Text>
          <View style={styles.timeFilterButtons}>
            {timeFrames.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.filterButton,
                  timeFrame === option.key && styles.filterButtonActive,
                ]}
                onPress={() => {
                  mixpanel.track('Metric Detail - Filter Used', {
                    screen: 'MetricDetail',
                    action: 'filter_used',
                    metric_key: 'metric2',
                    filter_type: 'time_frame',
                    filter_value: option.key,
                  });
                  setTimeFrame(option.key);
                }}>
                <Text
                  style={[
                    styles.filterButtonText,
                    timeFrame === option.key && styles.filterButtonTextActive,
                  ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.observations}</Text>
            <Text style={styles.statLabel}>Observations</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatTime(stats.median)}</Text>
            <Text style={styles.statLabel}>Median</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatTime(stats.average)}</Text>
            <Text style={styles.statLabel}>Average</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatTime(stats.p90)}</Text>
            <Text style={styles.statLabel}>P90</Text>
          </View>
        </View>

        {/* Distribution Chart */}
        {renderBarChart()}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: statusBarHeight - 20,
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  backButton: {
    padding: 10,
    marginRight: 10,
  },
  backButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentHeader: {
    padding: 20,
    paddingBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  filterSection: {
    marginBottom: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    marginHorizontal: 20,
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
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    minWidth: width * 0.2,
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8E24AA',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  chartContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 160,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  barWrapper: {
    height: 120,
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  bar: {
    width: 30,
    borderRadius: 4,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  barCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});

export default AIResponseTimeMetric;
