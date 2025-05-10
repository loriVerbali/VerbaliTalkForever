import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

interface ActionSectionProps {
  onActionSelect: (action: string) => void;
}

const ActionSection: React.FC<ActionSectionProps> = ({onActionSelect}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose the action:</Text>
      <View style={styles.actionsContainer}>
        {/* Action buttons will be populated dynamically based on the selected topic */}
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
  actionsContainer: {
    flex: 1,
    gap: 15,
  },
});

export default ActionSection;
