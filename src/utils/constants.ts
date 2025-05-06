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
};

type Stacks = {
  LOGGEDINSTACK: string;
  LOGIN: string;
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
  HOME: 'view.HOME',
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
  FEELINGS: 'view.FEELINGS',
  SHORTCUTS: 'view.SHORTCUTS',
};

export const stacks: Stacks = {
  LOGGEDINSTACK: 'LOGGEDINSTACK',
  LOGIN: 'LOGIN',
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
