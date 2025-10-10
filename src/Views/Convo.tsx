import React from 'react';
import {View, StyleSheet} from 'react-native';
import SentenceBuilderGrid from '../Components/SentenceBuilder/SentenceBuilderGrid';

const Convo = () => {
  return (
    <View style={styles.container}>
      <SentenceBuilderGrid />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});

export default Convo;
