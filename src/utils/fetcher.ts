import Config from 'react-native-config';
import _ from 'lodash';
import AppConfig, {MethodObject} from './config';
import {sessionManager} from './sessionManager';

const METHODTODEBUG = 'processImagesConvo';

// Helper function to check if user is authenticated (always true for guest sessions)
export const isAuthenticated = async (): Promise<boolean> => {
  // Guest sessions are always "authenticated"
  return true;
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
        // Try to refresh session and retry once
        const newToken = await sessionManager.refreshSession();

        if (newToken) {
          request.headers = {
            ...request.headers,
            Authorization: 'Bearer ' + newToken,
          };
          return fetchWithRetry(url, methodName, request, retries - 1, delay);
        }

        return Promise.reject('Authentication failed - session refresh failed');
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
      // For backend API calls, ensure we have a valid session token
      const sessionToken = await sessionManager.ensureValidSession();
      if (sessionToken) {
        headers['Authorization'] = 'Bearer ' + sessionToken;
      } else {
        console.warn(
          `No valid session token found for authenticated method: ${methodName}`,
        );
        return Promise.reject('No valid session token');
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
  // Apply a 20s timeout only for Whisper transcription (OpenAI) requests
  if (methodName === 'transcribeAudio') {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 8000);

    // Attach abort signal to this request
    (request as RequestInit).signal = abortController.signal;

    try {
      return await fetchWithRetry(url, methodName, request);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return fetchWithRetry(url, methodName, request);
};

export default fetchHelper;
