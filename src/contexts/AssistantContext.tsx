import React, {createContext, useContext, useState, ReactNode} from 'react';
import fetchHelper from '../utils/fetcher';

// New type for possible answers from assistant
interface PossibleAnswerItem {
  word: string;
  type?: string;
  imageUrl?: string;
}

interface AssistantContextType {
  generateAnswers: (
    sentence: string,
    options?: any,
  ) => Promise<PossibleAnswerItem[]>;
}

const AssistantContext = createContext<AssistantContextType | undefined>(
  undefined,
);

interface AssistantProviderProps {
  children: ReactNode;
}

export const AssistantProvider: React.FC<AssistantProviderProps> = ({
  children,
}) => {
  const generateAnswers = async (sentence: string, options: any = {}) => {
    const {
      mode = 'generate_answers',
      metadata = {},
      prior = {},
      countMin = 5,
      countMax = 5,
      genderType = 'white boy',
    } = options;

    try {
      const response = await fetchHelper(
        'generateAnswers',
        {},
        {
          sentence,
          mode,
          metadata: {
            kidName: options.metadata.kidName || 'I', // Replace with actual kid name
            speaker: options.metadata.speaker || 'anyone', // Replace with actual speaker
            audience: options.metadata.audience || 'my', // Replace with actual audience
            ...metadata,
          },
          prior,
          options: {
            countMin,
            countMax,
            genderType,
          },
        },
      );

      if (response && response.results) {
        return response.results; // Array of { word, imageUrl } objects
      } else {
        throw new Error(
          'Invalid response format from generateAnswers endpoint',
        );
      }
    } catch (error) {
      
      throw error;
    }
  };

  return (
    <AssistantContext.Provider
      value={{
        generateAnswers,
      }}>
      {children}
    </AssistantContext.Provider>
  );
};

export const useAssistant = () => {
  const context = useContext(AssistantContext);
  if (context === undefined) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return context;
};

export default AssistantContext;
