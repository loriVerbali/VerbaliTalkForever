import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {views} from '../utils/constants';
import Onboarding from '../Views/Onboarding';

const InitStack = createStackNavigator();

const InitNavigation: React.FC = () => {
  return (
    <InitStack.Navigator>
      <InitStack.Screen
        name={views.ONBOARDING}
        component={Onboarding}
        options={{
          headerShown: false,
        }}
      />
    </InitStack.Navigator>
  );
};

export default InitNavigation;
