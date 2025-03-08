import React, {Suspense, useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import LoggedNavigation from '../Navigation/LoggedNavigation';
import SetupNavigation from '../Navigation/SetupNavigation';
import InitNavigation from '../Navigation/InitNavigation';
import {useAppSettings} from '../utils/persistance';
import {stacks} from '../utils/constants';
import {useConnection} from '../utils/connection';
import {View, Text} from 'react-native';

const RootStack = createStackNavigator();

const RootStackScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [showInit, setShowInit] = useState(true);
  const [user, setUser] = useState(null);
  const {preferences, initializePreferences} = useAppSettings();
  const {isConnected} = useConnection();

  useEffect(() => {
    if (isLoading) {
      initializePreferences().then(res => {});
    }
  }, []);

  if (!isConnected) {
    return <NoInternetConnection />;
  }

  return (
    <RootStack.Navigator>
      <RootStack.Screen
        options={{headerShown: false}}
        name={stacks.LOGGEDINSTACK}
        component={LoggedNavigation}
      />
    </RootStack.Navigator>
  );
};

const RootControllerView: React.FC = () => {
  return (
    <Suspense>
      <NavigationContainer>
        <RootStackScreen />
      </NavigationContainer>
    </Suspense>
  );
};

export default RootControllerView;

const NoInternetConnection = () => {
  return (
    <View>
      <Text>No Internet Connection</Text>
    </View>
  );
};
