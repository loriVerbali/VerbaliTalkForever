/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */
import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, AppState, AppStateStatus, StatusBar } from 'react-native';
import RootControllerView from './Navigation/RootControllerView';
import { AppSettingsProvider } from './utils/persistance';
import { AdminProvider } from './contexts/adminContext';
import { ChatContextProvider } from './contexts/ChatContextProvider';
import { ConnectionProvider } from './utils/connection';
import { ToastProvider } from './contexts/ToastContext';
import { DatabaseProvider } from './contexts/DatabaseContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { sessionManager } from './utils/sessionManager';
import mixpanel from './utils/mixpanelInstance';
import TTSService from './utils/TTSService';
import WakeWordService from './utils/wakewordService';
import fetchHelper from './utils/fetcher';
import DefaultPreference from 'react-native-default-preference';
import DeviceInfo from 'react-native-device-info';

const App = () => {
  const appState = useRef(AppState.currentState);


  // Initialize Mixpanel and device tracking (once on mount)
  useEffect(() => {
    const initializeMixpanel = async () => {
      try {
        // Initialize SDK first — must complete before any other calls
        await mixpanel.init();

        // Get the actual device ID
        const deviceId = await DeviceInfo.getUniqueId();

        // Identify the user with the device ID in Mixpanel
        mixpanel.identify(deviceId);

        // Set device_id as a super property for easier querying
        mixpanel.registerSuperProperties({
          device_id: deviceId,
        });
      } catch (error) {
        console.error('Error initializing Mixpanel:', error);
      }
    };

    initializeMixpanel();
  }, []);

  // Unified AppState listener + TTS/WakeWord service initialization
  // Merged two separate useEffect hooks to avoid duplicate AppState listeners
  // and the race condition where both mutated appState.current
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

    // Single unified handler for all app state changes
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const wakeWordService = WakeWordService.getInstance();

      // Check if onboarding is complete before starting wakeword service
      const wasOnboarded = await DefaultPreference.get('wasOnboarded');
      const isOnboardingComplete = wasOnboarded === '1';

      if (nextAppState === 'background') {
        // Stop wake word service when app goes to background to save battery and memory
        try {
          await wakeWordService.stopListening();
        } catch (error) { }
      } else if (
        nextAppState === 'active' &&
        appState.current === 'background'
      ) {
        // App is coming back to foreground — refresh session + wakeup + restart wakeword
        try {
          await sessionManager.ensureValidSession();
        } catch (error) { }

        try {
          await fetchHelper('wakeup', {}, {});
        } catch (error) { }

        // Restart wake word service when app comes back to foreground (only if onboarding is complete)
        if (isOnboardingComplete) {
          try {
            await wakeWordService.startListening();
          } catch (error) { }
        }
      } else if (nextAppState === 'active' && appState.current === 'inactive') {
        // App is being opened for the first time or from inactive state
        try {
          await sessionManager.ensureValidSession();
          await fetchHelper('wakeup', {}, {});
        } catch (error) { }
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

  // Removed blocking DeviceStatusScreen - unified modal handled in Open.tsx

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
                    <RootControllerView />
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
