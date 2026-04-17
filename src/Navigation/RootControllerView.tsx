import React, { Suspense, useEffect, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoggedNavigation from '../Navigation/LoggedNavigation';
import InitNavigation from '../Navigation/InitNavigation';
import { useAppSettings } from '../utils/persistance';
import { stacks } from '../utils/constants';
import { useConnection } from '../utils/connection';
import { View, Text, Dimensions, StatusBar } from 'react-native';
import FastImage from 'react-native-fast-image';
import NoInternetConnection from '../Components/NoInternetConnection';
import { navigationRef } from '../utils/navigation';

const { width, height } = Dimensions.get('window');
// Create a context to set onboarding state
export const OnboardingContext = React.createContext<{
  completeOnboarding: () => void;
}>({
  completeOnboarding: () => { },
});

const RootStack = createStackNavigator();

const RootStackScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const { getItem } = useAppSettings();

  // Function to complete onboarding from children
  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  useEffect(() => {
    const initApp = async () => {
      if (isLoading) {
        const wasOnboarded = await getItem('wasOnboarded');
        const isEnrolled = await getItem('isEnrolled');
        setShowOnboarding(wasOnboarded !== '1' || isEnrolled !== '1');
        setIsLoading(false);
      }
    };

    initApp();
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <OnboardingContext.Provider value={{ completeOnboarding }}>
      <RootStack.Navigator>
        {showOnboarding ? (
          <RootStack.Screen
            options={{ headerShown: false }}
            name={stacks.INITSTACK}
            component={InitNavigation}
          />
        ) : (
          <RootStack.Screen
            options={{ headerShown: false }}
            name={stacks.LOGGEDINSTACK}
            component={LoggedNavigation}
          />
        )}
      </RootStack.Navigator>
    </OnboardingContext.Provider>
  );
};

const RootControllerView: React.FC = () => {
  const { restartKey } = useAppSettings();

  return (
    <Suspense fallback={<LoadingScreen />}>
      <NavigationContainer ref={navigationRef} key={restartKey}>
        <RootStackScreen />
      </NavigationContainer>
    </Suspense>
  );
};

const LoadingScreen = () => {
  return (
    <View
      style={{
        position: 'absolute',
        width: width,
        height: height,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
      }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0f0f0" />
      <FastImage
        source={require('../assets/matalk.png')}
        style={{ width: width * 0.6, height: width * 0.3 }}
        resizeMode={FastImage.resizeMode.contain}
      />
      <NoInternetConnection />
      <Text style={{ fontSize: 16, color: '#333', marginTop: 10 }}>
        Loading...
      </Text>
    </View>
  );
};

export default RootControllerView;
