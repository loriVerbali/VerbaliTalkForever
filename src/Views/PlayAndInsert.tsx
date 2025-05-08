import React from 'react';
import {View, TextInput, TouchableOpacity, StyleSheet} from 'react-native';
import {Ionicons} from '@expo/vector-icons';

interface PlayAndInsertProps {
  onPlay?: () => void;
  onTextChange?: (text: string) => void;
}

const PlayAndInsert: React.FC<PlayAndInsertProps> = ({
  onPlay,
  onTextChange,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playButton} onPress={onPlay}>
        <Ionicons name="play" size={32} color="white" />
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        placeholder="Waiting for input..."
        placeholderTextColor="#666"
        onChangeText={onTextChange}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 15,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
  },
});

export default PlayAndInsert;
