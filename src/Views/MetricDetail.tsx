import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useRoute, useNavigation} from '@react-navigation/native';
import WordCountMetric from '../Components/WordCountMetric';
import AIResponseTimeMetric from '../Components/AIResponseTimeMetric';
import QALogMetric from '../Components/QALogMetric';
import ClassicBoardMetric from '../Components/ClassicBoardMetric';
import {Mixpanel} from 'mixpanel-react-native';

const {height} = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40;

const MetricDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const title = route.params?.title ?? 'Metric';
  const metricKey = route.params?.metricKey ?? '';
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);

  // Track section entry based on metric key
  useEffect(() => {
    const sectionNames: {[key: string]: string} = {
      metric1: 'Total Utterances',
      metric2: 'Overview of answering questions using AI',
      metric3: 'Average time to create a sentence',
      metric4: 'Overview of questions answered using AI',
    };

    mixpanel.track('Metric Detail - Section Entered', {
      screen: 'MetricDetail',
      action: 'section_entered',
      metric_key: metricKey,
      section_name: sectionNames[metricKey] || 'Unknown',
    });
  }, [metricKey]);

  const renderMetricComponent = () => {
    switch (metricKey) {
      case 'metric1':
        return <WordCountMetric />;
      case 'metric2':
        return <AIResponseTimeMetric />;
      case 'metric3':
        return <ClassicBoardMetric />;
      case 'metric4':
        return <QALogMetric />;
      default:
        return (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholder}>
              Select a metric to view details.
            </Text>
          </View>
        );
    }
  };

  return (
    <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.content}>{renderMetricComponent()}</View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fe',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: statusBarHeight - 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 10,
  },
  backButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  placeholder: {
    fontSize: height * 0.02,
    color: '#666',
    textAlign: 'center',
  },
});

export default MetricDetailScreen;
