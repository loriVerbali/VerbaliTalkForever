import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import SpeakerSection from './SpeakerSection';
import fetchHelper from '../utils/fetcher';

type Topic = 'NA' | 'Talk' | 'Play';
type Action = 'NA' | 'say' | 'ask' | 'tell' | 'run' | 'jump' | 'dance';
type Object =
  | 'NA'
  | 'hello'
  | 'goodbye'
  | 'please'
  | 'question'
  | 'help'
  | 'permission'
  | 'story'
  | 'joke'
  | 'secret'
  | 'fast'
  | 'slow'
  | 'together'
  | 'high'
  | 'low'
  | 'rope'
  | 'music'
  | 'party';

type Speaker = 'I' | 'Dad' | 'Mom';
type Audience = 'I' | 'Dad' | 'Mom';
type SentenceType = '?' | '!';

interface Sentence {
  speaker: Speaker | '';
  audience: Audience | '';
  sentenceType: SentenceType | '';
  topic: Topic | '';
  action: Action | '';
  object: Object | '';
}

type RootStackParamList = {};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const COLUMN_WIDTH = SCREEN_WIDTH / 4;

const Convo = () => {
  const [sentence, setSentence] = useState<Sentence>({
    speaker: '',
    audience: '',
    sentenceType: '',
    topic: '',
    action: '',
    object: '',
  });
  const [inputText, setInputText] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Get assistant context
  const {
    createThreadIfNeeded,
    sendMessage,
    runAssistant,
    resetHistory,
    response,
  } = useAssistant();

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const speakerCarouselRef = useRef<ICarouselInstance>(null);
  const audienceCarouselRef = useRef<ICarouselInstance>(null);
  const sentenceTypeCarouselRef = useRef<ICarouselInstance>(null);
  const topicCarouselRef = useRef<ICarouselInstance>(null);
  const actionCarouselRef = useRef<ICarouselInstance>(null);
  const objectCarouselRef = useRef<ICarouselInstance>(null);
  const speakers: Speaker[] = ['I', 'Dad', 'Mom'];
  const audience: Audience[] = ['I', 'Dad', 'Mom'];
  const sentenceTypes: SentenceType[] = ['?', '!'];
  const extendedSpeakers = [...speakers, ...speakers, ...speakers];
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
  const [isLoading, setIsLoading] = useState(false);

  // Update input text when sentence changes
  useEffect(() => {
    const {speaker, audience, topic, action, object} = sentence;
    if (speaker && topic && action && object) {
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

      // Create a thread if needed
      console.log('📋 Checking if a new thread is needed...');
      const threadId = await createThreadIfNeeded();
      console.log(`🧵 Using thread ID: ${threadId}`);

      // Prepare the message with the mode and content
      // Format the message to clearly indicate the mode for the assistant
      const message = `${prompt}`;
      console.log(`💬 Sending message with mode ${mode}:`, message);

      // Send the message
      const messageId = await sendMessage(
        message,
        undefined,
        mode as 'object' | 'topic' | 'action' | 'generate_answers' | 'sentence',
      );
      console.log(`📨 Message sent with ID: ${messageId} and mode: ${mode}`);

      // Run the assistant
      console.log('🤖 Running assistant...');
      const runId = await runAssistant();
      console.log(`🏃 Assistant run started with ID: ${runId}`);

      console.log('⏳ Waiting for assistant response...');
      return true;
    } catch (error) {
      console.error(`❌ Error calling assistant in ${mode} mode:`, error);
      setIsLoading(false);
      return false;
    }
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

      return {url: imageUrl};
    } catch (error) {
      console.error('Failed to generate image:', error);
      throw error;
    }
  };

  // Handle assistant responses
  useEffect(() => {
    if (response) {
      console.log('📩 Received assistant response:', response);
      try {
        // Handle the response based on its modeType
        if (response.modeType === 'topic') {
          try {
            const topicsArray = JSON.parse(response.response);
            if (
              Array.isArray(topicsArray.output_schema) &&
              topicsArray.output_schema.length > 0
            ) {
              console.log('📋 Got topics array:', topicsArray.output_schema);
              setAvailableTopics(
                topicsArray.output_schema.slice(0, 4) as Topic[],
              );
              debugger;
              // generateImage(topicsArray.output_schema);
              console.log('✅ Topics updated');
            }
          } catch (error) {
            console.error('Error parsing topics:', error);
          }
        } else if (response.modeType === 'action') {
          try {
            const actionsData = JSON.parse(response.response);
            if (
              actionsData &&
              Array.isArray(actionsData.output_schema) &&
              actionsData.output_schema.length > 0
            ) {
              console.log('🎯 Got actions:', actionsData.output_schema);
              setAvailableActions(
                actionsData.output_schema.slice(0, 4) as Action[],
              );
              //setSentence({...sentence, action: '', object: ''});
              console.log(
                '✅ Actions updated, cleared action and object selections',
              );
            }
          } catch (error) {
            console.error('Error parsing actions:', error);
          }
        } else if (response.modeType === 'object') {
          try {
            const objectsData = JSON.parse(response.response);
            if (
              objectsData &&
              Array.isArray(objectsData.output_schema) &&
              objectsData.output_schema.length > 0
            ) {
              console.log('📦 Got objects:', objectsData.output_schema);
              setAvailableObjects(
                objectsData.output_schema.slice(0, 4) as Object[],
              );
              // setSentence({...sentence, object: ''});
              console.log('✅ Objects updated, cleared object selection');
            }
          } catch (error) {
            console.error('Error parsing objects:', error);
          }
        } else if (response.modeType === 'sentence') {
          try {
            debugger;
            const sentenceData = response?.response;

            if (sentenceData) {
              console.log('📝 Got generated sentence:', sentenceData);
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
      console.log('👁️ Checking if we should generate topics...');
      console.log('  Speaker:', speaker);
      console.log('  Audience:', audience);
      console.log('  SentenceType:', sentenceType);

      // Only proceed if all three are selected
      if (speaker && audience && sentenceType) {
        console.log('✅ All prerequisites met, generating topics');
        const prompt = `Please list possible topics for a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. I need up to 4 simple, kid-friendly topics. The message.metadata.mode = 'topics'`;

        console.log('🔄 Calling assistant for topics');
        await callAssistant('topic', prompt);
      } else {
        console.log(
          '⏳ Waiting for all prerequisites before generating topics',
        );
      }
    };

    generateTopics();
  }, [sentence.speaker, sentence.audience, sentence.sentenceType]);

  // Watch for topic selection to generate actions
  useEffect(() => {
    const generateActions = async () => {
      const {speaker, audience, sentenceType} = sentence;
      console.log('👁️ Checking if we should generate actions...');
      console.log('  Speaker:', speaker);
      console.log('  Audience:', audience);
      console.log('  SentenceType:', sentenceType);
      console.log('  Topic:', topic);

      // Only proceed if topic is selected
      if (speaker && audience && sentenceType && topic) {
        console.log('✅ Topic selected, generating actions');
        const prompt = `Please list possible action verbs related to the topic "${topic}" for a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. I need up to 3 simple, kid-friendly action verbs. The message.metadata.mode = 'actions'`;

        console.log('🔄 Calling assistant for actions');
        await callAssistant('action', prompt);
      } else {
        console.log('⏳ Waiting for topic selection before generating actions');
      }
    };

    if (topic) {
      console.log('🔵 Topic changed to:', topic);
      generateActions();
    }
  }, [topic]);

  // Watch for action selection to generate objects
  useEffect(() => {
    const generateObjects = async () => {
      const {speaker, audience, sentenceType} = sentence;
      console.log('👁️ Checking if we should generate objects...');
      console.log('  Speaker:', speaker);
      console.log('  Audience:', audience);
      console.log('  SentenceType:', sentenceType);
      console.log('  Topic:', topic);
      console.log('  Action:', action);

      // Only proceed if action is selected
      if (speaker && audience && sentenceType && topic && action) {
        console.log('✅ Action selected, generating objects');
        const objectsPrompt = `Please list possible direct objects or noun phrases for the action "${action}" related to the topic "${topic}" in a conversation where ${speaker} is speaking to ${audience} with sentence type ${
          sentenceType === '?' ? 'question' : 'statement'
        }. I need up to 3 simple, kid-friendly objects. The message.metadata.mode = 'objects'`;

        console.log('🔄 Calling assistant for objects');
        const objectsResult = await callAssistant('object', objectsPrompt);
        console.log('Objects result:', objectsResult);
      } else {
        console.log(
          '⏳ Waiting for action selection before generating objects',
        );
      }
    };

    if (action) {
      console.log('🔵 Action changed to:', action);
      generateObjects();
    }
  }, [action]);

  useEffect(() => {
    const {speaker, audience, sentenceType} = sentence;
    const generateSentence = async () => {
      console.log('🔵 Topic:', topic);
      console.log('🔵 Action:', action);
      console.log('🔵 Object:', object);

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
    if (speakerCarouselRef.current) {
      // @ts-ignore
      speakerCarouselRef.current.scrollTo({index, animated: true});
    }
  };

  const handleAudienceSelect = (audience: Audience, index: number) => {
    setSentence({...sentence, audience});
    setAudienceIndex(index);
    if (audienceCarouselRef.current) {
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

  const handleTopicSelect = (topic: Topic, index: number) => {
    //setSentence({...sentence, topic, action: '', object: ''});
    setTopic(topic);
    setTopicIndex(index);
  };

  const handleActionSelect = (action: Action, index: number) => {
    // setSentence({...sentence, action});
    setAction(action);
    setActionIndex(index);
  };

  const handleObjectSelect = (object: Object, index: number) => {
    //setSentence({...sentence, object});
    setObject(object);
    setObjectIndex(index);
  };

  const handleHome = () => {
    navigation.navigate(views.OPEN as never);
  };

  const toggleKeyboard = () => {
    setIsKeyboardVisible(!isKeyboardVisible);
  };

  return (
    <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
      {/* Input and Navigation Section - Adjusted with safe area padding */}
      <View style={styles.safeAreaPadding} />

      <View style={styles.inputNavigationContainer}>
        <Pressable
          style={styles.playButton}
          onPress={() => TTSService.speak(inputText, true)}>
          <FastImage
            source={require('../assets/play.png')}
            style={styles.playIcon}
            resizeMode={FastImage.resizeMode.contain}
          />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Waiting for input..."
          value={inputText}
          onChangeText={setInputText}
        />
        <View style={styles.inlineNavigationButtons}>
          <Pressable style={styles.smallNavButton} onPress={toggleKeyboard}>
            <Text style={styles.smallNavIcon}>⌨️</Text>
          </Pressable>
          <Pressable style={styles.smallNavButton} onPress={handleHome}>
            <Text style={styles.smallNavIcon}>🏠</Text>
          </Pressable>
        </View>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Generating options...</Text>
        </View>
      )}

      <View style={styles.columnsContainer}>
        {/* Column 1: Speaker & Audience */}
        <View style={styles.column}>
          {/* Speaker Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>The speaker:</Text>
            <View style={styles.speakerContainer}>
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
              />
            </View>
          </View>

          {/* Audience Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>The audience:</Text>
            <View style={styles.optionsContainer}>
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
              />
            </View>
          </View>

          {/* Sentence Type*/}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sentence</Text>
            <View style={styles.optionsContainer}>
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

        {/* Column 2: Topic */}
        <View style={styles.column}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose the topic:</Text>
            <View style={styles.optionsContainer}>
              <ConvoCarousel<Topic>
                carouselRef={topicCarouselRef}
                currentIndex={topicIndex}
                setCurrentIndex={setTopicIndex}
                sentence={sentence}
                setSentence={setSentence}
                data={availableTopics.length > 0 ? availableTopics : []}
                handleItemSelect={handleTopicSelect}
                fieldName="topic"
              />
            </View>
          </View>
        </View>

        {/* Column 3: Action */}
        <View style={styles.column}>
          {topic && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose the action:</Text>
              <View style={styles.optionsContainer}>
                <ConvoCarousel<Action>
                  carouselRef={actionCarouselRef}
                  currentIndex={actionIndex}
                  setCurrentIndex={setActionIndex}
                  sentence={sentence}
                  setSentence={setSentence}
                  data={availableActions.length > 0 ? availableActions : []}
                  handleItemSelect={handleActionSelect}
                  fieldName="action"
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
              <View style={styles.optionsContainer}>
                <ConvoCarousel<Object>
                  carouselRef={objectCarouselRef}
                  currentIndex={objectIndex}
                  setCurrentIndex={setObjectIndex}
                  sentence={sentence}
                  setSentence={setSentence}
                  data={availableObjects.length > 0 ? availableObjects : []}
                  handleItemSelect={handleObjectSelect}
                  fieldName="object"
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {isKeyboardVisible && (
        <View style={styles.keyboardOverlay}>
          <TextInput
            style={styles.keyboardInput}
            value={inputText}
            onChangeText={setInputText}
            multiline
            autoFocus
            onBlur={() => setIsKeyboardVisible(false)}
          />
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  playButton: {
    width: SCREEN_WIDTH * 0.12,
    height: SCREEN_WIDTH * 0.12,
    maxWidth: 60,
    maxHeight: 60,
    borderRadius: SCREEN_WIDTH * 0.06,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    width: '80%',
    height: '80%',
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
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
  },
  column: {
    flex: 1,
    padding: 5,
    borderRightWidth: 1,
    borderColor: '#E0E0E0',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  optionsContainer: {
    alignItems: 'center',
    gap: 10,
  },
  option: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    width: '90%',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedOption: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  emoticon: {
    fontSize: 24,
    marginBottom: 5,
  },
  optionText: {
    marginTop: 5,
    fontSize: 14,
    color: '#333',
  },
  speakerContainer: {
    height: 170,
    width: COLUMN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',

    paddingHorizontal: 0,
  },
  speakerOption: {
    borderRadius: 10,
    padding: 5,
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 170,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  verticalOption: {
    height: SCREEN_HEIGHT * 0.3,
    marginBottom: 10,
    width: '100%',
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
  personContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  personImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  talkContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  talkImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    zIndex: 100,
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  itemImage: {
    width: '80%',
    height: '80%',
    marginBottom: 5,
  },
});

export default Convo;

const ConvoCarousel = <T extends string>({
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
}: {
  carouselRef: React.RefObject<ICarouselInstance | null>;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  sentence: Sentence;
  setSentence: (sentence: Sentence) => void;
  data: T[];
  handleItemSelect: (item: T, index: number) => void;
  fieldName:
    | 'topic'
    | 'object'
    | 'action'
    | 'questions'
    | 'generate_answers'
    | 'speaker'
    | 'audience'
    | 'sentenceType';
  showPersonIcon?: boolean;
  showTalkIcon?: boolean;
}) => {
  const isVerticalLayout =
    fieldName === 'action' || fieldName === 'object' || fieldName === 'topic';

  if (isVerticalLayout) {
    // For vertical layout, render items in a ScrollView instead of Carousel
    return (
      <ScrollView
        style={{
          width: '100%',
          maxHeight: SCREEN_HEIGHT * 0.8,
          minHeight: SCREEN_HEIGHT * 0.8,
        }}>
        {data.map((item, index) => (
          <Pressable
            key={`${fieldName}-${item}-${index}`}
            style={[
              styles.speakerOption,
              sentence[fieldName] === item && styles.selectedOption,
              styles.verticalOption,
            ]}
            onPress={() => handleItemSelect(item, index)}>
            <View style={styles.itemContainer}>
              <Image
                source={require('../assets/welcome.png')}
                style={styles.itemImage}
                resizeMode="contain"
              />
              <Text style={styles.optionText}>{item}</Text>
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
        // Update only the specific field
        const value = data[index] as any;
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
      renderItem={({item: cardItemValue, index}) => (
        <Pressable
          style={[
            styles.speakerOption,
            sentence[fieldName as keyof Sentence] === cardItemValue &&
              styles.selectedOption,
          ]}
          onPress={() => handleItemSelect(cardItemValue as T, index)}>
          {showPersonIcon ? (
            <>
              <View style={styles.personContainer}>
                <Image
                  source={require('../assets/person.png')}
                  style={styles.personImage}
                />
              </View>
              <Text style={styles.optionText}>{cardItemValue}</Text>
            </>
          ) : showTalkIcon ? (
            <>
              <View style={styles.talkContainer}>
                {cardItemValue === '?' ? (
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
              <Text style={styles.optionText}>{cardItemValue}</Text>
            </>
          ) : (
            <>
              <View style={styles.itemContainer}>
                <Image
                  source={require('../assets/welcome.png')}
                  style={styles.itemImage}
                  resizeMode="contain"
                />
                <Text style={styles.optionText}>{cardItemValue}</Text>
              </View>
            </>
          )}
        </Pressable>
      )}
    />
  );
};
