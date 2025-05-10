import Config, {MethodObject} from './config';
import _ from 'lodash';
import DefaultPreference from 'react-native-default-preference';

const METHODTODEBUG = 'transcribeAudio'; ////remove this after debugging//

// Retry-enabled fetch function
const fetchWithRetry = async (
  url: string,
  methodName: keyof typeof Config.methods,
  request: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<any> => {
  try {
    const response = await fetch(url, request);

    // Handle successful responses
    if (response.status >= 200 && response.status < 300) {
      if (response.status === 204) return response;
      if (response.status === 200 && Config.methods[methodName].isPicsUrl)
        return response;
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
      return Promise.reject(
        'WE made a bubu! Sorry about that , please open the app again',
      );
    }
  } catch (error) {
    console.warn('Error:', error);
  }
};

const fetchHelper = async (
  methodName: keyof typeof Config.methods,
  dynamicUrlData: Record<string, string>,
  bodyData: any = '',
): Promise<any> => {
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
    ? Config.openAiUrl + parsedUrl
    : methodName === 'generateImage'
    ? Config.picsUrl + parsedUrl
    : Config.baseUrl + parsedUrl;

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
