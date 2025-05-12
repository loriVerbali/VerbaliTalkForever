import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {views} from '../utils/constants';
import OnboardingScreen from '../Views/Onboarding';

const InitStack = createStackNavigator();

const InitNavigation = () => {
  return (
    <InitStack.Navigator>
      <InitStack.Screen
        options={{headerShown: false}}
        name={views.ONBOARDING}
        component={OnboardingScreen}
      />
    </InitStack.Navigator>
  );
};

export default InitNavigation;
