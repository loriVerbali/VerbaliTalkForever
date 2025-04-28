import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  StatusBar,
  Pressable,
} from 'react-native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import {views} from '../utils/constants';

type RootStackParamList = {
  MainTab: {
    screen: string;
    params: {stateof: string};
  };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const {height} = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40; // fallback for iOS

const OpenScreen: React.FC = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();

  const handleNavigation = (state: string) => {
    navigation.navigate('MainTab', {
      screen: views.HOME,
      params: {stateof: state},
    });
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.microphoneButton}>
        <FastImage
          source={require('../assets/microphone.png')}
          style={styles.microphoneImage}
          resizeMode={FastImage.resizeMode.contain}
        />
      </Pressable>
      <View style={styles.contentContainer}>
        <View
          style={{
            flexDirection: 'row',
            height: height / 2 - tabBarHeight / 2 - statusBarHeight,
          }}>
          <View style={styles.rowContent}>
            <Pressable
              style={styles.tileWrapper}
              onPress={() => handleNavigation('Talk')}>
              <FastImage
                source={require('../assets/talk.png')}
                style={{width: '100%', height: '100%'}}
                resizeMode={FastImage.resizeMode.contain}
              />
              <Text style={styles.kidText}>Start Talking</Text>
            </Pressable>
          </View>
          <View style={styles.rowContent}>
            <Pressable style={styles.tileWrapper}>
              <FastImage
                source={require('../assets/shortCuts.png')}
                style={{width: '100%', height: '100%'}}
                resizeMode={FastImage.resizeMode.contain}
              />
              <Text style={styles.kidText}>ShortCuts!</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            height: height / 2 - tabBarHeight / 2,
          }}>
          <View style={styles.rowContent}>
            <Pressable style={styles.tileWrapper}>
              <FastImage
                source={require('../assets/feelings.png')}
                style={{width: '100%', height: '100%'}}
                resizeMode={FastImage.resizeMode.contain}
              />
              <Text style={styles.kidText}>How I Feel</Text>
            </Pressable>
          </View>
          <View style={styles.rowContent}>
            <Pressable
              style={styles.tileWrapper}
              onPress={() => handleNavigation('KB')}>
              <FastImage
                source={require('../assets/keyboard.png')}
                style={{width: '100%', height: '100%'}}
                resizeMode={FastImage.resizeMode.contain}
              />
              <Text style={styles.kidText}>Type Here!</Text>
            </Pressable>
          </View>
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
    justifyContent: 'center',
    marginTop: 40,
  },
  rowContent: {
    width: '50%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileWrapper: {
    width: '80%',
    borderRadius: 20,
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  microphoneButton: {
    position: 'absolute',
    top: 40,
    left: 10,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  microphoneImage: {
    width: '100%',
    height: '100%',
  },
  kidText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default OpenScreen;
