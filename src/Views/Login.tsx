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
import fetchHelper from '../utils/fetcher';

const Login: React.FC = () => {
  const {authorize, clearSession, user, error, isLoading, getCredentials} =
    useAuth0();
  const navigation = useNavigation();
  const {setItem, getItem} = useAppSettings();

  // Helper function to extract user ID from Auth0 user.sub
  const extractUserId = (userSub: string): string => {
    // Handle both Auth0 and Google OAuth user IDs
    if (userSub.startsWith('auth0|')) {
      return userSub.replace('auth0|', '');
    } else if (userSub.startsWith('google-oauth2|')) {
      return userSub.replace('google-oauth2|', '');
    } else if (userSub.startsWith('apple|')) {
      return userSub.replace('apple|', '');
    }

    // For other providers or if no prefix, return as-is
    return userSub;
  };

  // Helper function to get assistant ID for the user
  const getAssistantId = async (userId: string): Promise<void> => {
    try {
      const response = await fetchHelper(
        'getAssistantId',
        {},
        {
          userId: userId,
        },
      );

      if (response && response.assistantId) {
        await setItem('assistantId', response.assistantId);
      }
    } catch (error) {
      console.error('Error getting assistant ID:', error);
    }
  };

  // Helper function to get and store fresh credentials
  const getAndStoreCredentials = async (): Promise<void> => {
    try {
      const credentials = await getCredentials();
      if (credentials?.accessToken) {
        await setItem('token', credentials.accessToken);
      }
    } catch (tokenError: any) {
      // If we can't get credentials, user might need to re-authenticate
      if (tokenError.message?.includes('No credentials stored')) {
        await setItem('loggedIn', '0');
        await setItem('token', '');
      }
    }
  };

  // Check auth state on component mount
  useEffect(() => {
    const checkAuthState = async () => {
      if (user) {
        const userId = user.sub?.toString() || '';
        setItem('auth0Id', userId);

        // Get and store the access token
        await getAndStoreCredentials();

        // Save user data to preferences
        try {
          await setItem('loggedIn', '1');
          await setItem('username', user.name || '');

          // Get and store the assistant ID for this user
          await getAssistantId(userId);

          // Navigate to Open screen if user is logged in
          navigation.navigate(views.OPEN as never);
        } catch (e) {
          console.error('Error saving user data:', e);
        }
      } else {
        // Check if user was previously logged in
        try {
          const loggedInValue = await getItem('loggedIn');
          if (loggedInValue === '1') {
            // If user was previously logged in, try to get fresh credentials
            await getAndStoreCredentials();

            // Get the stored user ID and fetch assistant ID if not already stored
            const storedUserId = await getItem('auth0Id');
            const storedAssistantId = await getItem('assistantId');

            if (storedUserId && !storedAssistantId) {
              await getAssistantId(storedUserId);
            }

            // Navigate to Open screen if user is logged in
            navigation.navigate(views.OPEN as never);
          }
        } catch (e) {
          console.error('Error retrieving user data:', e);
        }
      }
    };

    if (!isLoading) {
      checkAuthState();
    }
  }, [user, isLoading]);

  const onPress = async () => {
    try {
      const result = await authorize({
        scope: 'openid profile email offline_access',
        audience: 'https://matalkapi-production.up.railway.app/',
      });

      // Store the access token from the result
      if (result?.accessToken) {
        await setItem('token', result.accessToken);
      }
      // Stop persisting refresh tokens; Auth0 Credentials Manager handles rotation
    } catch (e) {
      console.error('Authorization error:', e);
    }
  };

  const onLogout = async () => {
    try {
      await clearSession();
      // Clear stored user data and token on logout
      await setItem('loggedIn', '0');
      await setItem('username', '');
      await setItem('token', '');
    } catch (e) {
      console.error('Log out cancelled:', e);
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
  },
});

export default Login;
