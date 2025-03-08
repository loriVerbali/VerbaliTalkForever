import Config, {MethodObject} from './config';
import _ from 'lodash';
import DefaultPreference from 'react-native-default-preference';

const METHODTODEBUG = 'checkRunStatus'; ////remove this after debugging//

// Retry-enabled fetch function
const fetchWithRetry = async (
  url: string,
  request: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<any> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, request);

      // Handle successful responses
      if (response.status >= 200 && response.status < 300) {
        if (response.status === 204) return response;
        return await response.json();
      }

      // Handle specific status codes
      if (response.status === 500) {
        return Promise.reject('Server error');
      }
      if (response.status === 401) {
        return Promise.reject('Not authenticated');
      }
      if (response.status === 400) {
        return response;
      }

      // Retry on 504 status
      if (response.status === 504) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          return Promise.reject(
            'WE made a bubu! Sorry about that , please open the app again',
          );
        }
      }
    } catch (error) {
      console.warn('Error:', error);

      // Retry on network or transient errors
      if (attempt < retries) {
        //console.warn(`Retrying... (${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return Promise.reject(error);
      }
    }
  }
};

const fetchHelper = async (
  methodName: keyof typeof Config.methods,
  dynamicUrlData: Record<string, string>,
  bodyData: any = '',
): Promise<any> => {
  if (methodName === METHODTODEBUG) {
    debugger;
    console.log('checkRunStatus called with:', {
      dynamicUrlData,
      bodyData,
    });

    // Add URL debugging
    const baseUrl = Config.methods[methodName].openAi
      ? Config.openAiUrl
      : Config.baseUrl;
    const suffixUrl = Config.methods[methodName].suffixUrl;
    let finalUrl = `${baseUrl}${suffixUrl}`;

    // Replace dynamic parameters in URL
    Object.keys(dynamicUrlData).forEach(key => {
      finalUrl = finalUrl.replace(`{${key}}`, dynamicUrlData[key]);
    });

    console.log('checkRunStatus URL:', finalUrl);
  }

  const methodObject: MethodObject = Config.methods[methodName];

  const headers: Record<string, string> = {};

  const OPEN_AI_KEY =
    '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';
  // Add token if the method requires authentication
  const token = await DefaultPreference.get('token');
  if (methodObject.isAuthenticated) {
    if (methodObject.openAi) {
      headers['Authorization'] = 'Bearer ' + OPEN_AI_KEY;
    } else {
      headers['Authorization'] = 'Bearer ' + token;
    }
  }

  // Set content type for JSON requests
  if (methodObject.jsonMethod) {
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
    ? Config.openAiUrl + parsedUrl
    : Config.baseUrl + parsedUrl;

  // Add body data for POST or PUT requests
  if (methodObject.verb === 'POST' || methodObject.verb === 'PUT') {
    request.body = JSON.stringify(bodyData);
  }

  // Use fetchWithRetry for the request
  return fetchWithRetry(url, request);
};

export default fetchHelper;
