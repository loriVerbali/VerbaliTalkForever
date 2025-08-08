import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  FC,
  useEffect,
} from 'react';
import DefaultPreference from 'react-native-default-preference';
import {validateReceiptOnLaunch} from './recieptValidation';

interface Preferences {
  loggedIn: string;
  username: string;
  wasWelcomed: string;
  showInit: string;
  token: string;
  threadId: string;
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
  isIOSActive: string;
  pepes: string;
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
  threadId: '',
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
  gobackAfterSelection: initEnum.true,
  wasDeleted: initEnum.false,
  isIOSActive: initEnum.false,
  pepes: '',
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

  const setItem = async (
    key: keyof Preferences,
    value: string,
  ): Promise<void> => {
    try {
      await DefaultPreference.set(key, value);
      setPreferences(prevPreferences => ({...prevPreferences, [key]: value}));
    } catch (error) {
      console.error('Error setting item in DefaultPreference', error);
    }
  };

  const getItem = async (key: keyof Preferences): Promise<string> => {
    try {
      const item = await DefaultPreference.get(key);
      return item ?? initialPreferences[key];
    } catch (error) {
      console.error('Error getting item from DefaultPreference', error);
      return initialPreferences[key];
    }
  };

  const removeItem = async (key: keyof Preferences): Promise<void> => {
    try {
      await DefaultPreference.set(key, initEnum.notSet);
      setPreferences(prevPreferences => ({...prevPreferences, [key]: ''}));
    } catch (error) {
      console.error('Error removing item from DefaultPreference', error);
    }
  };

  const initializePreferences = async (): Promise<Preferences> => {
    try {
      const getKeys = Object.keys(initialPreferences) as (keyof Preferences)[];
      const loaded: Partial<Preferences> = {};

      for (const key of getKeys) {
        const found = await DefaultPreference.get(key);
        loaded[key] = (found ?? initialPreferences[key]) as any;
      }

      setPreferences(
        prevPreferences => ({...prevPreferences, ...loaded} as Preferences),
      );

      // validate purchase on launch
      setTimeout(async () => {
        try {
          await validateReceiptOnLaunch();
        } catch (error) {}
      }, 3000);

      return loaded as Preferences;
    } catch (error) {
      console.error('Error initializing preferences', error);
      return initialPreferences;
    }
  };

  useEffect(() => {
    initializePreferences();
  }, []);

  const clear = async (): Promise<void> => {
    try {
      const getKeys = Object.keys(initialPreferences) as (keyof Preferences)[];
      for (const key of getKeys) {
        await DefaultPreference.set(key, initialPreferences[key]);
      }
      setPreferences(initialPreferences);
    } catch (error) {
      console.error('Error clearing DefaultPreference', error);
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
