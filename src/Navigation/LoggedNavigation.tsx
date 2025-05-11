import React, {useEffect, useState} from 'react';
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
import FeelingsScreen from '../Views/Feelings';
import ShortCutsScreen from '../Views/ShortCuts';
import Convo from '../Views/Convo';
import Login from '../Views/Login';
import {useAppSettings} from '../utils/persistance';

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
          <HomeStack.Screen
            name={views.FEELINGS}
            component={FeelingsScreen}
            options={{
              headerShown: false,
            }}
          />
          <HomeStack.Screen
            name={views.SHORTCUTS}
            component={ShortCutsScreen}
            options={{
              headerShown: false,
            }}
          />
          <HomeStack.Screen
            name={views.CONVO}
            component={Convo}
            options={{
              headerShown: false,
            }}
          />
        </HomeStack.Navigator>
      </SoundProvider>
    </AssistantProvider>
  );
}

const MainTabs = () => {
  const {getItem} = useAppSettings();
  const [initialRoute, setInitialRoute] = useState(views.LOGIN);

  useEffect(() => {
    // Check if user is already logged in
    const checkLoginStatus = async () => {
      try {
        const loggedInValue = await getItem('loggedIn');
        if (loggedInValue === '1') {
          setInitialRoute(views.OPEN);
        }
      } catch (e) {
        console.log('Error checking login status:', e);
      }
    };

    checkLoginStatus();
  }, [getItem]);

  return (
    <Tabs.Navigator
      initialRouteName={initialRoute}
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
        name={views.LOGIN}
        component={Login}
        options={{
          tabBarLabel: '',
          headerShown: false,
          tabBarAccessibilityLabel: 'Login',
        }}
      />
      <Tabs.Screen
        name={views.HOME}
        component={HomeScreen}
        options={{
          tabBarLabel: '',
          headerShown: false,
          tabBarAccessibilityLabel: 'Home',
        }}
      />
    </Tabs.Navigator>
  );
};

export default LoggedNavigation;
