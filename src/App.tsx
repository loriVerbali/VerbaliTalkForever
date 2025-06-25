/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */
import 'react-native-gesture-handler';
import React, {useEffect, useRef} from 'react';
import {StyleSheet, Linking, AppState, AppStateStatus} from 'react-native';
import RootControllerView from './Navigation/RootControllerView';
import {AppSettingsProvider} from './utils/persistance';
import {ConnectionProvider} from './utils/connection';
import {AdminProvider} from './contexts/adminContext';
import {ChatContextProvider} from './contexts/ChatContextProvider';
import TTSService from './utils/TTSService';
import {SoundProvider} from './contexts/soundContext';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {Auth0Provider} from 'react-native-auth0';
import WakeWordService from './utils/wakewordService';
import {Mixpanel} from 'mixpanel-react-native';
import Orientation from 'react-native-orientation-locker';

const App = () => {
  const appState = useRef(AppState.currentState);

  // Lock to landscape orientation as early as possible
  console.log('🔄 Attempting to lock orientation to landscape...');
  Orientation.lockToLandscapeLeft();

  const trackAutomaticEvents = true;
  const mixpanel = new Mixpanel(
    'b5c43b5eeefef8db948f6bf391e5ce39',
    trackAutomaticEvents,
  );

  mixpanel.init();

  // Initialize voice and TTS services at app level for better performance
  useEffect(() => {
    // Force landscape orientation immediately
    console.log('🔄 UseEffect: Locking orientation to landscape...');
    Orientation.lockToLandscapeLeft();

    const initServices = async () => {
      // Initialize TTS service when the app starts
      await TTSService.initialize();
    };

    initServices();

    // Handle app state changes for Vosk model management
    const handleAppStateChange = (nextAppState: AppStateStatus) => {};

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    // Clean up resources when app is closed
    return () => {
      TTSService.shutdown();
      subscription?.remove();
    };
  }, []);

  return (
    <Auth0Provider
      domain={'dev-64l2kpebzn1y4zm7.us.auth0.com'}
      clientId={'9CrrlRaLHYzHfzIa5DlE01PdMzwXk5jX'}>
      <GestureHandlerRootView style={styles.container}>
        <ConnectionProvider>
          <AppSettingsProvider>
            <AdminProvider>
              <ChatContextProvider>
                <SoundProvider>
                  <RootControllerView />
                </SoundProvider>
              </ChatContextProvider>
            </AdminProvider>
          </AppSettingsProvider>
        </ConnectionProvider>
      </GestureHandlerRootView>
    </Auth0Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
