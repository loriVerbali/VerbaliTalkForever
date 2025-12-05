// API for word/image search endpoint
import fetchHelper from './fetcher';

export interface WordImageResult {
  word: string;
  imageUrl: string;
  id: string;
}

export interface WordImageSearchResponse {
  results: WordImageResult[];
  total: number;
}

// Mock data for development
const mockWordImages: WordImageResult[] = [
  {word: 'Yes', imageUrl: 'https://example.com/images/yes.png', id: 'yes_1'},
  {word: 'No', imageUrl: 'https://example.com/images/no.png', id: 'no_1'},
  {
    word: 'Maybe',
    imageUrl: 'https://example.com/images/maybe.png',
    id: 'maybe_1',
  },
  {
    word: 'Later',
    imageUrl: 'https://example.com/images/later.png',
    id: 'later_1',
  },
  {word: 'Help', imageUrl: 'https://example.com/images/help.png', id: 'help_1'},
  {word: 'Dad', imageUrl: 'https://example.com/images/dad.png', id: 'dad_1'},
  {word: 'Mom', imageUrl: 'https://example.com/images/mom.png', id: 'mom_1'},
  {
    word: 'Grandpa',
    imageUrl: 'https://example.com/images/grandpa.png',
    id: 'grandpa_1',
  },
  {
    word: 'Water',
    imageUrl: 'https://example.com/images/water.png',
    id: 'water_1',
  },
  {word: 'Food', imageUrl: 'https://example.com/images/food.png', id: 'food_1'},
  {word: 'Play', imageUrl: 'https://example.com/images/play.png', id: 'play_1'},
  {
    word: 'Sleep',
    imageUrl: 'https://example.com/images/sleep.png',
    id: 'sleep_1',
  },
  {
    word: 'Happy',
    imageUrl: 'https://example.com/images/happy.png',
    id: 'happy_1',
  },
  {word: 'Sad', imageUrl: 'https://example.com/images/sad.png', id: 'sad_1'},
  {word: 'More', imageUrl: 'https://example.com/images/more.png', id: 'more_1'},
  {word: 'Stop', imageUrl: 'https://example.com/images/stop.png', id: 'stop_1'},
];

/**
 * Search for words and their associated images
 * @param query - The search query
 * @param limit - Maximum number of results to return (default: 20)
 * @returns Promise with search results
 */
export const searchWordImages = async (
  query: string,
  limit: number = 20,
): Promise<WordImageSearchResponse> => {
  try {
    // Call the real API
    const response = await fetchHelper(
      'searchWordImages',
      {q: query, limit: limit.toString()},
      {},
    );

    // Transform the response to match our interface
    if (response.success && response.data) {
      return {
        results: response.data.results || [],
        total: response.data.total || 0,
      };
    } else {
      throw new Error(response.error?.message || 'API request failed');
    }
  } catch (error) {
    console.error('Error searching word images:', error);

    // Fallback to mock data if API fails
    const filteredResults = mockWordImages.filter(item =>
      item.word.toLowerCase().includes(query.toLowerCase()),
    );
    const results = filteredResults.slice(0, limit);

    return {
      results,
      total: filteredResults.length,
    };
  }
};
