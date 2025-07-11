import Config from 'react-native-config';
import DefaultPreference from 'react-native-default-preference';
import Auth0 from 'react-native-auth0';
import {Platform} from 'react-native';
import _ from 'lodash';
import AppConfig, {MethodObject} from './config';

const METHODTODEBUG = 'transcribeAudio'; ////remove this after debugging//

// Global reference to Auth0 instance for token refresh
let auth0Instance: Auth0 | null = null;

// Function to set the Auth0 instance from the app
export const setAuth0Instance = (instance: Auth0) => {
  auth0Instance = instance;
};

// Function to refresh the token
export const refreshToken = async (): Promise<string | null> => {
  // For now, just return the existing token without refresh logic
  try {
    const existingToken = await DefaultPreference.get('token');
    if (existingToken && existingToken !== 'init.NotSet') {
      return existingToken;
    }
    return null;
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
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

// Retry-enabled fetch function
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
    if (response.status === 401) {
      // Handle 401 responses differently based on whether the method requires authentication
      const methodObject = AppConfig.methods[methodName];
      if (methodObject.isAuthenticated && !methodObject.openAi) {
        console.log(
          'Received 401 for authenticated method, attempting token refresh...',
        );
        const newToken = await refreshToken();
        if (newToken) {
          // Update the Authorization header with the new token
          const headers = request.headers as Record<string, string>;
          headers['Authorization'] = `Bearer ${newToken}`;

          // Retry the request with the new token
          console.log('Retrying request with refreshed token...');
          return fetchWithRetry(url, methodName, request, retries - 1, delay);
        }
        return Promise.reject(
          'Authentication failed - unable to refresh token',
        );
      } else {
        // For non-authenticated methods, a 401 indicates a server configuration issue
        console.error(
          `Received 401 for non-authenticated method: ${methodName}. Check backend configuration.`,
        );
        return Promise.reject(
          `Server configuration error - endpoint ${methodObject.suffixUrl} should not require authentication`,
        );
      }
    }
    if (response.status === 400) {
      return response;
    }

    // Retry on 504 status
    if (response.status === 504) {
      return Promise.reject(
        'WE made a bubu! Sorry about that , please open the app again',
      );
    }
  } catch (error) {
    console.warn('Error:', error);
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
    console.log({url});
    console.log({methodName});
    console.log({request});
  }

  // Use fetchWithRetry for the request
  return fetchWithRetry(url, methodName, request);
};

export default fetchHelper;
