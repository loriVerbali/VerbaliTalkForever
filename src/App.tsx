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
import {IepStoreProvider} from './features/iep/hooks/IepStoreProvider';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {sessionManager} from './utils/sessionManager';
import mixpanel from './utils/mixpanelInstance';
import TTSService from './utils/TTSService';
import WakeWordService from './utils/wakewordService';
import fetchHelper from './utils/fetcher';
import {personalMemoryService} from './services/PersonalMemoryService';
import DefaultPreference from 'react-native-default-preference';
import DeviceInfo from 'react-native-device-info';
import FastImage from 'react-native-fast-image';
import {PostHogProvider} from 'posthog-react-native';
import AppUpdateModal from './Components/AppUpdateModal';
import {
  checkForUpdatePopup,
  hasUpdatePopupBeenShownThisSession,
  markUpdatePopupShown,
} from './utils/appUpdateService';
import type {DisplayableUpdatePolicy} from './types/appUpdate';

const {width, height} = Dimensions.get('window');

const App = () => {
  const appState = useRef(AppState.currentState);
  // Bootstrap tracks whether the init-once startup sequence has completed.
  // The Navigator (and therefore Open.tsx) is not rendered until this is true,
  // so Open.tsx always mounts with WakeWord already live.
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const bootstrapRanRef = useRef(false);
  const bootstrapDoneRef = useRef(false);

  // Start-up update popup. The policy request runs in parallel with bootstrap
  // and the modal is shown once the root UI is available. The once-per-session
  // guard lives in appUpdateService (in-memory only, by design).
  const [updatePolicy, setUpdatePolicy] =
    useState<DisplayableUpdatePolicy | null>(null);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);

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
      // Warm up the backend on cold start (fire-and-forget, don't block startup)
      fetchHelper('wakeup', {}, {}).catch(() => {});

      const wakeWordService = WakeWordService.getInstance();
      const wasOnboarded = await DefaultPreference.get('wasOnboarded');
      const isOnboardingComplete = wasOnboarded === '1';

      // Update popup: only for users who have completed onboarding. Fetched in
      // parallel — never awaited by bootstrap, fails safely to null so startup
      // is unaffected by network issues.
      if (isOnboardingComplete && !hasUpdatePopupBeenShownThisSession()) {
        checkForUpdatePopup()
          .then(policy => {
            if (policy) setUpdatePolicy(policy);
          })
          .catch(() => {});
      }

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

      // Personal Memory: open the local DB (no-op mode on failure)
      await personalMemoryService.init().catch(() => {});

      // Navigator renders — Open.tsx mounts with WakeWord already active
      setBootstrapDone(true);
    };

    bootstrap();
  }, []);

  // ─── UPDATE POPUP (once per native session) ──────────────────────────────
  // Show only after the root UI is rendered; mark the guard when displayed.
  useEffect(() => {
    if (!bootstrapDone || !updatePolicy) return;
    if (hasUpdatePopupBeenShownThisSession()) return;
    markUpdatePopupShown();
    setUpdateModalVisible(true);
    try {
      mixpanel.track('Update Popup Shown', {
        importance: updatePolicy.importance,
        installed_build: updatePolicy.installedBuild,
        minimum_popup_build: updatePolicy.minimumPopupBuild,
        latest_build: updatePolicy.latestBuild,
      });
    } catch {}
  }, [bootstrapDone, updatePolicy]);

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

        // Personal Memory: drain extraction queue + daily drift check
        personalMemoryService.onAppForeground();
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
            <PostHogProvider
              apiKey="phc_xTg6VY6vzemW5JDCkTY63fQxpzQhHGG3y8zWGk5Lgaws"
              // Screen autocapture calls useNavigation(), but this provider
              // sits above NavigationContainer so it can only ever log
              // "useNavigation error". Screens are tracked via mixpanel.
              autocapture={{ captureScreens: false }}
              options={{
                host: 'https://us.i.posthog.com',

                // Enable session recording. Requires enabling in your project settings as well.
                // Default is false.
                enableSessionReplay: true,

                sessionReplayConfig: {
                  // Whether text inputs are masked. Default is true.
                  // Password inputs are always masked regardless
                  maskAllTextInputs: true,

                  // Whether images are masked. Default is true.
                  maskAllImages: true,

                  // Capture logs automatically. Default is true.
                  // Android only (Native Logcat only)
                  //
                  // Support for remote configuration
                  // in the [session replay settings](https://app.posthog.com/settings/project-replay#replay-log-capture)
                  // requires SDK version 4.35.0 or higher.
                  captureLog: true,

                  // Whether network requests are captured in recordings. Default is true
                  // Only metric-like data like speed, size, and response code are captured.
                  // No data is captured from the request or response body.
                  // iOS only
                  //
                  // Support for remote configuration
                  // in the [session replay settings](https://app.posthog.com/settings/project-replay#replay-network)
                  // requires SDK version 4.35.0 or higher.
                  captureNetworkTelemetry: true,

                  // Sample rate for session recordings. A value between 0.0 and 1.0.
                  // 1.0 means 100% of sessions will be recorded. 0.5 means 50%, and so on.
                  // Local config has precedence over remote config when both are set.
                  // Default is undefined (all sessions are recorded).
                  sampleRate: undefined,

                  // Throttling delay used to reduce the number of snapshots captured
                  // and reduce performance impact. Default is 1000ms
                  throttleDelayMs: 1500,
                },
              }}>
              <AppSettingsProvider>
                <DatabaseProvider>
                  <IepStoreProvider>
                  <AdminProvider>
                    <ChatContextProvider>
                      <RootControllerView />
                    </ChatContextProvider>
                  </AdminProvider>
                  </IepStoreProvider>
                </DatabaseProvider>
              </AppSettingsProvider>
            </PostHogProvider>
          </ConnectionProvider>
        </ToastProvider>
        {/* Root-owned so it works for onboarding and logged-in stacks alike */}
        <AppUpdateModal
          visible={updateModalVisible}
          policy={updatePolicy}
          onClose={() => setUpdateModalVisible(false)}
        />
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
