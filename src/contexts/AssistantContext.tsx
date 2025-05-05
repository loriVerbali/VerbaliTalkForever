import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import fetchHelper from '../utils/fetcher';
import {useAdmin} from './adminContext';
import {GoogleGenAI, Modality} from '@google/genai';
import Config from '../utils/config';

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
  sendMessage: (content: string, threadIdOverride?: string) => Promise<string>;
  runAssistant: (threadIdOverride?: string) => Promise<string>;
  setThreadId: (id: string) => void;
  setRunId: (id: string) => void;
  resetHistory: () => void;
  generateImage: (prompt: string) => Promise<{url: string}>;
  geminiGenerateImage: (prompt: string) => Promise<string>;
  imageUrls: Array<{url: string; prompt: string}>;
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
  const [possibleAnswers, setPossibleAnswers] = useState<string[] | null>(null);
  const [questionContext, setQuestionContext] = useState<string>('');
  const [questionTopic, setQuestionTopic] = useState<string>('');
  const [identifiedQuestion, setIdentifiedQuestion] = useState<string>('');

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

              try {
                // Parse the JSON response
                const responseData = JSON.parse(responseText);

                // Extract possible answers from the JSON
                const answers = responseData['Possible answers']
                  .split(',')
                  .map((answer: string) => answer.trim());

                setQuestionContext(responseData['context']);
                setQuestionTopic(responseData['topic']);
                setIdentifiedQuestion(responseData['Identified Question']);

                setPossibleAnswers(answers);
              } catch (parseError) {
                console.error('Failed to parse response as JSON:', parseError);
              }
            }
            break;
          }

          if (['failed', 'cancelled', 'expired'].includes(data.status)) {
            setError(`Run ${data.status}`);
            break;
          }

          await new Promise<void>(resolve => setTimeout(resolve, 1000));
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

  return {
    status,
    response,
    error,
    possibleAnswers,
    questionContext,
    questionTopic,
    identifiedQuestion,
  };
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
  const [imageUrls, setImageUrls] = useState<
    Array<{url: string; prompt: string}>
  >([]);

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
      const encodedPrompt = encodeURIComponent(
        'Create a realistic image as an answer to this question or statement ' +
          identifiedQuestion +
          ' tailored to a boy, the topic is ' +
          questionTopic +
          ', the context is ' +
          questionContext +
          'and the possible answer is ' +
          prompt,
      );
      console.log(
        'Create a realistic image as an answer to this question or statement ' +
          identifiedQuestion +
          ' tailored to a boy, the topic is ' +
          questionTopic +
          ', the context is ' +
          questionContext +
          ' and the possible answer is ' +
          prompt,
      );
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
      return {url: imageUrl};
    } catch (error) {
      console.error('Failed to generate image:', error);
      throw error;
    }
  };

  const geminiGenerateImage = async (prompt: string) => {
    debugger;
    const ai = new GoogleGenAI({apiKey: Config.geminiAPIKey});

    const imagePrompt =
      'Create a realistic image as an answer to this question or statement ' +
      prompt;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp-image-generation',
      contents: imagePrompt,
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });
    if (response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      return response.candidates[0].content.parts[0].inlineData.data;
    } else {
      return 'noImage';
    }
  };

  const {
    status,
    response,
    error,
    possibleAnswers,
    questionContext,
    questionTopic,
    identifiedQuestion,
  } = useAssistantResponse(threadId, runId);

  // Effect for generating images when status is completed
  useEffect(() => {
    const generateImages = async () => {
      if (status === 'completed' && possibleAnswers) {
        const newImageUrls: Array<{url: string; prompt: string}> = [];

        if (Config.picGeneration === 'Gemini') {
          for (const answer of possibleAnswers) {
            const imageURLResponse = await geminiGenerateImage(answer);
            if (imageURLResponse) {
              newImageUrls.push({url: imageURLResponse, prompt: answer});
            }
          }
        } else {
          for (const answer of possibleAnswers) {
            try {
              const imageURLResponse = await generateImage(answer);
              if (imageURLResponse?.url) {
                newImageUrls.push({url: imageURLResponse.url, prompt: answer});
              }
            } catch (err) {
              console.error(
                'Failed to generate image for answer:',
                answer,
                err,
              );
            }
          }
          setImageUrls(newImageUrls);
        }
      }
    };

    generateImages();
  }, [status, possibleAnswers]);

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

  const sendMessage = async (content: string, threadIdOverride?: string) => {
    const idToUse = threadIdOverride || threadId;
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
        {thread_id: idToUse},
        {
          role: 'user',
          content: content,
        },
      );
      const data = await response;
      return data.id;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  };

  const runAssistant = async (threadIdOverride?: string) => {
    const idToUse = threadIdOverride || threadId;

    try {
      const response = await fetchHelper(
        'runAssistant',
        {thread_id: idToUse},
        {assistant_id: ASSISTANT_ID_MATAN},
      );
      const data = await response;
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
        geminiGenerateImage,
        imageUrls,
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
