import React from 'react';
import {
  createStackNavigator,
  StackNavigationOptions,
} from '@react-navigation/stack';
import {views} from '../utils/constants';
import OnBoarding from '../Views/Onboarding';

const SetupStack = createStackNavigator();

const SetupNavigation: React.FC = () => {
  return (
    <SetupStack.Navigator initialRouteName={views.ONBOARDING}>
      <SetupStack.Screen
        name={'OnBoarding'}
        component={OnBoarding}
        options={{
          headerShown: false,
          headerTransparent: true,
          headerTitle: '',
        }}
      />
    </SetupStack.Navigator>
  );
};

export default SetupNavigation;
