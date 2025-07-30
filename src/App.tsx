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
import fetchHelper, {setAuth0Instance} from './utils/fetcher';
import {ToastProvider} from './contexts/ToastContext';
import Auth0 from 'react-native-auth0';

const App = () => {
  const appState = useRef(AppState.currentState);

  // Lock to landscape orientation as early as possible
  // Orientation.lockToLandscapeLeft();

  const trackAutomaticEvents = false;
  const mixpanelToken = 'b5c43b5eeefef8db948f6bf391e5ce39';

  const mixpanel = new Mixpanel(mixpanelToken, trackAutomaticEvents);
  mixpanel.init();
  mixpanel.reset(); // anonymizes session, clears device_id and user_id
  mixpanel.clearSuperProperties();

  // Initialize Auth0 instance for token refresh
  useEffect(() => {
    const auth0 = new Auth0({
      domain: 'dev-64l2kpebzn1y4zm7.us.auth0.com',
      clientId: '9CrrlRaLHYzHfzIa5DlE01PdMzwXk5jX',
    });
    setAuth0Instance(auth0);
  }, []);

  // Initialize voice and TTS services at app level for better performance
  useEffect(() => {
    // Force landscape orientation immediately
    Orientation.lockToLandscapeLeft();

    const initServices = async () => {
      // Initialize TTS service when the app starts
      await TTSService.initialize();
    };

    initServices();

    // Handle app state changes for wake word and resource management
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const wakeWordService = WakeWordService.getInstance();

      if (nextAppState === 'background') {
        // Stop wake word service when app goes to background to save battery and memory
        try {
          await wakeWordService.stopListening();
        } catch (error) {
          console.error(
            'Error stopping wake word service on background:',
            error,
          );
        }
      } else if (
        nextAppState === 'active' &&
        appState.current === 'background'
      ) {
        // App is coming back to foreground - send wakeup call to backend

        try {
          await fetchHelper('wakeup', {}, {});
        } catch (error) {
          console.error('Error sending wakeup call to backend:', error);
        }

        // Restart wake word service when app comes back to foreground
        try {
          await wakeWordService.startListening();
        } catch (error) {
          console.error(
            'Error restarting wake word service on foreground:',
            error,
          );
        }
      } else if (nextAppState === 'active' && appState.current === 'inactive') {
        // App is being opened for the first time or from inactive state
        try {
          await fetchHelper('wakeup', {}, {});
        } catch (error) {
          console.error('Error sending wakeup call to backend:', error);
        }
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    // Clean up resources when app is closed
    return () => {
      TTSService.shutdown();
      // Clean up wake word service when app closes
      WakeWordService.getInstance().cleanup();
      subscription?.remove();
    };
  }, []);

  return (
    <Auth0Provider
      domain={'dev-64l2kpebzn1y4zm7.us.auth0.com'}
      clientId={'9CrrlRaLHYzHfzIa5DlE01PdMzwXk5jX'}>
      <GestureHandlerRootView style={styles.container}>
        <ToastProvider>
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
        </ToastProvider>
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
