import React from 'react';
import {createStackNavigator, TransitionSpecs} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {
  NavigationProp,
  ParamListBase,
  RouteProp,
} from '@react-navigation/native';
import HomeScreen from '../Views/Home';
import {views} from '../utils/constants';
import {AssistantProvider} from '../contexts/AssistantContext';
import {SoundProvider} from '../contexts/soundContext';

import OpenScreen from '../Views/Open';

const HomeStack = createStackNavigator();
const Tabs = createBottomTabNavigator();

type ResetHomeStackOnTabPressProps = {
  navigation: NavigationProp<ParamListBase>;
  route: RouteProp<ParamListBase, string>;
};

function LoggedNavigation() {
  return (
    <AssistantProvider>
      <SoundProvider>
        <HomeStack.Navigator initialRouteName={'MainTab'}>
          <HomeStack.Screen
            options={{headerShown: false}}
            component={MainTabs}
            name={'MainTab'}
          />
        </HomeStack.Navigator>
      </SoundProvider>
    </AssistantProvider>
  );
}
export default LoggedNavigation;

const MainTabs = () => {
  return (
    <Tabs.Navigator
      initialRouteName={views.OPEN}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#F1F6F6', // Match this with your app's background color
          elevation: 0, // Remove shadow on Android
          shadowOpacity: 0, // Remove shadow on iOS
          borderTopWidth: 0, // Remove the border line on top of the tab bar
        },
        tabBarShowLabel: false, // Hide labels if not needed
        tabBarInactiveTintColor: '#979797', // Inactive icon color
        tabBarActiveTintColor: '#8E24AA', // Active icon color
      }}>
      <Tabs.Screen
        name={views.OPEN}
        component={OpenScreen}
        options={{
          tabBarLabel: '',
          headerShown: false,
          tabBarAccessibilityLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name={views.HOME}
        component={(props: any) => <HomeScreen {...props} />}
        options={{
          tabBarLabel: '',
          headerShown: false,
          tabBarAccessibilityLabel: 'Home',
        }}
      />
    </Tabs.Navigator>
  );
};
