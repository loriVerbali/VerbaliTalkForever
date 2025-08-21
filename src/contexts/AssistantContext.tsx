import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import fetchHelper from '../utils/fetcher';
import {useAppSettings} from '../utils/persistance';

// Thread expiration time in milliseconds (12 hours)
const THREAD_EXPIRATION_MS = 12 * 60 * 60 * 1000;

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

// New type for possible answers from assistant
interface PossibleAnswerItem {
  word: string;
  type?: string;
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
      | 'sentence'
      | 'generate_more_answers'
      | 'learning_feedback',
  ) => Promise<string>;
  runAssistant: (threadIdOverride?: string) => Promise<string>;
  setThreadId: (id: string) => void;
  setRunId: (id: string) => void;
  resetHistory: () => void;
  resetAssistant: () => void;
  clearImages: () => void;
  generateImage: (prompt: string) => Promise<{url: string}>;
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
  const [possibleAnswers, setPossibleAnswers] = useState<
    PossibleAnswerItem[] | null
  >(null);
  const [questionContext, setQuestionContext] = useState<string>('');
  const [questionTopic, setQuestionTopic] = useState<string>('');
  const [identifiedQuestion, setIdentifiedQuestion] = useState<string>('');
  const [modeType, setModeType] = useState<string>('');
  const [summarizedWord, setSummarizedWord] = useState<string>('');

  const getTopicFromResponse = (response: string) => {
    setModeType('list_possible_topics');
    setResponse({response: response, modeType: 'list_possible_topics'});
  };

  const getObjectFromResponse = (response: string) => {
    setModeType('list_possible_objects');
    setResponse({response: response, modeType: 'list_possible_objects'});
  };

  const getActionFromResponse = (response: string) => {
    setModeType('list_possible_actions');
    setResponse({response: response, modeType: 'list_possible_actions'});
  };

  const getSentenceFromResponse = (response: string) => {
    setResponse({response: response, modeType: 'sentence'});
  };

  useEffect(() => {
    let isSubscribed = true;

    // Don't start polling if we don't have both threadId and runId
    if (!threadId || !runId) {
      return;
    }

    const pollStatus = async () => {
      try {
        let pollCount = 0;
        const maxPolls = 40; // Increase max polls to account for longer intervals
        let pollInterval = 300; // Start with 300ms

        while (isSubscribed && pollCount < maxPolls) {
          pollCount++;

          let data;
          try {
            const statusResponse = await fetchHelper(
              'checkRunStatus',
              {
                thread_id: threadId,
                run_id: runId,
              },
              {},
            );
            data = statusResponse;
          } catch (apiError) {
            console.error('❌ Error checking run status:', apiError);
            // Use exponential backoff on API errors
            pollInterval = Math.min(pollInterval * 1.5, 3000);
            await new Promise<void>(resolve =>
              setTimeout(resolve, pollInterval),
            );
            continue;
          }

          // Safety check: ensure we have valid status data
          if (!data || !data.status) {
            await new Promise<void>(resolve =>
              setTimeout(resolve, pollInterval),
            );
            continue;
          }

          // Update status for any valid status
          setStatus(data.status);

          if (data.status === 'completed') {
            const messagesResponse = await fetchHelper(
              'getMessages',
              {
                thread_id: threadId,
              },
              {},
            );
            const messageType = messagesResponse.data[1]?.metadata?.mode;
            // Skip processing for learning feedback messages
            if (messageType === 'learning_feedback') {
              break;
            }
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
            if (
              messageType === 'generate_answers' ||
              messageType === 'generate_more_answers'
            ) {
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
                  const answersRaw = responseData['Possible answers'];

                  if (answersRaw) {
                    setQuestionContext(responseData['context'] || '');
                    // Support both new and legacy field names for topic
                    setQuestionTopic(
                      responseData['topic'] ||
                        responseData['list_possible_topics'] ||
                        '',
                    );
                    setIdentifiedQuestion(
                      responseData['Identified Question'] || '',
                    );
                    setSummarizedWord(responseData['summarized_word'] || '');

                    // Normalize answers into {word, type}
                    const normalized: PossibleAnswerItem[] = Array.isArray(
                      answersRaw,
                    )
                      ? answersRaw.map((a: any) => {
                          if (a && typeof a === 'object') {
                            return {
                              word: String(a.word || a.text || ''),
                              type: a.type ? String(a.type) : undefined,
                            };
                          }
                          // legacy string answer
                          return {word: String(a || ''), type: undefined};
                        })
                      : [];

                    setPossibleAnswers(normalized);
                  }
                } catch (parseError) {
                  console.error(
                    '❌ Failed to parse response as JSON:',
                    parseError,
                  );
                }
              }
            }
            break;
          }

          if (['failed', 'cancelled', 'expired'].includes(data.status)) {
            console.error(`❌ Run ${data.status}`);
            setStatus('failed');
            setError(`Run ${data.status}`);

            break;
          }

          // Adaptive polling: start fast, then slow down
          // For the first 5 polls, use shorter intervals
          if (pollCount <= 5) {
            pollInterval = 300; // 300ms for first 5 polls
          } else if (pollCount <= 15) {
            pollInterval = 800; // 800ms for next 10 polls
          } else {
            pollInterval = 1500; // 1.5s for remaining polls
          }

          await new Promise<void>(resolve => setTimeout(resolve, pollInterval));
        }

        if (pollCount >= maxPolls) {
          console.error(
            'Maximum polling attempts reached. The operation may have timed out.',
          );
          setError('Polling timed out after maximum attempts');
        }
      } catch (err) {
        console.error('❌ Error during polling:', err);
        if (isSubscribed) {
          setError(
            err instanceof Error ? err.message : 'An unknown error occurred',
          );
        }
      }
    };

    pollStatus();

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

  // Track last message to enable retry-on-failure
  const lastMessageContentRef = useRef<string | null>(null);
  const lastMessageModeRef = useRef<
    | 'list_possible_topics'
    | 'list_possible_objects'
    | 'list_possible_actions'
    | 'generate_answers'
    | 'sentence'
    | 'generate_more_answers'
    | 'learning_feedback'
    | undefined
  >(undefined);
  const retryCountRef = useRef<number>(0);
  const MAX_RETRIES_ON_FAILURE = 1;

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
            // NEW: Also send pepes data on app start for existing fresh thread
            sendPepesIfAvailableForThread(savedThreadId);
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

  // Helper: validate and send pepes content to a specific thread (fire-and-forget)
  const sendPepesIfAvailableForThread = (newThreadId: string) => {
    try {
      const pepesString = preferences?.pepes;
      if (!pepesString || pepesString.trim().length === 0) {
        return;
      }

      let pepesJson: any;
      try {
        pepesJson = JSON.parse(pepesString);
      } catch (e) {
        return; // invalid JSON, skip
      }

      const hasAnyItems = (() => {
        if (!pepesJson || typeof pepesJson !== 'object') return false;
        return Object.values(pepesJson).some((val: any) =>
          Array.isArray(val) ? val.length > 0 : false,
        );
      })();

      if (!hasAnyItems) {
        return;
      }

      const content = `pepes data:\n${pepesString}`;
      // learning_feedback so it won't trigger normal response handling
      sendMessage(content, newThreadId, 'learning_feedback').catch(err => {
        console.warn('Failed to send pepes data message:', err);
      });
    } catch (err) {
      console.warn('Error preparing pepes data message:', err);
    }
  };

  const createThreadIfNeeded = async () => {
    try {
      // Otherwise create a new thread
      const response = await fetchHelper('createThread', {}, {});
      const data = await response;

      // Update state immediately
      setThreadId(data.id);

      const now = new Date().toISOString();
      await setItem('threadId', data.id);
      await setItem('threadCreatedAt', now);
      setIsThreadFresh(true);

      // Send pepes data once when a new thread is created
      sendPepesIfAvailableForThread(data.id);

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
      | 'sentence'
      | 'generate_more_answers'
      | 'learning_feedback',
  ) => {
    let idToUse = threadIdOverride || threadId;

    try {
      // Persist last message for potential retry
      lastMessageContentRef.current = content;
      lastMessageModeRef.current = mode;

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

  const {
    status,
    response,
    error,
    possibleAnswers,
    questionContext,
    questionTopic,
    identifiedQuestion,
    modeType,
  } = useAssistantResponse(threadId, runId);

  // Reset retry counter on success
  useEffect(() => {
    if (status === 'completed') {
      retryCountRef.current = 0;
    }
  }, [status]);

  // Effect for generating images when status is completed
  useEffect(() => {
    let isMounted = true;
    let isProcessing = false;

    const generateImages = async () => {
      // Prevent multiple simultaneous processing
      if (isProcessing || !isMounted) return;

      if (status === 'completed' && possibleAnswers) {
        try {
          isProcessing = true;

          // Build a lookup from pepes (names and aliases) to local image URIs
          const pepesLookup: {[key: string]: string} = {};
          // Also build a type lookup (e.g., "dolls" → some local doll image)
          const typeLookup: {
            [key: string]: {favorite?: string; fallback?: string};
          } = {};
          // Capture People and Pets for category-aware logic
          const peopleItems: Array<{
            name: string;
            nameLower: string;
            url: string;
            aliasesLower: string[];
            typeLower?: string;
            relationshipLower?: string;
          }> = [];
          const petsItems: Array<{
            name: string;
            nameLower: string;
            url: string;
            aliasesLower: string[];
            typeLower?: string;
          }> = [];
          try {
            const pepesString = preferences?.pepes;
            if (pepesString && pepesString.trim().length > 0) {
              const pepesJson = JSON.parse(pepesString);
              if (pepesJson && typeof pepesJson === 'object') {
                Object.entries(pepesJson).forEach(
                  ([categoryKey, categoryItems]: [string, any]) => {
                    if (Array.isArray(categoryItems)) {
                      categoryItems.forEach((item: any) => {
                        const imageUri = item?.imageUri;
                        if (!imageUri) return;
                        const originalName = String(item?.name || '').trim();
                        const nameKey = originalName.toLowerCase();
                        if (nameKey) {
                          pepesLookup[nameKey] = imageUri;
                        }
                        const aliases: any[] = Array.isArray(item?.aliases)
                          ? item.aliases
                          : [];
                        const aliasesLower: string[] = [];
                        aliases.forEach(alias => {
                          const aliasKey = String(alias || '')
                            .trim()
                            .toLowerCase();
                          if (aliasKey) {
                            pepesLookup[aliasKey] = imageUri;
                            aliasesLower.push(aliasKey);
                          }
                        });
                        const typeKey = String(item?.type || '')
                          .trim()
                          .toLowerCase();
                        if (typeKey) {
                          if (!typeLookup[typeKey]) {
                            typeLookup[typeKey] = {};
                          }
                          if (
                            item?.isFavorite &&
                            !typeLookup[typeKey].favorite
                          ) {
                            typeLookup[typeKey].favorite = imageUri;
                          }
                          if (!typeLookup[typeKey].fallback) {
                            typeLookup[typeKey].fallback = imageUri;
                          }
                        }

                        // Capture People / Pets records for expansion
                        if (categoryKey === 'People') {
                          const relationshipLower = String(
                            item?.relationship || '',
                          )
                            .trim()
                            .toLowerCase();
                          peopleItems.push({
                            name: originalName,
                            nameLower: nameKey,
                            url: imageUri,
                            aliasesLower,
                            typeLower: typeKey || undefined,
                            relationshipLower: relationshipLower || undefined,
                          });
                        } else if (categoryKey === 'Pets') {
                          petsItems.push({
                            name: originalName,
                            nameLower: nameKey,
                            url: imageUri,
                            aliasesLower,
                            typeLower: typeKey || undefined,
                          });
                        }
                      });
                    }
                  },
                );
              }
            }
          } catch (e) {
            // Ignore parse errors – we'll just fall back to server images when needed
          }

          // Helper to resolve a local pepes image for a given word/type
          const resolveLocalPepeUrl = (wordRaw: string, typeRaw?: string) => {
            const normalized = String(wordRaw || '')
              .trim()
              .toLowerCase();
            if (!normalized) return '';
            // Priority 1: exact match on name/alias
            if (pepesLookup[normalized]) {
              return pepesLookup[normalized];
            }
            // Priority 2: type match using explicit type
            const typeNorm = String(typeRaw || '')
              .trim()
              .toLowerCase();
            if (typeNorm && typeLookup[typeNorm]) {
              const entry = typeLookup[typeNorm];
              return entry.favorite || entry.fallback || '';
            }
            // Priority 3: type match using plural/singular variants of word
            const variants: string[] = [normalized];
            if (normalized.endsWith('es'))
              variants.push(normalized.slice(0, -2));
            if (normalized.endsWith('s'))
              variants.push(normalized.slice(0, -1));
            else {
              variants.push(normalized + 's');
              variants.push(normalized + 'es');
            }
            for (const v of variants) {
              const entry = typeLookup[v];
              if (entry) return entry.favorite || entry.fallback || '';
            }
            return '';
          };

          // Helper: build plural/singular variants
          const buildVariants = (w: string) => {
            const normalized = w.trim().toLowerCase();
            const variants = [normalized];
            if (normalized.endsWith('es'))
              variants.push(normalized.slice(0, -2));
            if (normalized.endsWith('s'))
              variants.push(normalized.slice(0, -1));
            else {
              variants.push(normalized + 's');
              variants.push(normalized + 'es');
            }
            return variants;
          };

          // Expand People / Pets group words into multiple local items
          const expandPeoplePets = (word: string) => {
            const w = String(word || '')
              .trim()
              .toLowerCase();
            if (!w) return [] as Array<{name: string; url: string}>;

            // People relationship mapping / group words
            const peopleRelMap: {
              [key: string]: (rel?: string, type?: string) => boolean;
            } = {
              sister: rel => rel === 'sister',
              sisters: rel => rel === 'sister',
              brother: rel => rel === 'brother',
              brothers: rel => rel === 'brother',
              mom: rel => rel === 'mom' || rel === 'mother',
              mother: rel => rel === 'mother' || rel === 'mom',
              dad: rel => rel === 'dad' || rel === 'father',
              father: rel => rel === 'father' || rel === 'dad',
              parent: rel =>
                ['mom', 'mother', 'dad', 'father'].includes(rel || ''),
              parents: rel =>
                ['mom', 'mother', 'dad', 'father'].includes(rel || ''),
              grandma: rel => rel === 'grandma' || rel === 'grandmother',
              grandmother: rel => rel === 'grandmother' || rel === 'grandma',
              grandpa: rel => rel === 'grandpa' || rel === 'grandfather',
              grandfather: rel => rel === 'grandfather' || rel === 'grandpa',
              aunt: rel => rel === 'aunt',
              uncle: rel => rel === 'uncle',
              cousin: rel => rel === 'cousin',
              friend: (rel, type) => rel === 'friend' || type === 'friends',
              friends: (rel, type) => rel === 'friend' || type === 'friends',
              people: () => true,
              family: () => true,
              teacher: (rel, type) =>
                rel === 'teacher' || type === 'professionals',
              teachers: (rel, type) =>
                rel === 'teacher' || type === 'professionals',
            };

            if (peopleRelMap[w]) {
              const matches = peopleItems.filter(pi =>
                peopleRelMap[w](pi.relationshipLower, pi.typeLower),
              );
              if (matches.length > 0) {
                return matches.map(m => ({name: m.name, url: m.url}));
              }
            }

            // Pets group/type mapping. Match by type or generic 'pets'
            const petTypeVariants = new Set(buildVariants(w));
            const petMatches = petsItems.filter(
              p =>
                (p.typeLower && petTypeVariants.has(p.typeLower)) ||
                petTypeVariants.has('pets'),
            );
            if (petMatches.length > 0) {
              return petMatches.map(m => ({name: m.name, url: m.url}));
            }
            return [] as Array<{name: string; url: string}>;
          };

          // Decide which answers can be fulfilled by pepes locally
          type IndexedAnswer = {index: number; word: string; type?: string};
          const allAnswers: IndexedAnswer[] = possibleAnswers.map((a, idx) => ({
            index: idx,
            word: String(a.word || ''),
            type: a.type,
          }));

          const localResults: Array<{
            index: number;
            url: string;
            prompt: string;
          }> = [];
          const toFetch: IndexedAnswer[] = [];
          allAnswers.forEach(item => {
            // First: Try to expand to People/Pets category matches
            const expanded = expandPeoplePets(item.word);
            if (expanded.length > 0) {
              expanded.forEach(e =>
                localResults.push({
                  index: item.index,
                  url: e.url,
                  prompt: e.name,
                }),
              );
              return; // Do not go to server for this word
            }

            // Second: Try to resolve single local match
            const localUrl = resolveLocalPepeUrl(item.word, item.type);
            if (localUrl) {
              localResults.push({
                index: item.index,
                url: localUrl,
                prompt: item.word,
              });
              return;
            }

            // Otherwise, fetch from server
            toFetch.push(item);
          });

          let fetchedResults: Array<{
            index: number;
            url: string;
            prompt: string;
          }> = [];

          if (toFetch.length > 0) {
            // Call the process_images API ONLY for the items not present in pepes
            const responseImages = await fetchHelper(
              'processImages',
              {},
              {
                possibleAnswers: toFetch.map(itm => ({
                  word: itm.word,
                  type: itm.type,
                })),
                questionContext: questionContext,
                identifiedQuestion: identifiedQuestion,
                questionTopic: questionTopic,
                gender:
                  preferences?.gender && preferences.gender.trim() !== ''
                    ? preferences.gender
                    : 'other',
              },
            );

            if (
              responseImages?.results &&
              Array.isArray(responseImages.results)
            ) {
              // Map results back to their original indices
              // We rely on server returning results in the same order for provided words
              fetchedResults = responseImages.results.map(
                (imageData: any, i: number) => {
                  const original = toFetch[i];
                  // No need to try pepes again here; these are items that had no local match
                  return {
                    index: original.index,
                    url: String(imageData?.imageUrl || ''),
                    prompt: String(imageData?.word || original.word || ''),
                  };
                },
              );
            }
          }

          // Combine and sort by original order
          const combined = [...localResults, ...fetchedResults]
            .sort((a, b) => a.index - b.index)
            .map(item => ({url: item.url, prompt: item.prompt}));

          // Deduplicate by image URL so the same image is not shown multiple times
          const seenUrls = new Set<string>();
          const deduped = combined.filter(item => {
            const key = String(item.url || '').trim();
            if (!key || seenUrls.has(key)) {
              return false;
            }
            seenUrls.add(key);
            return true;
          });

          // Set images in a single update to avoid UI flicker
          if (isMounted) {
            setImageUrls(deduped);
          }
        } catch (err) {
          console.error('Failed to process images:', err);
        } finally {
          isProcessing = false;
        }
      }
    };

    generateImages();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [
    status,
    possibleAnswers,
    questionContext,
    identifiedQuestion,
    questionTopic,
  ]);

  const runAssistant = async (threadIdOverride?: string) => {
    // Ensure we have a thread ID first by checking if we need a new one
    let idToUse = threadIdOverride || threadId;

    try {
      // Check if we have an assistant ID, if not, try to get it
      let assistantId = preferences.assistantId;

      if (!assistantId || assistantId === '') {
        // Get the user ID from preferences
        const userId = preferences.auth0Id;
        if (!userId || userId === '') {
          throw new Error(
            'No user ID found in preferences. User must be logged in.',
          );
        }

        try {
          const response = await fetchHelper(
            'getAssistantId',
            {},
            {
              userId: userId,
            },
          );

          if (response && response.assistantId) {
            assistantId = response.assistantId;
            // Store the assistant ID for future use
            await setItem('assistantId', response.assistantId);
          } else {
            throw new Error('No assistant ID returned from API');
          }
        } catch (apiError) {
          console.error('Failed to get assistant ID:', apiError);
          throw new Error(
            'Unable to retrieve assistant ID. Please try logging in again.',
          );
        }
      }

      const response = await fetchHelper(
        'runAssistant',
        {thread_id: idToUse},
        {assistant_id: assistantId},
      );
      const data = await response;
      setRunId(data.id);
      return data.id;
    } catch (error) {
      console.error('Failed to run assistant:', error);
      throw error;
    }
  };

  // Retry logic: if a run fails/cancels/expires, automatically re-send last message and re-run once
  useEffect(() => {
    const attemptRetry = async () => {
      // Only retry when marked failed by the polling hook
      if (status !== 'failed') return;

      // Skip if no message to retry or if last mode was learning feedback
      if (!lastMessageContentRef.current) return;
      if (lastMessageModeRef.current === 'learning_feedback') return;

      // Respect retry limit
      if (retryCountRef.current >= MAX_RETRIES_ON_FAILURE) return;

      try {
        // Small backoff before retry
        await new Promise<void>(resolve => setTimeout(() => resolve(), 500));

        // Re-send last message and re-run assistant on the same thread
        await sendMessage(
          lastMessageContentRef.current!,
          threadId,
          lastMessageModeRef.current,
        );
        await runAssistant(threadId);

        retryCountRef.current += 1;
        // Clear transient error so UI doesn't get stuck
        setLocalError(null);
        setLocalStatus('queued');
      } catch (retryErr) {
        console.error('Automatic retry failed:', retryErr);
      }
    };
    attemptRetry();
  }, [status, threadId, sendMessage, runAssistant]);

  const clearImages = () => {
    setImageUrls([]);
  };

  const resetAssistant = () => {
    // Reset all state except threadId
    setImageUrls([]);
    setHistory([]);
    setRunId('');
    setLocalStatus(null);
    setLocalResponse('');
    setLocalError(null);
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
        clearImages,
        generateImage,
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
