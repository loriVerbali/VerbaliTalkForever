import fetchHelper from './fetcher';

interface LogInitConversationData {
  question: string;
  possibleTopics: string[];
  possibleActions: string[];
  possibleObjects: string[];
  sentence: string;
  topic: string;
  action: string;
  objectPicked: string;
  threadId: string;
}

export const logInitConversation = async (
  data: LogInitConversationData,
): Promise<void> => {
  try {
    const response = await fetchHelper(
      'loginitconversation',
      {},
      {
        question: data.question,
        possibleTopics: data.possibleTopics,
        possibleActions: data.possibleActions,
        possibleObjects: data.possibleObjects,
        sentence: data.sentence,
        topic: data.topic,
        action: data.action,
        objectPicked: data.objectPicked,
        threadId: data.threadId,
      },
    );
  } catch (error) {
    console.error('Failed to log init conversation:', error);
    // Don't throw error to avoid disrupting user experience
  }
};
