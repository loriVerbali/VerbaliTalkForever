import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  FC,
  useEffect,
  useRef,
} from 'react';
import DefaultPreference from 'react-native-default-preference';
// Receipt validation removed - paid app
import WhisperModelManager from './WhisperModelManager';
import {sessionManager} from './sessionManager';

interface Preferences {
  loggedIn: string;
  username: string;
  wasWelcomed: string;
  showInit: string;
  token: string;
  threadCreatedAt: string;
  returnedMessages: string;
  topicsCount: string;
  actionsCount: string;
  objectsCount: string;
  wasOnboarded: string;
  heroName: string;
  adminCode: string;
  gender: string;
  auth0Id: string;
  assistantId: string;
  familyPicsData: string;
  specialPlaces: string;
  homeAddress: string;
  homeIsCurrentLocation: string;
  schoolAddress: string;
  schoolIsCurrentLocation: string;
  therapyAddress: string;
  therapyIsCurrentLocation: string;
  wasLocationOnboarded: string;
  conversationMode: string;
  gobackAfterSelection: string;
  wasDeleted: string;
  // isIOSActive, isInTrial, trialInstallationDate removed - paid app
  pepes: string;
  whisperModelAvailable: string;
  whisperModelLastChecked: string;
  useLocalWhisper: string;
  watchedVideos: string;
  settingsTappedOnce: string;
  microphoneTappedOnce: string;
  showAndTellModalShown: string;
  my8words: string;
  handshakeMessage: string;
  // Guest session management
  installationGuid: string;
  sessionToken: string;
  lastRefreshCheck: string;
  // App rating
  ratingPromptShown: string;
  ratingPromptDismissed: string;
}

const initEnum = {
  notSet: 'init.NotSet',
  false: '0',
  true: '1',
};

const platFormEnum = {
  notSet: 'init.NotSet',
  ios: 'ios',
  andriod: 'android',
};

const initialPreferences: Preferences = {
  loggedIn: initEnum.false,
  username: '',
  wasWelcomed: initEnum.false,
  showInit: initEnum.false,
  token: initEnum.notSet,
  threadCreatedAt: '',
  returnedMessages: '5',
  topicsCount: '4',
  actionsCount: '4',
  objectsCount: '4',
  wasOnboarded: initEnum.false,
  wasLocationOnboarded: initEnum.false,
  heroName: '',
  adminCode: '',
  gender: '',
  auth0Id: '',
  assistantId: '',
  familyPicsData: '',
  specialPlaces: '',
  homeAddress: '',
  homeIsCurrentLocation: '',
  schoolAddress: '',
  schoolIsCurrentLocation: '',
  therapyAddress: '',
  therapyIsCurrentLocation: '',
  conversationMode: 'easy',
  gobackAfterSelection: initEnum.false,
  wasDeleted: initEnum.false,
  // isIOSActive, isInTrial, trialInstallationDate removed - paid app
  pepes: '',
  whisperModelAvailable: initEnum.false,
  whisperModelLastChecked: '0',
  useLocalWhisper: initEnum.true,
  watchedVideos: '',
  settingsTappedOnce: initEnum.false,
  microphoneTappedOnce: initEnum.false,
  showAndTellModalShown: initEnum.false,
  my8words: '',
  handshakeMessage:
    'Hi ,this is how I communicate say Hey Verby and it will record the question.',
  // Guest session management
  installationGuid: initEnum.notSet,
  sessionToken: initEnum.notSet,
  lastRefreshCheck: '0',
  // App rating
  ratingPromptShown: initEnum.false,
  ratingPromptDismissed: initEnum.false,
};

interface AppSettingsContextProps {
  preferences: Preferences;
  setItem: (key: keyof Preferences, value: string) => Promise<void>;
  getItem: (key: keyof Preferences) => Promise<string>;
  removeItem: (key: keyof Preferences) => Promise<void>;
  initializePreferences: () => Promise<Preferences>;
  clear: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextProps | undefined>(
  undefined,
);

interface AppSettingsProviderProps {
  children: ReactNode;
}

export const AppSettingsProvider: FC<AppSettingsProviderProps> = ({
  children,
}) => {
  const [preferences, setPreferences] =
    useState<Preferences>(initialPreferences);
  const initializationRef = useRef(false);
  // receiptValidationRef removed - paid app

  const setItem = async (
    key: keyof Preferences,
    value: string,
  ): Promise<void> => {
    try {
      await DefaultPreference.set(key, value);
      setPreferences(prevPreferences => ({...prevPreferences, [key]: value}));
    } catch (error) {
      
    }
  };

  const getItem = async (key: keyof Preferences): Promise<string> => {
    try {
      const item = await DefaultPreference.get(key);
      return item ?? initialPreferences[key];
    } catch (error) {
      
      return initialPreferences[key];
    }
  };

  const removeItem = async (key: keyof Preferences): Promise<void> => {
    try {
      await DefaultPreference.set(key, initEnum.notSet);
      setPreferences(prevPreferences => ({...prevPreferences, [key]: ''}));
    } catch (error) {
      
    }
  };

  const initializePreferences = async (): Promise<Preferences> => {
    // Prevent multiple initializations
    if (initializationRef.current) {
      
      return preferences;
    }

    
    initializationRef.current = true;

    try {
      const getKeys = Object.keys(initialPreferences) as (keyof Preferences)[];
      const loaded: Partial<Preferences> = {};

      for (const key of getKeys) {
        const found = await DefaultPreference.get(key);
        loaded[key] = (found ?? initialPreferences[key]) as any;
        if (key === 'isInTrial') {
          
        }
      }

      setPreferences(
        prevPreferences => ({...prevPreferences, ...loaded} as Preferences),
      );

      // Receipt validation removed - paid app
      return loaded as Preferences;
    } catch (error) {
      
      return initialPreferences;
    }
  };

  useEffect(() => {
    const initApp = async () => {
      // Initialize session manager with app settings
      sessionManager.setAppSettings({
        preferences,
        setItem,
        getItem,
        removeItem,
        initializePreferences,
        clear,
      });

      // Initialize preferences
      await initializePreferences();

      // Initialize guest session
      try {
        await sessionManager.ensureValidSession();
        
      } catch (error) {
        
      }
    };

    initApp();

    return () => {
      initializationRef.current = false;
      // Receipt validation cleanup removed - paid app
    };
  }, []);

  const clear = async (): Promise<void> => {
    try {
      const getKeys = Object.keys(initialPreferences) as (keyof Preferences)[];
      for (const key of getKeys) {
        await DefaultPreference.set(key, initialPreferences[key]);
      }
      setPreferences(initialPreferences);
    } catch (error) {
      
    }
  };

  return (
    <AppSettingsContext.Provider
      value={{
        preferences,
        setItem,
        getItem,
        removeItem,
        initializePreferences,
        clear,
      }}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error('useAppSettings must be used within AppSettingsProvider');
  }

  return context;
};
