import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, Dimensions} from 'react-native';

const {width} = Dimensions.get('window');

type RootStackParamList = {
  Home: undefined;
};

const OpenScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <View style={{flexDirection: 'row'}}>
          <View style={{width: '50%'}}></View>
          <View style={{width: '50%'}}></View>
        </View>
        <View style={{flexDirection: 'row'}}>
          <View style={{width: '50%'}}></View>
          <View style={{width: '50%'}}></View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'column',
    width: '100%',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'red',
  },
});

export default OpenScreen;
