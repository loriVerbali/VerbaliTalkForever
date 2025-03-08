import React from 'react';
import {View, Text, ScrollView, StyleSheet} from 'react-native';
import {useAssistant} from '../contexts/AssistantContext';

const Transcription: React.FC = () => {
  const {history} = useAssistant();

  return (
    <ScrollView style={styles.container}>
      {history.map((item, index) => (
        <View
          key={index}
          style={[
            styles.historyItem,
            item.isUserInput ? styles.userMessage : styles.assistantMessage,
          ]}>
          <Text style={styles.timestamp}>
            {item.timestamp.toLocaleTimeString()}
          </Text>
          <Text
            style={[
              styles.messageText,
              item.type === 'error' && styles.errorText,
              item.type === 'status' && styles.statusText,
            ]}>
            {item.content}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  historyItem: {
    padding: 8,
    marginVertical: 4,
    borderRadius: 8,
  },
  userMessage: {
    backgroundColor: '#E3F2FD',
    alignSelf: 'flex-end',
  },
  assistantMessage: {
    backgroundColor: '#F5F5F5',
    alignSelf: 'flex-start',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
  },
  errorText: {
    color: 'red',
  },
  statusText: {
    color: '#666',
    fontStyle: 'italic',
  },
});

export default Transcription;
