import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import HomeScreen from '../Views/Home';
import {views} from '../utils/constants';
import {AssistantProvider} from '../contexts/AssistantContext';
import {SoundProvider} from '../contexts/soundContext';
import OpenScreen from '../Views/Open';
import FeelingsScreen from '../Views/Feelings';
import ShortCutsScreen from '../Views/ShortCuts';
import Convo from '../Views/Convo';
import SettingsScreen from '../Views/Settings';
import WebViewScreen from '../Views/WebViewScreen';
import ReportsScreen from '../Views/Reports';
import MetricDetailScreen from '../Views/MetricDetail';

const HomeStack = createStackNavigator();

function LoggedNavigation() {
  // No need to check login status - guest sessions are always "authenticated"
  // Always start with the main app

  return (
    <AssistantProvider>
      <SoundProvider>
        <HomeStack.Navigator initialRouteName={views.OPEN}>
          <HomeStack.Screen
            options={{headerShown: false}}
            component={OpenScreen}
            name={views.OPEN}
          />
          <HomeStack.Screen
            options={{headerShown: false}}
            component={HomeScreen}
            name={views.HOME}
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
          <HomeStack.Screen
            name={views.SETTINGS}
            component={SettingsScreen}
            options={{
              headerShown: false,
            }}
          />
          <HomeStack.Screen
            name={views.REPORTS}
            component={ReportsScreen}
            options={{
              headerShown: false,
            }}
          />
          <HomeStack.Screen
            name={views.METRIC_DETAIL}
            component={MetricDetailScreen}
            options={{
              headerShown: false,
            }}
          />
          <HomeStack.Screen
            name="WebView"
            component={WebViewScreen}
            options={{
              headerShown: false,
            }}
          />
        </HomeStack.Navigator>
      </SoundProvider>
    </AssistantProvider>
  );
}

// const MainTabs = () => {
//   return (
//     <Tabs.Navigator
//       initialRouteName={initialRoute}
//       screenOptions={{
//         tabBarStyle: {
//           backgroundColor: '#F1F6F6', // Match this with your app's background color
//           elevation: 0, // Remove shadow on Android
//           shadowOpacity: 0, // Remove shadow on iOS
//           borderTopWidth: 0, // Remove the border line on top of the tab bar
//         },
//         tabBarShowLabel: false, // Hide labels if not needed
//         tabBarInactiveTintColor: '#979797', // Inactive icon color
//         tabBarActiveTintColor: '#8E24AA', // Active icon color
//       }}>
//       <Tabs.Screen
//         name={views.OPEN}
//         component={OpenScreen}
//         options={{
//           tabBarLabel: '',
//           headerShown: false,
//           tabBarAccessibilityLabel: 'Open',
//         }}
//       />
//       <Tabs.Screen
//         name={views.LOGIN}
//         component={Login}
//         options={{
//           tabBarLabel: '',
//           headerShown: false,
//           tabBarAccessibilityLabel: 'Login',
//         }}
//       />
//       <Tabs.Screen
//         name={views.HOME}
//         component={HomeScreen}
//         options={{
//           tabBarLabel: '',
//           headerShown: false,
//           tabBarAccessibilityLabel: 'Home',
//         }}
//       />
//     </Tabs.Navigator>
//   );
// };

export default LoggedNavigation;
