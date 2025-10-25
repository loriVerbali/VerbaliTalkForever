/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */
import 'react-native-gesture-handler';
import React, {useEffect, useRef} from 'react';
import {StyleSheet, AppState, AppStateStatus, StatusBar} from 'react-native';
import RootControllerView from './Navigation/RootControllerView';
import {AppSettingsProvider} from './utils/persistance';
import {AdminProvider} from './contexts/adminContext';
import {ChatContextProvider} from './contexts/ChatContextProvider';
import {SoundProvider} from './contexts/soundContext';
import {ConnectionProvider} from './utils/connection';
import {ToastProvider} from './contexts/ToastContext';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {Auth0Provider} from 'react-native-auth0';
import {setAuth0Instance} from './utils/fetcher';
import Auth0 from 'react-native-auth0';
import {Mixpanel} from 'mixpanel-react-native';
import TTSService from './utils/TTSService';
import WakeWordService from './utils/wakewordService';
import fetchHelper from './utils/fetcher';
import WhisperModelManager from './utils/WhisperModelManager';
import WhisperService from './utils/WhisperService';
import DefaultPreference from 'react-native-default-preference';

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

  // Refresh token when app becomes active (Auth0 credential manager handles automatic refresh)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        try {
          const {ensureFreshToken} = await import('./utils/fetcher');
          await ensureFreshToken();
        } catch (error) {
          console.error('App state change token refresh failed:', error);
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, []);

  // Initialize voice and TTS services at app level for better performance
  useEffect(() => {
    const initServices = async () => {
      // Initialize TTS service when the app starts
      await TTSService.initialize();

      // Pre-initialize WhisperService for faster first transcription
      try {
        // Check if local Whisper is enabled (default to true since we're disabling cloud)
        const useLocalWhisper = await DefaultPreference.get('useLocalWhisper');
        const shouldUseLocal = useLocalWhisper !== '0'; // Default to true if not set

        if (shouldUseLocal) {
          const initSuccess = await WhisperService.initialize();
          if (!initSuccess) {
            console.warn(
              '⚠️ WhisperService pre-initialization failed, will initialize on first use',
            );
          }
        }
      } catch (error) {
        console.error('Error pre-initializing WhisperService:', error);
      }
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
      {/* Hide status bar for immersive experience - handled by Android native code */}
      <StatusBar hidden animated />
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
