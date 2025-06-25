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

// Debug flag to disable image generation
const DEBUGWITHOUTIMAGEGENERATION = false;

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
  resetAssistant: () => void;
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
    setResponse({response: response, modeType: 'list_possible_topics'});
  };

  const getObjectFromResponse = (response: string) => {
    setConvoObject(response);
    setModeType('list_possible_objects');
    setResponse({response: response, modeType: 'list_possible_objects'});
  };

  const getActionFromResponse = (response: string) => {
    setConvoAction(response);
    setModeType('list_possible_actions');
    setResponse({response: response, modeType: 'list_possible_actions'});
  };

  const getSentenceFromResponse = (response: string) => {
    setConvoSentence(response);
    setResponse({response: response, modeType: 'sentence'});
  };

  useEffect(() => {
    let isSubscribed = true;

    console.log('🔄 Polling status for thread:', threadId, runId);

    const pollStatus = async () => {
      try {
        let pollCount = 0;
        const maxPolls = 30; // Set a reasonable limit for polling attempts

        while (isSubscribed && pollCount < maxPolls) {
          pollCount++;

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

            const messageType = messagesResponse.data[1].metadata.mode;
            if (messageType === 'list_possible_topics') {
              if (
                messagesResponse.data &&
                messagesResponse.data[0]?.content[0]?.text?.value
              ) {
                console.log(
                  '🔵 messageType',
                  messageType,
                  messagesResponse.data[0].content[0].text.value,
                );
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
                setResponse({
                  response: responseText,
                  modeType: 'generate_answers',
                });

                try {
                  // Parse the JSON response
                  const responseData = JSON.parse(responseText);
                  // Extract possible answers from the JSON
                  const answers = responseData['Possible answers'];

                  if (answers) {
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

          await new Promise<void>(resolve => setTimeout(resolve, 500));
        }

        if (pollCount >= maxPolls) {
          console.error(
            'Maximum polling attempts reached. The operation may have timed out.',
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
      const savedThreadId = await getItem('threadId');
      const savedThreadCreatedAt = await getItem('threadCreatedAt');

      if (savedThreadId) {
        setThreadId(savedThreadId);

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
      } else {
        createThreadIfNeeded();
      }
    };

    initThread();
  }, []);

  const resetHistory = () => {
    setHistory([]);
    setRunId('');
    setLocalStatus(null);
    setLocalResponse('');
    setLocalError(null);
  };

  const createThreadIfNeeded = async () => {
    try {
      console.log('🔄 Creating new thread...');
      // Otherwise create a new thread
      const response = await fetchHelper('createThread', {}, {});
      const data = await response;

      // Update state immediately
      setThreadId(data.id);

      const now = new Date().toISOString();
      await setItem('threadId', data.id);
      await setItem('threadCreatedAt', now);
      setIsThreadFresh(true);

      return data.id;
    } catch (error) {
      console.error('Failed to create thread:', error);
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
    let idToUse = threadIdOverride || threadId;

    try {
      // Add user message to history

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
      return data.id;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  };

  const generateImage = async (prompt: string) => {
    // Debug mode: return hardcoded welcome.png reference
    if (DEBUGWITHOUTIMAGEGENERATION) {
      return {url: 'welcome.png'};
    }

    try {
      // First, call OpenAI to generate an enhanced image prompt
      const promptEnhancementRequest = {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at creating detailed, vivid image prompts for AI image generation. Create a detailed, descriptive prompt that will generate a high-quality, realistic image suitable for children.',
          },
          {
            role: 'user',
            content: `Create a detailed image prompt for: "${prompt}". The context is: question "${identifiedQuestion}", topic "${questionTopic}", context "${questionContext}". Make it realistic, child-friendly, and visually appealing. Focus on creating a clear, detailed scene that would help a child understand the concept. Return only the enhanced prompt, nothing else.`,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      };

      const enhancedPromptResponse = await fetchHelper(
        'chatCompletion',
        {},
        promptEnhancementRequest,
      );

      let enhancedPrompt = prompt; // fallback to original prompt
      if (enhancedPromptResponse?.choices?.[0]?.message?.content) {
        enhancedPrompt =
          enhancedPromptResponse.choices[0].message.content.trim();
      }

      // Now use the enhanced prompt for image generation
      const encodedPrompt = encodeURIComponent(enhancedPrompt);

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

      return {url: imageUrl};
    } catch (error) {
      console.error('Failed to generate image:', error);
      throw error;
    }
  };

  const geminiGenerateImage = async (prompt: string) => {
    // Debug mode: return hardcoded welcome.png reference
    if (DEBUGWITHOUTIMAGEGENERATION) {
      return 'welcome.png';
    }

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
        try {
          // Get the enhanced context with weather and location
          // const {weather, location} = useChatContext();
          //   const enhancedContext = `${questionContext}. Weather: ${weather}. Location: ${location}`;

          // Prepare all items in one array
          const items = possibleAnswers.map(answer => ({
            possibleanswer: answer,
            questionContext: questionContext,
            identifiedQuestion: identifiedQuestion,
            questionTopic: questionTopic,
          }));

          // Call the process_images API with all items
          const responseImages = await fetchHelper(
            'processImages',
            {},
            {
              items: items,
            },
          );

          // Process the response and update image URLs
          if (responseImages && Array.isArray(responseImages.results)) {
            const newImageUrls = responseImages.results.map(
              (imageData: any) => ({
                url: imageData.imageUrl,
                prompt: imageData.word,
              }),
            );
            setImageUrls(newImageUrls);
          }
        } catch (err) {
          console.error('Failed to process images:', err);
        }
      }
    };
    generateImages();
  }, [status, possibleAnswers]);

  const runAssistant = async (threadIdOverride?: string) => {
    // Ensure we have a thread ID first by checking if we need a new one
    let idToUse = threadIdOverride || threadId;

    try {
      const response = await fetchHelper(
        'runAssistant',
        {thread_id: idToUse},
        {assistant_id: ASSISTANT_ID_LORI},
      );
      const data = await response;
      setRunId(data.id);
      return data.id;
    } catch (error) {
      console.error('Failed to run assistant:', error);
      throw error;
    }
  };

  const resetAssistant = () => {
    // Reset all state except threadId
    setHistory([]);
    setRunId('');
    setLocalStatus(null);
    setLocalResponse('');
    setLocalError(null);
    setImageUrls([]);
    setIsThreadFresh(false);
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
        resetAssistant,
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
