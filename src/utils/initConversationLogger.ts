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
      },
    );
  } catch (error) {
    
    // Don't throw error to avoid disrupting user experience
  }
};
