import React from 'react';
import {View, TouchableOpacity, StyleSheet, Platform} from 'react-native';
import {Ionicons} from '@expo/vector-icons';

interface NavigationButtonsProps {
  onKeyboardPress?: () => void;
  onHomePress?: () => void;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  onKeyboardPress,
  onHomePress,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={onKeyboardPress}>
        <Ionicons name="keyboard-outline" size={24} color="#333" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={onHomePress}>
        <Ionicons name="home-outline" size={24} color="#333" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    flexDirection: 'row',
    gap: 15,
  },
  button: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
});

export default NavigationButtons;
