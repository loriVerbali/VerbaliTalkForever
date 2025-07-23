import React, {createContext, useContext, useState, ReactNode, FC} from 'react';
import DefaultPreference from 'react-native-default-preference';

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
      await DefaultPreference.clear(key);
      setPreferences(prevPreferences => ({
        ...prevPreferences,
        [key]: initialPreferences[key],
      }));
    } catch (error) {
      console.error('Error removing item from DefaultPreference', error);
    }
  };

  const clear = async (): Promise<void> => {
    try {
      await DefaultPreference.clearAll();
      setPreferences(initialPreferences);
    } catch (error) {
      console.error('Error clearing DefaultPreference', error);
    }
  };

  const initializePreferences = async (): Promise<Preferences> => {
    try {
      const newPreferences = await Object.keys(initialPreferences).reduce<
        Promise<Preferences>
      >(async (accPromise, key) => {
        const acc = await accPromise;
        const typedKey = key as keyof Preferences;
        let defaultPreferenceValue = await DefaultPreference.get(typedKey);

        const preferenceValue =
          defaultPreferenceValue ?? initialPreferences[typedKey];
        return {...acc, [typedKey]: preferenceValue};
      }, Promise.resolve({} as Preferences));

      setPreferences(prevPreferences => ({
        ...prevPreferences,
        ...newPreferences,
      }));
      return newPreferences;
    } catch (error) {
      console.error('Error initializing preferences', error);
      throw error;
    }
  };

  return (
    <AppSettingsContext.Provider
      value={{
        preferences,
        setItem,
        getItem,
        removeItem,
        clear,
        initializePreferences,
      }}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = (): AppSettingsContextProps => {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error(
      'useAppSettings must be used within an AppSettingsProvider',
    );
  }
  return context;
};
