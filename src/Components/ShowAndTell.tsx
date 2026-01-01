import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import Video, {OnLoadData} from 'react-native-video';

const {width} = Dimensions.get('window');

type PlaybackRate = 1 | 1.5 | 2 | 2.5;

// Base URL for remote video assets
const VIDEO_BASE_URL = 'https://pub-478619cacb0f41448d8ea23825356593.r2.dev/';

/**
 * Builds a video URL from a video name
 * @param videoName - The name of the video file (e.g., "GettingStarted", "reports")
 * @returns Video source object with URI for react-native-video
 */
const getVideoUrl = (videoName: string): {uri: string} => {
  // Remove .mp4 extension if present
  const name = videoName.replace(/\.mp4$/, '');
  return {
    uri: `${VIDEO_BASE_URL}${name}.mp4`,
  };
};

// Default video source using remote URL
const DEFAULT_VIDEO_SOURCE = getVideoUrl('GettingStarted');

interface ShowAndTellProps {
  videoSource?: any;
  context?: 'onboarding' | 'settings';
  videoList?: any[];
  currentVideoIndex?: number;
  onVideoChange?: (index: number) => void;
}

const ShowAndTell: React.FC<ShowAndTellProps> = ({
  videoSource,
  context = 'onboarding',
  videoList = [],
  currentVideoIndex = 0,
  onVideoChange,
}) => {
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const videoRef = useRef<any>(null);
  const [paused, setPaused] = useState<boolean>(true);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);

  const onLoaded = (data: OnLoadData) => {
    setDurationSeconds(data.duration);
  };

  const handleTogglePlayPause = () => {
    setPaused(prev => !prev);
  };

  const handleSelectRate = (newRate: PlaybackRate) => {
    setRate(newRate);
  };

  const handlePreviousVideo = () => {
    if (context === 'settings' && videoList.length > 0 && onVideoChange) {
      const prevIndex =
        currentVideoIndex > 0 ? currentVideoIndex - 1 : videoList.length - 1;
      onVideoChange(prevIndex);
    }
  };

  const handleNextVideo = () => {
    if (context === 'settings' && videoList.length > 0 && onVideoChange) {
      const nextIndex =
        currentVideoIndex < videoList.length - 1 ? currentVideoIndex + 1 : 0;
      onVideoChange(nextIndex);
    }
  };

  /**
   * Normalizes a video source to the format expected by react-native-video
   * Handles both require() objects, string names, and URI objects
   */
  const normalizeVideoSource = (source: any): {uri: string} => {
    // If it's already a URI object, return it
    if (source && typeof source === 'object' && source.uri) {
      return source;
    }

    // If it's a require() object (has a number or uri property), try to extract name
    // For backward compatibility, we'll try to handle require() objects
    if (source && typeof source === 'object') {
      // If it has a uri property already, use it
      if (source.uri) {
        return source;
      }
      // If it's a require() result, we can't determine the name, so fall back to default
      // This shouldn't happen in the new implementation, but handle it gracefully
      return DEFAULT_VIDEO_SOURCE;
    }

    // If it's a string, treat it as a video name
    if (typeof source === 'string') {
      return getVideoUrl(source);
    }

    // Default fallback
    return DEFAULT_VIDEO_SOURCE;
  };

  // Determine which video to show
  const getCurrentVideoSource = () => {
    if (context === 'settings' && videoList.length > 0) {
      return normalizeVideoSource(videoList[currentVideoIndex]);
    }
    return normalizeVideoSource(videoSource || DEFAULT_VIDEO_SOURCE);
  };

  // Landscape-only app: classify phone/tablet by height
  const isPhone = screenHeight < 600;
  const sizeScale = isPhone ? 0.595 : 1; // phone scale
  const isTablet = !isPhone;
  const tabletScale = isTablet ? 0.85 : 1; // reduce by 15% on tablets
  const sideColumnWidth = isPhone
    ? Math.max(75, Math.min(130, screenHeight * 0.17))
    : 0;

  return (
    <View style={styles.container}>
      <View
        style={[styles.contentContainer, isPhone ? styles.row : styles.column]}>
        {(() => {
          const aspect = 16 / 9;
          const horizontalGutter = isPhone ? 12 : 0;
          const containerPaddingFactor = isPhone ? 0.92 : 0.9;
          const baseNonPhoneHeightFactor = 0.45;
          const maxHeight =
            screenHeight *
            (isPhone ? 0.38 : baseNonPhoneHeightFactor * tabletScale);
          const availableWidth = isPhone
            ? screenWidth * containerPaddingFactor -
              sideColumnWidth -
              horizontalGutter
            : screenWidth * containerPaddingFactor;
          const maxWidth = availableWidth;
          const heightByWidth = maxWidth / aspect;
          const widthByHeight = maxHeight * aspect;
          const height = Math.min(maxHeight, heightByWidth);
          const width = Math.min(maxWidth, widthByHeight);
          return (
            <View style={[styles.videoWrapper, {width, height}]}>
              <Video
                ref={videoRef}
                source={getCurrentVideoSource()}
                disableAudioSessionManagement={true}
                style={styles.video}
                paused={paused}
                rate={rate}
                resizeMode="contain"
                controls={false}
                onLoad={onLoaded}
              />
            </View>
          );
        })()}

        {isPhone ? (
          <View style={[styles.sideControls, {width: sideColumnWidth}]}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.primaryButtonFull,
                isPhone && {
                  paddingVertical: 12 * sizeScale,
                  paddingHorizontal: 28 * sizeScale,
                  borderRadius: 30 * sizeScale,
                },
              ]}
              onPress={handleTogglePlayPause}>
              <Text
                style={[
                  styles.primaryButtonText,
                  isPhone && {fontSize: 18 * sizeScale},
                ]}>
                {paused ? 'Play' : 'Stop'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.speedColumn, isPhone && {marginTop: 8}]}>
              {[1, 1.5, 2, 2.5].map(value => {
                const isActive = rate === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => handleSelectRate(value as PlaybackRate)}
                    style={[
                      styles.speedButton,
                      styles.speedButtonFull,
                      isPhone && {
                        paddingVertical: 8 * sizeScale,
                        paddingHorizontal: 14 * sizeScale,
                        borderRadius: 18 * sizeScale,
                        marginVertical: 4 * sizeScale,
                      },
                      isActive && styles.speedButtonActive,
                    ]}>
                    <Text
                      style={[
                        styles.speedText,
                        isPhone && {fontSize: 14 * sizeScale},
                        isActive && styles.speedTextActive,
                      ]}>
                      {value}x
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isTablet && {
                    paddingVertical: 12 * tabletScale,
                    paddingHorizontal: 28 * tabletScale,
                    borderRadius: 30 * tabletScale,
                  },
                ]}
                onPress={handleTogglePlayPause}>
                <Text
                  style={[
                    styles.primaryButtonText,
                    isTablet && {fontSize: 18 * tabletScale},
                  ]}>
                  {paused ? 'Play' : 'Stop'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.speedRow}>
              {[1, 1.5, 2, 2.5].map(value => {
                const isActive = rate === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => handleSelectRate(value as PlaybackRate)}
                    style={[
                      styles.speedButton,
                      isTablet && {
                        paddingVertical: 8 * tabletScale,
                        paddingHorizontal: 14 * tabletScale,
                        borderRadius: 18 * tabletScale,
                      },
                      isActive && styles.speedButtonActive,
                    ]}>
                    <Text
                      style={[
                        styles.speedText,
                        isTablet && {fontSize: 14 * tabletScale},
                        isActive && styles.speedTextActive,
                      ]}>
                      {value}x
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Navigation buttons - only show in settings context */}
            {context === 'settings' && videoList.length > 1 && (
              <View style={styles.navigationRow}>
                <TouchableOpacity
                  style={[
                    styles.navButton,
                    isTablet && {
                      paddingVertical: 8 * tabletScale,
                      paddingHorizontal: 16 * tabletScale,
                      borderRadius: 20 * tabletScale,
                    },
                  ]}
                  onPress={handlePreviousVideo}>
                  <Text
                    style={[
                      styles.navButtonText,
                      isTablet && {fontSize: 14 * tabletScale},
                    ]}>
                    ← Previous
                  </Text>
                </TouchableOpacity>

                <Text
                  style={[
                    styles.videoCounter,
                    isTablet && {fontSize: 12 * tabletScale},
                  ]}>
                  {currentVideoIndex + 1} / {videoList.length}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.navButton,
                    isTablet && {
                      paddingVertical: 8 * tabletScale,
                      paddingHorizontal: 16 * tabletScale,
                      borderRadius: 20 * tabletScale,
                    },
                  ]}
                  onPress={handleNextVideo}>
                  <Text
                    style={[
                      styles.navButtonText,
                      isTablet && {fontSize: 14 * tabletScale},
                    ]}>
                    Next →
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Navigation buttons for phone layout - only show in settings context */}
        {isPhone && context === 'settings' && videoList.length > 1 && (
          <View style={[styles.navigationColumn, {width: sideColumnWidth}]}>
            <TouchableOpacity
              style={[
                styles.navButton,
                styles.navButtonFull,
                {
                  paddingVertical: 8 * sizeScale,
                  paddingHorizontal: 16 * sizeScale,
                  borderRadius: 20 * sizeScale,
                  marginVertical: 4 * sizeScale,
                },
              ]}
              onPress={handlePreviousVideo}>
              <Text style={[styles.navButtonText, {fontSize: 12 * sizeScale}]}>
                ← Previous
              </Text>
            </TouchableOpacity>

            <Text
              style={[
                styles.videoCounter,
                styles.videoCounterFull,
                {fontSize: 10 * sizeScale, marginVertical: 4 * sizeScale},
              ]}>
              {currentVideoIndex + 1} / {videoList.length}
            </Text>

            <TouchableOpacity
              style={[
                styles.navButton,
                styles.navButtonFull,
                {
                  paddingVertical: 8 * sizeScale,
                  paddingHorizontal: 16 * sizeScale,
                  borderRadius: 20 * sizeScale,
                  marginVertical: 4 * sizeScale,
                },
              ]}
              onPress={handleNextVideo}>
              <Text style={[styles.navButtonText, {fontSize: 12 * sizeScale}]}>
                Next →
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {durationSeconds > 0 && (
        <Text
          style={[
            styles.durationText,
            isPhone && {fontSize: 10 * sizeScale, marginTop: 6 * sizeScale},
            !isPhone && {
              fontSize: 12 * tabletScale,
              marginTop: 8 * tabletScale,
            },
          ]}>
          Approx. {(durationSeconds / 60).toFixed(1)} minutes
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    width: '95%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  column: {
    flexDirection: 'column',
  },
  videoWrapper: {
    width: '90%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 16,
  },
  sideControls: {
    marginLeft: 12,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  primaryButton: {
    backgroundColor: 'rgba(20, 108, 240, 0.75)',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 30,
  },
  primaryButtonFull: {
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  speedColumn: {
    marginTop: 12,
  },
  speedButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(20, 108, 240, 0.45)',
    backgroundColor: '#fff',
    marginHorizontal: 6,
  },
  speedButtonFull: {
    width: '100%',
    marginHorizontal: 0,
    marginVertical: 4,
    alignItems: 'center',
  },
  speedButtonActive: {
    backgroundColor: 'rgba(20, 108, 240, 0.08)',
    borderColor: 'rgba(20, 108, 240, 0.9)',
  },
  speedText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '700',
  },
  speedTextActive: {
    color: 'rgba(20, 108, 240, 0.9)',
  },
  durationText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
  },
  navigationColumn: {
    marginTop: 12,
    alignItems: 'stretch',
  },
  navButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(20, 108, 240, 0.45)',
    backgroundColor: '#fff',
    marginHorizontal: 6,
  },
  navButtonFull: {
    width: '100%',
    marginHorizontal: 0,
    alignItems: 'center',
  },
  navButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '700',
  },
  videoCounter: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  videoCounterFull: {
    textAlign: 'center',
  },
});

export default ShowAndTell;
