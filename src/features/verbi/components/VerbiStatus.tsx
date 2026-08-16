import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { PredictionStatus, ListeningState } from '../state/verbiTypes';

interface VerbiStatusProps {
  predictionStatus: PredictionStatus;
  listeningState: ListeningState;
  isOnline: boolean;
}

const VerbiStatus: React.FC<VerbiStatusProps> = ({
  predictionStatus,
  listeningState,
  isOnline,
}) => {
  if (!isOnline) return null;

  if (predictionStatus === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText} accessibilityLabel="Verbi suggestion error">
          ⚠️
        </Text>
      </View>
    );
  }

  // Quiet in-flight indicator: the suggestions below stay tappable, so this is
  // the only signal that a refresh is coming.
  if (predictionStatus === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator
          size="small"
          color="#7C3AED"
          accessibilityLabel="Updating suggestions"
        />
      </View>
    );
  }

  if (listeningState === 'listening') {
    return (
      <View style={styles.container}>
        <View style={styles.listeningDot} accessibilityLabel="Listening for partner speech" />
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
});

export default VerbiStatus;
