// API for Google Image search endpoint
import fetchHelper from './fetcher';
import { WordImageResult, WordImageSearchResponse } from './wordImageApi';

/**
 * Search for images using Google Custom Search API via backend
 * @param query - The search query
 * @param limit - Maximum number of results to return (default: 5)
 * @returns Promise with search results
 */
export const searchGoogleImages = async (
    query: string,
    limit: number = 5,
): Promise<WordImageSearchResponse> => {
    try {
        const response = await fetchHelper(
            'searchGoogleImages',
            { q: query, limit: limit.toString() },
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
        console.error('Google Image search error:', error);
        throw error;
    }
};
