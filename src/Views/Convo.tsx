import React, {useState, useRef, useCallback, useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import SentenceBuilderGrid from '../Components/SentenceBuilder/SentenceBuilderGrid';
import {useDatabase} from '../contexts/DatabaseContext';
import {Mixpanel} from 'mixpanel-react-native';

const Convo = () => {
  const {addClassicEntry} = useDatabase();
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);
  const [sentenceStartTime, setSentenceStartTime] = useState<number | null>(
    null,
  );
  const [totalWordsAdded, setTotalWordsAdded] = useState(0);
  const [currentSentenceTokens, setCurrentSentenceTokens] = useState<string[]>(
    [],
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track when user enters the Convo section
  useEffect(() => {
    mixpanel.track('Convo Screen - Entered', {
      screen: 'Convo',
      action: 'screen_entered',
    });
  }, []);

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

  const handleWordRemoved = useCallback((nodeId: string) => {
    setCurrentSentenceTokens(prev => prev.filter(id => id !== nodeId));
    // Note: We don't decrease totalWordsAdded to track deleted words
  }, []);

  // Handle sentence play - save to database
  const handleSentencePlayed = useCallback(
    async (sentenceTokens: string[], nodes: any[]) => {
      if (sentenceStartTime === null) return;

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
        console.error('Error saving sentence to database:', error);
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

  return (
    <View style={styles.container}>
      <SentenceBuilderGrid
        onWordAdded={handleWordAdded}
        onWordRemoved={handleWordRemoved}
        onSentencePlayed={handleSentencePlayed}
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
