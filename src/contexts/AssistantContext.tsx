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
  type: 'text' | 'status' | 'error';
  content: string;
  timestamp: Date;
  isUserInput?: boolean;
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
}

const AssistantContext = createContext<AssistantContextType | undefined>(
  undefined,
);

// Move useAssistantResponse hook logic here
const useAssistantResponse = (threadId: string, runId: string) => {
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
              setResponse(messagesResponse.data[0].content[0].text.value);
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
  }, [threadId, runId]);

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

  const {status, response, error} = useAssistantResponse(threadId, runId);

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
