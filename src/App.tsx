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
import {DatabaseProvider} from './contexts/DatabaseContext';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {sessionManager} from './utils/sessionManager';
import {Mixpanel} from 'mixpanel-react-native';
import TTSService from './utils/TTSService';
import WakeWordService from './utils/wakewordService';
import fetchHelper from './utils/fetcher';
import DefaultPreference from 'react-native-default-preference';
import DeviceInfo from 'react-native-device-info';

const App = () => {
  const appState = useRef(AppState.currentState);

  // Lock to landscape orientation as early as possible
  // Orientation.lockToLandscapeLeft();

  const trackAutomaticEvents = false;
  const mixpanelToken = 'f88f7a27585868c53b1e08c06f5226bd';

  const mixpanel = new Mixpanel(mixpanelToken, trackAutomaticEvents);
  mixpanel.init();
  mixpanel.reset(); // anonymizes session, clears device_id and user_id
  mixpanel.clearSuperProperties();

  // Initialize device ID for Mixpanel tracking
  useEffect(() => {
    const initializeDeviceTracking = async () => {
      try {
        // Get the actual device ID
        const deviceId = await DeviceInfo.getUniqueId();

        // Identify the user with the device ID in Mixpanel
        mixpanel.identify(deviceId);

        // Also set it as a super property for easier querying
        mixpanel.registerSuperProperties({
          device_id: deviceId,
        });
      } catch (error) {
        console.error('Error setting device ID in Mixpanel:', error);
        // Fallback: generate a GUID if device ID retrieval fails
        const fallbackId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
          /[xy]/g,
          function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          },
        );
        mixpanel.identify(fallbackId);
        mixpanel.registerSuperProperties({
          device_id: fallbackId,
        });
      }
    };

    initializeDeviceTracking();
  }, []);

  // Refresh session when app becomes active
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        try {
          await sessionManager.ensureValidSession();
        } catch (error) {}
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

      // CRITICAL: Do NOT pre-initialize WhisperService here
      // Whisper initialization must happen AFTER wake word is initialized
      // This is handled in LoggedNavigation.tsx to ensure correct initialization order
      // Pre-initializing here would cause wake word to fail because Whisper takes exclusive control
      // of ONNX Runtime, CoreML, and audio resources
    };

    initServices();

    // Handle app state changes for wake word and resource management
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const wakeWordService = WakeWordService.getInstance();

      // Check if onboarding is complete before starting wakeword service
      const wasOnboarded = await DefaultPreference.get('wasOnboarded');
      const isOnboardingComplete = wasOnboarded === '1';

      if (nextAppState === 'background') {
        // Stop wake word service when app goes to background to save battery and memory
        try {
          await wakeWordService.stopListening();
        } catch (error) {}
      } else if (
        nextAppState === 'active' &&
        appState.current === 'background'
      ) {
        // App is coming back to foreground - send wakeup call to backend

        try {
          await fetchHelper('wakeup', {}, {});
        } catch (error) {}

        // Restart wake word service when app comes back to foreground (only if onboarding is complete)
        if (isOnboardingComplete) {
          try {
            await wakeWordService.startListening();
          } catch (error) {}
        } else {
        }
      } else if (nextAppState === 'active' && appState.current === 'inactive') {
        // App is being opened for the first time or from inactive state
        try {
          await fetchHelper('wakeup', {}, {});
        } catch (error) {}
        // Don't start wakeword here - let Open.tsx handle it after onboarding
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
    <>
      {/* Hide status bar for immersive experience - handled by Android native code */}
      <StatusBar hidden animated />
      <GestureHandlerRootView style={styles.container}>
        <ToastProvider>
          <ConnectionProvider>
            <AppSettingsProvider>
              <DatabaseProvider>
                <AdminProvider>
                  <ChatContextProvider>
                    <SoundProvider>
                      <RootControllerView />
                    </SoundProvider>
                  </ChatContextProvider>
                </AdminProvider>
              </DatabaseProvider>
            </AppSettingsProvider>
          </ConnectionProvider>
        </ToastProvider>
      </GestureHandlerRootView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
