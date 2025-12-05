import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

interface ObjectSectionProps {
  onObjectSelect: (object: string) => void;
}

const ObjectSection: React.FC<ObjectSectionProps> = ({onObjectSelect}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose the object:</Text>
      <View style={styles.objectsContainer}>
        {/* Object buttons will be populated dynamically based on the selected action */}
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
  objectsContainer: {
    flex: 1,
    gap: 15,
  },
});

export default ObjectSection;
