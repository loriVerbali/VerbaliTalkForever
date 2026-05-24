import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useAdmin } from '../../contexts/adminContext';
import { useAppSettings } from '../../utils/persistance';
import fetchHelper from '../../utils/fetcher';
const { width, height } = Dimensions.get('window');

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface Step {
  name: string;
  requirements: string;
  assistantMessage: string;
}

const getIntakeSteps = (childName: string): Step[] => {
  const hasName = childName && childName.toLowerCase() !== 'your child';
  const nameDisplay = hasName ? childName : 'your child';
  const possessiveName = hasName ? `${childName}'s` : 'their';

  return [
    {
      name: 'Child Basic Info',
      requirements: hasName ? 'age' : 'name and age',
      assistantMessage: hasName
        ? `Let's start with some facts about ${nameDisplay}. How old are they?`
        : `Let's start with some facts about ${nameDisplay}. What is their name and age?`,
    },
    {
      name: 'Caregivers',
      requirements: 'names, relationships, what the child calls them',
      assistantMessage: `Who are ${possessiveName} primary caregivers? Please share their names, relationships, and what ${nameDisplay} calls them.`,
    },
    {
      name: 'Family outside the home',
      requirements: 'if they live close or far, city/state/country if far',
      assistantMessage: 'What about family outside the home? Do they live close or far? If they live far, what city, state, or country are they in?',
    },
    {
      name: 'Therapists',
      requirements: 'name, role, where therapy happens',
      assistantMessage: `Does ${nameDisplay} work with any therapists? Please share their names, roles, and where therapy happens.`,
    },
    {
      name: 'School',
      requirements: 'school name, teachers names, teachers roles',
      assistantMessage: "How about school? Do they attend any school or program? What are the teachers' names and roles?",
    },
    {
      name: 'Routines',
      requirements: 'routine steps, foods, drinks, people, places, objects, shows, songs, books',
      assistantMessage: `Lastly, let’s talk about routines. What does a typical day look like? Feel free to mention ${possessiveName} favorite foods, drinks, places, shows, songs, or books.`,
    },
  ];
};

interface IntakeChatModalProps {
  visible: boolean;
  childName: string;
  onCancel: () => void;
  onComplete: (transcript: string) => void;
}

const IntakeChatModal: React.FC<IntakeChatModalProps> = ({
  visible,
  childName,
  onCancel,
  onComplete,
}) => {
  const INTAKE_STEPS = getIntakeSteps(childName);
  const { isTablet } = useAdmin();
  const { preferences, setItem } = useAppSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Initialize chat when modal opens
  useEffect(() => {
    if (visible && messages.length === 0) {
      let savedIndex = parseInt(preferences.intakeActiveStepIndex || '0', 10);
      let savedStatuses: string[] = [];
      try {
        savedStatuses = JSON.parse(preferences.intakeStepStatuses || '[]');
      } catch (e) { }

      if (savedIndex >= INTAKE_STEPS.length) {
        savedIndex = 0;
        savedStatuses = [];
      }

      setStepStatuses(savedStatuses);
      setActiveStepIndex(savedIndex);

      const nameDisplay = childName && childName.toLowerCase() !== 'your child' ? childName : 'your child';
      const startMsg = savedIndex === 0
        ? `We’ll keep this simple. Start with ${nameDisplay}, then I’ll guide you one small step at a time.\n\n${INTAKE_STEPS[0].assistantMessage}`
        : INTAKE_STEPS[savedIndex].assistantMessage;

      setMessages([
        {
          role: 'assistant',
          content: startMsg,
        },
      ]);
    } else if (!visible) {
      // Reset when closed so we pull latest preferences next time
      setMessages([]);
    }
  }, [visible, preferences.intakeActiveStepIndex, preferences.intakeStepStatuses]);

  const handleStop = async () => {
    const finalTranscript = messages
      .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${m.content}`)
      .join('\\n\\n');

    await setItem('intakeActiveStepIndex', activeStepIndex.toString());
    await setItem('intakeStepStatuses', JSON.stringify(stepStatuses));

    onComplete(finalTranscript);
  };

  const handleSkip = async () => {
    const newStatuses = [...stepStatuses];
    newStatuses[activeStepIndex] = 'skipped';
    setStepStatuses(newStatuses);

    let nextIndex = activeStepIndex + 1;

    if (nextIndex >= INTAKE_STEPS.length) {
      const finalTranscript = messages
        .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${m.content}`)
        .join('\\n\\n');

      await setItem('intakeActiveStepIndex', '0');
      await setItem('intakeStepStatuses', '[]');

      onComplete(finalTranscript);
    } else {
      setActiveStepIndex(nextIndex);
      await setItem('intakeActiveStepIndex', nextIndex.toString());
      await setItem('intakeStepStatuses', JSON.stringify(newStatuses));

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Skipping to next topic...\n\n${INTAKE_STEPS[nextIndex].assistantMessage}` }
      ]);
    }
  };

  const handleJumpToStep = async (targetIndex: number) => {
    if (isTyping) return;
    const status = stepStatuses[targetIndex];
    // Only allow jumping to completed (green) or skipped (orange) steps
    if (status !== 'completed' && status !== 'skipped') return;

    const step = INTAKE_STEPS[targetIndex];
    const goingBackMsg = `Going back to "${step.name}"...`;

    setActiveStepIndex(targetIndex);
    await setItem('intakeActiveStepIndex', targetIndex.toString());

    const updatedMessages: Message[] = [
      ...messages,
      { role: 'assistant', content: goingBackMsg },
    ];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      const targetStep = INTAKE_STEPS[targetIndex + 1] || null;

      const result = await fetchHelper('intakeChat', {}, {
        childName,
        activeStep: step,
        targetStep,
        transcript: updatedMessages,
        isRevisit: true,
        existingAnswers: messages
          .filter(m => m.role === 'user')
          .map(m => m.content),
      });

      const followUp = result.assistant_next_question;
      setMessages(prev => [...prev, { role: 'assistant', content: followUp }]);
    } catch (error) {
      // Fallback: just show the topic's opening question only if we can't get a contextual one
      setMessages(prev => [...prev, { role: 'assistant', content: step.assistantMessage }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isTyping) return;

    const userMsg: Message = { role: 'user', content: inputText.trim() };
    const newTranscript = [...messages, userMsg];
    setMessages(newTranscript);
    setInputText('');
    setIsTyping(true);

    try {
      const activeStep = INTAKE_STEPS[activeStepIndex];
      const targetStep = INTAKE_STEPS[activeStepIndex + 1] || null;

      const result = await fetchHelper('intakeChat', {}, {
        childName,
        activeStep,
        targetStep,
        transcript: newTranscript,
        existingAnswers: messages
          .filter(m => m.role === 'user')
          .map(m => m.content),
      });

      let nextIndex = activeStepIndex;
      let nextMsgContent = result.assistant_next_question;
      let newStatuses = [...stepStatuses];

      if (result.topic_complete) {
        newStatuses[activeStepIndex] = 'completed';
        setStepStatuses(newStatuses);
        await setItem('intakeStepStatuses', JSON.stringify(newStatuses));

        if (result.transition_message) {
          nextMsgContent = `${result.transition_message}\n\n${nextMsgContent}`;
        }
        nextIndex += 1;
      }

      if (nextIndex >= INTAKE_STEPS.length && result.topic_complete) {
        // Finished all steps
        const finalTranscript = newTranscript
          .map(m => `${m.role === 'assistant' ? 'Assistant' : 'Caregiver'}: ${m.content}`)
          .join('\\n\\n');

        await setItem('intakeActiveStepIndex', '0');
        await setItem('intakeStepStatuses', '[]');

        onComplete(finalTranscript);
      } else {
        setActiveStepIndex(nextIndex);
        if (result.topic_complete) {
          await setItem('intakeActiveStepIndex', nextIndex.toString());
        }
        setMessages([...newTranscript, { role: 'assistant', content: nextMsgContent }]);
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong while chatting. Please try again.');
      // Remove the user's message so they can try again
      setMessages(messages);
    } finally {
      setIsTyping(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isAssistant = item.role === 'assistant';
    return (
      <View
        style={[
          styles.messageBubble,
          isAssistant ? styles.assistantBubble : styles.userBubble,
        ]}>
        <Text
          style={[
            styles.messageText,
            isAssistant ? styles.assistantText : styles.userText,
          ]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, isTablet && styles.containerTablet]}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerLeftActions}>
                <TouchableOpacity onPress={handleStop} style={styles.actionButton}>
                  <Text style={[styles.actionText, { color: '#E53935' }]}>Stop</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkip} style={styles.actionButton}>
                  <Text style={[styles.actionText, { color: '#FF9800' }]}>Skip</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.title}>{activeStepIndex + 1}/6</Text>
              <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.progressBarContainer}>
              {INTAKE_STEPS.map((step, index) => {
                let bgColor = '#e1e1e1';
                const status = stepStatuses[index];
                if (status === 'completed') bgColor = '#4CAF50';
                else if (status === 'skipped') bgColor = '#FF9800';
                else if (index === activeStepIndex) bgColor = '#8E24AA';
                const isColored = status === 'completed' || status === 'skipped' || index === activeStepIndex;
                const isTappable = status === 'completed' || status === 'skipped';
                const pill = (
                  <View style={[styles.progressPill, { backgroundColor: bgColor }]}>
                    <Text
                      style={[styles.progressPillText, { color: isColored ? '#fff' : '#999' }]}
                      numberOfLines={1}
                    >
                      {step.name}
                    </Text>
                  </View>
                );
                return isTappable ? (
                  <TouchableOpacity
                    key={index}
                    style={styles.progressPillWrapper}
                    onPress={() => handleJumpToStep(index)}
                    activeOpacity={0.75}
                  >
                    {pill}
                  </TouchableOpacity>
                ) : (
                  <View key={index} style={styles.progressPillWrapper}>
                    {pill}
                  </View>
                );
              })}
            </View>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, index) => index.toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatContainer}
            style={styles.flatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />

          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your response..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping}>
              {isTyping ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
    display: 'flex',
    flexDirection: 'column',
  },
  containerTablet: {
    width: '80%',
    height: '80%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'column',
    gap: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeftActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  actionText: {
    fontWeight: '700',
    fontSize: 14,
  },
  progressBarContainer: {
    flexDirection: 'row',
    gap: 5,
    width: '100%',
  },
  progressPillWrapper: {
    flex: 1,
    height: height * 0.05
  },
  progressPill: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPillText: {
    fontSize: height * 0.015,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeText: {
    fontSize: 24,
    color: '#999',
  },
  chatContainer: {
    padding: 20,
    paddingBottom: 130,
    gap: 12,
    flexGrow: 1,
  },
  flatList: {
    flex: 1,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 16,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#8E24AA',
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  assistantText: {
    color: '#333',
  },
  userText: {
    color: '#fff',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'flex-end',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 48,
    maxHeight: 120,
    fontSize: 16,
    color: '#333',
  },
  sendButton: {
    backgroundColor: '#8E24AA',
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default IntakeChatModal;
