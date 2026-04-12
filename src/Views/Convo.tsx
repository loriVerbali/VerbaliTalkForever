import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import SentenceBuilderGrid from '../Components/SentenceBuilder/SentenceBuilderGrid';
import { useDatabase } from '../contexts/DatabaseContext';
import mixpanel from '../utils/mixpanelInstance';
import { GridConfigKey } from '../types/sentenceBuilder';

const Convo = () => {
  const { addClassicEntry } = useDatabase();

  const [sentenceStartTime, setSentenceStartTime] = useState<number | null>(
    null,
  );
  const [totalWordsAdded, setTotalWordsAdded] = useState(0);
  const [currentSentenceTokens, setCurrentSentenceTokens] = useState<string[]>(
    [],
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start timer when first word is added
  const handleFirstWordAdded = useCallback(() => {
    if (sentenceStartTime === null) {
      const startTime = Date.now();
      setSentenceStartTime(startTime);

      // Set timeout for 4 minutes (240 seconds)
      timerRef.current = setTimeout(() => {
        // Timeout reached - reset timer
        setSentenceStartTime(null);
        setTotalWordsAdded(0);
        setCurrentSentenceTokens([]);
      }, 4 * 60 * 1000); // 4 minutes in milliseconds
    }
  }, [sentenceStartTime]);

  // Track word additions and deletions
  const handleWordAdded = useCallback(
    (nodeId: string) => {
      setTotalWordsAdded(prev => prev + 1);
      setCurrentSentenceTokens(prev => [...prev, nodeId]);
      handleFirstWordAdded();
    },
    [handleFirstWordAdded],
  );

  const handleWordRemoved = useCallback((nodeId: string, index: number) => {
    setCurrentSentenceTokens(prev => {
      const newState = [...prev];
      newState.splice(index, 1);
      return newState;
    });
    // Note: We don't decrease totalWordsAdded to track deleted words
  }, []);

  // Handle sentence play - save to database
  const handleSentencePlayed = useCallback(
    async (sentenceTokens: string[], nodes: any[]) => {
      if (sentenceStartTime === null) return;

      // Track play button tap
      mixpanel.track('Convo Play Tapped');

      try {
        // Calculate time taken
        const endTime = Date.now();
        const timeToBuild = Math.round((endTime - sentenceStartTime) / 1000); // Convert to seconds

        // Build sentence text
        const sentenceText = sentenceTokens
          .map(nodeId => {
            const node = nodes.find(n => n.id === nodeId);
            return node ? node.ttsText || node.title : '';
          })
          .filter(text => text.trim() !== '')
          .join(' ');

        // Count words in final sentence
        const finalWordCount = sentenceText
          .split(' ')
          .filter(word => word.trim() !== '').length;

        // Save to database
        await addClassicEntry({
          sentence: sentenceText,
          wordcount: totalWordsAdded, // Include deleted words
          dateof: new Date(),
          timetobuild: timeToBuild,
        });
      } catch (error) {

        // Don't show error to user - fail silently as requested
      } finally {
        // Reset timer and counters
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setSentenceStartTime(null);
        setTotalWordsAdded(0);
        setCurrentSentenceTokens([]);
      }
    },
    [sentenceStartTime, totalWordsAdded, addClassicEntry],
  );

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Track breadcrumb tap
  const handleBreadcrumbTapped = useCallback((index: number) => {
    mixpanel.track('Convo Breadcrumb Tapped', { index });
  }, []);

  // Track grid size change
  const handleGridSizeChanged = useCallback((size: GridConfigKey) => {
    mixpanel.track('Convo Grid Size Changed', { size });
  }, []);

  // Track grid size value
  const handleGridSizeLoaded = useCallback((size: GridConfigKey) => {
    mixpanel.track('Convo Grid Size', { size });
  }, []);

  // Track reset DB tap
  const handleResetDbPressed = useCallback(() => {
    mixpanel.track('Convo Reset DB Tapped');
  }, []);

  return (
    <View style={styles.container}>
      <SentenceBuilderGrid
        onWordAdded={handleWordAdded}
        onWordRemoved={handleWordRemoved}
        onSentencePlayed={handleSentencePlayed}
        onBreadcrumbTapped={handleBreadcrumbTapped}
        onGridSizeChanged={handleGridSizeChanged}
        onGridSizeLoaded={handleGridSizeLoaded}
        onResetDbPressed={handleResetDbPressed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});

export default Convo;
