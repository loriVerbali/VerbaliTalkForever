/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */
import 'react-native-gesture-handler';
import React, {useEffect, useRef, useState} from 'react';
import {
  StyleSheet,
  AppState,
  AppStateStatus,
  StatusBar,
  View,
  Dimensions,
  Text,
} from 'react-native';
import RootControllerView from './Navigation/RootControllerView';
import {AppSettingsProvider} from './utils/persistance';
import {AdminProvider} from './contexts/adminContext';
import {ChatContextProvider} from './contexts/ChatContextProvider';
import {ConnectionProvider} from './utils/connection';
import {ToastProvider} from './contexts/ToastContext';
import {DatabaseProvider} from './contexts/DatabaseContext';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {sessionManager} from './utils/sessionManager';
import mixpanel from './utils/mixpanelInstance';
import TTSService from './utils/TTSService';
import WakeWordService from './utils/wakewordService';
import fetchHelper from './utils/fetcher';
import DefaultPreference from 'react-native-default-preference';
import DeviceInfo from 'react-native-device-info';
import FastImage from 'react-native-fast-image';

const {width, height} = Dimensions.get('window');

const App = () => {
  const appState = useRef(AppState.currentState);
  // Bootstrap tracks whether the init-once startup sequence has completed.
  // The Navigator (and therefore Open.tsx) is not rendered until this is true,
  // so Open.tsx always mounts with WakeWord already live.
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const bootstrapRanRef = useRef(false);
  const bootstrapDoneRef = useRef(false);

  useEffect(() => {
    bootstrapDoneRef.current = bootstrapDone;
  }, [bootstrapDone]);

  // Initialize Mixpanel and device tracking (once on mount)
  useEffect(() => {
    const initializeMixpanel = async () => {
      try {
        await mixpanel.init();
        const deviceId = await DeviceInfo.getUniqueId();
        mixpanel.identify(deviceId);
        mixpanel.registerSuperProperties({device_id: deviceId});
      } catch (error) {
        console.error('Error initializing Mixpanel:', error);
      }
    };
    initializeMixpanel();
  }, []);

  // ─── ONE-TIME BOOTSTRAP ───────────────────────────────────────────────────
  // Sequence (in order, never repeated unless the app crashes):
  //   1. WakeWord  → initializeAndPause()  (existing users only)
  //   2. TTS/STT   → TTSService.initialize() (existing users only)
  //   3. WakeWord  → resumeDetection()     (existing users only)
  // New users activate WakeWord after onboarding grants microphone permission.
  // Only then do we flip bootstrapDone=true so the Navigator renders.
  useEffect(() => {
    if (bootstrapRanRef.current) return;
    bootstrapRanRef.current = true;

    const bootstrap = async () => {
      const wakeWordService = WakeWordService.getInstance();
      const wasOnboarded = await DefaultPreference.get('wasOnboarded');
      const isOnboardingComplete = wasOnboarded === '1';

      if (isOnboardingComplete) {
        try {
          // Step 1: init WakeWord, leave it paused
          await wakeWordService.initializeAndPause();
        } catch (err) {
          console.warn('[App] WakeWord initializeAndPause failed:', err);
        }
      }

      if (isOnboardingComplete) {
        try {
          // Step 2: init TTS + STT (initAll → DaVoice.stop parks it)
          await TTSService.initialize();
        } catch (err) {
          console.warn('[App] TTSService.initialize failed:', err);
        }
      }

      if (isOnboardingComplete) {
        try {
          // Step 3: open the mic — WakeWord is now live
          await wakeWordService.resumeDetection();
        } catch (err) {
          console.warn('[App] WakeWord resumeDetection failed:', err);
        }
      }

      // Navigator renders — Open.tsx mounts with WakeWord already active
      setBootstrapDone(true);
    };

    bootstrap();
  }, []);

  // ─── APP STATE (background ↔ foreground) ─────────────────────────────────
  // Use pause/resume — never stop/start — so the instance is never torn down.
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const wakeWordService = WakeWordService.getInstance();
      const wasOnboarded = await DefaultPreference.get('wasOnboarded');
      const isOnboardingComplete = wasOnboarded === '1';

      if (nextAppState === 'background') {
        // Release mic while backgrounded
        try {
          await wakeWordService.pauseDetection(false);
        } catch {}
      } else if (
        nextAppState === 'active' &&
        appState.current === 'background'
      ) {
        // Coming back to foreground
        try {
          await sessionManager.ensureValidSession();
        } catch {}

        try {
          await fetchHelper('wakeup', {}, {});
        } catch {}

        // Resume mic (only if onboarding is complete and bootstrap ran)
        if (isOnboardingComplete && bootstrapDoneRef.current) {
          try {
            await wakeWordService.resumeDetection();
          } catch {}
        }
      } else if (nextAppState === 'active' && appState.current === 'inactive') {
        try {
          await sessionManager.ensureValidSession();
          await fetchHelper('wakeup', {}, {});
        } catch {}
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription?.remove();
    };
  }, []);

  // Show splash while bootstrap runs so Open.tsx always mounts ready
  if (!bootstrapDone) {
    return (
      <View
        style={{
          position: 'absolute',
          width,
          height,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#FFF8E7',
        }}>
        <StatusBar hidden animated />
        <FastImage
          source={require('./assets/movie/recording.gif')}
          style={{width: width * 0.3, height: width * 0.3}}
          resizeMode={FastImage.resizeMode.contain}
        />
        <Text
          style={{
            fontSize: height * 0.03,
            fontWeight: 'bold',
            color: '#8E24AA',
            marginTop: height * 0.02,
            textAlign: 'center',
          }}>
          loading our magic...
        </Text>
      </View>
    );
  }

  return (
    <>
      {/* Hide status bar for immersive experience */}
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
