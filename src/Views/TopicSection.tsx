import React from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet} from 'react-native';

interface TopicSectionProps {
  onTopicSelect: (topic: string) => void;
}

const TopicSection: React.FC<TopicSectionProps> = ({onTopicSelect}) => {
  const topics = [
    {id: 'talk', label: 'Talk', image: require('../../assets/talk-icon.png')},
    {id: 'play', label: 'Play', image: require('../../assets/play-icon.png')},
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose the topic:</Text>
      <View style={styles.topicsContainer}>
        {topics.map(topic => (
          <TouchableOpacity
            key={topic.id}
            style={styles.topicButton}
            onPress={() => onTopicSelect(topic.label)}>
            <Image source={topic.image} style={styles.topicImage} />
            <Text style={styles.topicLabel}>{topic.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 15,
    padding: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  topicsContainer: {
    gap: 15,
  },
  topicButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  topicImage: {
    width: 100,
    height: 80,
    resizeMode: 'contain',
  },
  topicLabel: {
    marginTop: 5,
    fontSize: 16,
    color: '#333',
  },
});

export default TopicSection;
