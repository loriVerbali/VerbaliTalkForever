import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';

interface TranscriptionProps {
  text: string;
}

const Transcription: React.FC<TranscriptionProps> = ({text}) => {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.text}>{text}</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  text: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
});

export default Transcription;
