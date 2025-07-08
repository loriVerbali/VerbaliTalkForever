import React from 'react';
import {Pressable, Text, StyleSheet, Dimensions} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {views} from '../utils/constants';
import {useAssistant} from '../contexts/AssistantContext';
import {useAdmin} from '../contexts/adminContext';

const {width, height} = Dimensions.get('window');

interface HomeButtonProps {
  zIndex?: number;
  navigation?: any; // Navigation prop can be passed, otherwise will use useNavigation hook
  onReset?: () => void; // Optional callback for additional reset logic
  disabled?: boolean; // Disable the button when processing
}

const HomeButton: React.FC<HomeButtonProps> = ({
  zIndex = 1,
  navigation: navigationProp,
  onReset,
  disabled = false,
}) => {
  // Use passed navigation if provided, otherwise use the hook
  const navigationHook = useNavigation();
  const navigation = navigationProp || navigationHook;
  const {resetAssistant} = useAssistant();
  const {isTablet} = useAdmin();

  // Responsive values for home button
  const responsiveValues = {
    iconSize: isTablet
      ? {width: width * 0.05, height: width * 0.05}
      : {width: width * 0.04, height: width * 0.04},
    borderRadius: isTablet ? width * 0.04 : width * 0.03,
    fontSize: isTablet ? 30 : 20,
  };

  const handleHomePress = () => {
    // Don't do anything if disabled
    if (disabled) {
      return;
    }

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
      disabled={disabled}
      style={({pressed}) => [
        styles.homeIcon,
        responsiveValues.iconSize,
        {borderRadius: responsiveValues.borderRadius},
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        {zIndex: zIndex},
      ]}>
      <Text
        style={[
          styles.homeIconText,
          {fontSize: responsiveValues.fontSize},
          disabled && styles.homeIconTextDisabled,
        ]}>
        🏠
      </Text>
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
    // width, height, borderRadius are now handled dynamically
    backgroundColor: '#FFF',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{scale: 0.98}],
  },
  buttonDisabled: {
    opacity: 0.5,
    backgroundColor: '#E0E0E0',
  },
  homeIconText: {
    // fontSize is now handled dynamically
    color: '#FFFFFF',
  },
  homeIconTextDisabled: {
    color: '#999999',
  },
});

export default HomeButton;
