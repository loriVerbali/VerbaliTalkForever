import fetchHelper from './fetcher';

interface LogConversationData {
  question: string;
  possibleAnswers: string[];
  answerPicked: string;
}

export const logConversation = async (
  data: LogConversationData,
): Promise<void> => {
  try {
    const response = await fetchHelper(
      'logconversation',
      {},
      {
        question: data.question,
        possibleAnswers: data.possibleAnswers,
        answerPicked: data.answerPicked,
      },
    );
  } catch (error) {
    
    // Don't throw error to avoid disrupting user experience
  }
};
