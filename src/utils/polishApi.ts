// API for Google Image search endpoint
import fetchHelper from './fetcher';

/**
 * Search for images using Google Custom Search API via backend
 * @param query - The search query
 * @returns Promise with search results
 */
export const polishText = async (
    query: string,
): Promise<string> => {
    try {
        const response = await fetchHelper(
            'polishApi',
            {},
            { text: query },
        );

        // The API returns a flat object with polishedText
        if (response && response.polishedText) {
            return response.polishedText;
        } else {
            throw new Error('API request failed: Invalid response format');
        }
    } catch (error) {
        console.error('Polish text error:', error);
        throw error;
    }
};
