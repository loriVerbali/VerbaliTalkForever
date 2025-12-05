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
import WhisperModelManager from './utils/WhisperModelManager';
import WhisperService from './utils/WhisperService';
import DefaultPreference from 'react-native-default-preference';
import DeviceInfo from 'react-native-device-info';

const App = () => {
  const appState = useRef(AppState.currentState);
  const mixpanelRef = useRef<Mixpanel | null>(null);

  // Lock to landscape orientation as early as possible
  // Orientation.lockToLandscapeLeft();

  // Initialize Mixpanel once
  useEffect(() => {
    const trackAutomaticEvents = false;
    const mixpanelToken = 'b5c43b5eeefef8db948f6bf391e5ce39';
    const mixpanel = new Mixpanel(mixpanelToken, trackAutomaticEvents);
    mixpanel.init();
    mixpanelRef.current = mixpanel;

    // Initialize device ID for Mixpanel tracking
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

        console.log('Device ID set in Mixpanel:', deviceId);
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

  // Initialize session manager with app settings
  useEffect(() => {
    // Session manager will be initialized in AppSettingsProvider
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
        } catch (error) {
          console.error('App state change session refresh failed:', error);
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
