import React, {useEffect} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ImageBackground,
} from 'react-native';
import {useAuth0} from 'react-native-auth0';
import {useNavigation} from '@react-navigation/native';
import {useAppSettings} from '../utils/persistance';
import {views} from '../utils/constants';
import {set} from 'lodash';

const Login: React.FC = () => {
  const {authorize, clearSession, user, error, isLoading} = useAuth0();
  const navigation = useNavigation();
  const {setItem, getItem} = useAppSettings();

  // Check auth state on component mount
  useEffect(() => {
    const checkAuthState = async () => {
      if (user) {
        setItem('auth0Id', user.sub?.replace('auth0|', '') || '');
        // Save user data to preferences
        try {
          await setItem('loggedIn', '1');
          await setItem('username', user.name || '');
          // Navigate to Open screen if user is logged in
          navigation.navigate(views.OPEN as never);
        } catch (e) {
          console.log('Error saving user data:', e);
        }
      } else {
        // Check if user was previously logged in
        try {
          const loggedInValue = await getItem('loggedIn');
          if (loggedInValue === '1') {
            // If user was previously logged in, navigate to Open screen
            navigation.navigate(views.OPEN as never);
          }
        } catch (e) {
          console.log('Error retrieving user data:', e);
        }
      }
    };

    if (!isLoading && user) {
      checkAuthState();
    }
  }, [user, isLoading]);

  const onPress = async () => {
    try {
      const result = await authorize();
      console.log(result);
    } catch (e) {
      console.log(e);
    }
  };

  const onLogout = async () => {
    try {
      await clearSession();
      // Clear stored user data on logout
      await setItem('loggedIn', '0');
      await setItem('username', '');
    } catch (e) {
      console.log('Log out cancelled');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading</Text>
      </View>
    );
  }
  const loggedIn = user !== undefined && user !== null;

  return (
    <ImageBackground
      source={require('../assets/welcome.png')}
      style={styles.backgroundImage}>
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          {loggedIn && (
            <Text style={styles.text}>You are logged in as {user.name}</Text>
          )}
          {!loggedIn && <Text style={styles.text}>You are not logged in</Text>}
        </View>

        <Pressable
          style={styles.button}
          onPress={loggedIn ? onLogout : onPress}>
          <Text style={styles.buttonText}>
            {loggedIn ? 'Log Out' : 'Log In'}
          </Text>
        </Pressable>
        {/* 
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error.message}</Text>
          </View>
        )} */}
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)', // Semi-transparent overlay
  },
  errorContainer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 10,
    borderRadius: 5,
  },
});

export default Login;
