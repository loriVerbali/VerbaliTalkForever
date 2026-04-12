import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ScrollView,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { views } from '../utils/constants';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAppSettings } from '../utils/persistance';
import mixpanel from '../utils/mixpanelInstance';

const { width, height } = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40;

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
}) => (
  <Modal
    animationType="fade"
    transparent={true}
    visible={visible}
    supportedOrientations={['landscape-left', 'landscape-right']}
    onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalDescription}>{description}</Text>
        <TouchableOpacity style={styles.modalButton} onPress={onClose}>
          <Text style={styles.modalButtonText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const ReportsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { preferences } = useAppSettings();


  const {
    isInitialized,
    isLoading,
    getClassicData,
    getWordCountData,
    getAIResponseTimeData,
    getAIResolvedData,
  } = useDatabase();

  // Real data will be loaded from database
  const [snapshots, setSnapshots] = useState<any>({
    metric1: {
      title: 'Total Utterances',
      subtitle: 'Sorted by usage',
      totalUtterances: 0,
      topWords: [],
    },
    metric2: {
      title: 'Overview of answering questions using AI',
      subtitle: `Last 30 days: This view shows how ${preferences.heroName || 'your child'
        } uses AI to answer questions`,
      median: '0s',
      average: '0s',
      observations: 0,
    },
    metric3: {
      title: 'Average time to create a sentence (Classic Board)',
      subtitle: `The average time it took ${preferences.heroName || 'your child'
        } to build a sentence in the last 30 days. (Timing starts at first word tap until Play button is tapped; Max 5 minutes.)`,
      median: '0s',
      recentSentences: [],
    },
    metric4: {
      title: 'Overview of questions answered using AI',
      subtitle: `Last 30 days : This view shows the questions ${preferences.heroName || 'your child'
        } was asked using AI and how many rounds it took to find an answer.`,
      resolvedRound1: 0,
      recentQuestions: [],
    },
  });

  // State for info modals
  const [showObservationsInfo, setShowObservationsInfo] = useState(false);
  const [showMedianInfo, setShowMedianInfo] = useState(false);
  const [showInsightsInfo, setShowInsightsInfo] = useState(false);
  const [showTotalUtterancesInfo, setShowTotalUtterancesInfo] = useState(false);
  const [showClassicBoardInfo, setShowClassicBoardInfo] = useState(false);
  const [showAIResponseTimeInfo, setShowAIResponseTimeInfo] = useState(false);
  const [showAIResolvedInfo, setShowAIResolvedInfo] = useState(false);

  // Load Total Utterances snapshot from DB (last 30 days)
  useEffect(() => {
    const loadUtterancesSnapshot = async () => {
      if (!isInitialized || isLoading) return;

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      try {
        const data = await getWordCountData({ startDate, endDate });
        if (!data || data.length === 0) {
          setSnapshots((prev: any) => ({
            ...prev,
            metric1: {
              ...prev.metric1,
              totalUtterances: 0,
              topWords: [],
            },
          }));
          return;
        }

        // Calculate total utterances count
        const totalUtterances = data.reduce((sum, item) => sum + item.count, 0);

        // Get top 5 words
        const topWords = data.slice(0, 5);

        setSnapshots((prev: any) => ({
          ...prev,
          metric1: {
            ...prev.metric1,
            totalUtterances,
            topWords,
          },
        }));
      } catch (e) {
        // On error, keep empty snapshot
      }
    };

    loadUtterancesSnapshot();
  }, [isInitialized, isLoading, getWordCountData]);

  // Load Classic Board snapshot from DB (last 30 days)
  useEffect(() => {
    const loadClassicSnapshot = async () => {
      if (!isInitialized || isLoading) return;

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      try {
        const data = await getClassicData({ startDate, endDate });
        if (!data || data.length === 0) {
          setSnapshots((prev: any) => ({
            ...prev,
            metric3: {
              ...prev.metric3,
              median: '0s',
              recentSentences: [],
            },
          }));
          return;
        }

        // Compute median timeToBuild (seconds)
        const times = data.map(d => d.timetobuild).sort((a, b) => a - b);
        const mid = Math.floor(times.length / 2);
        const medianSec =
          times.length % 2 === 0
            ? (times[mid - 1] + times[mid]) / 2
            : times[mid];

        const formatTime = (seconds: number) => {
          if (seconds >= 300) return 'Timeout (>5min)';
          if (seconds < 60) return `${seconds}s`;
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          return `${m}m ${s}s`;
        };

        const recentSentences = data.slice(0, 2).map(d => ({
          sentence: d.sentence,
          words: d.wordcount,
          time: formatTime(d.timetobuild),
        }));

        setSnapshots((prev: any) => ({
          ...prev,
          metric3: {
            ...prev.metric3,
            median: formatTime(Math.round(medianSec)),
            recentSentences,
          },
        }));
      } catch (e) {
        // On error, keep empty snapshot
      }
    };

    loadClassicSnapshot();
  }, [isInitialized, isLoading, getClassicData]);

  // Load AI Response Time snapshot from DB (last 30 days)
  useEffect(() => {
    const loadAIResponseTimeSnapshot = async () => {
      if (!isInitialized || isLoading) return;

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      try {
        const data = await getAIResponseTimeData({ startDate, endDate });
        if (!data || data.length === 0) {
          setSnapshots((prev: any) => ({
            ...prev,
            metric2: {
              ...prev.metric2,
              median: '0s',
              average: '0s',
              observations: 0,
            },
          }));
          return;
        }

        // Calculate statistics
        const times = data.map(d => d.timetotap).sort((a, b) => a - b);
        const observations = times.length;

        // Calculate median
        const mid = Math.floor(times.length / 2);
        const medianMs =
          times.length % 2 === 0
            ? (times[mid - 1] + times[mid]) / 2
            : times[mid];

        // Calculate average
        const averageMs =
          times.reduce((sum, time) => sum + time, 0) / times.length;

        // Calculate P90
        const p90Index = Math.floor(times.length * 0.9);
        const p90Ms = times[p90Index] || 0;

        const formatTime = (value: number) => {
          // Check if the value looks like it's already in seconds (reasonable range for response times)
          // If it's > 1000, assume it's milliseconds, otherwise assume it's already seconds
          const totalSeconds =
            value > 1000 ? Math.round(value / 1000) : Math.round(value);

          if (totalSeconds < 60) return `${totalSeconds}s`;
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          return `${minutes}m ${seconds}s`;
        };

        setSnapshots((prev: any) => ({
          ...prev,
          metric2: {
            ...prev.metric2,
            median: formatTime(medianMs),
            average: formatTime(averageMs),
            p90: formatTime(p90Ms),
            observations,
          },
        }));
      } catch (e) {
        // On error, keep empty snapshot

      }
    };

    loadAIResponseTimeSnapshot();
  }, [isInitialized, isLoading, getAIResponseTimeData]);

  // Load AI Resolved snapshot from DB (last 30 days)
  useEffect(() => {
    const loadAIResolvedSnapshot = async () => {
      if (!isInitialized || isLoading) return;

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      try {
        const data = await getAIResolvedData({ startDate, endDate });
        if (!data || data.length === 0) {
          setSnapshots((prev: any) => ({
            ...prev,
            metric4: {
              ...prev.metric4,
              resolvedRound1: 0,
              recentQuestions: [],
            },
          }));
          return;
        }

        // Count resolved questions (those with at least one picked answer)
        const resolvedCount = data.filter(
          item =>
            item.round1_picked || item.round2_picked || item.round3_picked,
        ).length;

        // Get recent questions (last 5)
        const recentQuestions = data.slice(0, 5).map(item => ({
          question: item.question,
          date: item.dateof,
          rounds: {
            round1: item.round1_picked ? '✓' : '-',
            round2: item.round2_picked ? '✓' : '-',
            round3: item.round3_picked ? '✓' : '-',
          },
        }));

        setSnapshots((prev: any) => ({
          ...prev,
          metric4: {
            ...prev.metric4,
            resolvedRound1: resolvedCount,
            recentQuestions,
          },
        }));
      } catch (e) {
        // On error, keep empty snapshot

      }
    };

    loadAIResolvedSnapshot();
  }, [isInitialized, isLoading, getAIResolvedData]);

  const metrics: any[] = [
    { key: 'metric1', ...snapshots.metric1 }, // Total utterances
    { key: 'metric3', ...snapshots.metric3 }, // Classic Board
    { key: 'metric2', ...snapshots.metric2 }, // AI Response Time
    { key: 'metric4', ...snapshots.metric4 }, // AI Resolved
  ];

  const handleViewDetails = (metricKey: string, title: string) => {
    // Track which detailed report was accessed
    mixpanel.track('Report Detail Viewed', {
      MetricKey: metricKey,
      Title: title,
    });

    navigation.navigate(views.METRIC_DETAIL, {
      metricKey,
      title,
    });
  };

  const renderSnapshotCard = (metric: any) => {
    return (
      <View key={metric.key} style={styles.snapshotCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardTitle}>{metric.title}</Text>
            <Text style={styles.cardSubtitle}>{metric.subtitle}</Text>
          </View>
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => handleViewDetails(metric.key, metric.title)}>
            <Text style={styles.detailsButtonText}>View details →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardContent}>
          {metric.key === 'metric1' && (
            <View style={styles.topWordsList}>
              {metric.topWords && metric.topWords.length > 0 ? (
                metric.topWords.slice(0, 5).map((item: any, index: number) => (
                  <View key={index} style={styles.wordRow}>
                    <Text style={styles.wordRank}>{index + 1}</Text>
                    <Text style={styles.wordText}>{item.word}</Text>
                    <Text style={styles.wordCount}>{item.count}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.noDataContainer}>
                  <Text style={styles.noDataText}>No data yet</Text>
                </View>
              )}
            </View>
          )}

          {metric.key === 'metric2' && (
            <View style={styles.metric2Content}>
              {metric.observations > 0 ? (
                <>
                  <View style={styles.statBox}>
                    <View style={styles.labelRow}>
                      <Text style={styles.statLabel}>Observations</Text>
                      <TouchableOpacity
                        onPress={() => setShowObservationsInfo(true)}
                        style={styles.infoButton}>
                        <Text style={styles.infoIcon}>?</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.statValue}>{metric.observations}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <View style={styles.labelRow}>
                      <Text style={styles.statLabel}>
                        Median time to answer
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowMedianInfo(true)}
                        style={styles.infoButton}>
                        <Text style={styles.infoIcon}>?</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.statValue}>{metric.median}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Average time to answer</Text>
                    <Text style={styles.statValue}>{metric.average}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <View style={styles.labelRow}>
                      <Text style={styles.statLabel}>Insights</Text>
                      <TouchableOpacity
                        onPress={() => setShowInsightsInfo(true)}
                        style={styles.infoButton}>
                        <Text style={styles.infoIcon}>?</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.statValue}>
                      {metric.p90 || 'No data yet'}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.noDataContainer}>
                  <Text style={styles.noDataText}>No data yet</Text>
                </View>
              )}
            </View>
          )}

          {metric.key === 'metric3' && (
            <View style={styles.metric3Content}>
              {metric.recentSentences && metric.recentSentences.length > 0 ? (
                <>
                  <View style={styles.medianDisplay}>
                    <Text style={styles.medianLabel}>Median</Text>
                    <Text style={styles.medianValue}>{metric.median}</Text>
                  </View>
                  <View style={styles.recentSentences}>
                    {metric.recentSentences
                      .slice(0, 2)
                      .map((item: any, index: number) => (
                        <View key={index} style={styles.sentenceRow}>
                          <Text style={styles.sentenceText} numberOfLines={1}>
                            {item.sentence}
                          </Text>
                          <Text style={styles.sentenceMeta}>
                            {item.words} words · {item.time}
                          </Text>
                        </View>
                      ))}
                  </View>
                </>
              ) : (
                <View style={styles.noDataContainer}>
                  <Text style={styles.noDataText}>No data yet</Text>
                </View>
              )}
            </View>
          )}

          {metric.key === 'metric4' && (
            <View style={styles.metric4Content}>
              {metric.recentQuestions && metric.recentQuestions.length > 0 ? (
                <>
                  <View style={styles.resolvedBox}>
                    <Text style={styles.resolvedLabel}>Resolved</Text>
                  </View>
                  <View style={styles.recentQuestions}>
                    {metric.recentQuestions
                      .slice(0, 2)
                      .map((item: any, index: number) => {
                        const roundStr =
                          `${item.rounds.round1} ${item.rounds.round2} ${item.rounds.round3}`.trim();
                        const roundsPicked = [
                          item.rounds.round1,
                          item.rounds.round2,
                          item.rounds.round3,
                        ].filter((r: string) => r === '✓').length;
                        return (
                          <View key={index} style={styles.questionRow}>
                            <Text style={styles.questionText} numberOfLines={1}>
                              {item.question}
                            </Text>
                            <Text style={styles.questionMeta}>
                              {roundStr} • {roundsPicked}{' '}
                              {roundsPicked === 1 ? 'round' : 'rounds'}
                            </Text>
                          </View>
                        );
                      })}
                  </View>
                </>
              ) : (
                <View style={styles.noDataContainer}>
                  <Text style={styles.noDataText}>No data yet</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: '#f8f9fe' }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            navigation.navigate(views.SETTINGS, { fromReports: true } as any)
          }>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Dashboard Snapshot Card */}
        <View style={styles.dashboardSnapshotCard}>
          <View style={styles.dashboardSnapshotHeader}>
            <Text style={styles.dashboardSnapshotTitle}>
              Dashboard Snapshot
            </Text>
            <Text style={styles.dashboardSnapshotSubtitle}>Last 30 days</Text>
          </View>
          <View style={styles.quickAccessRow}>
            {metrics.map((metric, index) => {
              const renderCardContent = () => {
                switch (metric.key) {
                  case 'metric1':
                    return (
                      <>
                        <Text style={styles.quickAccessCardValue}>
                          {metric.totalUtterances > 0
                            ? metric.totalUtterances.toLocaleString()
                            : 'No data yet'}
                        </Text>
                        <Text style={styles.quickAccessCardLabel}>
                          Total Utterances
                        </Text>
                        <Text style={styles.quickAccessCardPeriod}>
                          Last 30 days
                        </Text>
                      </>
                    );
                  case 'metric3':
                    return (
                      <>
                        <Text style={styles.quickAccessCardValue}>
                          {metric.median !== '0s'
                            ? metric.median
                            : 'No data yet'}
                        </Text>
                        <Text style={styles.quickAccessCardLabel}>
                          Classic Words Board
                        </Text>
                        <Text style={styles.quickAccessCardPeriod}>
                          Average time to build a sentence
                        </Text>
                      </>
                    );
                  case 'metric2':
                    return (
                      <>
                        <Text style={styles.quickAccessCardValue}>
                          {metric.average !== '0s'
                            ? metric.average
                            : 'No data yet'}
                        </Text>
                        <Text style={styles.quickAccessCardLabel}>
                          AI - Time to answer a question
                        </Text>
                        <Text style={styles.quickAccessCardPeriod}>
                          Average
                        </Text>
                      </>
                    );
                  case 'metric4':
                    return (
                      <>
                        <Text style={styles.quickAccessCardValue}>
                          {metric.resolvedRound1 > 0
                            ? metric.resolvedRound1
                            : 'No data yet'}
                        </Text>
                        <Text style={styles.quickAccessCardLabel}>
                          AI — Questions answered
                        </Text>
                        <Text style={styles.quickAccessCardPeriod}>
                          Total Questions Answered
                        </Text>
                      </>
                    );
                  default:
                    return null;
                }
              };

              // Determine border color based on position
              const borderColor = index < 2 ? '#E1BEE7' : '#B3E5FC'; // Light purple for 1,2; Light blue for 3,4

              // Get info button handler based on metric key
              const getInfoHandler = () => {
                switch (metric.key) {
                  case 'metric1':
                    return () => setShowTotalUtterancesInfo(true);
                  case 'metric3':
                    return () => setShowClassicBoardInfo(true);
                  case 'metric2':
                    return () => setShowAIResponseTimeInfo(true);
                  case 'metric4':
                    return () => setShowAIResolvedInfo(true);
                  default:
                    return () => { };
                }
              };

              return (
                <View key={metric.key} style={[styles.quickAccessCardWrapper]}>
                  <TouchableOpacity
                    style={[styles.quickAccessCard, { borderColor: borderColor }]}
                    onPress={() => handleViewDetails(metric.key, metric.title)}>
                    {renderCardContent()}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={getInfoHandler()}
                    style={styles.quickAccessInfoButton}>
                    <Text style={styles.infoIcon}>?</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {/* Snapshot Cards */}
        {metrics.map((metric, index) => {
          // Determine border color based on position
          const borderColor = index < 2 ? '#E1BEE7' : '#B3E5FC'; // Light purple for 1,2; Light blue for 3,4

          return (
            <View
              key={metric.key}
              style={[styles.snapshotCard, { borderColor: borderColor }]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardTitle}>{metric.title}</Text>
                  <Text style={styles.cardSubtitle}>{metric.subtitle}</Text>
                </View>
                <TouchableOpacity
                  style={styles.detailsButton}
                  onPress={() => handleViewDetails(metric.key, metric.title)}>
                  <Text style={styles.detailsButtonText}>View details →</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.cardContent}>
                {metric.key === 'metric1' && (
                  <View style={styles.topWordsList}>
                    {metric.topWords
                      ?.slice(0, 5)
                      .map((item: any, index: number) => (
                        <View key={index} style={styles.wordRow}>
                          <Text style={styles.wordRank}>{index + 1}</Text>
                          <Text style={styles.wordText}>{item.word}</Text>
                          <Text style={styles.wordCount}>{item.count}</Text>
                        </View>
                      ))}
                  </View>
                )}

                {metric.key === 'metric2' && (
                  <View style={styles.metric2Content}>
                    <View style={styles.statBox}>
                      <View style={styles.labelRow}>
                        <Text style={styles.statLabel}>Observations</Text>
                        <TouchableOpacity
                          onPress={() => setShowObservationsInfo(true)}
                          style={styles.infoButton}>
                          <Text style={styles.infoIcon}>?</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.statValue}>
                        {metric.observations}
                      </Text>
                    </View>
                    <View style={styles.statBox}>
                      <View style={styles.labelRow}>
                        <Text style={styles.statLabel}>
                          Median time to answer
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowMedianInfo(true)}
                          style={styles.infoButton}>
                          <Text style={styles.infoIcon}>?</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.statValue}>{metric.median}</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>
                        Average time to answer
                      </Text>
                      <Text style={styles.statValue}>
                        {metric.average !== '0s'
                          ? metric.average
                          : 'No data yet'}
                      </Text>
                    </View>
                    <View style={styles.statBox}>
                      <View style={styles.labelRow}>
                        <Text style={styles.statLabel}>Insights</Text>
                        <TouchableOpacity
                          onPress={() => setShowInsightsInfo(true)}
                          style={styles.infoButton}>
                          <Text style={styles.infoIcon}>?</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.statValue}>
                        {metric.p90 || 'No data yet'}
                      </Text>
                    </View>
                  </View>
                )}

                {metric.key === 'metric3' && (
                  <View style={styles.metric3Content}>
                    <View style={styles.medianDisplay}>
                      <Text style={styles.medianLabel}>Median</Text>
                      <Text style={styles.medianValue}>{metric.median}</Text>
                    </View>
                    <View style={styles.recentSentences}>
                      {metric.recentSentences
                        ?.slice(0, 2)
                        .map((item: any, index: number) => (
                          <View key={index} style={styles.sentenceRow}>
                            <Text style={styles.sentenceText} numberOfLines={1}>
                              {item.sentence}
                            </Text>
                            <Text style={styles.sentenceMeta}>
                              {item.words} words · {item.time}
                            </Text>
                          </View>
                        ))}
                    </View>
                  </View>
                )}

                {metric.key === 'metric4' && (
                  <View style={styles.metric4Content}>
                    <View style={styles.resolvedBox}>
                      <Text style={styles.resolvedLabel}>Resolved</Text>
                      <Text style={styles.resolvedValue}>
                        {metric.resolvedRound1}
                      </Text>
                    </View>
                    <View style={styles.recentQuestions}>
                      {metric.recentQuestions
                        ?.slice(0, 2)
                        .map((item: any, index: number) => {
                          const roundStr =
                            `${item.rounds.round1} ${item.rounds.round2} ${item.rounds.round3}`.trim();
                          const roundsPicked = [
                            item.rounds.round1,
                            item.rounds.round2,
                            item.rounds.round3,
                          ].filter((r: string) => r === '✓').length;
                          return (
                            <View key={index} style={styles.questionRow}>
                              <Text
                                style={styles.questionText}
                                numberOfLines={1}>
                                {item.question}
                              </Text>
                              <Text style={styles.questionMeta}>
                                {roundStr}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Info Modals */}
      <InfoModal
        visible={showObservationsInfo}
        onClose={() => setShowObservationsInfo(false)}
        title="Total number of questions answered"
        description="The total number of questions answered using AI."
      />

      <InfoModal
        visible={showMedianInfo}
        onClose={() => setShowMedianInfo(false)}
        title="Median time to answer"
        description={`The median time it took ${preferences.heroName || 'your child'
          } to answer questions using AI.`}
      />

      <InfoModal
        visible={showInsightsInfo}
        onClose={() => setShowInsightsInfo(false)}
        title="Insights"
        description={`In the last 30 days, 90% of questions were answered in under ${snapshots.metric2.p90 || 'N/A'
          } using AI.`}
      />

      {/* Dashboard Snapshot Info Modals */}
      <InfoModal
        visible={showTotalUtterancesInfo}
        onClose={() => setShowTotalUtterancesInfo(false)}
        title="Total Utterances"
        description="Which words were tapped on from anywhere in the app."
      />

      <InfoModal
        visible={showClassicBoardInfo}
        onClose={() => setShowClassicBoardInfo(false)}
        title="Classic Words Board"
        description="The average time from first word tap to Play on the Classic word Board (we stop if there's no tap for 5 minutes)."
      />

      <InfoModal
        visible={showAIResponseTimeInfo}
        onClose={() => setShowAIResponseTimeInfo(false)}
        title="AI Response Time"
        description={`The average time it takes ${preferences.heroName || 'your child'
          } to answer a question using AI.`}
      />

      <InfoModal
        visible={showAIResolvedInfo}
        onClose={() => setShowAIResolvedInfo(false)}
        title="AI Resolved"
        description={`How many questions ${preferences.heroName || 'your child'
          } answered using AI.`}
      />
    </View>
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
    padding: 20,
    paddingBottom: 40,
  },
  dashboardSnapshotCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 2,
    borderColor: '#E1BEE7',
  },
  dashboardSnapshotHeader: {
    marginBottom: 20,
  },
  dashboardSnapshotTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  dashboardSnapshotSubtitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickAccessCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 2,
    minHeight: height * 0.14,
  },
  quickAccessCardValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#8E24AA',
    marginBottom: 4,
    textAlign: 'center',
  },
  quickAccessCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  quickAccessCardPeriod: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  quickAccessCardWrapper: {
    flex: 1,
    position: 'relative',
  },
  quickAccessInfoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8E24AA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  snapshotCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  detailsButton: {
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  detailsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cardContent: {
    marginTop: 8,
  },
  // Metric 1 - Top Words
  topWordsList: {
    gap: 8,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  wordRank: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    width: 30,
  },
  wordText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  wordCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E24AA',
    textAlign: 'right',
    width: 60,
  },
  // Metric 2 - AI Response Time
  metric2Content: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBox: {
    backgroundColor: '#f8f9fe',
    padding: 16,
    borderRadius: 8,
    minWidth: width * 0.2,
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  infoButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#8E24AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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
  modalDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
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
  // Metric 3 - Classic Board
  metric3Content: {
    flexDirection: 'row',
    gap: 20,
  },
  medianDisplay: {
    backgroundColor: '#f8f9fe',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: width * 0.25,
  },
  medianLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  medianValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8E24AA',
  },
  recentSentences: {
    flex: 1,
    gap: 12,
  },
  sentenceRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sentenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  sentenceMeta: {
    fontSize: 12,
    color: '#666',
  },
  // Metric 4 - AI Resolved
  metric4Content: {
    flexDirection: 'row',
    gap: 20,
  },
  resolvedBox: {
    backgroundColor: '#f8f9fe',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: width * 0.25,
  },
  resolvedLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  resolvedValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8E24AA',
  },
  recentQuestions: {
    flex: 1,
    gap: 12,
  },
  questionRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  questionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  questionMeta: {
    fontSize: 12,
    color: '#666',
  },
  noDataContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 16,
    color: '#8E24AA',
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default ReportsScreen;
