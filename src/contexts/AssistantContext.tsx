import React, { createContext, useContext, useState, ReactNode } from 'react';
import fetchHelper from '../utils/fetcher';

// New type for messages in conversation history
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

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
  conversationHistory: Message[];
  addToConversationHistory: (
    userMessage: string,
    assistantResponse: string,
    maxHistoryLength?: number,
  ) => void;
  updateLastAssistantMessage: (selectionText: string) => void;
  clearHistory: () => void;
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
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);

  const addToConversationHistory = (
    userMessage: string,
    assistantResponse: string,
    maxHistoryLength: number = 20, // Keep last 20 exchanges
  ) => {
    setConversationHistory(prev => {
      const newHistory = [
        ...prev,
        { role: 'user' as const, content: userMessage, timestamp: Date.now() },
        {
          role: 'assistant' as const,
          content: assistantResponse,
          timestamp: Date.now(),
        },
      ];

      // Keep only the most recent exchanges
      return newHistory.slice(-maxHistoryLength * 2); // *2 because each exchange has user + assistant
    });
  };

  const updateLastAssistantMessage = (selectionText: string) => {
    setConversationHistory(prev => {
      if (prev.length === 0) return prev;

      const newHistory = [...prev];
      const lastIndex = newHistory.length - 1;

      if (newHistory[lastIndex].role === 'assistant') {
        newHistory[lastIndex] = {
          ...newHistory[lastIndex],
          content: `${newHistory[lastIndex].content}. User picked: ${selectionText}`,
        };
      }

      return newHistory;
    });
  };

  const clearHistory = () => {
    setConversationHistory([]);
  };

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
            ...(mode.startsWith('generate_') ? { conversationHistory } : {}), // Only include history in generate modes
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
        conversationHistory,
        addToConversationHistory,
        updateLastAssistantMessage,
        clearHistory,
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
