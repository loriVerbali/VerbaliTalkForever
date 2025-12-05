import React from 'react';
import {Pressable, Text, StyleSheet, Dimensions, Platform} from 'react-native';
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
  inScreen?: boolean; // If the button is in the screen
}

const HomeButton: React.FC<HomeButtonProps> = ({
  zIndex = 1,
  navigation: navigationProp,
  onReset,
  disabled = false,
  inScreen = false,
}) => {
  // Use passed navigation if provided, otherwise use the hook
  const navigationHook = useNavigation();
  const navigation = navigationProp || navigationHook;
  const {isTablet} = useAdmin();

  // Responsive values for home button
  const responsiveValues = {
    iconSize: isTablet
      ? {
          width: inScreen ? width * 0.1 : width * 0.05,
          height: inScreen ? width * 0.1 : width * 0.05,
        }
      : {
          width: inScreen ? width * 0.1 : width * 0.04,
          height: inScreen ? width * 0.1 : width * 0.04,
        },
    borderRadius: isTablet ? width * 0.04 : width * 0.03,
    fontSize: isTablet ? (inScreen ? 100 : 30) : inScreen ? 40 : 20,
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
    navigation.navigate(views.OPEN as never);
  };

  return (
    <Pressable
      onPress={handleHomePress}
      disabled={disabled}
      style={({pressed}) => [
        inScreen ? styles.homeIconInScreen : styles.homeIcon,
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
    position: 'absolute',
    backgroundColor: '#FFF',
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
    // width, height, borderRadius are now handled dynamically
  },
  homeIconInScreen: {
    justifyContent: 'center',
    alignItems: 'center',
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
