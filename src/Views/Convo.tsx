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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Carousel, {ICarouselInstance} from 'react-native-reanimated-carousel';
import TTSService from '../utils/TTSService';
import {views} from '../utils/constants';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import FastImage from 'react-native-fast-image';

type Topic = 'Talk' | 'Play';
type Action = 'say' | 'ask' | 'tell' | 'run' | 'jump' | 'dance';
type Object =
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

type RootStackParamList = {
  MainTab: {
    screen: string;
    params: {stateof: string};
  };
};

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

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const scrollViewRef = useRef<ScrollView>(null);
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

  // Define actions for each topic
  const topicActions: Record<Topic, Action[]> = {
    Talk: ['say', 'ask', 'tell'],
    Play: ['run', 'jump', 'dance'],
  };

  // Define objects for each action
  const actionObjects: Record<Action, Object[]> = {
    say: ['hello', 'goodbye', 'please'],
    ask: ['question', 'help', 'permission'],
    tell: ['story', 'joke', 'secret'],
    run: ['fast', 'slow', 'together'],
    jump: ['high', 'low', 'rope'],
    dance: ['music', 'party', 'together'],
  };

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
    setSentence({...sentence, topic});
    setTopicIndex(index);
  };

  const handleActionSelect = (action: Action, index: number) => {
    setSentence({...sentence, action});
    setActionIndex(index);
  };

  const handleObjectSelect = (object: Object, index: number) => {
    setSentence({...sentence, object});
    setObjectIndex(index);
  };

  const handleHome = () => {
    navigation.navigate('MainTab', {
      screen: views.OPEN,
      params: {stateof: ''},
    });
  };

  const toggleKeyboard = () => {
    setIsKeyboardVisible(!isKeyboardVisible);
  };

  return (
    <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
      {/* Play button and input section */}
      <View style={styles.inputSection}>
        <Pressable
          style={styles.playButton}
          onPress={() => TTSService.speak(inputText, true)}>
          <FastImage
            source={require('../assets/play.png')}
            style={[styles.playIcon, {opacity: 0.5}]}
            resizeMode={FastImage.resizeMode.contain}
          />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Waiting for input..."
          value={inputText}
          onChangeText={setInputText}
        />
      </View>

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
                data={['Talk', 'Play']}
                handleItemSelect={handleTopicSelect}
                fieldName="topic"
              />
            </View>
          </View>
        </View>

        {/* Column 3: Action */}
        <View style={styles.column}>
          {sentence.topic && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose the action:</Text>
              <View style={styles.optionsContainer}>
                <ConvoCarousel<Action>
                  carouselRef={actionCarouselRef}
                  currentIndex={actionIndex}
                  setCurrentIndex={setActionIndex}
                  sentence={sentence}
                  setSentence={setSentence}
                  data={topicActions[sentence.topic]}
                  handleItemSelect={handleActionSelect}
                  fieldName="action"
                />
              </View>
            </View>
          )}
        </View>

        {/* Column 4: Object */}
        <View style={styles.column}>
          {sentence.action && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose the object:</Text>
              <View style={styles.optionsContainer}>
                <ConvoCarousel<Object>
                  carouselRef={objectCarouselRef}
                  currentIndex={objectIndex}
                  setCurrentIndex={setObjectIndex}
                  sentence={sentence}
                  setSentence={setSentence}
                  data={actionObjects[sentence.action]}
                  handleItemSelect={handleObjectSelect}
                  fieldName="object"
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Navigation Buttons */}
      <View style={styles.navigationButtons}>
        <Pressable style={styles.navButton} onPress={toggleKeyboard}>
          <Text style={styles.navIcon}>⌨️</Text>
        </Pressable>
        <Pressable style={styles.navButton} onPress={handleHome}>
          <Text style={styles.navIcon}>🏠</Text>
        </Pressable>
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
  inputSection: {
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
    gap: 20,
    marginTop: 20,
  },
  playButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
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
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 30,
    marginTop: 40,
    paddingBottom: 40,
    paddingRight: 40,
  },
  navButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
  navIcon: {
    fontSize: 60,
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
  fieldName: keyof Sentence;
  showPersonIcon?: boolean;
  showTalkIcon?: boolean;
}) => {
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
            sentence[fieldName] === cardItemValue && styles.selectedOption,
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
            <Text style={styles.optionText}>{cardItemValue}</Text>
          )}
        </Pressable>
      )}
    />
  );
};
