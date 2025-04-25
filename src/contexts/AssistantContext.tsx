import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import fetchHelper from '../utils/fetcher';

const ASSISTANT_ID_LORI = 'asst_4IsFZTiNNEqtZECNCWCyGHwz';
const ASSISTANT_ID_MATAN = 'asst_flU36FyuLnpincfu1FxkF3L2';
// Add history type
interface HistoryItem {
  type: 'text' | 'status' | 'error' | 'image';
  content: string;
  timestamp: Date;
  isUserInput?: boolean;
  imageUrl?: string;
}

interface AssistantContextType {
  threadId: string;
  runId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | null;
  response: string;
  error: string | null;
  history: HistoryItem[];
  createThread: () => Promise<string>;
  sendMessage: (content: string) => Promise<string>;
  runAssistant: () => Promise<string>;
  setThreadId: (id: string) => void;
  setRunId: (id: string) => void;
  resetHistory: () => void;
  generateImage: (prompt: string) => Promise<string>;
}

const AssistantContext = createContext<AssistantContextType | undefined>(
  undefined,
);

// Move useAssistantResponse hook logic here
const useAssistantResponse = (
  threadId: string,
  runId: string,
  generateImage: (prompt: string) => Promise<string>,
) => {
  const [status, setStatus] = useState<
    'queued' | 'in_progress' | 'completed' | 'failed' | null
  >(null);
  const [response, setResponse] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    const pollStatus = async () => {
      try {
        while (isSubscribed) {
          const statusResponse = await fetchHelper(
            'checkRunStatus',
            {
              thread_id: threadId,
              run_id: runId,
            },
            {},
          );

          const data = await statusResponse;
          console.log('data in pollStatus', data);

          if (data?.status === 'completed') {
            setStatus(data.status);
            const messagesResponse = await fetchHelper(
              'getMessages',
              {
                thread_id: threadId,
              },
              {},
            );

            if (
              messagesResponse.data &&
              messagesResponse.data[0]?.content[0]?.text?.value
            ) {
              const responseText =
                messagesResponse.data[0].content[0].text.value;
              setResponse(responseText);

              // Extract possible answers from the response
              // Assuming answers are separated by newlines or specific markers
              const possibleAnswers = responseText
                .split('\n')
                .filter((line: string) => line.trim().length > 0)
                .map((line: string) => line.trim());

              // Generate images for each possible answer
              for (const answer of possibleAnswers) {
                try {
                  await generateImage(answer);
                } catch (err) {
                  console.error(
                    'Failed to generate image for answer:',
                    answer,
                    err,
                  );
                }
              }
            }
            break;
          }

          if (['failed', 'cancelled', 'expired'].includes(data.status)) {
            setError(`Run ${data.status}`);
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: unknown) {
        if (isSubscribed) {
          setError(
            err instanceof Error ? err.message : 'An unknown error occurred',
          );
        }
      }
    };

    if (threadId && runId) {
      pollStatus();
    }

    return () => {
      isSubscribed = false;
    };
  }, [threadId, runId, generateImage]);

  return {status, response, error};
};

interface AssistantProviderProps {
  children: ReactNode;
}

export const AssistantProvider: React.FC<AssistantProviderProps> = ({
  children,
}) => {
  const [threadId, setThreadId] = useState<string>('');
  const [runId, setRunId] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [localStatus, setLocalStatus] = useState<
    'queued' | 'in_progress' | 'completed' | 'failed' | null
  >(null);
  const [localResponse, setLocalResponse] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const resetHistory = () => {
    setHistory([]);
    setThreadId('');
    setRunId('');
    setLocalStatus(null);
    setLocalResponse('');
    setLocalError(null);
  };

  const generateImage = async (prompt: string) => {
    try {
      // Encode the prompt for URL
      const encodedPrompt = encodeURIComponent(prompt);
      // Generate a random seed for variety
      const seed = Math.floor(Math.random() * 1000);

      const response = await fetchHelper(
        'generateImage',
        {
          prompt: encodedPrompt,
          seed: seed.toString(),
        },
        {},
      );

      // The response is the direct image URL
      const imageUrl = response;

      setHistory(prev => [
        ...prev,
        {
          type: 'image',
          content: prompt,
          timestamp: new Date(),
          imageUrl: imageUrl,
        },
      ]);
      console.log({imageUrl});
      return imageUrl;
    } catch (error) {
      console.error('Failed to generate image:', error);
      throw error;
    }
  };

  const {status, response, error} = useAssistantResponse(
    threadId,
    runId,
    generateImage,
  );

  // Update history when status changes
  useEffect(() => {
    if (status) {
      setHistory(prev => [
        ...prev,
        {
          type: 'status',
          content: `Status: ${status}`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [status]);

  // Update history when response is received
  useEffect(() => {
    if (response) {
      setHistory(prev => [
        ...prev,
        {
          type: 'text',
          content: response,
          timestamp: new Date(),
          isUserInput: false,
        },
      ]);
    }
  }, [response]);

  // Update history when error occurs
  useEffect(() => {
    if (error) {
      setHistory(prev => [
        ...prev,
        {
          type: 'error',
          content: `Error: ${error}`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [error]);

  const createThread = async () => {
    try {
      const response = await fetchHelper('createThread', {}, {});
      const data = await response;
      setThreadId(data.id);
      return data.id;
    } catch (error) {
      console.error('Failed to create thread:', error);
      throw error;
    }
  };

  const sendMessage = async (content: string) => {
    try {
      // Add user message to history
      setHistory(prev => [
        ...prev,
        {
          type: 'text',
          content,
          timestamp: new Date(),
          isUserInput: true,
        },
      ]);

      const response = await fetchHelper(
        'sendMessage',
        {thread_id: threadId},
        {
          role: 'user',
          content: content,
        },
      );
      const data = await response;
      console.log('sendMessage to thread', threadId, data);
      return data.id;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  };

  const runAssistant = async () => {
    try {
      const response = await fetchHelper(
        'runAssistant',
        {thread_id: threadId},
        {assistant_id: ASSISTANT_ID_MATAN},
      );
      const data = await response;
      console.log('runAssistant on thread', threadId, data);
      setRunId(data.id);
      return data.id;
    } catch (error) {
      console.error('Failed to run assistant:', error);
      throw error;
    }
  };

  return (
    <AssistantContext.Provider
      value={{
        threadId,
        runId,
        status,
        response,
        error,
        history,
        createThread,
        sendMessage,
        runAssistant,
        setThreadId,
        setRunId,
        resetHistory,
        generateImage,
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
