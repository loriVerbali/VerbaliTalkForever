import {WordImageResult} from './wordImageApi';

export interface My8WordsCard {
  word: string;
  imageUrl: string;
  localImagePath?: string; // Path to downloaded image on device
  id: string;
}

export interface My8WordsData {
  cards: My8WordsCard[];
}

// Default words as specified in requirements
const DEFAULT_WORDS = [
  'Yes',
  'No',
  'Hi.',
  'Mom',
  'Dad',
  'Help',
  'Bathroom',
  'More',
];

/**
 * Get default 8 words data structure
 */
export const getDefaultMy8Words = (): My8WordsData => {
  const imagePaths = [
    '../assets/classic/yes.jpg',
    '../assets/classic/no.jpg',
    '../assets/shortCuts/attention/hi.jpg',
    '../assets/classic/mom.jpg',
    '../assets/classic/dad.jpg',
    '../assets/classic/help.jpg',
    '../assets/classic/bathroom.jpg',
    '../assets/classic/more.jpg',
  ];

  return {
    cards: DEFAULT_WORDS.map((word, index) => ({
      word,
      imageUrl: imagePaths[index],
      id: `default_${word.toLowerCase().replace(/[^a-z0-9]/g, '')}_${index}`,
    })),
  };
};

/**
 * Parse my8words JSON string from preferences
 */
export const parseMy8Words = (jsonString: string): My8WordsData => {
  if (!jsonString || jsonString.trim() === '') {
    return getDefaultMy8Words();
  }

  try {
    const parsed = JSON.parse(jsonString);
    // Validate structure
    if (parsed && Array.isArray(parsed.cards) && parsed.cards.length === 8) {
      // Check if this is old data with mock URLs and migrate it
      const needsMigration = parsed.cards.some(
        card => card.imageUrl && card.imageUrl.includes('example.com'),
      );

      if (needsMigration) {
        return getDefaultMy8Words();
      }

      return parsed;
    }
    return getDefaultMy8Words();
  } catch (error) {
    
    return getDefaultMy8Words();
  }
};

/**
 * Convert My8WordsData to JSON string for storage
 */
export const stringifyMy8Words = (data: My8WordsData): string => {
  return JSON.stringify(data);
};

/**
 * Update a specific card in the 8 words data
 */
export const updateCard = (
  data: My8WordsData,
  cardIndex: number,
  newCard: My8WordsCard,
): My8WordsData => {
  if (cardIndex < 0 || cardIndex >= 8) {
    throw new Error('Card index must be between 0 and 7');
  }

  const newData = {...data};
  newData.cards = [...data.cards];
  newData.cards[cardIndex] = newCard;

  return newData;
};

/**
 * Get card by index
 */
export const getCard = (
  data: My8WordsData,
  cardIndex: number,
): My8WordsCard | null => {
  if (cardIndex < 0 || cardIndex >= 8) {
    return null;
  }
  return data.cards[cardIndex];
};

/**
 * Convert WordImageResult to My8WordsCard
 */
export const wordImageToCard = (wordImage: WordImageResult): My8WordsCard => {
  return {
    word: wordImage.word,
    imageUrl: wordImage.imageUrl,
    id: wordImage.id,
  };
};
