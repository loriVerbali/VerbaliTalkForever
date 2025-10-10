import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';

interface AddCardProps {
  onPress: () => void;
  cardSize: number;
}

const AddCard: React.FC<AddCardProps> = ({onPress, cardSize}) => {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          width: cardSize,
          height: cardSize,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.addIcon}>
        <Text style={styles.addIconText}>+</Text>
      </View>
      <Text style={styles.text}>Add</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  addIcon: {
    marginBottom: 8,
  },
  addIconText: {
    fontSize: 32,
    color: '#666',
    fontWeight: 'bold',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
});

export default AddCard;
