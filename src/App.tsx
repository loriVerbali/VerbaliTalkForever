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
import {AssistantProvider} from './contexts/AssistantContext';

const App = () => {
  return (
    <>
      <ConnectionProvider>
        <AppSettingsProvider>
          <AssistantProvider>
            <RootControllerView />
          </AssistantProvider>
        </AppSettingsProvider>
      </ConnectionProvider>
    </>
  );
};

const styles = StyleSheet.create({});

export default App;
