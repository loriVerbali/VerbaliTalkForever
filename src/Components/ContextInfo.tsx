import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {useChatContext} from '../contexts/ChatContextProvider';
import {useAdmin} from '../contexts/adminContext';

const {width, height} = Dimensions.get('window');

interface ContextInfoProps {
  visible: boolean;
  onClose: () => void;
}

const ContextInfo: React.FC<ContextInfoProps> = ({visible, onClose}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const {
    weather,
    location,
    loading,
    error,
    lastUpdated,
    refreshWeatherData,
    isDataStale,
  } = useChatContext();

  const {isTablet} = useAdmin();
  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  // Refresh weather data when modal opens if data is stale
  useEffect(() => {
    if (visible && isDataStale()) {
      refreshWeatherData();
    }
  }, [visible, isDataStale, refreshWeatherData]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={isTablet ? styles.container : styles.containerMobile}>
          <View style={styles.header}>
            <Text style={styles.title}> Information</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={styles.columnsContainer}>
              {/* Current Time */}
              <View style={styles.column}>
                <Text style={styles.sectionTitle}>🕐 Time</Text>
                <Text style={styles.infoText}>{currentTime}</Text>
              </View>

              {/* Location */}
              <View style={styles.column}>
                <Text style={styles.sectionTitle}>📍 Location</Text>
                {location ? (
                  <View>
                    {location.specialPlace ? (
                      <View style={styles.specialPlaceContainer}>
                        <Text style={styles.specialPlaceIcon}>
                          {location.specialPlace.type === 'home'
                            ? '🏠'
                            : location.specialPlace.type === 'school'
                            ? '🏫'
                            : '🏥'}
                        </Text>
                        <Text style={styles.specialPlaceText} numberOfLines={2}>
                          {location.specialPlace.name}
                        </Text>
                        <Text
                          style={styles.specialPlaceSubtext}
                          numberOfLines={1}>
                          Special Place
                        </Text>
                      </View>
                    ) : location.display_name ? (
                      <Text style={styles.infoText} numberOfLines={3}>
                        {location.display_name}
                      </Text>
                    ) : (
                      <Text style={styles.infoText}>
                        {location.name}, {location.region}, {location.country}
                      </Text>
                    )}
                    {/* {location.address && (
                      <View style={styles.addressDetails}>
                        {location.address.road && (
                          <Text style={styles.addressText} numberOfLines={1}>
                            📍 {location.address.road}
                            {location.address.house_number &&
                              ` ${location.address.house_number}`}
                          </Text>
                        )}
                        {location.address.neighbourhood && (
                          <Text style={styles.addressText} numberOfLines={1}>
                            🏘️ {location.address.neighbourhood}
                          </Text>
                        )}
                        {location.address.city && location.address.state && (
                          <Text style={styles.addressText} numberOfLines={1}>
                            🏙️ {location.address.city}, {location.address.state}
                          </Text>
                        )}
                        {location.address.postcode && (
                          <Text style={styles.addressText} numberOfLines={1}>
                            📮 {location.address.postcode}
                          </Text>
                        )}
                      </View>
                    )} */}
                  </View>
                ) : (
                  <Text style={styles.infoText}>Location access required</Text>
                )}
              </View>

              {/* Weather */}
              <View style={styles.column}>
                <Text style={styles.sectionTitle}>🌤️ Weather</Text>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading...</Text>
                  </View>
                ) : error ? (
                  <View>
                    <Text style={styles.errorText} numberOfLines={2}>
                      {error}
                    </Text>
                    {!location && null}
                    {location && (
                      <Pressable
                        style={styles.retryButton}
                        onPress={refreshWeatherData}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                      </Pressable>
                    )}
                  </View>
                ) : weather ? (
                  <View style={styles.weatherContainer}>
                    <Text style={styles.temperatureText}>
                      {weather.temperature}°F
                    </Text>
                    <Text style={styles.descriptionText} numberOfLines={2}>
                      {weather.description.charAt(0).toUpperCase() +
                        weather.description.slice(1)}
                    </Text>
                    <Text style={styles.feelsLikeText}>
                      Feels like {weather.feelsLike}°F
                    </Text>
                    <View style={styles.weatherDetails}>
                      <Text style={styles.detailText}>
                        Humidity: {weather.humidity}%
                      </Text>
                      <Text style={styles.detailText}>
                        Wind: {weather.windSpeed} mph
                      </Text>
                    </View>
                    <View style={styles.weatherDetails}>
                      <Text style={styles.detailText}>
                        UV: {weather.uvIndex}
                      </Text>
                      <Text style={styles.detailText}>
                        Vis: {weather.visibility} mi
                      </Text>
                    </View>
                    {lastUpdated && (
                      <Text style={styles.lastUpdatedText} numberOfLines={1}>
                        Updated: {lastUpdated.toLocaleTimeString()}
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.4,
    minHeight: height * 0.3,
  },
  containerMobile: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.7,
    minHeight: height * 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  columnsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  column: {
    flex: 1,
    paddingHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    textAlign: 'center',
  },
  weatherContainer: {
    alignItems: 'center',
  },
  temperatureText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  descriptionText: {
    fontSize: 12,
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
  },
  feelsLikeText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 6,
    textAlign: 'center',
  },
  weatherDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 10,
    color: '#666',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 6,
  },
  retryButtonText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
  },
  lastUpdatedText: {
    fontSize: 10,
    color: '#999',
    marginTop: 6,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  addressDetails: {
    marginTop: 6,
  },
  addressText: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
    textAlign: 'center',
  },
  specialPlaceContainer: {
    alignItems: 'center',
  },
  specialPlaceIcon: {
    fontSize: 20,
    marginBottom: 4,
    textAlign: 'center',
  },
  specialPlaceText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 2,
  },
  specialPlaceSubtext: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
});

export default ContextInfo;
