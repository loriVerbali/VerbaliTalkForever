import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  initDatabase,
  getDatabase,
  closeDatabase,
  getDatabaseStats,
  clearAllData,
  UtteranceRecord,
  ClassicRecord,
  AIResponseTimeRecord,
  AIResolvedRecord,
  insertUtterance,
  insertClassic,
  insertAIResponseTime,
  insertAIResolved,
  getUtterances,
  getClassicEntries,
  getAIResponseTimes,
  getAIResolved,
  getWordCounts,
} from '../utils/database';

interface DatabaseContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Database operations
  addUtterance: (utterance: Omit<UtteranceRecord, 'id'>) => Promise<number>;
  addClassicEntry: (entry: Omit<ClassicRecord, 'id'>) => Promise<number>;
  addAIResponseTime: (
    record: Omit<AIResponseTimeRecord, 'id'>,
  ) => Promise<number>;
  addAIResolved: (record: Omit<AIResolvedRecord, 'id'>) => Promise<number>;

  // Data retrieval
  getUtterancesData: (filters?: any) => Promise<UtteranceRecord[]>;
  getClassicData: (filters?: any) => Promise<ClassicRecord[]>;
  getAIResponseTimeData: (filters?: any) => Promise<AIResponseTimeRecord[]>;
  getAIResolvedData: (filters?: any) => Promise<AIResolvedRecord[]>;
  getWordCountData: (filters?: any) => Promise<{word: string; count: number}[]>;

  // Utility functions
  getStats: () => Promise<any>;
  clearData: () => Promise<void>;
  refreshDatabase: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(
  undefined,
);

interface DatabaseProviderProps {
  children: ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeDatabase();
    return () => {
      closeDatabase();
    };
  }, []);

  const initializeDatabase = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await initDatabase();
      setIsInitialized(true);
      console.log('Database context initialized');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to initialize database';
      setError(errorMessage);
      console.error('Database initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDatabase = async () => {
    await initializeDatabase();
  };

  // Database operations
  const addUtterance = async (
    utterance: Omit<UtteranceRecord, 'id'>,
  ): Promise<number> => {
    try {
      return await insertUtterance(utterance);
    } catch (err) {
      console.error('Error adding utterance:', err);
      throw err;
    }
  };

  const addClassicEntry = async (
    entry: Omit<ClassicRecord, 'id'>,
  ): Promise<number> => {
    try {
      return await insertClassic(entry);
    } catch (err) {
      console.error('Error adding classic entry:', err);
      throw err;
    }
  };

  const addAIResponseTime = async (
    record: Omit<AIResponseTimeRecord, 'id'>,
  ): Promise<number> => {
    try {
      return await insertAIResponseTime(record);
    } catch (err) {
      console.error('Error adding AI response time:', err);
      throw err;
    }
  };

  const addAIResolved = async (
    record: Omit<AIResolvedRecord, 'id'>,
  ): Promise<number> => {
    try {
      return await insertAIResolved(record);
    } catch (err) {
      console.error('Error adding AI resolved:', err);
      throw err;
    }
  };

  // Data retrieval
  const getUtterancesData = async (
    filters?: any,
  ): Promise<UtteranceRecord[]> => {
    try {
      return await getUtterances(filters);
    } catch (err) {
      console.error('Error getting utterances:', err);
      throw err;
    }
  };

  const getClassicData = async (filters?: any): Promise<ClassicRecord[]> => {
    try {
      return await getClassicEntries(filters);
    } catch (err) {
      console.error('Error getting classic data:', err);
      throw err;
    }
  };

  const getAIResponseTimeData = async (
    filters?: any,
  ): Promise<AIResponseTimeRecord[]> => {
    try {
      return await getAIResponseTimes(filters);
    } catch (err) {
      console.error('Error getting AI response time data:', err);
      throw err;
    }
  };

  const getAIResolvedData = async (
    filters?: any,
  ): Promise<AIResolvedRecord[]> => {
    try {
      return await getAIResolved(filters);
    } catch (err) {
      console.error('Error getting AI resolved data:', err);
      throw err;
    }
  };

  const getWordCountData = async (
    filters?: any,
  ): Promise<{word: string; count: number}[]> => {
    try {
      return await getWordCounts(filters);
    } catch (err) {
      console.error('Error getting word count data:', err);
      throw err;
    }
  };

  // Utility functions
  const getStats = async () => {
    try {
      return await getDatabaseStats();
    } catch (err) {
      console.error('Error getting database stats:', err);
      throw err;
    }
  };

  const clearData = async () => {
    try {
      await clearAllData();
    } catch (err) {
      console.error('Error clearing data:', err);
      throw err;
    }
  };

  const value: DatabaseContextType = {
    isInitialized,
    isLoading,
    error,
    addUtterance,
    addClassicEntry,
    addAIResponseTime,
    addAIResolved,
    getUtterancesData,
    getClassicData,
    getAIResponseTimeData,
    getAIResolvedData,
    getWordCountData,
    getStats,
    clearData,
    refreshDatabase,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = (): DatabaseContextType => {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};
