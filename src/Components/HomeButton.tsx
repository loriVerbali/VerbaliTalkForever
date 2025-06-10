import React from 'react';
import {Pressable, Text, StyleSheet, Dimensions} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {views} from '../utils/constants';
import {useAssistant} from '../contexts/AssistantContext';

const {width, height} = Dimensions.get('window');

interface HomeButtonProps {
  zIndex?: number;
  navigation?: any; // Navigation prop can be passed, otherwise will use useNavigation hook
  onReset?: () => void; // Optional callback for additional reset logic
}

const HomeButton: React.FC<HomeButtonProps> = ({
  zIndex = 1,
  navigation: navigationProp,
  onReset,
}) => {
  // Use passed navigation if provided, otherwise use the hook
  const navigationHook = useNavigation();
  const navigation = navigationProp || navigationHook;
  const {resetAssistant} = useAssistant();

  const handleHomePress = () => {
    // Call additional reset logic if provided
    if (onReset) {
      onReset();
    }
    // Reset the assistant state (everything except threadId)
    resetAssistant();
    navigation.navigate(views.OPEN as never);
  };

  return (
    <Pressable
      onPress={handleHomePress}
      style={({pressed}) => [
        styles.homeIcon,
        pressed && styles.buttonPressed,
        {zIndex: zIndex},
      ]}>
      <Text style={styles.homeIconText}>🏠</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  homeIcon: {
    top: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    right: width * 0.03,
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
    width: width * 0.05,
    height: width * 0.05,
    backgroundColor: '#FFF',
    borderRadius: width * 0.04,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{scale: 0.98}],
  },
  homeIconText: {
    fontSize: 30,
    color: '#FFFFFF',
  },
});

export default HomeButton;
