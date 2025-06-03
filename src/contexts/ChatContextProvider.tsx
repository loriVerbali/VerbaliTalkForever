import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import Geolocation from '@react-native-community/geolocation';

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

  // Check if data is stale (older than 3 hours)
  const isDataStale = (): boolean => {
    if (!lastUpdated) return true;
    const now = new Date();
    return now.getTime() - lastUpdated.getTime() > CACHE_DURATION;
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
      console.log('Reverse geocoding:', url);

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
      console.log('Fetching weather from:', url);

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

        const locationData: LocationData = {
          name: weatherData.location.name,
          region: weatherData.location.region,
          country: weatherData.location.country,
          localTime: weatherData.location.localtime,
          latitude: lat,
          longitude: lon,
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
    if (isDataStale()) {
      refreshWeatherData();
    }
  }, []);

  // Auto-refresh every 3 hours
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDataStale()) {
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
