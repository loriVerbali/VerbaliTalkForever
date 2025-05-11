/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */
import 'react-native-gesture-handler';
import React, {useEffect} from 'react';
import {StyleSheet, Linking} from 'react-native';
import RootControllerView from './Navigation/RootControllerView';
import {AppSettingsProvider} from './utils/persistance';
import {ConnectionProvider} from './utils/connection';
import {AdminProvider} from './contexts/adminContext';
import TTSService from './utils/TTSService';
import VoiceService from './utils/VoiceService';
import {SoundProvider} from './contexts/soundContext';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {useAuth0, Auth0Provider} from 'react-native-auth0';

const App = () => {
  // Initialize voice and TTS services at app level for better performance
  useEffect(() => {
    const initServices = async () => {
      // Initialize TTS service when the app starts
      await TTSService.initialize();

      // Pre-initialize Voice service
      await VoiceService.initialize();
    };

    initServices();

    // Clean up resources when app is closed
    return () => {
      TTSService.shutdown();
      VoiceService.destroy();
    };
  }, []);

  return (
    <Auth0Provider
      domain={'dev-64l2kpebzn1y4zm7.us.auth0.com'}
      clientId={'9CrrlRaLHYzHfzIa5DlE01PdMzwXk5jX'}>
      <GestureHandlerRootView>
        <ConnectionProvider>
          <AppSettingsProvider>
            <AdminProvider>
              <SoundProvider>
                <RootControllerView />
              </SoundProvider>
            </AdminProvider>
          </AppSettingsProvider>
        </ConnectionProvider>
      </GestureHandlerRootView>
    </Auth0Provider>
  );
};

const styles = StyleSheet.create({});

export default App;
