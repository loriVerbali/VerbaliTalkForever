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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Carousel, {ICarouselInstance} from 'react-native-reanimated-carousel';
import TTSService from '../utils/TTSService';
import {views} from '../utils/constants';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';
import {useAssistant} from '../contexts/AssistantContext';
import fetchHelper from '../utils/fetcher';
import wakeWord from '../utils/wakewordService';
import matalkImg from '../assets/matalk.png';
import welcomeImg from '../assets/welcome.png';
import Slider from '@react-native-community/slider';
import {useAppSettings} from '../utils/persistance';
import {FamilyMember} from '../Components/FamilyPics';
import ContextInfo from '../Components/ContextInfo';
import {
  useChatContext,
  getContextualInfo,
} from '../contexts/ChatContextProvider';
import {logInitConversation} from '../utils/initConversationLogger';

const DEBUGCONVONOIMAGEGENERATION = true;

const {width, height} = Dimensions.get('window');

type Topic = 'NA' | 'Talk' | 'Play';
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

  // Get assistant context
  const {
    threadId,
    sendMessage,
    runAssistant,
    response,
    status,
    resetAssistant,
  } = useAssistant();

  // Get chat context for weather and location
  const {weather, location} = useChatContext();

  // Get app settings for family pics data
  const {getItem} = useAppSettings();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const speakerCarouselRef = useRef<ICarouselInstance>(null);
  const audienceCarouselRef = useRef<ICarouselInstance>(null);
  const sentenceTypeCarouselRef = useRef<ICarouselInstance>(null);
  const topicCarouselRef = useRef<ICarouselInstance>(null);
  const actionCarouselRef = useRef<ICarouselInstance>(null);
  const objectCarouselRef = useRef<ICarouselInstance>(null);

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
    const loadFamilyData = async () => {
      try {
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
      } catch (error) {
        console.error('Error loading family data:', error);
        // Fallback to default
        setSpeakers(['I', 'Mom', 'Dad']);
        setAudience(['I', 'Mom', 'Dad']);
      }
    };

    loadFamilyData();
  }, []);

  // Helper function to get family member image
  const getFamilyMemberImage = (memberName: string) => {
    const member = familyMembers.find(m => m.name === memberName);
    return member?.imageUri;
  };

  // Update input text when sentence changes
  useEffect(() => {
    const {speaker, audience, list_possible_topics, action, object} = sentence;
    if (speaker && list_possible_topics && action && object) {
      setInputText(
        `${speaker} want to ${action} ${object} ${
          audience ? 'to ' + audience : ''
        }`,
      );
    }
  }, [sentence]);

  // Helper to parse JSON responses from the assistant
  const parseAssistantResponse = (jsonString: any) => {
    console.log('🔍 Attempting to parse assistant response:', jsonString);
    try {
      if (jsonString?.response) {
        console.log('✅ Successfully parsed response:', jsonString.response);
        return jsonString.response;
      } else {
        console.log('❌ No response found in JSON string');
        return null;
      }
    } catch (error) {
      console.error('❌ Error parsing assistant response:', error);
      return null;
    }
  };

  // Helper function to use the Assistant API
  const callAssistant = async (mode: string, prompt: string) => {
    console.log(`🔄 Starting assistant call - Mode: ${mode}`);
    console.log(`📤 Prompt: ${prompt}`);
    try {
      setIsLoading(true);

      // Prepare the message with the mode and content
      // Format the message to clearly indicate the mode for the assistant
      const message = `${prompt}`;

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
      console.log(`📨 Message sent with ID: ${messageId} and mode: ${mode}`);

      // Run the assistant
      const runId = await runAssistant();
      return true;
    } catch (error) {
      console.error(`❌ Error calling assistant in ${mode} mode:`, error);
      setIsLoading(false);
      return false;
    }
  };

  // Function to log conversation process
  const logConversationProcess = async () => {
    if (!threadId || !generatedSentence) {
      console.log('⏳ Missing threadId or generated sentence for logging');
      return;
    }

    try {
      console.log('📝 Logging conversation process...');

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

      console.log('✅ Conversation process logged successfully');
    } catch (error) {
      console.error('❌ Error logging conversation process:', error);
    }
  };

  const generateImage = async (array: ImagePrompt[], mode: string) => {
    try {
      const images: ImageGenerated[] = [];
      // Process each prompt in the array
      for (const prompt of array) {
        const text = prompt.text;
        let imageUrl = DEBUGCONVONOIMAGEGENERATION ? welcomeImg : '';
        if (!DEBUGCONVONOIMAGEGENERATION) {
          const encodedPrompt = encodeURIComponent(prompt.image_prompt);

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

          // Handle different possible response formats
          let imageUrl = '';
          if (typeof response === 'string') {
            // Direct URL string response
            imageUrl = response;
          } else if (
            response &&
            typeof response === 'object' &&
            'url' in response
          ) {
            // Object response with url property
            imageUrl = response.url || '';
          }
        }

        if (imageUrl) {
          // Add both the text prompt and image URL to the array
          images.push({
            text: text,
            url: imageUrl,
          });
        }
      }

      // Update state with generated images
      if (mode === 'topic') {
        setGeneratedTopicImages(images);
      } else if (mode === 'list_possible_actions') {
        setGeneratedActionImages(images);
      } else if (mode === 'list_possible_objects') {
        setGeneratedObjectImages(images);
      }
      return images;
    } catch (error) {
      console.error('Failed to generate image:', error);
      throw error;
    }
  };

  // Handle assistant responses
  useEffect(() => {
    if (response) {
      try {
        // Handle the response based on its modeType
        if (response.modeType === 'list_possible_topics') {
          try {
            const topicsArray = JSON.parse(response.response);
            if (
              Array.isArray(topicsArray.topics) &&
              topicsArray.topics.length > 0
            ) {
              console.log('📋 Got topics array:', topicsArray.topics);
              setAvailableTopics(
                topicsArray.topics
                  .slice(0, 4)
                  .map((item: {text: any}) => item.text) as Topic[],
              );
              generateImage(topicsArray.topics, 'topic');
              console.log('✅ Topics updated');
            }
          } catch (error) {
            console.error('Error parsing topics:', error);
          }
        } else if (response.modeType === 'list_possible_actions') {
          try {
            const actionsData = JSON.parse(response.response);
            if (
              actionsData &&
              Array.isArray(actionsData.verbs) &&
              actionsData.verbs.length > 0
            ) {
              console.log('🎯 Got actions:', actionsData.verbs);
              setAvailableActions(actionsData.verbs.slice(0, 4) as Action[]);
              //setSentence({...sentence, action: '', object: ''});
              console.log(
                '✅ Actions updated, cleared action and object selections',
              );
              generateImage(actionsData.verbs, 'list_possible_actions');
            }
          } catch (error) {
            console.error('Error parsing actions:', error);
          }
        } else if (response.modeType === 'list_possible_objects') {
          try {
            const objectsData = JSON.parse(response.response);
            if (
              objectsData &&
              Array.isArray(objectsData.objects) &&
              objectsData.objects.length > 0
            ) {
              console.log('📦 Got objects:', objectsData.objects);
              setAvailableObjects(objectsData.objects.slice(0, 4) as Object[]);
              // setSentence({...sentence, object: ''});
              console.log('✅ Objects updated, cleared object selection');
              generateImage(objectsData.objects, 'list_possible_objects');
            }
          } catch (error) {
            console.error('Error parsing objects:', error);
          }
        } else if (response.modeType === 'sentence') {
          try {
            const sentenceData = response?.response;

            if (sentenceData) {
              setGeneratedSentence(sentenceData);
              setInputText(sentenceData);
              console.log('✅ Generated sentence applied to input');
            }
          } catch (error) {
            console.error('Error parsing sentence:', error);
          }
        } else {
          console.log('⚠️ Unrecognized mode type:', response.modeType);
        }
      } catch (error) {
        console.error('❌ Error processing assistant response:', error);
      }

      setIsLoading(false);
      console.log('🏁 Assistant processing complete, loading state cleared');
    }
  }, [response]);

  // Watch for speaker, audience, and sentenceType selections to generate topics
  useEffect(() => {
    const generateTopics = async () => {
      const {speaker, audience, sentenceType} = sentence;

      // Only proceed if all three are selected, slider is at position 0, and we don't have a valid topic
      if (
        speaker &&
        audience &&
        sentenceType &&
        sliderPosition === 0 &&
        (!topic || topic === 'NA')
      ) {
        // Get contextual information
        const contextInfo = getContextualInfo(weather, location);

        const prompt = `${contextInfo}. Please list possible topics for a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. Consider the current time, weather, location, and day when suggesting topics. I need up to 4 simple, kid-friendly topics that are appropriate for the current context. The message.metadata.mode = 'list_possible_topics'`;
        console.log(
          '🔄 Calling assistant for list_possible_topics with context',
        );
        await callAssistant('list_possible_topics', prompt);
      } else {
        console.log(
          '⏳ Waiting for all prerequisites before generating topics',
        );
      }
    };

    generateTopics();
  }, [
    sentence.speaker,
    sentence.audience,
    sentence.sentenceType,
    sliderPosition,
    weather,
    location,
  ]);

  // Watch for topic selection to generate actions
  useEffect(() => {
    const generateActions = async () => {
      const {speaker, audience, sentenceType} = sentence;

      // Only proceed if we have prerequisites and either no action selected or at position 1
      if (
        speaker &&
        audience &&
        sentenceType &&
        topic &&
        topic !== 'NA' &&
        sliderPosition === 1 &&
        (!action || action === 'NA')
      ) {
        // Get contextual information
        const contextInfo = getContextualInfo(weather, location);

        const prompt = `${contextInfo}. Please list possible action verbs related to the topic "${topic}" for a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. Consider the current weather, time of day, location, and day when suggesting actions. I need up to 3 simple, kid-friendly action verbs that are appropriate for the current context and conditions. The message.metadata.mode = 'actions'`;

        console.log('🔄 Calling assistant for actions with context');
        await callAssistant('list_possible_actions', prompt);
      } else {
        console.log('⏳ Waiting for prerequisites before generating actions');
      }
    };

    generateActions();
  }, [topic, sliderPosition, weather, location]);

  // Watch for action selection to generate objects
  useEffect(() => {
    const generateObjects = async () => {
      const {speaker, audience, sentenceType} = sentence;

      // Only proceed if we have prerequisites and either no object selected or at position 2
      if (
        speaker &&
        audience &&
        sentenceType &&
        topic &&
        topic !== 'NA' &&
        action &&
        action !== 'NA' &&
        sliderPosition === 2 &&
        (!object || object === 'NA')
      ) {
        const objectsPrompt = `Please list possible direct objects or noun phrases for the action "${action}" related to the topic "${topic}" in a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. I need up to 3 simple, kid-friendly objects. The message.metadata.mode = 'objects'`;

        console.log('🔄 Calling assistant for objects');
        await callAssistant('list_possible_objects', objectsPrompt);
      } else {
        console.log('⏳ Waiting for prerequisites before generating objects');
      }
    };

    generateObjects();
  }, [action, sliderPosition]);

  useEffect(() => {
    const {speaker, audience, sentenceType} = sentence;
    const generateSentence = async () => {
      const sentencePrompt = `Please create a complete, kid-friendly sentence where ${speaker} wants to ${action} with the topic "${topic}" to ${audience}. The sentence should be a ${
        sentenceType === '?' ? 'question' : 'statement'
      }. Return just the sentence.`;
      console.log('🔵 All selected, generating sentence');
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
    navigation.navigate(views.OPEN as never);
  };

  const toggleKeyboard = () => {
    setIsKeyboardVisible(!isKeyboardVisible);
  };

  const toggleContextInfo = () => {
    setContextInfoVisible(!contextInfoVisible);
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

  useEffect(() => {
    // Stop listening when component mounts, but don't block loading
    setTimeout(() => {
      void wakeWord.stopListening();
    }, 0);

    // No need for cleanup since we're already stopped
  }, []);

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

  // useEffect(() => {
  //   if (topic === 'NA' && (sliderPosition === 1 || sliderPosition === 2)) {
  //     setSliderPosition(0);
  //     setTimeout(() => setIsAutoSliding(false), 0);
  //   }
  //   if (action === 'NA' && sliderPosition === 2) {
  //     setSliderPosition(1);
  //     setTimeout(() => setIsAutoSliding(false), 0);
  //   }
  // }, [sliderPosition]);

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

        await TTSService.speak(inputText);

        // Wait for 3 seconds before resetting
        setTimeout(() => {
          // Reset everything except sentence type first
          setSentence(prev => ({
            ...prev,
            sentenceType: '',
            list_possible_topics: '',
            action: '',
            object: '',
          }));
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

  return (
    <LinearGradient colors={['#FFF8E7', '#FFF8E7']} style={styles.container}>
      {/* Input and Navigation Section - Adjusted with safe area padding */}
      <View style={styles.safeAreaPadding} />

      <View style={styles.inputNavigationContainer}>
        <TextInput
          style={styles.input}
          placeholder="Waiting for input..."
          value={inputText}
          onChangeText={setInputText}
        />
        <View style={styles.inlineNavigationButtons}>
          <Pressable style={styles.smallNavButton} onPress={toggleContextInfo}>
            <Text style={styles.smallNavIcon}>ℹ️</Text>
          </Pressable>
          <Pressable style={styles.smallNavButton} onPress={handleHome}>
            <Text style={styles.smallNavIcon}>🏠</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.columnsContainer}>
        {/* Column 1: Speaker & Audience */}
        <View style={styles.speakerAudienceColumn}>
          {/* Speaker Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>The speaker:</Text>
            <View style={styles.cardWrapper}>
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
                />
              )}
            </View>
          </View>

          {/* Audience Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>The audience:</Text>
            <View style={styles.cardWrapper}>
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
                />
              )}
            </View>
          </View>

          {/* Sentence Type*/}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sentence</Text>
            <View style={styles.cardWrapper}>
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
              />
            </View>
          </View>
        </View>

        <View
          style={{
            width: '79%',
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
          <View
            style={{
              width: '100%',
              flexDirection: 'row',
              height: '60%',
            }}>
            {/* Column 2: Topic */}
            <View style={styles.column}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Choose the topic:</Text>
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
                  />
                </View>
              </View>
            </View>

            {/* Column 3: Action */}
            <View style={styles.column}>
              {topic && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Choose the action:</Text>
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
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Column 4: Object */}
            <View style={styles.column}>
              {action && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Choose the object:</Text>
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
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
          {/* Slider for navigation between topics, actions, objects */}
          <View style={styles.sliderContainer}>
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
          <View style={styles.playButtonContainer}>
            <Pressable
              style={[
                styles.playButton,
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

      <View style={styles.matalkIcon}>
        <FastImage source={matalkImg} style={styles.iconSize} />
      </View>

      <ContextInfo
        visible={contextInfoVisible}
        onClose={() => setContextInfoVisible(false)}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  safeAreaPadding: {
    height: Platform.OS === 'ios' ? SCREEN_HEIGHT * 0.05 : SCREEN_HEIGHT * 0.03,
  },
  inputNavigationContainer: {
    flexDirection: 'row',
    width: '90%',
    alignSelf: 'center',
    alignItems: 'center',
    marginVertical: SCREEN_HEIGHT * 0.02,
    justifyContent: 'space-between',
  },
  matalkIcon: {
    bottom: height * 0.04,
    justifyContent: 'center',
    alignItems: 'center',
    left: width * 0.03,
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    position: 'absolute',
  },
  iconSize: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
  },
  input: {
    flex: 1,
    height: SCREEN_HEIGHT * 0.06,
    maxHeight: 60,
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: SCREEN_WIDTH * 0.03,
    fontSize: SCREEN_HEIGHT * 0.02,
    marginHorizontal: SCREEN_WIDTH * 0.02,
  },
  inlineNavigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallNavButton: {
    width: SCREEN_WIDTH * 0.08,
    height: SCREEN_WIDTH * 0.08,
    maxWidth: 50,
    maxHeight: 50,
    borderRadius: SCREEN_WIDTH * 0.04,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SCREEN_WIDTH * 0.02,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  smallNavIcon: {
    fontSize: SCREEN_WIDTH * 0.02,
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
    width: '15%',
    marginRight: SCREEN_WIDTH * 0.03,
    marginLeft: SCREEN_WIDTH * 0.03,
    overflow: 'hidden',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  labelGrid: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
  },
  optionText: {
    fontSize: 14,
    color: '#333',
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
    width: width * 0.08,
    height: width * 0.08,
    marginBottom: height * 0.01,
  },
  personImage: {
    width: width * 0.05,
    height: width * 0.05,
    resizeMode: 'contain',
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
  talkContainer: {
    width: width * 0.1,
    height: width * 0.1,
    borderRadius: width * 0.05,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
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
    height: SCREEN_HEIGHT * 0.2,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
    marginTop: height * 0.06,
  },
  playButton: {
    width: width * 0.2,
    height: width * 0.05,
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
  playButtonIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
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
          marginTop: height * 0.02,
          paddingBottom: height * 0.2, // Add padding to prevent last item from being cut off
        }}
        style={{
          width: '100%',
          maxHeight: SCREEN_HEIGHT * 0.75, // Adjusted to fit within 40% column height
          minHeight: SCREEN_HEIGHT * 0.75, // Adjusted to fit within 40% column height
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
            <View style={styles.gridImageContainer}>
              {getItemImageUrl(item) ? (
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
              <Text style={styles.labelGrid}>{getItemText(item)}</Text>
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
      windowSize={3}
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
              <View style={styles.personContainer}>
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
                        style={styles.personImage}
                      />
                    );
                  }
                })()}
              </View>
              <Text style={styles.optionText}>{getItemText(cardItem)}</Text>
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
                <Text style={styles.optionText}>{getItemText(cardItem)}</Text>
              </View>
            </>
          )}
        </Pressable>
      )}
    />
  );
};
