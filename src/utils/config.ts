export interface MethodObject {
  description: string;
  isAuthenticated: boolean;
  verb: 'GET' | 'POST' | 'PUT' | 'DELETE';
  sendDeviceKey: boolean;
  jsonMethod: boolean;
  suffixUrl: string;
  mustStringify: boolean;
  isFlatResponse: boolean;
  openAi: boolean;
  contentType: string;
  isBeta: boolean;
  isPicsUrl: boolean;
}

export interface ConfigType {
  baseUrl: string;
  openAiUrl: string;
  picsUrl: string;
  methods: Record<string, MethodObject>;
}

const Config: ConfigType = {
  baseUrl: 'https://niche.ink/api',
  openAiUrl: 'https://api.openai.com/v1',
  picsUrl: 'https://image.pollinations.ai/prompt',
  methods: {
    registerUser: {
      description: 'registerUser',
      isAuthenticated: false,
      verb: 'POST',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/auth/local/register',
      mustStringify: true,
      isFlatResponse: false,
      openAi: false,
      isBeta: false,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    saveFCM: {
      description: 'saveFCM',
      isAuthenticated: false,
      verb: 'POST',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/auth/local/fcm',
      mustStringify: true,
      isFlatResponse: false,
      openAi: false,
      isBeta: false,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    transcribeAudio: {
      description: 'transcribeAudio',
      isAuthenticated: true,
      verb: 'POST',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/audio/transcribe',
      mustStringify: true,
      isFlatResponse: false,
      openAi: true,
      isBeta: false,
      isPicsUrl: false,
      contentType: 'multipart/form-data',
    },
    assistantAPI: {
      description: 'chat',
      isAuthenticated: true,
      verb: 'POST',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/chat/completions',
      mustStringify: true,
      isFlatResponse: false,
      openAi: true,
      isBeta: true,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    createThread: {
      description: 'createThread',
      isAuthenticated: true,
      verb: 'POST',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/threads',
      mustStringify: true,
      isFlatResponse: false,
      openAi: true,
      isBeta: true,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    sendMessage: {
      description: 'sendMessage',
      isAuthenticated: true,
      verb: 'POST',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/threads/{thread_id}/messages',
      mustStringify: true,
      isFlatResponse: false,
      openAi: true,
      isBeta: true,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    runAssistant: {
      description: 'runAssistant',
      isAuthenticated: true,
      verb: 'POST',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/threads/{thread_id}/runs',
      mustStringify: true,
      isFlatResponse: false,
      openAi: true,
      isBeta: true,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    checkRunStatus: {
      description: 'checkRunStatus',
      isAuthenticated: true,
      verb: 'GET',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/threads/{thread_id}/runs/{run_id}',
      mustStringify: false,
      isFlatResponse: false,
      openAi: true,
      isBeta: true,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    getMessages: {
      description: 'getMessages',
      isAuthenticated: true,
      verb: 'GET',
      sendDeviceKey: false,
      jsonMethod: true,
      suffixUrl: '/threads/{thread_id}/messages',
      mustStringify: false,
      isFlatResponse: false,
      openAi: true,
      isBeta: true,
      isPicsUrl: false,
      contentType: 'application/json',
    },
    generateImage: {
      description: 'generateImage',
      isAuthenticated: false,
      verb: 'GET',
      sendDeviceKey: false,
      jsonMethod: false,
      suffixUrl: '/{prompt}?width=200&height=200&seed={seed}',
      mustStringify: false,
      isFlatResponse: true,
      openAi: false,
      isBeta: false,
      isPicsUrl: true,
      contentType: 'application/json',
    },
    // Add other methods as needed
  },
};

export default Config;
