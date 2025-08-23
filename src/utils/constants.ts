import React from 'react';
import {Dimensions, ImageSourcePropType} from 'react-native';
import FastImage from 'react-native-fast-image';

// Define types for views and stacks
type Views = {
  HOME: string;
  SETTINGS: string;
  AUTHORS: string;
  INITVIEW: string;
  SETUP: string;
  BROWSE: string;
  PRIVACY: string;
  ABOUTUS: string;
  CONTACT: string;
  ONBOARDING: string;
  LOGGEDINSTACK: string;
  OPEN: string;
  FEELINGS: string;
  SHORTCUTS: string;
  CONVO: string;
  LOGIN: string;
};

type Stacks = {
  LOGGEDINSTACK: string;
  LOGIN: string;
  INITSTACK: string;
};

// Define types for carousel data
type CarouselItem = {
  title: string;
  description: string;
  subdescription: string;
  bgColor: string;
  textColor: string;
  subTextColor: string;
  resizeMode: keyof typeof FastImage.resizeMode;
  pic: ImageSourcePropType;
  colors: string;
};

// Export the constants with types
export const views: Views = {
  HOME: 'HOME',
  SETTINGS: 'view.SETTINGS',
  AUTHORS: 'AUTHORS',
  INITVIEW: 'view.INITVIEW',
  SETUP: 'view.SETUP',
  BROWSE: 'view.BROWSE',
  ONBOARDING: 'ONBOARDING',
  LOGGEDINSTACK: 'LOGGEDINSTACK',
  PRIVACY: 'view.PRIVACY',
  ABOUTUS: 'view.ABOUTUS',
  CONTACT: 'view.CONTACT',
  OPEN: 'view.OPEN',
  FEELINGS: 'FEELINGS',
  SHORTCUTS: 'SHORTCUTS',
  CONVO: 'Convo',
  LOGIN: 'LOGIN',
};

export const stacks: Stacks = {
  LOGGEDINSTACK: 'LOGGEDINSTACK',
  LOGIN: 'LOGIN',
  INITSTACK: 'INITSTACK',
};

export const imageUrl = {
  url: 'https://niche.ink',
};

export const carouselData: CarouselItem[] = [
  {
    title: 'Welcome to GH Tracker',
    description: '',
    subdescription: ' Track your GH treatment with ease',
    bgColor: '#3B5998',
    textColor: 'white',
    subTextColor: 'white',
    resizeMode: FastImage.resizeMode.cover,
    pic: require('../assets/welcome.png'),
    colors: '#AF9B46',
  },
  {
    title: 'Lets get started',
    description: 'Growing together',
    subdescription: ' ',
    bgColor: '#43d854',
    textColor: 'white',
    subTextColor: 'white',
    resizeMode: FastImage.resizeMode.cover,
    pic: require('../assets/welcome.png'),
    colors: '#089ACD',
  },
];

export const colors = {
  niceBlue: '#19769f',
  shipCove: '#7A8EB1',
  white: '#FFFFFF',
  biscay: '#2B3857',
};

export const SCREEN_WIDTH = Dimensions.get('window').width;
export const SCREEN_HEIGHT = Dimensions.get('window').height;

export const CAROUSEL_VERTICAL_OUTPUT = 100;
export const CAROUSEL_ITEM_WIDTH = SCREEN_WIDTH;

export const MODEL_CONFIG = {
  // Flag to control which model is used
  USE_MODEL: 'GEMMA_3N', // Options: 'GEMMA_2B' or 'GEMMA_3N'

  // Model definitions
  MODELS: {
    GEMMA_2B: {
      name: 'Gemma 2B',
      url: 'https://huggingface.co/BafS/gemma-2-2b-it-Q4_K_M-GGUF/resolve/main/gemma-2-2b-it-q4_k_m.gguf',
      fileName: 'gemma-2-2b-it-q4_k_m.gguf',
      size: '1.6GB',
      description: 'Gemma 2B Instruct model - faster, smaller file size',
    },
    GEMMA_3N: {
      name: 'Gemma 3N',
      url: 'https://huggingface.co/unsloth/gemma-3n-E2B-it-GGUF/resolve/main/gemma-3n-E2B-it-Q4_K_M.gguf',
      fileName: 'gemma-3n-E2B-it-Q4_K_M.gguf',
      size: '2.8GB',
      description:
        'Gemma 3N Instruct model - better performance, larger file size',
    },
  },

  // Get the currently selected model
  getCurrentModel() {
    return this.MODELS[this.USE_MODEL as keyof typeof this.MODELS];
  },

  // Get model URL
  getModelUrl() {
    return this.getCurrentModel().url;
  },

  // Get model file name
  getModelFileName() {
    return this.getCurrentModel().fileName;
  },

  // Get model size
  getModelSize() {
    return this.getCurrentModel().size;
  },

  // Get model name
  getModelName() {
    return this.getCurrentModel().name;
  },

  // Get model description
  getModelDescription() {
    return this.getCurrentModel().description;
  },

  // Whisper model configuration
  WHISPER: {
    name: 'Whisper Base English',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    fileName: 'ggml-small.en.bin',
    size: '466MB',
    description: 'Whisper transcription model for voice-to-text conversion',
  },

  // Get Whisper model URL
  getWhisperModelUrl() {
    return this.WHISPER.url;
  },

  // Get Whisper model file name
  getWhisperModelFileName() {
    return this.WHISPER.fileName;
  },

  // Get Whisper model size
  getWhisperModelSize() {
    return this.WHISPER.size;
  },

  // Get Whisper model name
  getWhisperModelName() {
    return this.WHISPER.name;
  },

  // Get Whisper model description
  getWhisperModelDescription() {
    return this.WHISPER.description;
  },

  // Transcription configuration
  TRANSCRIPTION: {
    useLocalWhisper: true, // Set to false to use cloud-based transcription
    fallbackToCloud: true, // If local fails, fallback to cloud
  },

  // Get transcription preference (now dynamic based on settings)
  shouldUseLocalWhisper(useLocalWhisper?: boolean) {
    // Use the local whisper setting if provided, otherwise use default
    return useLocalWhisper !== undefined
      ? useLocalWhisper
      : this.TRANSCRIPTION.useLocalWhisper;
  },

  // Get fallback preference
  shouldFallbackToCloud() {
    return this.TRANSCRIPTION.fallbackToCloud;
  },
};
