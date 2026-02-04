import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../Views/Home';
import { views } from '../utils/constants';
import { AssistantProvider } from '../contexts/AssistantContext';
import { SoundProvider } from '../contexts/soundContext';
import OpenScreen from '../Views/Open';
import FeelingsScreen from '../Views/Feelings';
import ShortCutsScreen from '../Views/ShortCuts';
import Convo from '../Views/Convo';
import SettingsScreen from '../Views/Settings';
import WebViewScreen from '../Views/WebViewScreen';
import ReportsScreen from '../Views/Reports';
import MetricDetailScreen from '../Views/MetricDetail';
import KeyboardHomeScreen from '../Views/KeyboardHome';
import WhisperService from '../utils/WhisperService';
import WakeWordService from '../utils/wakewordService';
import { useAppSettings } from '../utils/persistance';
import Voice from '@dev-amirzubair/react-native-voice';

const HomeStack = createStackNavigator();

function LoggedNavigation() {
  // No need to check login status - guest sessions are always "authenticated"
  // Always start with the main app
  const { getItem } = useAppSettings();

  // CRITICAL: Wait for Open.tsx to initialize wake word FIRST, then initialize Whisper
  // Both services use ONNX Runtime, CoreML, and audio resources
  // If Whisper initializes first, it may take exclusive control and prevent wake word from working
  // Open.tsx will handle wake word initialization and callback setup
  useEffect(() => {
    const initServices = async () => {
      try {
        // Optimization: wasOnboarded check removed - LoggedNavigation only mounts if onboarding is complete
        // RootControllerView already checks this before showing LoggedNavigation

        // Step 1: Wait for Open.tsx to mount and initialize wake word
        // Open.tsx will handle wake word initialization and callback setup
        // We need to give it time to initialize wake word before we initialize Whisper

        // Wait and check if wake word is initialized
        // Optimization: Reduced from 3000ms to 2000ms (Open.tsx delay also reduced)
        const maxWaitTime = 2000; // 2 seconds max wait (optimization: was 3 seconds)
        const checkInterval = 200; // Check every 200ms
        let waited = 0;
        const wakeWordService = WakeWordService.getInstance();

        while (waited < maxWaitTime) {
          await new Promise<void>(resolve =>
            setTimeout(resolve, checkInterval),
          );
          waited += checkInterval;

          const status = wakeWordService.getStatus();
          if (status.isListening || status.isInitialized) {
            break;
          }
        }

        // Step 2: Platform-specific service initialization
        // WhisperService is iOS-only, Voice is Android-only
        if (Platform.OS === 'ios') {
          // iOS: Initialize WhisperService AFTER wake word is ready
          const modelAvailable = await WhisperService.isModelAvailable();
          if (modelAvailable) {
            const initSuccess = await WhisperService.initialize();
            if (initSuccess) {
              // CRITICAL: Restart wake word detection after Whisper initializes
              // Whisper may change the audio session configuration, which can break wake word detection
              // Restarting wake word ensures it has proper access to the audio session
              try {
                const wakeWordService = WakeWordService.getInstance();
                if (wakeWordService.isCurrentlyListening()) {
                  // Stop and restart to reacquire audio session
                  await wakeWordService.stopListening();
                  // Optimization: Reduced delay from 300ms to 100ms
                  await new Promise<void>(resolve => setTimeout(resolve, 100)); // Brief delay (optimization: was 300ms)
                  await wakeWordService.startListening();
                }
              } catch (error) {
                console.log(
                  '[LoggedNavigation] Error restarting wakeword on iOS:',
                  error,
                );
              }
            }
          }
        } else if (Platform.OS === 'android') {
          // Android: Check if Voice recognition is currently active before restarting wake word
          // If Voice is recognizing, don't restart wakeword as it will steal the microphone
          try {
            const isVoiceRecognizing = await Voice.isRecognizing();
            if (isVoiceRecognizing) {
              console.log(
                '[LoggedNavigation] Voice is recognizing, skipping wakeword restart',
              );
              return;
            }

            const wakeWordService = WakeWordService.getInstance();
            if (wakeWordService.isCurrentlyListening()) {
              // Stop and restart to reacquire audio session
              await wakeWordService.stopListening();
              await new Promise<void>(resolve => setTimeout(resolve, 100));
              await wakeWordService.startListening();
            }
          } catch (error) {
            console.log(
              '[LoggedNavigation] Error restarting wakeword on Android:',
              error,
            );
          }
        }
      } catch (error) { }
    };

    initServices();
  }, [getItem]);

  return (
    <AssistantProvider>
      <SoundProvider>
        <HomeStack.Navigator initialRouteName={views.OPEN}>
          <HomeStack.Screen
            options={{ headerShown: false }}
            component={OpenScreen}
            name={views.OPEN}
          />
          <HomeStack.Screen
            options={{ headerShown: false }}
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
          <HomeStack.Screen
            name={views.KEYBOARD_HOME}
            component={KeyboardHomeScreen}
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
