import Config from 'react-native-config';
import DefaultPreference from 'react-native-default-preference';
import Auth0 from 'react-native-auth0';
import {Platform} from 'react-native';
import _ from 'lodash';
import AppConfig, {MethodObject} from './config';

const METHODTODEBUG = 'transcribeAudio';

// Global reference to Auth0 instance for token refresh
let auth0Instance: Auth0 | null = null;

// Function to set the Auth0 instance from the app
export const setAuth0Instance = (instance: Auth0) => {
  auth0Instance = instance;
};

// Function to refresh the token
export const refreshToken = async (): Promise<string | null> => {
  try {
    const refreshToken = await DefaultPreference.get('refreshToken');
    if (!refreshToken || refreshToken === 'init.NotSet') {
      console.warn('No refresh token available');
      return null;
    }

    if (!auth0Instance) {
      throw new Error('Auth0 instance not initialized');
    }

    const newTokens = await auth0Instance.auth.refreshToken({refreshToken});

    if (newTokens?.accessToken) {
      await DefaultPreference.set('token', newTokens.accessToken);

      // Optional: update refreshToken if new one is returned
      if (newTokens.refreshToken) {
        await DefaultPreference.set('refreshToken', newTokens.refreshToken);
      }

      return newTokens.accessToken;
    }

    return null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
};

// Function to handle token expiration/invalidation
export const handleTokenExpiration = async (): Promise<void> => {
  try {
    // Clear all auth-related data
    await DefaultPreference.set('token', '');
    await DefaultPreference.set('loggedIn', '0');
    await DefaultPreference.set('username', '');
  } catch (error) {
    console.error('Error handling token expiration:', error);
  }
};

// Public utility function to ensure we have a fresh token
export const ensureFreshToken = async (): Promise<string | null> => {
  try {
    const currentToken = await DefaultPreference.get('token');
    if (currentToken && currentToken !== 'init.NotSet') {
      // Check if we can refresh the token to ensure it's valid
      const freshToken = await refreshToken();
      return freshToken || currentToken;
    }
    // If no current token, try to get one
    return await refreshToken();
  } catch (error) {
    console.error('Error ensuring fresh token:', error);
    return null;
  }
};

// Helper function to check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  try {
    const token = await DefaultPreference.get('token');
    return token !== null && token !== 'init.NotSet' && token !== '';
  } catch (error) {
    console.error('Error checking authentication status:', error);
    return false;
  }
};

// Modify the fetchWithRetry function to handle 401s better
const fetchWithRetry = async (
  url: string,
  methodName: keyof typeof AppConfig.methods,
  request: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<any> => {
  try {
    const response = await fetch(url, request);

    // Handle successful responses
    if (response.status >= 200 && response.status < 300) {
      if (response.status === 204) return response;
      if (response.status === 200 && AppConfig.methods[methodName].isPicsUrl)
        return response;
      return await response.json();
    }

    // Handle specific status codes
    if (response.status === 500) {
      return Promise.reject('Server error');
    }

    if (response.status === 401 && retries > 0) {
      const methodObject = AppConfig.methods[methodName];
      if (methodObject.isAuthenticated && !methodObject.openAi) {
        const newToken = await refreshToken();

        if (newToken) {
          request.headers = {
            ...request.headers,
            Authorization: 'Bearer ' + newToken,
          };
          return fetchWithRetry(url, methodName, request, retries - 1, delay);
        }

        await handleTokenExpiration();
        return Promise.reject('Authentication failed - please log in again');
      }
    }

    if (response.status === 400) {
      return response;
    }

    // Retry on 504 status
    if (response.status === 504) {
      return Promise.reject('Server timeout error. Please try again.');
    }

    return Promise.reject(`Request failed with status ${response.status}`);
  } catch (error) {
    console.error('Network or parsing error:', error);
    throw error;
  }
};

const fetchHelper = async (
  methodName: keyof typeof AppConfig.methods,
  dynamicUrlData: Record<string, string>,
  bodyData: any = '',
): Promise<any> => {
  const methodObject: MethodObject = AppConfig.methods[methodName];

  const headers: Record<string, string> = {};

  // Add token if the method requires authentication
  if (methodObject.isAuthenticated) {
    if (methodObject.openAi) {
      headers['Authorization'] = 'Bearer ' + (Config.OPENAI_API_KEY || '');
    } else {
      // For backend API calls, get the Auth0 token
      const token = await DefaultPreference.get('token');
      if (token && token !== 'init.NotSet') {
        headers['Authorization'] = 'Bearer ' + token;
      } else {
        console.warn(
          `No valid token found for authenticated method: ${methodName}`,
        );
        return Promise.reject('No valid authentication token');
      }
    }
  }

  // Set content type for JSON requests
  if (
    methodObject.jsonMethod &&
    methodObject.contentType !== 'multipart/form-data'
  ) {
    headers['Content-Type'] = methodObject.contentType;
    methodObject.isBeta && methodObject.openAi
      ? (headers['OpenAI-Beta'] = 'assistants=v2')
      : null;
  }

  const request: RequestInit = {
    method: methodObject.verb,
    headers: headers,
    mode: 'cors',
  };

  // Parse and construct the dynamic URL
  let parsedUrl = methodObject.suffixUrl;
  const regex = new RegExp('{(.*?)}');
  _.each(dynamicUrlData, item => {
    parsedUrl = parsedUrl.replace(regex, (pattern, val) => {
      return dynamicUrlData[val];
    });
  });

  const url = methodObject.openAi
    ? AppConfig.openAiUrl + parsedUrl
    : methodName === 'generateImage'
    ? AppConfig.picsUrl + parsedUrl
    : AppConfig.baseUrl + parsedUrl;

  // Add body data for POST or PUT requests
  if (methodObject.verb === 'POST' || methodObject.verb === 'PUT') {
    if (methodObject.contentType === 'multipart/form-data') {
      request.body = bodyData; // send FormData as-is
      // Do NOT set Content-Type header, let fetch handle it
      delete headers['Content-Type'];
    } else {
      request.body = JSON.stringify(bodyData);
    }
  }

  if (methodName === METHODTODEBUG) {
    // console.log({url});
    // console.log({methodName});
    // console.log({request});
  }

  // Use fetchWithRetry for the request
  return fetchWithRetry(url, methodName, request);
};

export default fetchHelper;
