import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import Geolocation from '@react-native-community/geolocation';
import {useAppSettings} from '../utils/persistance';

// WeatherAPI.com API key
const WEATHER_API_KEY = 'f9cce715fe3d4b7da27170914250306';

// Cache duration: 3 hours in milliseconds
const CACHE_DURATION = 3 * 60 * 60 * 1000;

interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  uvIndex: number;
  visibility: number;
}

interface SpecialPlace {
  type: 'home' | 'school' | 'therapy';
  address: string;
  isCurrentLocation: boolean;
}

interface LocationData {
  name: string;
  region: string;
  country: string;
  localTime: string;
  latitude: number;
  longitude: number;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    borough?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  display_name?: string;
  specialPlace?: {
    type: 'home' | 'school' | 'therapy';
    name: string;
  } | null;
}

interface ChatContextType {
  weather: WeatherData | null;
  location: LocationData | null;
  loading: boolean;
  error: string;
  lastUpdated: Date | null;
  refreshWeatherData: () => void;
  isDataStale: () => boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatContextProviderProps {
  children: ReactNode;
}

export const ChatContextProvider: React.FC<ChatContextProviderProps> = ({
  children,
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const {preferences, getItem} = useAppSettings();

  // Check if data is stale (older than 3 hours)
  const isDataStale = (): boolean => {
    if (!lastUpdated) return true;
    const now = new Date();
    return now.getTime() - lastUpdated.getTime() > CACHE_DURATION;
  };

  // Function to check if current location matches any special places
  const checkSpecialPlaces = async (
    currentAddress: string,
    currentLat?: number,
    currentLon?: number,
  ): Promise<{
    type: 'home' | 'school' | 'therapy';
    name: string;
  } | null> => {
    try {
      // Get saved special places
      const specialPlacesData = await getItem('specialPlaces');
      if (!specialPlacesData) {
        return null;
      }

      const specialPlaces: SpecialPlace[] = JSON.parse(specialPlacesData);

      // Check each special place
      for (const place of specialPlaces) {
        if (place.address && place.address.trim()) {
          let isMatch = false;

          // If this place was set using current location, try to get its coordinates for comparison
          if (place.isCurrentLocation && currentLat && currentLon) {
            // For places set as "current location", we can try geocoding the saved address
            // to get coordinates and compare distance
            try {
              const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                place.address,
              )}&limit=1`;
              const geocodeResponse = await fetch(geocodeUrl);
              const geocodeData = await geocodeResponse.json();

              if (geocodeData && geocodeData.length > 0) {
                const savedLat = parseFloat(geocodeData[0].lat);
                const savedLon = parseFloat(geocodeData[0].lon);

                // Calculate distance using Haversine formula (simplified)
                const distance = calculateDistance(
                  currentLat,
                  currentLon,
                  savedLat,
                  savedLon,
                );

                // If within 100 meters, consider it a match
                if (distance < 0.1) {
                  isMatch = true;
                }
              }
            } catch (error) {
              console.warn('Error geocoding saved place:', error);
            }
          }

          // If coordinate matching didn't work or wasn't applicable, fall back to address matching
          if (!isMatch) {
            // Enhanced address matching
            const placeAddressLower = place.address.toLowerCase();
            const currentAddressLower = currentAddress.toLowerCase();

            // Remove common words that don't help with matching
            const commonWords = [
              'the',
              'and',
              'or',
              'at',
              'in',
              'on',
              'of',
              'to',
              'for',
              'with',
              'by',
            ];

            const cleanAddress = (addr: string) => {
              return addr
                .split(/[,\s]+/)
                .filter(comp => comp.length > 2 && !commonWords.includes(comp))
                .map(comp => comp.replace(/[^\w]/g, '')); // Remove punctuation
            };

            const placeComponents = cleanAddress(placeAddressLower);
            const currentComponents = cleanAddress(currentAddressLower);

            // Count matching components with fuzzy matching
            let matchCount = 0;
            for (const placeComp of placeComponents) {
              for (const currentComp of currentComponents) {
                // Exact match or one contains the other
                if (
                  placeComp === currentComp ||
                  placeComp.includes(currentComp) ||
                  currentComp.includes(placeComp)
                ) {
                  matchCount++;
                  break; // Don't count the same component multiple times
                }

                // Fuzzy matching for similar words (simple Levenshtein-like)
                if (placeComp.length > 3 && currentComp.length > 3) {
                  const similarity = calculateStringSimilarity(
                    placeComp,
                    currentComp,
                  );
                  if (similarity > 0.8) {
                    matchCount += 0.5; // Partial match
                    break;
                  }
                }
              }
            }

            // Determine if it's a match based on the ratio of matching components
            const matchRatio = matchCount / Math.max(placeComponents.length, 1);
            const minMatchRatio = placeComponents.length <= 2 ? 0.8 : 0.6; // Higher threshold for shorter addresses

            if (matchRatio >= minMatchRatio && matchCount >= 1) {
              isMatch = true;
            }
          }

          if (isMatch) {
            const placeName =
              place.type.charAt(0).toUpperCase() + place.type.slice(1);
            return {
              type: place.type,
              name: placeName,
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error checking special places:', error);
      return null;
    }
  };

  // Helper function to calculate distance between two coordinates (in km)
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Helper function to calculate string similarity (simple version)
  const calculateStringSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  // Helper function to calculate Levenshtein distance
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  };

  // Get current location
  const getCurrentLocation = (): Promise<{
    latitude: number;
    longitude: number;
  }> => {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position: any) => {
          const {latitude, longitude} = position.coords;
          resolve({latitude, longitude});
        },
        (error: any) => {
          console.warn('Location error:', error);
          // Don't fallback to default location - reject the promise
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 10000,
        },
      );
    });
  };

  // Reverse geocode coordinates to get readable address
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok && data) {
        return {
          display_name: data.display_name,
          address: data.address,
        };
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err);
    }
    return null;
  };

  // Fetch weather data
  const fetchWeatherData = async (lat: number, lon: number) => {
    try {
      const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&aqi=no`;

      // Fetch both weather data and reverse geocoding in parallel
      const [weatherResponse, geocodeData] = await Promise.all([
        fetch(url),
        reverseGeocode(lat, lon),
      ]);

      const weatherData = await weatherResponse.json();

      if (weatherResponse.ok && weatherData.current) {
        const weather: WeatherData = {
          temperature: Math.round(weatherData.current.temp_f),
          description: weatherData.current.condition.text.toLowerCase(),
          humidity: weatherData.current.humidity,
          windSpeed: Math.round(weatherData.current.wind_mph),
          feelsLike: Math.round(weatherData.current.feelslike_f),
          uvIndex: weatherData.current.uv,
          visibility: Math.round(weatherData.current.vis_miles),
        };

        // Check if current location matches any special places
        const currentAddress =
          geocodeData?.display_name ||
          `${weatherData.location.name}, ${weatherData.location.region}`;
        const specialPlace = await checkSpecialPlaces(currentAddress, lat, lon);

        const locationData: LocationData = {
          name: weatherData.location.name,
          region: weatherData.location.region,
          country: weatherData.location.country,
          localTime: weatherData.location.localtime,
          latitude: lat,
          longitude: lon,
          specialPlace,
          // Add reverse geocoding data if available
          ...(geocodeData && {
            display_name: geocodeData.display_name,
            address: geocodeData.address,
          }),
        };

        setWeather(weather);
        setLocation(locationData);
        setLastUpdated(new Date());
        setError('');
      } else {
        throw new Error('Failed to fetch weather data');
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError('Unable to fetch weather information');
    }
  };

  // Main function to refresh weather data
  const refreshWeatherData = async () => {
    if (loading) return; // Prevent multiple simultaneous requests

    setLoading(true);
    setError('');

    try {
      const coords = await getCurrentLocation();
      await fetchWeatherData(coords.latitude, coords.longitude);
    } catch (err) {
      console.error('Error getting location:', err);
      setError('Location access required for weather data');
      // Keep weather and location as null when location access fails
      setWeather(null);
      setLocation(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh on mount if data is stale
  useEffect(() => {
    if (isDataStale() && preferences.wasLocationOnboarded === '1') {
      refreshWeatherData();
    }
  }, [preferences?.wasLocationOnboarded]);

  // Auto-refresh every 3 hours
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDataStale() && preferences.wasLocationOnboarded === '1') {
        refreshWeatherData();
      }
    }, CACHE_DURATION);

    return () => clearInterval(interval);
  }, []);

  const contextValue: ChatContextType = {
    weather,
    location,
    loading,
    error,
    lastUpdated,
    refreshWeatherData,
    isDataStale,
  };

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
  );
};

// Custom hook to use the chat context
export const useChatContext = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatContextProvider');
  }
  return context;
};

// Helper function to get contextual information for AI prompts
export const getContextualInfo = (
  weather: WeatherData | null,
  location: LocationData | null,
): string => {
  const now = new Date();

  // Use more efficient date formatting
  const dayOfWeek = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][now.getDay()];
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeString = `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${minute
    .toString()
    .padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;

  // Determine time period more efficiently
  let timePeriod = 'night';
  if (hour >= 5 && hour < 12) timePeriod = 'morning';
  else if (hour >= 12 && hour < 17) timePeriod = 'afternoon';
  else if (hour >= 17 && hour < 21) timePeriod = 'evening';

  // Build context string more efficiently
  let contextParts = [`It's ${dayOfWeek} ${timePeriod} at ${timeString}`];

  if (location) {
    if (location.specialPlace) {
      contextParts.push(`Location: ${location.specialPlace.name}`);

      // Add context-specific information based on the special place
      const placeContext = {
        home: '(home environment)',
        school: '(school environment)',
        therapy: '(therapy environment)',
      }[location.specialPlace.type];

      if (placeContext) {
        contextParts.push(placeContext);
      }
    } else {
      contextParts.push(`Location: ${location.name}, ${location.region}`);
    }
  }

  if (weather) {
    const temp = weather.temperature;
    let tempDesc = 'pleasant';
    if (temp < 40) tempDesc = 'very cold';
    else if (temp < 60) tempDesc = 'cool';
    else if (temp > 80) tempDesc = 'hot';

    contextParts.push(
      `Weather: ${temp}°F, ${weather.description} (${tempDesc})`,
    );

    // Add weather-specific context more efficiently
    const desc = weather.description.toLowerCase();
    if (desc.includes('rain') || desc.includes('storm')) {
      contextParts.push('rainy weather');
    } else if (desc.includes('snow')) {
      contextParts.push('snowy weather');
    } else if (desc.includes('sun') || desc.includes('clear')) {
      contextParts.push('sunny weather');
    } else if (desc.includes('cloud')) {
      contextParts.push('cloudy weather');
    }
  }

  return `Current context: ${contextParts.join('. ')}`;
};
