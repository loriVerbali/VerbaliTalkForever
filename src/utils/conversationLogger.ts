import fetchHelper from './fetcher';

interface LogConversationData {
  question: string;
  possibleAnswers: string[];
  answerPicked: string;
  threadId: string;
}

export const logConversation = async (
  data: LogConversationData,
): Promise<void> => {
  try {
    console.log('📊 Logging conversation:', data);

    const response = await fetchHelper(
      'logconversation',
      {},
      {
        question: data.question,
        possibleAnswers: data.possibleAnswers,
        answerPicked: data.answerPicked,
        threadId: data.threadId,
      },
    );

    console.log('✅ Conversation logged successfully');
  } catch (error) {
    console.error('❌ Failed to log conversation:', error);
    // Don't throw error to avoid disrupting user experience
  }
};
