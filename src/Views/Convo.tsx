import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Dimensions,
  Image,
  Platform,
  Modal,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Carousel, {ICarouselInstance} from 'react-native-reanimated-carousel';
import TTSService from '../utils/TTSService';
import {views} from '../utils/constants';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import {useAssistant} from '../contexts/AssistantContext';
import fetchHelper from '../utils/fetcher';
import matalkImg from '../assets/matalk.png';
import welcomeImg from '../assets/welcome.png';

// Topic images from Topics.tsx
import beachImg from '../assets/topics/beach_topic_other.jpg';
import poolImg from '../assets/topics/pool_topic_other.jpg';
import parkImg from '../assets/topics/park_topic_other.jpg';
import playgroundImg from '../assets/topics/playground_topic_other.jpg';
import museumImg from '../assets/topics/museum_topic_other.jpg';
import backyardImg from '../assets/topics/backyard_topic_other.jpg';
import zooImg from '../assets/topics/zoo_topic_other.jpg';
import schoolImg from '../assets/topics/school_topic_other.jpg';
import libraryImg from '../assets/topics/library_topic_other.jpg';
import groceryStoreImg from '../assets/topics/grocery_store_topic_other.jpg';
import hideAndSeekImg from '../assets/topics/hide_and_seek_topic_other.jpg';
import dancingImg from '../assets/topics/dancing_topic_other.jpg';
import buildingImg from '../assets/topics/building_topic_other.jpg';
import ridesImg from '../assets/topics/rides_topic_other.jpg';
import fortImg from '../assets/topics/fort_topic_other.jpg';
import sandcastleImg from '../assets/topics/sandcastle_topic_other.jpg';
import toyImg from '../assets/topics/toy_topic_other.jpg';
import dinosaurImg from '../assets/topics/dinosaur_topic_other.jpg';
import trainImg from '../assets/topics/train_topic_other.jpg';
import airplanesImg from '../assets/topics/airplanes_topic_other.jpg';
import pancakesImg from '../assets/topics/pancakes_topic_other.jpg';
import iceCreamImg from '../assets/topics/ice_cream_topic_other.jpg';
import cookiesImg from '../assets/topics/cookies_topic_other.jpg';
import snackImg from '../assets/topics/snack_topic_other.jpg';
import popcornImg from '../assets/topics/popcorn_topic_other.jpg';
import hotChocolateImg from '../assets/topics/hot_chocolate_topic_other.jpg';
import lemonadeImg from '../assets/topics/lemonade_topic_other.jpg';
import dinnerImg from '../assets/topics/dinner_topic_other.jpg';
import rainImg from '../assets/topics/rain_topic_other.jpg';
import snowflakesImg from '../assets/topics/snowflakes_topic_other.jpg';
import snowmanImg from '../assets/topics/snowman_topic_other.jpg';
import puddlesImg from '../assets/topics/puddles_topic_other.jpg';
import windImg from '../assets/topics/wind_topic_other.jpg';
import cloudsImg from '../assets/topics/clouds_topic_other.jpg';
import sunImg from '../assets/topics/sun_topic_other.jpg';
import sunsetImg from '../assets/topics/sunset_topic_other.jpg';
import birthdayPartyImg from '../assets/topics/birthday_party_topic_other.jpg';
import weekendImg from '../assets/topics/weekend_topic_other.jpg';
import movieImg from '../assets/topics/movie_topic_other.jpg';
import partyImg from '../assets/topics/party_topic_other.jpg';
import Slider from '@react-native-community/slider';
import {useAppSettings} from '../utils/persistance';
import {FamilyMember} from '../Components/FamilyPics';
import ContextInfo from '../Components/ContextInfo';
import Topics from './Topics';
import {
  useChatContext,
  getContextualInfo,
} from '../contexts/ChatContextProvider';
import {logInitConversation} from '../utils/initConversationLogger';
import {useAdmin} from '../contexts/adminContext';

const DEBUGCONVONOIMAGEGENERATION = false;

// Mapping of topic names to their local images
const TOPIC_IMAGE_MAPPING: {[key: string]: any} = {
  Beach: beachImg,
  Pool: poolImg,
  Park: parkImg,
  Playground: playgroundImg,
  Museum: museumImg,
  Backyard: backyardImg,
  Zoo: zooImg,
  School: schoolImg,
  Library: libraryImg,
  'Grocery store': groceryStoreImg,
  'Hide and Seek': hideAndSeekImg,
  Dancing: dancingImg,
  Building: buildingImg,
  Rides: ridesImg,
  Fort: fortImg,
  Sandcastle: sandcastleImg,
  Toy: toyImg,
  Dinosaur: dinosaurImg,
  Train: trainImg,
  Airplanes: airplanesImg,
  Pancakes: pancakesImg,
  'Ice cream': iceCreamImg,
  Cookies: cookiesImg,
  Snack: snackImg,
  Popcorn: popcornImg,
  'Hot chocolate': hotChocolateImg,
  Lemonade: lemonadeImg,
  Dinner: dinnerImg,
  Rain: rainImg,
  Snowflakes: snowflakesImg,
  Snowman: snowmanImg,
  Puddles: puddlesImg,
  Wind: windImg,
  Clouds: cloudsImg,
  Sun: sunImg,
  Sunset: sunsetImg,
  'Birthday party': birthdayPartyImg,
  Weekend: weekendImg,
  Movie: movieImg,
  Party: partyImg,
};

const {width, height} = Dimensions.get('window');

type Topic = 'NA' | 'Talk' | 'Play' | 'All topics' | string;
type Action = 'NA' | 'say' | 'ask' | 'tell' | 'run' | 'jump' | 'dance';
type Object = 'NA' | 'ball';
type Speaker = string;
type Audience = string;
type SentenceType = '?' | '!';

interface Sentence {
  speaker: Speaker | '';
  audience: Audience | '';
  sentenceType: SentenceType | '';
  list_possible_topics: Topic | '';
  action: Action | '';
  object: Object | '';
}

type RootStackParamList = {};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const COLUMN_WIDTH = SCREEN_WIDTH / 4;

interface ImagePrompt {
  image_prompt: string;
  text: string;
}

interface ImageGenerated {
  text: string;
  url: string;
}

interface TopicData {
  label: string;
  image: any;
  backgroundColor: string;
}

const Convo = () => {
  const [sentence, setSentence] = useState<Sentence>({
    speaker: '',
    audience: '',
    sentenceType: '',
    list_possible_topics: '',
    action: '',
    object: '',
  });
  const [inputText, setInputText] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [contextInfoVisible, setContextInfoVisible] = useState(false);
  const [topicsModalVisible, setTopicsModalVisible] = useState(false);

  // Get assistant context
  const {
    threadId,
    sendMessage,
    runAssistant,
    response,
    status,
    resetAssistant,
  } = useAssistant();

  // Reset loading state if assistant fails
  useEffect(() => {
    if (status === 'failed') {
      setIsLoading(false);
    }
  }, [status]);

  // Get chat context for weather and location
  const {weather, location} = useChatContext();

  // Get app settings for family pics data
  const {getItem} = useAppSettings();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [conversationMode, setConversationMode] = useState<'easy' | 'advanced'>(
    'easy',
  );

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Get device type for responsive design
  const {isTablet} = useAdmin();

  // Responsive values based on device type
  const responsiveValues = {
    safeAreaPadding: isTablet
      ? SCREEN_HEIGHT * 0.05
      : Platform.OS === 'ios'
      ? SCREEN_HEIGHT * 0.05
      : SCREEN_HEIGHT * 0.03,
    inputHeight: isTablet ? SCREEN_HEIGHT * 0.06 : SCREEN_HEIGHT * 0.055,
    inputFontSize: isTablet ? SCREEN_HEIGHT * 0.02 : SCREEN_HEIGHT * 0.018,
    inputMarginHorizontal: isTablet ? SCREEN_WIDTH * 0.03 : SCREEN_WIDTH * 0.02,
    inputMarginVertical: isTablet
      ? SCREEN_HEIGHT * 0.02
      : SCREEN_HEIGHT * 0.015,
    navButtonSize: isTablet ? SCREEN_WIDTH * 0.08 : SCREEN_WIDTH * 0.07,
    navButtonMargin: isTablet ? SCREEN_WIDTH * 0.02 : SCREEN_WIDTH * 0.015,
    navButtonFontSize: isTablet ? SCREEN_WIDTH * 0.02 : SCREEN_WIDTH * 0.018,
    speakerAudienceWidth: isTablet ? ('15%' as const) : ('21%' as const),
    speakerAudienceMargin: isTablet ? SCREEN_WIDTH * 0.03 : SCREEN_WIDTH * 0.03,
    rightContentWidth: isTablet ? ('79%' as const) : ('71%' as const),
    sectionTitleFontSize: isTablet ? 18 : 12,
    optionTextFontSize: isTablet ? 14 : 12,
    personContainerSize: isTablet ? width * 0.08 : width * 0.04,
    personImageSize: isTablet ? width * 0.05 : width * 0.04,
    talkContainerSize: isTablet ? width * 0.1 : width * 0.05,
    gridImageHeight: isTablet ? SCREEN_HEIGHT * 0.2 : SCREEN_HEIGHT * 0.13,
    gridItemMarginBottom: isTablet ? 15 : 10,
    labelGridFontSize: isTablet ? 16 : 12,
    sliderMarginTop: isTablet ? height * 0.04 : 0.01,
    playButtonWidth: isTablet ? width * 0.2 : width * 0.15,
    playButtonHeight: isTablet ? width * 0.05 : width * 0.03,
    playButtonFontSize: isTablet ? 20 : 12,
    playButtonMarginTop: isTablet ? height * 0.06 : height * 0.04,
    matalkIconSize: isTablet ? 60 : 35,
    matalkIconBottom: isTablet ? height * 0.04 : height * 0.03,
    matalkIconLeft: isTablet ? width * 0.03 : width * 0.02,
    borderRadius: isTablet ? 16 : 16,
    shadowRadius: isTablet ? 5 : 3,
    shadowOffset: isTablet ? {width: 0, height: 2} : {width: 0, height: 1},
    elevation: isTablet ? 5 : 3,
    carouselWindowSize: isTablet ? 3 : 2,
  };

  const speakerCarouselRef = useRef<ICarouselInstance>(null);
  const audienceCarouselRef = useRef<ICarouselInstance>(null);
  const sentenceTypeCarouselRef = useRef<ICarouselInstance>(null);
  const topicCarouselRef = useRef<ICarouselInstance>(null);
  const actionCarouselRef = useRef<ICarouselInstance>(null);
  const objectCarouselRef = useRef<ICarouselInstance>(null);

  // Add a ref to track active calls and prevent duplicates
  const activeCallsRef = useRef<Set<string>>(new Set());

  // Track the last processed response to avoid processing the same response multiple times
  const lastProcessedResponseRef = useRef<string>('');

  // Dynamic speakers and audience based on family members
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [audience, setAudience] = useState<Audience[]>([]);

  const sentenceTypes: SentenceType[] = ['?', '!'];
  const [speakerIndex, setSpeakerIndex] = useState(0);
  const [audienceIndex, setAudienceIndex] = useState(0);
  const [sentenceTypeIndex, setSentenceTypeIndex] = useState(0);
  const [topicIndex, setTopicIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [objectIndex, setObjectIndex] = useState(0);
  const [topic, setTopic] = useState<Topic>('NA');
  const [action, setAction] = useState<Action>('NA');
  const [object, setObject] = useState<Object>('NA');

  // Add states for dynamic topics, actions and objects
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [availableActions, setAvailableActions] = useState<Action[]>([]);
  const [availableObjects, setAvailableObjects] = useState<Object[]>([]);
  const [generatedSentence, setGeneratedSentence] = useState('');
  const [generatedTopicImages, setGeneratedTopicImages] = useState<
    ImageGenerated[]
  >([]);
  const [generatedActionImages, setGeneratedActionImages] = useState<
    ImageGenerated[]
  >([]);
  const [generatedObjectImages, setGeneratedObjectImages] = useState<
    ImageGenerated[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  // Slider state
  const [sliderPosition, setSliderPosition] = useState(0); // 0: topics, 1: actions, 2: objects
  const [isAutoSliding, setIsAutoSliding] = useState(false);

  // Load family members data and update speakers/audience
  useEffect(() => {
    // Send wakeup call to backend when entering Convo screen
    const sendWakeupCall = async () => {
      try {
        await fetchHelper('wakeup', {}, {});
      } catch (error) {
        console.error('Error sending wakeup call from Convo screen:', error);
      }
    };

    // Send wakeup call first
    sendWakeupCall();

    const loadFamilyData = async () => {
      try {
        // Load conversation mode
        const savedConversationMode = await getItem('conversationMode');
        setConversationMode(
          (savedConversationMode as 'easy' | 'advanced') || 'easy',
        );

        const savedData = await getItem('familyPicsData');
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          setFamilyMembers(parsedData);

          // Extract names for speakers and audience
          const memberNames = parsedData.map(
            (member: FamilyMember) => member.name,
          );
          setSpeakers(memberNames);
          setAudience(memberNames);
        } else {
          // Fallback to default family members if no saved data
          const defaultMembers = [
            {id: 'me', name: 'I', isDefault: true},
            {id: 'mom', name: 'Mom', isDefault: true},
            {id: 'dad', name: 'Dad', isDefault: true},
          ];
          setFamilyMembers(defaultMembers);
          setSpeakers(['I', 'Mom', 'Dad']);
          setAudience(['I', 'Mom', 'Dad']);
        }

        // Set default speaker and audience for easy mode
        const mode = (savedConversationMode as 'easy' | 'advanced') || 'easy';
        if (mode === 'easy') {
          setSentence(prev => ({
            ...prev,
            speaker: 'I',
            audience: 'anyone',
          }));
        }
      } catch (error) {
        console.error('Error loading family data:', error);
        // Fallback to default
        setSpeakers(['I', 'Mom', 'Dad']);
        setAudience(['I', 'Mom', 'Dad']);

        // Set default for easy mode even on error
        const mode = 'easy';
        setConversationMode(mode);
        if (mode === 'easy') {
          setSentence(prev => ({
            ...prev,
            speaker: 'I',
            audience: 'anyone',
          }));
        }
      }
    };

    loadFamilyData();
  }, []);

  // Helper function to get family member image
  const getFamilyMemberImage = (memberName: string) => {
    const member = familyMembers.find(m => m.name === memberName);
    return member?.imageUri;
  };

  // Helper to parse JSON responses from the assistant
  const parseAssistantResponse = (jsonString: any) => {
    try {
      if (jsonString?.response) {
        return jsonString.response;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  };

  // Helper function to use the Assistant API
  const callAssistant = async (mode: string, prompt: string) => {
    // Prevent duplicate calls
    if (activeCallsRef.current.has(mode)) {
      return false;
    }

    // If already loading, don't start another call
    if (isLoading && status === 'in_progress') {
      return false;
    }

    try {
      activeCallsRef.current.add(mode);
      setIsLoading(true);

      // Prepare the message with the mode and content
      // Format the message to clearly indicate the mode for the assistant
      const contextInfo = getContextualInfo(weather, location);
      const message = `${prompt} , this is the weather , tima and location info: ${contextInfo}`;

      // Send the message
      const messageId = await sendMessage(
        message,
        undefined,
        mode as
          | 'list_possible_objects'
          | 'list_possible_topics'
          | 'list_possible_actions'
          | 'generate_answers'
          | 'sentence',
      );

      // Run the assistant
      const runId = await runAssistant();

      // Set a backup timeout to reset loading state if no response comes back
      setTimeout(() => {
        if (isLoading) {
          setIsLoading(false);
          activeCallsRef.current.delete(mode);
        }
      }, 8000); // 8 seconds, shorter than the main timeout

      return true;
    } catch (error) {
      console.error(`❌ Error calling assistant in ${mode} mode:`, error);
      setIsLoading(false);
      activeCallsRef.current.delete(mode);
      return false;
    }
  };

  // Function to log conversation process
  const logConversationProcess = async () => {
    if (!threadId || !generatedSentence) {
      return;
    }

    try {
      await logInitConversation({
        question: generatedSentence,
        possibleTopics: availableTopics,
        possibleActions: availableActions,
        possibleObjects: availableObjects,
        sentence: generatedSentence,
        topic: topic,
        action: action,
        objectPicked: object,
        threadId: threadId,
      });
    } catch (error) {
      console.error('❌ Error logging conversation process:', error);
    }
  };

  const generateImage = async (array: ImagePrompt[], mode: string) => {
    try {
      // Validate input data
      if (!array || !Array.isArray(array) || array.length === 0) {
        return;
      }

      // Process each item individually
      const images = [];
      for (const answer of array) {
        try {
          // Create single item with all context information
          const item = {
            speaker: sentence.speaker,
            audience: sentence.audience,
            sentenceType: sentence.sentenceType,
            topic: topic,
            object: object,
            action: action,
            text: answer.text || answer, // Handle both object and string formats
          };

          // Call the process_images API with single item
          const responseImages = await fetchHelper(
            'processImagesConvo',
            {},
            {
              items: [item],
            },
          );

          // Process the response and add to images array
          if (
            responseImages &&
            Array.isArray(responseImages.results) &&
            responseImages.results.length > 0
          ) {
            images.push({
              url: responseImages.results[0].url,
              text: responseImages.results[0].text,
            });
          } else {
            // Add fallback if no result
            images.push({
              text:
                typeof answer === 'string'
                  ? answer
                  : answer.text || answer.image_prompt || 'Unknown',
              url: '',
            });
          }
        } catch (itemError) {
          console.error('❌ Failed to process individual image:', itemError);
          // Add fallback for this item
          images.push({
            text:
              typeof answer === 'string'
                ? answer
                : answer.text || answer.image_prompt || 'Unknown',
            url: '',
          });
        }
      }

      if (mode === 'topic') {
        // Add "All topics" card to the topic images
        const allTopicsCard = {
          text: 'All topics',
          url: '', // No URL needed for local image
        };
        setGeneratedTopicImages([...images, allTopicsCard]);
      } else if (mode === 'list_possible_actions') {
        setGeneratedActionImages(images);
      } else if (mode === 'list_possible_objects') {
        setGeneratedObjectImages(images);
      }

      return images;
    } catch (err) {
      console.error('❌ Failed to process images:', err);

      // Create fallback images without URLs to prevent hanging
      const fallbackImages = array.map(item => ({
        text:
          typeof item === 'string'
            ? item
            : item.text || item.image_prompt || 'Unknown',
        url: '',
      }));

      if (mode === 'topic') {
        // Add "All topics" card to the fallback images
        const allTopicsCard = {
          text: 'All topics',
          url: '', // No URL needed for local image
        };
        setGeneratedTopicImages([...fallbackImages, allTopicsCard]);
      } else if (mode === 'list_possible_actions') {
        setGeneratedActionImages(fallbackImages);
      } else if (mode === 'list_possible_objects') {
        setGeneratedObjectImages(fallbackImages);
      }
    }
  };

  // Handle assistant responses
  useEffect(() => {
    if (response) {
      // Create a unique identifier for this response
      const responseId = `${response.modeType}-${response.response?.substring(
        0,
        50,
      )}`;

      // Check if we've already processed this response
      if (lastProcessedResponseRef.current === responseId) {
        return;
      }

      // Mark this response as processed
      lastProcessedResponseRef.current = responseId;

      try {
        // Handle the response based on its modeType
        if (response.modeType === 'list_possible_topics') {
          // Guard clause: Don't process topics if basic requirements aren't met
          if (
            !sentence.speaker ||
            !sentence.audience ||
            !sentence.sentenceType
          ) {
            return;
          }

          try {
            const topicsArray = JSON.parse(response.response);

            if (
              Array.isArray(topicsArray.topics) &&
              topicsArray.topics.length > 0
            ) {
              const topics = topicsArray.topics
                .slice(0, 4)
                .map((item: {text: any}) => item.text) as Topic[];

              setAvailableTopics(topics);

              generateImage(topicsArray.topics, 'topic').catch(error => {
                console.error(
                  '❌ Error in image generation for topics:',
                  error,
                );
                setIsLoading(false);
              });
            }
          } catch (error) {
            console.error('❌ Error parsing topics:', error);
          }
        } else if (response.modeType === 'list_possible_actions') {
          // Guard clause: Don't process actions if basic requirements aren't met
          if (
            !sentence.speaker ||
            !sentence.audience ||
            !sentence.sentenceType ||
            !topic ||
            topic === 'NA'
          ) {
            return;
          }

          try {
            const actionsData = JSON.parse(response.response);

            if (
              actionsData &&
              Array.isArray(actionsData.verbs) &&
              actionsData.verbs.length > 0
            ) {
              const actions = actionsData.verbs.slice(0, 4) as Action[];
              setAvailableActions(actions);

              generateImage(actionsData.verbs, 'list_possible_actions').catch(
                error => {
                  console.error(
                    '❌ Error in image generation for actions:',
                    error,
                  );
                  setIsLoading(false);
                },
              );
            }
          } catch (error) {
            console.error('❌ Error parsing actions:', error);
            setIsLoading(false);
          }
        } else if (response.modeType === 'list_possible_objects') {
          // Guard clause: Don't process objects if basic requirements aren't met
          if (
            !sentence.speaker ||
            !sentence.audience ||
            !sentence.sentenceType ||
            !topic ||
            topic === 'NA' ||
            !action ||
            action === 'NA'
          ) {
            return;
          }

          try {
            const objectsData = JSON.parse(response.response);

            if (
              objectsData &&
              Array.isArray(objectsData.objects) &&
              objectsData.objects.length > 0
            ) {
              const objects = objectsData.objects.slice(0, 4) as Object[];
              setAvailableObjects(objects);

              generateImage(objectsData.objects, 'list_possible_objects').catch(
                error => {
                  console.error(
                    '❌ Error in image generation for objects:',
                    error,
                  );
                  setIsLoading(false);
                },
              );
            }
          } catch (error) {
            console.error('❌ Error parsing objects:', error);
            setIsLoading(false);
          }
        } else if (response.modeType === 'sentence') {
          try {
            const sentenceData = response?.response;

            if (sentenceData) {
              setGeneratedSentence(sentenceData);
              setInputText(sentenceData);
            }
          } catch (error) {
            console.error('Error parsing sentence:', error);
          }
        }
      } catch (error) {
        console.error('❌ Error processing assistant response:', error);
      } finally {
        // Always reset loading state, regardless of success or failure
        setIsLoading(false);
        // Clear active calls when response is processed
        activeCallsRef.current.clear();
      }
    }
  }, [response]);

  // Add a safety mechanism to reset loading state if it gets stuck
  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        setIsLoading(false);
      }, 10000); // 10 second timeout for faster debugging

      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  // Watch for speaker, audience, and sentenceType selections to generate topics
  useEffect(() => {
    const generateTopics = async () => {
      const {speaker, audience, sentenceType} = sentence;

      // For easy mode: generate topics when sentence type is selected
      // For advanced mode: only proceed if all three are selected, slider is at position 0, and we don't have a valid topic
      const shouldGenerate =
        conversationMode === 'easy'
          ? speaker && audience && sentenceType && (!topic || topic === 'NA')
          : speaker &&
            audience &&
            sentenceType &&
            sliderPosition === 0 &&
            (!topic || topic === 'NA');

      if (shouldGenerate) {
        // Get contextual information
        const contextInfo = getContextualInfo(weather, location);

        const prompt = `${contextInfo}. Please list possible topics for a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. Consider the current time, weather, location, and day when suggesting topics. I need up to 4 simple, kid-friendly topics that are appropriate for the current context. The message.metadata.mode = 'list_possible_topics'`;
        await callAssistant('list_possible_topics', prompt);
      }
    };

    generateTopics();
  }, [
    sentence.speaker,
    sentence.audience,
    sentence.sentenceType,
    sliderPosition,
    conversationMode,
    weather,
    location,
  ]);

  // Watch for topic selection to generate actions
  useEffect(() => {
    const generateActions = async () => {
      const {speaker, audience, sentenceType} = sentence;

      // For easy mode: generate actions when topic is selected
      // For advanced mode: only proceed if we have prerequisites and either no action selected or at position 1
      const shouldGenerate =
        conversationMode === 'easy'
          ? speaker &&
            audience &&
            sentenceType &&
            topic &&
            topic !== 'NA' &&
            (!action || action === 'NA')
          : speaker &&
            audience &&
            sentenceType &&
            topic &&
            topic !== 'NA' &&
            sliderPosition === 1 &&
            (!action || action === 'NA');

      if (shouldGenerate) {
        // Get contextual information
        const contextInfo = getContextualInfo(weather, location);

        const prompt = `${contextInfo}. Please list possible action verbs related to the topic "${topic}" for a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. Consider the current weather, time of day, location, and day when suggesting actions. I need up to 3 simple, kid-friendly action verbs that are appropriate for the current context and conditions. The message.metadata.mode = 'actions'`;

        await callAssistant('list_possible_actions', prompt);
      }
    };

    generateActions();
  }, [topic, sliderPosition, conversationMode, weather, location]);

  // Watch for action selection to generate objects
  useEffect(() => {
    const generateObjects = async () => {
      const {speaker, audience, sentenceType} = sentence;

      // For easy mode: generate objects when action is selected
      // For advanced mode: only proceed if we have prerequisites and either no object selected or at position 2
      const shouldGenerate =
        conversationMode === 'easy'
          ? speaker &&
            audience &&
            sentenceType &&
            topic &&
            topic !== 'NA' &&
            action &&
            action !== 'NA' &&
            (!object || object === 'NA')
          : speaker &&
            audience &&
            sentenceType &&
            topic &&
            topic !== 'NA' &&
            action &&
            action !== 'NA' &&
            sliderPosition === 2 &&
            (!object || object === 'NA');

      if (shouldGenerate) {
        const objectsPrompt = `Please list possible direct objects or noun phrases for the action "${action}" related to the topic "${topic}" in a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. I need up to 3 simple, kid-friendly objects. The message.metadata.mode = 'objects'`;

        await callAssistant('list_possible_objects', objectsPrompt);
      }
    };

    generateObjects();
  }, [action, sliderPosition, conversationMode]);

  useEffect(() => {
    const {speaker, audience, sentenceType} = sentence;
    const generateSentence = async () => {
      const sentencePrompt = `Write one complete, kid-friendly sentence using the word "${action}" as the verb and "${object}" as the object. The sentence must clearly relate to the topic "${topic}", either by naming it or describing something from it. The speaker is "${speaker}", and the sentence should be addressed to "${audience}". The sentence must be a ${
        sentenceType === '?' ? 'question' : 'statement'
      }. Make it easy for a young child to understand and speak. Return only the sentence, nothing else.`;

      await callAssistant('sentence', sentencePrompt);
    };

    if (
      topic &&
      action &&
      object &&
      topic !== 'NA' &&
      action !== 'NA' &&
      object !== 'NA'
    ) {
      generateSentence();
    }
  }, [topic, action, object]);

  const handleSpeakerSelect = (speaker: Speaker, index: number) => {
    setSentence({...sentence, speaker});
    setSpeakerIndex(index);
    if (speakerCarouselRef.current && speakerIndex !== index) {
      // @ts-ignore
      speakerCarouselRef.current.scrollTo({index, animated: true});
    }
  };

  const handleAudienceSelect = (audience: Audience, index: number) => {
    setSentence({...sentence, audience});
    setAudienceIndex(index);
    if (audienceCarouselRef.current && audienceIndex !== index) {
      // @ts-ignore
      audienceCarouselRef.current.scrollTo({index, animated: true});
    }
  };

  const handleSentenceTypeSelect = (
    sentenceType: SentenceType,
    index: number,
  ) => {
    setSentence({...sentence, sentenceType});
    setSentenceTypeIndex(index);
    if (sentenceTypeCarouselRef.current) {
      // @ts-ignore
      sentenceTypeCarouselRef.current.scrollTo({index, animated: true});
    }
  };

  const handleTopicSelect = (item: Topic | ImageGenerated, index: number) => {
    // Extract the text if it's an ImageGenerated object
    const topicValue =
      typeof item === 'object' && 'text' in item
        ? (item.text as Topic)
        : (item as Topic);

    // If "All topics" is selected, open the Topics modal
    if (topicValue === 'All topics') {
      setTopicsModalVisible(true);
      return;
    }

    setTopic(topicValue);
    setTopicIndex(index);
  };

  const handleActionSelect = (
    action: Action | ImageGenerated,
    index: number,
  ) => {
    // setSentence({...sentence, action});
    const actionValue =
      typeof action === 'object' && 'text' in action
        ? (action.text as Action)
        : (action as Action);
    setAction(actionValue);
    setActionIndex(index);
  };

  const handleObjectSelect = (
    object: Object | ImageGenerated,
    index: number,
  ) => {
    //setSentence({...sentence, object});
    const objectValue =
      typeof object === 'object' && 'text' in object
        ? (object.text as Object)
        : (object as Object);
    setObject(objectValue);
    setObjectIndex(index);
  };

  const handleHome = () => {
    // Reset the assistant state (everything except threadId)
    resetAssistant();

    // Reset all sentence fields completely
    if (conversationMode === 'easy') {
      setSentence({
        speaker: 'I',
        audience: 'anyone',
        sentenceType: '',
        list_possible_topics: '',
        action: '',
        object: '',
      });
    } else {
      setSentence({
        speaker: '',
        audience: '',
        sentenceType: '',
        list_possible_topics: '',
        action: '',
        object: '',
      });
    }
    setAvailableTopics([]);
    setAvailableActions([]);
    setAvailableObjects([]);
    setGeneratedTopicImages([]);
    setGeneratedActionImages([]);
    setGeneratedObjectImages([]);
    setSentenceTypeIndex(0);
    setInputText('');
    setTopic('NA');
    setAction('NA');
    setObject('NA');
    setGeneratedSentence('');
    setSpeakerIndex(0);
    setAudienceIndex(0);
    setSentenceTypeIndex(0);
    setTopicIndex(0);
    setActionIndex(0);
    setObjectIndex(0);
    setSliderPosition(0);

    // Reset carousel positions
    if (speakerCarouselRef.current) {
      // @ts-ignore
      speakerCarouselRef.current.scrollTo({index: 0, animated: true});
    }
    if (audienceCarouselRef.current) {
      // @ts-ignore
      audienceCarouselRef.current.scrollTo({index: 0, animated: true});
    }
    if (sentenceTypeCarouselRef.current) {
      // @ts-ignore
      sentenceTypeCarouselRef.current.scrollTo({
        index: 0,
        animated: true,
      });
    }
    if (topicCarouselRef.current) {
      // @ts-ignore
      topicCarouselRef.current.scrollTo({index: 0, animated: true});
    }
    if (actionCarouselRef.current) {
      // @ts-ignore
      actionCarouselRef.current.scrollTo({index: 0, animated: true});
    }
    if (objectCarouselRef.current) {
      // @ts-ignore
      objectCarouselRef.current.scrollTo({index: 0, animated: true});
    }

    // Allow time for state to update and screen to re-render before navigating
    setTimeout(() => {
      navigation.navigate(views.OPEN as never);
    }, 100);
  };

  const toggleKeyboard = () => {
    setIsKeyboardVisible(!isKeyboardVisible);
  };

  const toggleContextInfo = () => {
    setContextInfoVisible(!contextInfoVisible);
  };

  const toggleTopicsModal = () => {
    setTopicsModalVisible(!topicsModalVisible);
  };

  const handleTopicSelection = (topicData: TopicData) => {
    // Create an ImageGenerated object from the selected topic
    const selectedTopicImage: ImageGenerated = {
      text: topicData.label,
      url: '', // We'll use the local image instead
    };

    // Add the selected topic to the beginning of the topic images array
    const currentImages = generatedTopicImages.filter(
      img => img.text !== 'All topics',
    );
    const allTopicsCard = generatedTopicImages.find(
      img => img.text === 'All topics',
    );

    // Create new array with existing topics, then selected topic, then "All topics" card
    const newTopicImages = [...currentImages, selectedTopicImage];
    if (allTopicsCard) {
      newTopicImages.push(allTopicsCard);
    }

    setGeneratedTopicImages(newTopicImages);
    setTopic(topicData.label as Topic);
    setTopicIndex(currentImages.length); // Set to the position of the newly added topic
    setTopicsModalVisible(false); // Close modal after selection
  };

  // Handle manual slider changes
  const handleSliderChange = (value: number) => {
    if (isAutoSliding) return; // Ignore manual changes during auto-sliding

    const newPosition = Math.round(value);
    if (newPosition === sliderPosition) return;

    // Check if slider should be disabled for general conditions
    const isGenerallyDisabled =
      isLoading || status === 'queued' || status === 'in_progress';

    if (isGenerallyDisabled) return; // Don't allow changes when disabled

    // Moving backwards - special handling
    if (newPosition < sliderPosition) {
      setSliderPosition(newPosition);

      if (newPosition === 0) {
        // Moving back to topics - only clear actions and objects, keep topic
        setAction('NA');
        setObject('NA');
        setAvailableActions([]);
        setAvailableObjects([]);
        setGeneratedActionImages([]);
        setGeneratedObjectImages([]);

        // Auto-advance to actions after a short delay if topic is selected
        if (topic && topic !== 'NA') {
          setTimeout(() => {
            setIsAutoSliding(true);
            setSliderPosition(1);
            setTimeout(() => setIsAutoSliding(false), 300);
          }, 100);
        }
      } else if (newPosition === 1) {
        // Moving back to actions - only clear objects
        setObject('NA');
        setAvailableObjects([]);
        setGeneratedObjectImages([]);

        // Auto-advance to objects after a short delay if action is selected
        if (action && action !== 'NA') {
          setTimeout(() => {
            setIsAutoSliding(true);
            setSliderPosition(2);
            setTimeout(() => setIsAutoSliding(false), 300);
          }, 100);
        }
      }
      return;
    }

    // Moving forward - check prerequisites
    if (newPosition > sliderPosition) {
      // Cannot move forward from topics if no topic is selected
      if (sliderPosition === 0 && (!topic || topic === 'NA')) {
        return;
      }

      // Cannot move forward from actions if no action is selected
      if (sliderPosition === 1 && (!action || action === 'NA')) {
        return;
      }

      // Cannot move forward from objects if no object is selected
      if (sliderPosition === 2 && (!object || object === 'NA')) {
        return;
      }
    }

    setSliderPosition(newPosition);
  };

  // useEffect(() => {
  //   // Stop listening when component mounts, but don't block loading
  //   setTimeout(() => {}, 0);

  //   // No need for cleanup since we're already stopped
  // }, []);

  // Auto-advance slider when topic is selected
  useEffect(() => {
    if (topic && topic !== 'NA' && sliderPosition === 0) {
      setIsAutoSliding(true);
      setSliderPosition(1);
      setTimeout(() => setIsAutoSliding(false), 300);
    }
  }, [topic]);

  // Auto-advance slider when action is selected
  useEffect(() => {
    if (action && action !== 'NA' && sliderPosition === 1) {
      setIsAutoSliding(true);
      setSliderPosition(2);
      setTimeout(() => setIsAutoSliding(false), 300);
    }
  }, [action]);

  // Function to handle TTS playback
  const handlePlaySentence = async () => {
    if (
      inputText &&
      inputText.trim() !== '' &&
      inputText !== 'Waiting for input...'
    ) {
      try {
        // Log the conversation process before playing
        await logConversationProcess();

        // Send learning feedback to assistant
        try {
          const currentTime = new Date().toLocaleString();
          const learningMessage = `User created sentence: "${inputText}" with choices - Speaker: ${
            sentence.speaker
          }, Audience: ${sentence.audience}, Sentence Type: ${
            sentence.sentenceType === '?' ? 'Question' : 'Statement'
          }, Topic: ${topic}, Action: ${action}, Object: ${object}. Context - Time: ${currentTime}, Location: ${
            location || 'Unknown'
          }, Weather: ${weather || 'Unknown'}`;
          await sendMessage(learningMessage, threadId, 'learning_feedback');
        } catch (error) {
          console.error('Failed to send learning feedback:', error);
          // Don't block the user flow if learning feedback fails
        }

        await TTSService.speak(inputText);

        // Wait for 3 seconds before resetting
        setTimeout(() => {
          // Reset everything except sentence type first
          if (conversationMode === 'easy') {
            setSentence(prev => ({
              ...prev,
              speaker: 'I',
              audience: 'anyone',
              sentenceType: '',
              list_possible_topics: '',
              action: '',
              object: '',
            }));
          } else {
            setSentence(prev => ({
              ...prev,
              sentenceType: '',
              list_possible_topics: '',
              action: '',
              object: '',
            }));
          }
          setSentenceTypeIndex(0);
          setInputText('');
          setTopic('NA');
          setAction('NA');
          setObject('NA');
          setAvailableTopics([]);
          setAvailableActions([]);
          setAvailableObjects([]);
          setGeneratedTopicImages([]);
          setGeneratedActionImages([]);
          setGeneratedObjectImages([]);
          setGeneratedSentence('');
          setSpeakerIndex(0);
          setAudienceIndex(0);
          setSentenceTypeIndex(0);
          setTopicIndex(0);
          setActionIndex(0);
          setObjectIndex(0);
          setSliderPosition(0);

          // Reset carousel positions
          if (speakerCarouselRef.current) {
            // @ts-ignore
            speakerCarouselRef.current.scrollTo({index: 0, animated: true});
          }
          if (audienceCarouselRef.current) {
            // @ts-ignore
            audienceCarouselRef.current.scrollTo({index: 0, animated: true});
          }
          if (sentenceTypeCarouselRef.current) {
            // @ts-ignore
            sentenceTypeCarouselRef.current.scrollTo({
              index: 0,
              animated: true,
            });
          }
          if (topicCarouselRef.current) {
            // @ts-ignore
            topicCarouselRef.current.scrollTo({index: 0, animated: true});
          }
          if (actionCarouselRef.current) {
            // @ts-ignore
            actionCarouselRef.current.scrollTo({index: 0, animated: true});
          }
          if (objectCarouselRef.current) {
            // @ts-ignore
            objectCarouselRef.current.scrollTo({index: 0, animated: true});
          }
        }, 3000); // 3000 milliseconds = 3 seconds
      } catch (error) {
        console.error('Error playing sentence:', error);
      }
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      // Reset all state when Convo screen is focused
      if (conversationMode === 'easy') {
        setSentence({
          speaker: 'I',
          audience: 'anyone',
          sentenceType: '',
          list_possible_topics: '',
          action: '',
          object: '',
        });
      } else {
        setSentence({
          speaker: '',
          audience: '',
          sentenceType: '',
          list_possible_topics: '',
          action: '',
          object: '',
        });
      }
      setAvailableTopics([]);
      setAvailableActions([]);
      setAvailableObjects([]);
      setGeneratedTopicImages([]);
      setGeneratedActionImages([]);
      setGeneratedObjectImages([]);
      setSentenceTypeIndex(0);
      setInputText('');
      setTopic('NA');
      setAction('NA');
      setObject('NA');
      setGeneratedSentence('');
      setSpeakerIndex(0);
      setAudienceIndex(0);
      setSentenceTypeIndex(0);
      setTopicIndex(0);
      setActionIndex(0);
      setObjectIndex(0);
      setSliderPosition(0);
      // Optionally reset carousels if needed
      if (speakerCarouselRef.current) {
        // @ts-ignore
        speakerCarouselRef.current.scrollTo({index: 0, animated: true});
      }
      if (audienceCarouselRef.current) {
        // @ts-ignore
        audienceCarouselRef.current.scrollTo({index: 0, animated: true});
      }
      if (sentenceTypeCarouselRef.current) {
        // @ts-ignore
        sentenceTypeCarouselRef.current.scrollTo({index: 0, animated: true});
      }
      if (topicCarouselRef.current) {
        // @ts-ignore
        topicCarouselRef.current.scrollTo({index: 0, animated: true});
      }
      if (actionCarouselRef.current) {
        // @ts-ignore
        actionCarouselRef.current.scrollTo({index: 0, animated: true});
      }
      if (objectCarouselRef.current) {
        // @ts-ignore
        objectCarouselRef.current.scrollTo({index: 0, animated: true});
      }
    }, [conversationMode]),
  );

  return (
    <LinearGradient colors={['#FFF8E7', '#FFF8E7']} style={styles.container}>
      {/* Input and Navigation Section - Adjusted with safe area padding */}
      <View
        style={[
          styles.safeAreaPadding,
          {height: responsiveValues.safeAreaPadding},
        ]}
      />

      <View
        style={[
          styles.inputNavigationContainer,
          {marginVertical: responsiveValues.inputMarginVertical},
        ]}>
        <TextInput
          style={[
            styles.input,
            {
              height: responsiveValues.inputHeight,
              fontSize: responsiveValues.inputFontSize,
              marginHorizontal: responsiveValues.inputMarginHorizontal,
            },
          ]}
          placeholder="Waiting for input..."
          value={inputText}
          onChangeText={setInputText}
        />
        <View style={styles.inlineNavigationButtons}>
          <Pressable
            style={[
              styles.smallNavButton,
              {
                width: responsiveValues.navButtonSize,
                height: responsiveValues.navButtonSize,
                borderRadius: responsiveValues.navButtonSize / 2,
                marginLeft: responsiveValues.navButtonMargin,
              },
            ]}
            onPress={toggleContextInfo}>
            <Text
              style={[
                styles.smallNavIcon,
                {fontSize: responsiveValues.navButtonFontSize},
              ]}>
              ℹ️
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.smallNavButton,
              {
                width: responsiveValues.navButtonSize,
                height: responsiveValues.navButtonSize,
                borderRadius: responsiveValues.navButtonSize / 2,
                marginLeft: responsiveValues.navButtonMargin,
              },
            ]}
            onPress={handleHome}>
            <Text
              style={[
                styles.smallNavIcon,
                {fontSize: responsiveValues.navButtonFontSize},
              ]}>
              🏠
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.columnsContainer}>
        {conversationMode === 'easy' ? (
          // Easy Mode: Only show sentence type selection with vertical buttons
          <View style={styles.easyModeContainer}>
            <Text
              style={[
                styles.easyModeTitle,
                {fontSize: responsiveValues.sectionTitleFontSize * 1.2},
              ]}>
              Start Talking
            </Text>

            <View style={styles.easyModeButtonsContainer}>
              <Pressable
                style={[
                  styles.easyModeButton,
                  sentence.sentenceType === '?' &&
                    styles.easyModeButtonSelected,
                  {
                    height: SCREEN_HEIGHT * 0.25,
                    borderRadius: responsiveValues.borderRadius,
                  },
                ]}
                onPress={() => handleSentenceTypeSelect('?', 0)}>
                <View
                  style={[
                    styles.easyModeImageContainer,
                    {
                      width: responsiveValues.talkContainerSize,
                      height: responsiveValues.talkContainerSize,
                      borderRadius: responsiveValues.talkContainerSize / 2,
                    },
                  ]}>
                  <Image
                    source={require('../assets/boyAsk.png')}
                    style={styles.talkImage}
                  />
                </View>
                <Text
                  style={[
                    styles.easyModeButtonText,
                    {fontSize: responsiveValues.sectionTitleFontSize},
                    sentence.sentenceType === '?' &&
                      styles.easyModeButtonTextSelected,
                  ]}>
                  Ask a Question
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.easyModeButton,
                  sentence.sentenceType === '!' &&
                    styles.easyModeButtonSelected,
                  {
                    height: SCREEN_HEIGHT * 0.25,
                    borderRadius: responsiveValues.borderRadius,
                    marginTop: responsiveValues.inputMarginVertical,
                  },
                ]}
                onPress={() => handleSentenceTypeSelect('!', 1)}>
                <View
                  style={[
                    styles.easyModeImageContainer,
                    {
                      width: responsiveValues.talkContainerSize,
                      height: responsiveValues.talkContainerSize,
                      borderRadius: responsiveValues.talkContainerSize / 2,
                    },
                  ]}>
                  <Image
                    source={require('../assets/boyTalk.png')}
                    style={styles.talkImage}
                  />
                </View>
                <Text
                  style={[
                    styles.easyModeButtonText,
                    {fontSize: responsiveValues.sectionTitleFontSize},
                    sentence.sentenceType === '!' &&
                      styles.easyModeButtonTextSelected,
                  ]}>
                  Make a Statement
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          // Advanced Mode: Original full interface
          <>
            {/* Column 1: Speaker & Audience */}
            <View
              style={[
                styles.speakerAudienceColumn,
                {
                  width: responsiveValues.speakerAudienceWidth,
                  marginRight: responsiveValues.speakerAudienceMargin,
                  marginLeft: responsiveValues.speakerAudienceMargin,
                },
              ]}>
              {/* Speaker Section */}
              <View style={styles.section}>
                <Text
                  style={[
                    styles.sectionTitle,
                    {fontSize: responsiveValues.sectionTitleFontSize},
                  ]}>
                  The speaker:
                </Text>
                <View
                  style={
                    isTablet ? styles.cardWrapper : styles.cardWrapperPhone
                  }>
                  {speakers.length > 0 && (
                    <ConvoCarousel<Speaker>
                      carouselRef={speakerCarouselRef}
                      currentIndex={speakerIndex}
                      setCurrentIndex={setSpeakerIndex}
                      sentence={sentence}
                      setSentence={setSentence}
                      data={speakers}
                      handleItemSelect={handleSpeakerSelect}
                      fieldName="speaker"
                      showPersonIcon={true}
                      familyMembers={familyMembers}
                      getFamilyMemberImage={getFamilyMemberImage}
                      responsiveValues={responsiveValues}
                    />
                  )}
                </View>
              </View>

              {/* Audience Section */}
              <View style={styles.section}>
                <Text
                  style={[
                    styles.sectionTitle,
                    {fontSize: responsiveValues.sectionTitleFontSize},
                  ]}>
                  The audience:
                </Text>
                <View
                  style={
                    isTablet ? styles.cardWrapper : styles.cardWrapperPhone
                  }>
                  {audience.length > 0 && (
                    <ConvoCarousel<Audience>
                      carouselRef={audienceCarouselRef}
                      currentIndex={audienceIndex}
                      setCurrentIndex={setAudienceIndex}
                      sentence={sentence}
                      setSentence={setSentence}
                      data={audience}
                      handleItemSelect={handleAudienceSelect}
                      fieldName="audience"
                      showPersonIcon={true}
                      familyMembers={familyMembers}
                      getFamilyMemberImage={getFamilyMemberImage}
                      responsiveValues={responsiveValues}
                    />
                  )}
                </View>
              </View>

              {/* Sentence Type*/}
              <View style={styles.section}>
                <Text
                  style={[
                    styles.sectionTitle,
                    {fontSize: responsiveValues.sectionTitleFontSize},
                  ]}>
                  Sentence
                </Text>
                <View
                  style={
                    isTablet ? styles.cardWrapper : styles.cardWrapperPhone
                  }>
                  <ConvoCarousel<SentenceType>
                    carouselRef={sentenceTypeCarouselRef}
                    currentIndex={sentenceTypeIndex}
                    setCurrentIndex={setSentenceTypeIndex}
                    sentence={sentence}
                    setSentence={setSentence}
                    data={sentenceTypes}
                    handleItemSelect={handleSentenceTypeSelect}
                    fieldName="sentenceType"
                    showTalkIcon={true}
                    responsiveValues={responsiveValues}
                  />
                </View>
              </View>
            </View>
          </>
        )}

        {/* Right side content - same for both modes but with adjusted width */}
        <View
          style={{
            width:
              conversationMode === 'easy'
                ? '60%'
                : responsiveValues.rightContentWidth,
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
          {availableTopics.length == 0 &&
          availableActions.length == 0 &&
          availableObjects.length === 0 ? (
            <>
              <View
                style={{
                  width: '80%',
                  height: isTablet ? '60%' : '50%',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                <Image
                  source={require('../assets/talk.png')}
                  style={{width: '50%', height: '50%', zIndex: 39}}
                  resizeMode={FastImage.resizeMode.contain}
                />
                <Text style={{color: 'black', fontWeight: 600}}>
                  {sentence.speaker === '' ? 'Choose a speaker' : null}
                  {sentence.speaker !== '' && sentence.sentenceType === ''
                    ? 'Question or Statement'
                    : null}
                  {sentence.speaker !== '' &&
                  sentence.audience == '' &&
                  sentence.sentenceType !== ''
                    ? 'Pick an Audience'
                    : null}
                  {sentence.speaker !== '' &&
                  sentence.sentenceType !== '' &&
                  sentence.audience !== ''
                    ? 'Making magic'
                    : null}
                </Text>
              </View>
            </>
          ) : (
            <View
              style={{
                width: '100%',
                flexDirection: 'row',
                height: isTablet ? '60%' : '50%',
              }}>
              {/* Column 2: Topic */}
              <View style={styles.column}>
                <View style={styles.section}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      {fontSize: responsiveValues.sectionTitleFontSize},
                    ]}>
                    Choose the topic:
                  </Text>
                  <View style={styles.cardWrapper}>
                    <ConvoCarousel<Topic | ImageGenerated>
                      carouselRef={topicCarouselRef}
                      currentIndex={topicIndex}
                      setCurrentIndex={setTopicIndex}
                      sentence={sentence}
                      setSentence={setSentence}
                      data={
                        generatedTopicImages.length > 0
                          ? generatedTopicImages
                          : []
                      }
                      handleItemSelect={handleTopicSelect}
                      fieldName="list_possible_topics"
                      selectedTopic={topic}
                      responsiveValues={responsiveValues}
                    />
                  </View>
                </View>
              </View>

              {/* Column 3: Action */}
              <View style={styles.column}>
                {topic && (
                  <View style={styles.section}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        {fontSize: responsiveValues.sectionTitleFontSize},
                      ]}>
                      Choose the action:
                    </Text>
                    <View style={styles.cardWrapper}>
                      <ConvoCarousel<Action | ImageGenerated>
                        carouselRef={actionCarouselRef}
                        currentIndex={actionIndex}
                        setCurrentIndex={setActionIndex}
                        sentence={sentence}
                        setSentence={setSentence}
                        data={
                          generatedActionImages.length > 0
                            ? generatedActionImages
                            : []
                        }
                        handleItemSelect={handleActionSelect}
                        fieldName="list_possible_actions"
                        selectedAction={action}
                        responsiveValues={responsiveValues}
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* Column 4: Object */}
              <View style={styles.column}>
                {action && (
                  <View style={styles.section}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        {fontSize: responsiveValues.sectionTitleFontSize},
                      ]}>
                      Choose the object:
                    </Text>
                    <View style={styles.cardWrapper}>
                      <ConvoCarousel<Object | ImageGenerated>
                        carouselRef={objectCarouselRef}
                        currentIndex={objectIndex}
                        setCurrentIndex={setObjectIndex}
                        sentence={sentence}
                        setSentence={setSentence}
                        data={
                          generatedObjectImages.length > 0
                            ? generatedObjectImages
                            : []
                        }
                        handleItemSelect={handleObjectSelect}
                        fieldName="list_possible_objects"
                        selectedObject={object}
                        responsiveValues={responsiveValues}
                      />
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}
          {/* Slider for navigation between topics, actions, objects */}
          <View
            style={[
              styles.sliderContainer,
              {marginTop: responsiveValues.sliderMarginTop},
            ]}>
            <Slider
              style={[
                styles.slider,
                (availableTopics.length === 0 ||
                  isLoading ||
                  status === 'queued' ||
                  status === 'in_progress') &&
                  styles.disabledSlider,
              ]}
              minimumValue={0}
              maximumValue={2}
              step={1}
              value={sliderPosition}
              onValueChange={handleSliderChange}
              minimumTrackTintColor={
                availableTopics.length === 0 ||
                isLoading ||
                status === 'queued' ||
                status === 'in_progress'
                  ? '#cccccc'
                  : 'white'
              }
              maximumTrackTintColor={
                availableTopics.length === 0 ||
                isLoading ||
                status === 'queued' ||
                status === 'in_progress'
                  ? '#cccccc'
                  : 'white'
              }
              // thumbImage={require('../assets/slider-thumb.png')}
              thumbTintColor={'black'}
              disabled={
                (sliderPosition === 0 && (!topic || topic === 'NA')) ||
                (sliderPosition === 1 &&
                  topic !== 'NA' &&
                  topic &&
                  generatedActionImages.length === 0) ||
                (sliderPosition === 2 &&
                  action !== 'NA' &&
                  action &&
                  topic !== 'NA' &&
                  topic &&
                  generatedObjectImages.length === 0) ||
                isLoading ||
                status === 'queued' ||
                status === 'in_progress'
              }
            />
          </View>

          {/* Play Button */}
          <View
            style={[
              styles.playButtonContainer,
              {marginTop: responsiveValues.playButtonMarginTop},
            ]}>
            <Pressable
              style={[
                styles.playButton,
                {
                  width: responsiveValues.playButtonWidth,
                  height: responsiveValues.playButtonHeight,
                  borderRadius: responsiveValues.borderRadius,
                  shadowRadius: responsiveValues.shadowRadius,
                  shadowOffset: responsiveValues.shadowOffset,
                  elevation: responsiveValues.elevation,
                },
                // Disable if sentence is not complete
                (!topic ||
                  topic === 'NA' ||
                  !action ||
                  action === 'NA' ||
                  !object ||
                  object === 'NA' ||
                  !generatedSentence ||
                  generatedSentence.trim() === '' ||
                  isLoading ||
                  status === 'queued' ||
                  status === 'in_progress') &&
                  styles.disabledPlayButton,
              ]}
              onPress={handlePlaySentence}
              disabled={
                !topic ||
                topic === 'NA' ||
                !action ||
                action === 'NA' ||
                !object ||
                object === 'NA' ||
                !generatedSentence ||
                generatedSentence.trim() === '' ||
                isLoading ||
                status === 'queued' ||
                status === 'in_progress'
              }>
              <Text
                style={[
                  styles.playButtonIcon,
                  {fontSize: responsiveValues.playButtonFontSize},
                  // Dim text when disabled
                  (!topic ||
                    topic === 'NA' ||
                    !action ||
                    action === 'NA' ||
                    !object ||
                    object === 'NA' ||
                    !generatedSentence ||
                    generatedSentence.trim() === '' ||
                    isLoading ||
                    status === 'queued' ||
                    status === 'in_progress') &&
                    styles.disabledPlayButtonText,
                ]}>
                PLAY ▶️
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable
        style={[
          styles.matalkIcon,
          {
            bottom: responsiveValues.matalkIconBottom,
            left: responsiveValues.matalkIconLeft,
          },
        ]}>
        <FastImage
          source={matalkImg}
          style={[
            styles.iconSize,
            {
              width: responsiveValues.matalkIconSize,
              height: responsiveValues.matalkIconSize,
            },
          ]}
        />
      </Pressable>

      <ContextInfo
        visible={contextInfoVisible}
        onClose={() => setContextInfoVisible(false)}
      />

      <Modal
        visible={topicsModalVisible}
        animationType="fade"
        transparent={true}
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={() => setTopicsModalVisible(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setTopicsModalVisible(false)}>
          <Pressable
            style={styles.modalContainer}
            onPress={e => e.stopPropagation()}>
            <Topics onSelectTopic={handleTopicSelection} />
            <Pressable
              style={styles.modalCloseButtonOverlay}
              onPress={() => setTopicsModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>✕</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  safeAreaPadding: {
    // Height is now set dynamically via responsiveValues
  },
  inputNavigationContainer: {
    flexDirection: 'row',
    width: '90%',
    alignSelf: 'center',
    alignItems: 'center',
    // marginVertical is now set dynamically via responsiveValues
    justifyContent: 'space-between',
  },
  matalkIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
    // bottom and left are now set dynamically via responsiveValues
  },
  iconSize: {
    // width and height are now set dynamically via responsiveValues
  },
  input: {
    flex: 1,
    maxHeight: 60,
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: SCREEN_WIDTH * 0.03,
    // height, fontSize, and marginHorizontal are now set dynamically via responsiveValues
  },
  inlineNavigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallNavButton: {
    maxWidth: 50,
    maxHeight: 50,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    // width, height, borderRadius, and marginLeft are now set dynamically via responsiveValues
  },
  smallNavIcon: {
    // fontSize is now set dynamically via responsiveValues
  },
  columnsContainer: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  column: {
    width: '33%',
    height: '100%',
    overflow: 'hidden',
  },
  speakerAudienceColumn: {
    overflow: 'hidden',
    // width, marginRight, and marginLeft are now set dynamically via responsiveValues
  },
  content: {
    flex: 1,
  },
  section: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    overflow: 'hidden',
  },
  sectionTitle: {
    fontWeight: '600',
    color: '#333',
    marginBottom: height * 0.01,
    // fontSize is now set dynamically via responsiveValues
  },
  labelGrid: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
  },
  optionText: {
    color: '#333',
    // fontSize is now set dynamically via responsiveValues
  },
  speakerOption: {
    borderRadius: 10,
    padding: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },

  keyboardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    padding: 15,
    borderTopWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  keyboardInput: {
    height: 100,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  itemContainer: {
    borderRadius: 16,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  personContainer: {
    borderRadius: SCREEN_WIDTH * 0.05,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: height * 0.01,
    // width and height are now set dynamically via responsiveValues
  },
  personImage: {
    resizeMode: 'contain',
    // width and height are now set dynamically via responsiveValues
  },
  familyImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    borderRadius: 50,
  },
  talkImage: {
    width: '95%',
    height: '95%',
    resizeMode: 'contain',
  },
  itemImage: {
    width: '80%',
    height: '80%',
  },
  imageGrid: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardWrapper: {
    width: '90%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapperPhone: {
    width: '70%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  talkContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
    // width, height, and borderRadius are now set dynamically via responsiveValues
  },
  gridLabelContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  gridItem: {
    width: '85%',
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
    backgroundColor: 'white',
    marginBottom: 15,
  },
  gridImageContainer: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    // height is now set dynamically via responsiveValues
  },
  sliderContainer: {
    backgroundColor: '#F3F3F3',
    borderRadius: 16,
    width: '90%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: height * 0.04,
  },
  slider: {
    width: '100%',
  },
  disabledSlider: {
    opacity: 0.5,
  },
  playButtonContainer: {
    width: '90%',
    height: height * 0.05,
    justifyContent: 'center',
    alignItems: 'flex-end',
    // marginTop is now set dynamically via responsiveValues
  },
  playButton: {
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    // width, height, borderRadius, shadowRadius, shadowOffset, and elevation are now set dynamically via responsiveValues
  },
  playButtonIcon: {
    fontWeight: 'bold',
    color: '#000',
    // fontSize is now set dynamically via responsiveValues
  },
  disabledPlayButton: {
    backgroundColor: '#CCCCCC',
  },
  disabledPlayButtonText: {
    color: '#999',
  },
  personSelectionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '18%',
    height: 4,
    backgroundColor: 'red',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginTop: 2,
  },
  easyModeContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: height * 0.05,
  },
  easyModeTitle: {
    fontWeight: 'bold',
    color: '#333',
    marginBottom: height * 0.02,
  },
  easyModeButtonsContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '80%',
  },
  easyModeButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  easyModeButtonSelected: {
    backgroundColor: '#333',
  },
  easyModeImageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  easyModeButtonText: {
    fontWeight: 'bold',
    color: '#333',
  },
  easyModeButtonTextSelected: {
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '90%',
    height: '85%',
    backgroundColor: '#FFF8E7',
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 15,
    overflow: 'hidden',
  },

  modalCloseButtonOverlay: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 45,
    height: 45,
    backgroundColor: '#FFF',
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    zIndex: 1000,
  },
  modalCloseButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
  },
});

export default Convo;

const ConvoCarousel = <T extends string | ImageGenerated>({
  carouselRef,
  currentIndex,
  setCurrentIndex,
  sentence,
  setSentence,
  data,
  handleItemSelect,
  fieldName,
  showPersonIcon = false,
  showTalkIcon = false,
  selectedTopic,
  selectedAction,
  selectedObject,
  familyMembers = [],
  getFamilyMemberImage,
  responsiveValues,
}: {
  carouselRef: React.RefObject<ICarouselInstance | null>;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  sentence: Sentence;
  setSentence: (sentence: Sentence) => void;
  data: T[];
  handleItemSelect: (item: T, index: number) => void;
  fieldName:
    | 'list_possible_topics'
    | 'list_possible_objects'
    | 'list_possible_actions'
    | 'questions'
    | 'generate_answers'
    | 'speaker'
    | 'audience'
    | 'sentenceType';
  showPersonIcon?: boolean;
  showTalkIcon?: boolean;
  selectedTopic?: Topic;
  selectedAction?: Action;
  selectedObject?: Object;
  familyMembers?: FamilyMember[];
  getFamilyMemberImage?: (memberName: string) => string | undefined;
  responsiveValues?: any;
}) => {
  // Return null if data is empty to prevent rendering issues
  if (!data || data.length === 0) {
    return null;
  }

  const isVerticalLayout =
    fieldName === 'list_possible_actions' ||
    fieldName === 'list_possible_objects' ||
    fieldName === 'list_possible_topics';

  // Function to get text value from item, whether it's a string or ImageGenerated
  const getItemText = (item: T): string => {
    if (typeof item === 'string') {
      return item;
    } else if (typeof item === 'object' && 'text' in item) {
      return item.text;
    }
    return '';
  };

  // Function to get image URL if available
  const getItemImageUrl = (item: T): string | undefined => {
    if (typeof item === 'object' && 'url' in item) {
      return item.url;
    }
    return undefined;
  };

  if (isVerticalLayout) {
    // For vertical layout, render items in a ScrollView instead of Carousel
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginTop: responsiveValues
            ? responsiveValues.gridImageHeight * 0.1
            : height * 0.02,
          paddingBottom: responsiveValues
            ? responsiveValues.gridImageHeight * 1.5
            : height * 0.2, // Add padding to prevent last item from being cut off
        }}
        style={{
          width: '100%',
          maxHeight: responsiveValues
            ? responsiveValues.gridImageHeight * 4
            : SCREEN_HEIGHT * 0.75, // Adjusted to fit within 40% column height
          minHeight: responsiveValues
            ? responsiveValues.gridImageHeight * 4
            : SCREEN_HEIGHT * 0.75, // Adjusted to fit within 40% column height
        }}>
        {data.map((item, index) => (
          <Pressable
            key={`${fieldName}-${getItemText(item)}-${index}`}
            style={[
              styles.gridItem,
              // Add red bottom border when item is selected
              ((fieldName === 'list_possible_topics' &&
                getItemText(item) === selectedTopic) ||
                (fieldName === 'list_possible_actions' &&
                  getItemText(item) === selectedAction) ||
                (fieldName === 'list_possible_objects' &&
                  getItemText(item) === selectedObject)) && {
                borderBottomWidth: 6,
                borderBottomColor: 'red',
              },
            ]}
            onPress={() => handleItemSelect(item, index)}>
            <View
              style={[
                styles.gridImageContainer,
                {
                  height: responsiveValues
                    ? responsiveValues.gridImageHeight
                    : SCREEN_HEIGHT * 0.2,
                },
              ]}>
              {getItemText(item) === 'All topics' ? (
                <Image
                  source={matalkImg}
                  style={styles.imageGrid}
                  resizeMode="cover"
                />
              ) : TOPIC_IMAGE_MAPPING[getItemText(item)] ? (
                <Image
                  source={TOPIC_IMAGE_MAPPING[getItemText(item)]}
                  style={styles.imageGrid}
                  resizeMode="cover"
                />
              ) : getItemImageUrl(item) ? (
                <FastImage
                  source={
                    DEBUGCONVONOIMAGEGENERATION
                      ? welcomeImg
                      : {uri: getItemImageUrl(item)}
                  }
                  style={styles.imageGrid}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={welcomeImg}
                  style={styles.imageGrid}
                  resizeMode="cover"
                />
              )}
            </View>
            <View style={styles.gridLabelContainer}>
              <Text
                style={[
                  styles.labelGrid,
                  {
                    fontSize: responsiveValues
                      ? responsiveValues.labelGridFontSize
                      : 16,
                  },
                ]}>
                {getItemText(item)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  // For horizontal/regular layout, use Carousel as before
  return (
    <Carousel
      ref={carouselRef}
      loop
      width={COLUMN_WIDTH * 0.65}
      height={SCREEN_HEIGHT * 0.2}
      data={data}
      scrollAnimationDuration={1000}
      onSnapToItem={index => {
        setCurrentIndex(index);
        // Update the sentence with the selected item
        const item = data[index];
        const value = getItemText(item);
        setSentence({...sentence, [fieldName]: value});
      }}
      defaultIndex={0}
      windowSize={responsiveValues ? responsiveValues.carouselWindowSize : 3}
      mode="parallax"
      modeConfig={{
        parallaxScrollingScale: 0.95,
        parallaxAdjacentItemScale: 0.8,
      }}
      snapEnabled={true}
      autoPlay={false}
      enabled={true}
      pagingEnabled={true}
      style={{
        alignSelf: 'center',
      }}
      renderItem={({item: cardItem, index}) => (
        <Pressable
          style={[styles.speakerOption]}
          onPress={() => handleItemSelect(cardItem, index)}>
          {showPersonIcon ? (
            <>
              <View
                style={[
                  styles.personContainer,
                  {
                    width: responsiveValues
                      ? responsiveValues.personContainerSize
                      : width * 0.08,
                    height: responsiveValues
                      ? responsiveValues.personContainerSize
                      : width * 0.08,
                  },
                ]}>
                {(() => {
                  const memberName = getItemText(cardItem);
                  const familyImageUri = getFamilyMemberImage?.(memberName);

                  if (familyImageUri) {
                    return (
                      <FastImage
                        source={{uri: familyImageUri}}
                        style={styles.familyImage}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    );
                  } else {
                    return (
                      <Image
                        source={require('../assets/person.png')}
                        style={[
                          styles.personImage,
                          {
                            width: responsiveValues
                              ? responsiveValues.personImageSize
                              : width * 0.05,
                            height: responsiveValues
                              ? responsiveValues.personImageSize
                              : width * 0.05,
                          },
                        ]}
                      />
                    );
                  }
                })()}
              </View>
              <Text
                style={[
                  styles.optionText,
                  {
                    fontSize: responsiveValues
                      ? responsiveValues.optionTextFontSize
                      : 14,
                  },
                ]}>
                {getItemText(cardItem)}
              </Text>
              {sentence[fieldName as keyof Sentence] ===
                getItemText(cardItem) && (
                <View style={styles.personSelectionContainer} />
              )}
            </>
          ) : showTalkIcon ? (
            <>
              <View
                style={[
                  styles.talkContainer,
                  {
                    width: responsiveValues
                      ? responsiveValues.talkContainerSize
                      : width * 0.1,
                    height: responsiveValues
                      ? responsiveValues.talkContainerSize
                      : width * 0.1,
                    borderRadius: responsiveValues
                      ? responsiveValues.talkContainerSize / 2
                      : width * 0.05,
                  },
                  sentence.sentenceType === getItemText(cardItem) && {
                    borderBottomWidth: 3,
                    borderBottomColor: 'red',
                  },
                ]}>
                {getItemText(cardItem) === '?' ? (
                  <Image
                    source={require('../assets/boyAsk.png')}
                    style={styles.talkImage}
                  />
                ) : (
                  <Image
                    source={require('../assets/boyTalk.png')}
                    style={styles.talkImage}
                  />
                )}
              </View>
            </>
          ) : (
            <>
              <View style={styles.itemContainer}>
                {getItemImageUrl(cardItem) ? (
                  <FastImage
                    source={
                      DEBUGCONVONOIMAGEGENERATION
                        ? welcomeImg
                        : {uri: getItemImageUrl(cardItem)}
                    }
                    style={styles.itemImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Image
                    source={welcomeImg}
                    style={styles.itemImage}
                    resizeMode="contain"
                  />
                )}
                <Text
                  style={[
                    styles.optionText,
                    {
                      fontSize: responsiveValues
                        ? responsiveValues.optionTextFontSize
                        : 14,
                    },
                  ]}>
                  {getItemText(cardItem)}
                </Text>
              </View>
            </>
          )}
        </Pressable>
      )}
    />
  );
};
