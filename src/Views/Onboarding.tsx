import React, {useState, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Pressable,
} from 'react-native';

import {useRoute, RouteProp} from '@react-navigation/native';
const {width} = Dimensions.get('window');

type RootStackParamList = {
  OnBoarding: {
    initialSection?: number;
    initSetup?: number;
    userInfoLocal: UserInfo;
  };
  Home: undefined;
};
type UserInfo = {
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  photo: string;
};
type OnBoardingProp = RouteProp<RootStackParamList, 'OnBoarding'>;

const OnBoarding: React.FC = () => {
  const route = useRoute<OnBoardingProp>();

  return (
    <View style={styles.container}>
      <Text>OnBoarding</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});

export default OnBoarding;
