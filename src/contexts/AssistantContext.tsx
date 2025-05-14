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
import {useAppSettings} from '../utils/persistance';

const ASSISTANT_ID_LORI = 'asst_4IsFZTiNNEqtZECNCWCyGHwz';
const ASSISTANT_ID_MATAN = 'asst_flU36FyuLnpincfu1FxkF3L2';
// Thread expiration time in milliseconds (4 hours)
const THREAD_EXPIRATION_MS = 4 * 60 * 60 * 1000;
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
  status:
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'requires_action'
    | null;
  response: {
    response: string;
    modeType: string;
  };
  error: string | null;
  history: HistoryItem[];
  createThreadIfNeeded: () => Promise<string>;
  sendMessage: (
    content: string,
    threadIdOverride?: string,
    mode?:
      | 'list_possible_topics'
      | 'list_possible_objects'
      | 'list_possible_actions'
      | 'generate_answers'
      | 'sentence',
  ) => Promise<string>;
  runAssistant: (threadIdOverride?: string) => Promise<string>;
  setThreadId: (id: string) => void;
  setRunId: (id: string) => void;
  resetHistory: () => void;
  generateImage: (prompt: string) => Promise<{url: string}>;
  geminiGenerateImage: (prompt: string) => Promise<string>;
  imageUrls: Array<{url: string; prompt: string}>;
  isThreadFresh: boolean;
}

const AssistantContext = createContext<AssistantContextType | undefined>(
  undefined,
);

// Move useAssistantResponse hook logic here
const useAssistantResponse = (threadId: string, runId: string) => {
  const [status, setStatus] = useState<
    'queued' | 'in_progress' | 'completed' | 'failed' | 'requires_action' | null
  >(null);
  const [response, setResponse] = useState<{
    response: string;
    modeType: string;
  }>({response: '', modeType: ''});
  const [error, setError] = useState<string | null>(null);
  const [possibleAnswers, setPossibleAnswers] = useState<string[] | null>(null);
  const [questionContext, setQuestionContext] = useState<string>('');
  const [questionTopic, setQuestionTopic] = useState<string>('');
  const [identifiedQuestion, setIdentifiedQuestion] = useState<string>('');
  const [convoTopic, setConvoTopic] = useState<string>('');
  const [convoObject, setConvoObject] = useState<string>('');
  const [convoAction, setConvoAction] = useState<string>('');
  const [convoSentence, setConvoSentence] = useState<string>('');
  const [modeType, setModeType] = useState<string>('');

  const getTopicFromResponse = (response: string) => {
    setConvoTopic(response);
    setModeType('list_possible_topics');
    console.log('🔍 Convo topic:', response);
    setResponse({response: response, modeType: 'list_possible_topics'});
  };

  const getObjectFromResponse = (response: string) => {
    setConvoObject(response);
    setModeType('list_possible_objects');
    console.log('🔍 Convo object:', response);
    setResponse({response: response, modeType: 'list_possible_objects'});
  };

  const getActionFromResponse = (response: string) => {
    setConvoAction(response);
    setModeType('list_possible_actions');
    console.log('🔍 Convo action:', response);
    setResponse({response: response, modeType: 'list_possible_actions'});
  };

  const getSentenceFromResponse = (response: string) => {
    setConvoSentence(response);
    console.log('🔍 Convo sentence:', response);
    setResponse({response: response, modeType: 'sentence'});
  };

  useEffect(() => {
    let isSubscribed = true;

    console.log('🔄 Polling status for thread:', threadId, runId);

    const pollStatus = async () => {
      try {
        console.log('🔄 Starting polling for run status...');
        console.log(`🧵 Thread ID: ${threadId}, Run ID: ${runId}`);
        let pollCount = 0;
        const maxPolls = 30; // Set a reasonable limit for polling attempts

        while (isSubscribed && pollCount < maxPolls) {
          pollCount++;
          console.log(`📊 Polling attempt #${pollCount} for run status...`);

          const statusResponse = await fetchHelper(
            'checkRunStatus',
            {
              thread_id: threadId,
              run_id: runId,
            },
            {},
          );

          console.log('🔍 Run status response:', statusResponse);

          const data = await statusResponse;

          if (data?.status === 'completed') {
            console.log('✅ Run completed successfully!');
            setStatus(data.status);

            console.log('📨 Fetching messages...');
            const messagesResponse = await fetchHelper(
              'getMessages',
              {
                thread_id: threadId,
              },
              {},
            );

            console.log('📩 Messages response:', messagesResponse);
            const messageType = messagesResponse.data[1].metadata.mode;
            console.log('🔍 Message type:', messageType);

            if (messageType === 'list_possible_topics') {
              if (
                messagesResponse.data &&
                messagesResponse.data[0]?.content[0]?.text?.value
              ) {
                getTopicFromResponse(
                  messagesResponse.data[0].content[0].text.value,
                );
              }
            }

            if (messageType === 'list_possible_objects') {
              if (
                messagesResponse.data &&
                messagesResponse.data[0]?.content[0]?.text?.value
              ) {
                getObjectFromResponse(
                  messagesResponse.data[0].content[0].text.value,
                );
              }
            }

            if (messageType === 'list_possible_actions') {
              if (
                messagesResponse.data &&
                messagesResponse.data[0]?.content[0]?.text?.value
              ) {
                getActionFromResponse(
                  messagesResponse.data[0].content[0].text.value,
                );
              }
            }

            if (messageType === 'sentence') {
              if (
                messagesResponse.data &&
                messagesResponse.data[0]?.content[0]?.text?.value
              ) {
                getSentenceFromResponse(
                  messagesResponse.data[0].content[0].text.value,
                );
              }
            }
            if (messageType === 'generate_answers') {
              if (
                messagesResponse.data &&
                messagesResponse.data[0]?.content[0]?.text?.value
              ) {
                const responseText =
                  messagesResponse.data[0].content[0].text.value;
                console.log('📝 Response text:', responseText);
                setResponse({
                  response: responseText,
                  modeType: 'generate_answers',
                });

                try {
                  // Parse the JSON response
                  console.log('🔄 Attempting to parse JSON response...');
                  const responseData = JSON.parse(responseText);
                  console.log('✅ Successfully parsed JSON:', responseData);

                  // Extract possible answers from the JSON
                  const answers = responseData['Possible answers'];

                  if (answers) {
                    console.log('📋 Extracted answers:', answers);
                    setQuestionContext(responseData['context'] || '');
                    setQuestionTopic(
                      responseData['list_possible_topics'] || '',
                    );
                    setIdentifiedQuestion(
                      responseData['Identified Question'] || '',
                    );
                    setPossibleAnswers(answers);
                  } else {
                    console.log('⚠️ No answers found in response');
                  }
                } catch (parseError) {
                  console.error(
                    '❌ Failed to parse response as JSON:',
                    parseError,
                  );
                  console.log('📄 Raw response was:', responseText);
                }
              } else {
                console.warn('⚠️ No message content found in response');
              }
            }
            break;
          }

          if (['failed', 'cancelled', 'expired'].includes(data?.status)) {
            // console.error(`❌ Run ${data?.status}`);
            // setError(`Run ${data?.status}`);
            break;
          }

          if (data?.status === 'in_progress') {
            console.log('⏳ Run is in progress...');
          } else if (data?.status === 'queued') {
            console.log('⌛ Run is queued...');
          } else {
            // console.log(`🔄 Run is in status: ${data.status}`);
          }

          console.log(
            `💤 Waiting 1 second before next poll (attempt ${pollCount}/${maxPolls})...`,
          );
          await new Promise<void>(resolve => setTimeout(resolve, 500));
        }

        if (pollCount >= maxPolls) {
          console.error(
            '⛔ Maximum polling attempts reached. The operation may have timed out.',
          );
          setError('Polling timed out after maximum attempts');
        }
      } catch (err: unknown) {
        console.error('❌ Error during polling:', err);
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
    convoTopic,
    convoObject,
    convoAction,
    convoSentence,
    modeType,
  };
};

interface AssistantProviderProps {
  children: ReactNode;
}

export const AssistantProvider: React.FC<AssistantProviderProps> = ({
  children,
}) => {
  const {preferences, setItem, getItem} = useAppSettings();
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
  const [isThreadFresh, setIsThreadFresh] = useState<boolean>(false);

  // Initialize thread on app load
  useEffect(() => {
    const initThread = async () => {
      console.log('🔄 Initializing thread...');
      const savedThreadId = await getItem('threadId');
      const savedThreadCreatedAt = await getItem('threadCreatedAt');

      if (savedThreadId) {
        setThreadId(savedThreadId);
        console.log('🧵 Thread ID:', savedThreadId);

        // Check if thread is still fresh (less than expiration time)
        if (savedThreadCreatedAt) {
          const createdAt = new Date(savedThreadCreatedAt);
          const now = new Date();

          if (now.getTime() - createdAt.getTime() < THREAD_EXPIRATION_MS) {
            setIsThreadFresh(true);
          } else {
            setIsThreadFresh(false);
            createThreadIfNeeded();
          }
        }
      }
    };

    initThread();
  }, []);

  const resetHistory = () => {
    setHistory([]);
    setThreadId('');
    setRunId('');
    setLocalStatus(null);
    setLocalResponse('');
    setLocalError(null);
  };

  // Replace createThread with createThreadIfNeeded
  const createThreadIfNeeded = async () => {
    try {
      // If we have a fresh thread, just return it
      if (threadId && isThreadFresh) {
        console.log('🧵 Using existing fresh thread:', threadId);
        setThreadId(threadId);
        return threadId;
      }

      console.log('🔄 Creating new thread...');
      // Otherwise create a new thread
      const response = await fetchHelper('createThread', {}, {});
      const data = await response;

      // Save new thread ID and timestamp
      console.log('✅ New thread created with ID:', data.id);

      // Update state immediately
      setThreadId(data.id);

      const now = new Date().toISOString();
      await setItem('threadId', data.id);
      await setItem('threadCreatedAt', now);
      setIsThreadFresh(true);

      console.log('🔄 Thread state updated, returning new thread ID:', data.id);
      return data.id;
    } catch (error) {
      console.error('❌ Failed to create thread:', error);
      throw error;
    }
  };

  const sendMessage = async (
    content: string,
    threadIdOverride?: string,
    mode?:
      | 'list_possible_topics'
      | 'list_possible_objects'
      | 'list_possible_actions'
      | 'generate_answers'
      | 'sentence',
  ) => {
    // Ensure we have a thread ID first by checking if we need a new one
    console.log('🔍 Sending message:', content);
    console.log('threadOverride:', threadIdOverride);
    let idToUse = threadIdOverride || threadId;
    debugger;
    if (!idToUse) {
      console.log('⚠️ No thread ID available, creating a new thread...');
      idToUse = await createThreadIfNeeded();
      console.log('✅ New thread created for message:', idToUse);
    } else {
      console.log('🧵 Using existing thread for message:', idToUse);
    }

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

      console.log('📤 Sending message to thread:', idToUse);
      const response = await fetchHelper(
        'sendMessage',
        {thread_id: idToUse},
        {
          role: 'user',
          content: content,
          metadata: mode ? {mode} : undefined,
        },
      );
      const data = await response;
      console.log('📩 Message sent successfully, data:', data);
      console.log('📩 Message sent successfully, ID:', data.id);
      return data.id;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      throw error;
    }
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
    convoTopic,
    convoObject,
    convoAction,
    convoSentence,
    modeType,
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
          content: response.response,
          modeType: response.modeType,
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

  const runAssistant = async (threadIdOverride?: string) => {
    // Ensure we have a thread ID first by checking if we need a new one
    let idToUse = threadIdOverride || threadId;

    if (!idToUse) {
      console.log(
        '⚠️ No thread ID available for run, creating a new thread...',
      );
      idToUse = await createThreadIfNeeded();
      console.log('✅ New thread created for assistant run:', idToUse);
    } else {
      console.log('🧵 Using existing thread for assistant run:', idToUse);
    }

    console.log('🤖 Running assistant on thread:', idToUse);
    try {
      const response = await fetchHelper(
        'runAssistant',
        {thread_id: idToUse},
        {assistant_id: ASSISTANT_ID_LORI},
      );
      const data = await response;
      console.log('🏃‍♂️ Assistant run started with ID:', data.id);
      setRunId(data.id);
      return data.id;
    } catch (error) {
      console.error('❌ Failed to run assistant:', error);
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
        createThreadIfNeeded,
        sendMessage,
        runAssistant,
        setThreadId,
        setRunId,
        resetHistory,
        generateImage,
        geminiGenerateImage,
        imageUrls,
        isThreadFresh,
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
