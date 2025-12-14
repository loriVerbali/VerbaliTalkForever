import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import Geolocation from '@react-native-community/geolocation';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {Platform, PermissionsAndroid} from 'react-native';
import Config from 'react-native-config';
import {useAppSettings} from '../utils/persistance';

// WeatherAPI.com API key
const WEATHER_API_KEY = Config.WEATHER_API_KEY || '';

// Cache duration: 1 hour in milliseconds
const CACHE_DURATION = 60 * 60 * 1000;

interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  uvIndex: number;
  visibility: number;
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
    // Generic place from pepes Places
    type: string; // e.g., Home, School, Park, etc.
    name: string; // item name from pepes
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

  const formatAddressToString = (addressDetails?: {
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    country?: string;
  }): string => {
    if (!addressDetails) return '';
    const parts = [
      addressDetails.address || '',
      addressDetails.address2 || '',
      addressDetails.city || '',
      addressDetails.state || '',
      addressDetails.zipcode || '',
      addressDetails.country || '',
    ].filter(part => part.trim() !== '');
    return parts.join(', ');
  };

  // Function to check if current location matches any pepes Places
  const checkPepesPlaces = async (
    currentAddress: string,
    currentLat?: number,
    currentLon?: number,
  ): Promise<{
    type: string;
    name: string;
  } | null> => {
    try {
      const pepes = await getItem('pepes');
      if (!pepes) return null;
      const parsed = JSON.parse(pepes);
      const places: Array<{
        id: string;
        name: string;
        type?: string;
        aliases?: string[];
        addressDetails?: {
          address?: string;
          address2?: string;
          city?: string;
          state?: string;
          zipcode?: string;
          country?: string;
        };
        isCurrentLocation?: boolean;
      }> = parsed?.Places || [];
      if (!Array.isArray(places) || places.length === 0) return null;

      const currentLower = currentAddress.toLowerCase();
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '');

      // First pass: name/alias direct substring match
      let bestMatch: {name: string; type: string; score: number} | null = null;

      for (const item of places) {
        const n = (item.name || '').toString();
        const nl = normalize(n);
        if (nl && normalize(currentLower).includes(nl)) {
          const score = 1.0;

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              name: item.name,
              type: (item.type || 'Place').toString(),
              score,
            };
          }
          continue;
        }
        const aliases = Array.isArray(item.aliases) ? item.aliases : [];
        for (const a of aliases) {
          const al = normalize(a);
          if (al && normalize(currentLower).includes(al)) {
            const score = 0.95;

            if (!bestMatch || score > bestMatch.score) {
              bestMatch = {
                name: item.name,
                type: (item.type || 'Place').toString(),
                score,
              };
            }
            break;
          }
        }
      }

      if (bestMatch) {
        return {name: bestMatch.name, type: bestMatch.type};
      }

      // Second pass: address substring match (loose)
      for (const item of places) {
        const formatted = formatAddressToString(item.addressDetails);
        if (!formatted) continue;
        const pl = normalize(formatted);
        const cur = normalize(currentLower);
        if ((pl && cur.includes(pl)) || (cur && pl.includes(cur))) {
          const score = 0.9;

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              name: item.name,
              type: (item.type || 'Place').toString(),
              score,
            };
          }
        }
      }

      if (bestMatch) {
        return {name: bestMatch.name, type: bestMatch.type};
      }

      // Third pass: address string fuzzy component match
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
          .split(/[\,\s]+/)
          .filter(comp => comp.length > 2 && !commonWords.includes(comp))
          .map(comp => comp.replace(/[^\w]/g, ''));
      };
      const currentComponents = cleanAddress(currentLower);

      for (const item of places) {
        const formatted = formatAddressToString(item.addressDetails);
        if (!formatted) continue;
        const placeComponents = cleanAddress(formatted.toLowerCase());

        let matchCount = 0;
        for (const pc of placeComponents) {
          for (const cc of currentComponents) {
            if (pc === cc || pc.includes(cc) || cc.includes(pc)) {
              matchCount++;
              break;
            }
            if (pc.length > 3 && cc.length > 3) {
              const similarity = calculateStringSimilarity(pc, cc);
              if (similarity > 0.8) {
                matchCount += 0.5;
                break;
              }
            }
          }
        }
        const matchRatio = matchCount / Math.max(placeComponents.length, 1);
        const minMatchRatio = placeComponents.length <= 2 ? 0.8 : 0.6;
        const isMatch = matchRatio >= minMatchRatio && matchCount >= 1;
        const score = matchRatio;

        if (isMatch) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              name: item.name,
              type: (item.type || 'Place').toString(),
              score,
            };
          }
        }
      }

      if (bestMatch) {
        return {name: bestMatch.name, type: bestMatch.type};
      }

      // Optional final pass: if any item flagged as current location, try geocoding distance compare
      if (currentLat && currentLon) {
        for (const item of places) {
          if (!item.isCurrentLocation) continue;
          const formatted = formatAddressToString(item.addressDetails);
          if (!formatted) continue;
          try {
            const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              formatted,
            )}&limit=1`;
            const geocodeResponse = await fetch(geocodeUrl);
            const geocodeData = await geocodeResponse.json();
            if (Array.isArray(geocodeData) && geocodeData.length > 0) {
              const savedLat = parseFloat(geocodeData[0].lat);
              const savedLon = parseFloat(geocodeData[0].lon);
              const distance = calculateDistance(
                currentLat,
                currentLon,
                savedLat,
                savedLon,
              );

              if (distance < 0.1) {
                return {
                  name: item.name,
                  type: (item.type || 'Place').toString(),
                };
              }
            }
          } catch (e) {
            // ignore and continue
          }
        }
      }

      return null;
    } catch (error) {
      
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
    const matrix: number[][] = [];

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

  // Check location permission before getting location
  const checkLocationPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        // First check if permission is already granted
        const fineLocationStatus = await check(
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
        );
        const coarseLocationStatus = await check(
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
        );

        if (
          fineLocationStatus === RESULTS.GRANTED &&
          coarseLocationStatus === RESULTS.GRANTED
        ) {
          return true;
        }

        // If not granted, try using PermissionsAndroid as fallback
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted;
      } else {
        // iOS
        const status = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        return status === RESULTS.GRANTED;
      }
    } catch (error) {
      
      return false;
    }
  };

  // Get current location
  const getCurrentLocation = (): Promise<{
    latitude: number;
    longitude: number;
  }> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Check permissions first
        const hasPermission = await checkLocationPermission();
        if (!hasPermission) {
          
          reject(new Error('Location permission not granted'));
          return;
        }

        Geolocation.getCurrentPosition(
          (position: any) => {
            const {latitude, longitude} = position.coords;
            resolve({latitude, longitude});
          },
          (error: any) => {
            
            // Don't fallback to default location - reject the promise
            reject(error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000, // Increased timeout
            maximumAge: 10000,
          },
        );
      } catch (error) {
        
        reject(error);
      }
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

        // Check if current location matches any saved pepes Places
        const currentAddress =
          geocodeData?.display_name ||
          `${weatherData.location.name}, ${weatherData.location.region}`;
        const specialPlace = await checkPepesPlaces(currentAddress, lat, lon);

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
    } catch (err: any) {
      

      // Provide more specific error messages
      if (err?.message?.includes('permission')) {
        setError(
          'Location permission required for weather data. Please enable location permissions in Settings.',
        );
      } else if (err?.code === 1) {
        setError(
          'Location permission denied. Please enable location permissions in Settings.',
        );
      } else if (err?.code === 2) {
        setError('Location unavailable. Please check your GPS settings.');
      } else if (err?.code === 3) {
        setError('Location request timed out. Please try again.');
      } else {
        setError('Location access required for weather data');
      }

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
