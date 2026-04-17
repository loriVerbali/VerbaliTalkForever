import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Switch,
  Pressable,
  Dimensions,
  StatusBar,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
  TextInput,
  Alert,
  Keyboard,
  ActivityIndicator

} from 'react-native';
import Video from 'react-native-video';
import {
  useNavigation,
  CommonActions,
  useFocusEffect,
  useRoute,
} from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import { useAppSettings } from '../utils/persistance';
import { sessionManager } from '../utils/sessionManager';
import { useAdmin } from '../contexts/adminContext';
import { stacks, views } from '../utils/constants';
import Slider from '@react-native-community/slider';
import FamilyPics, { FamilyMember } from '../Components/FamilyPics';
import SpecialPlaces from '../Components/SpecialPlaces';
import MyPepesAndStuff from '../Components/MyPepesAndStuff';
import My8WordsCustomizer from '../Components/My8WordsCustomizer';
import mixpanel from '../utils/mixpanelInstance';
import fetchHelper from '../utils/fetcher';
import WhisperDownload from '../Components/WhisperDownload';
import ShowAndTell from '../Components/ShowAndTell';
import AppRatingModal from '../Components/AppRatingModal';
import NetInfo from '@react-native-community/netinfo';
import { ProfileExportService } from '../services/ProfileExportService';
import { ProfileImportService } from '../services/ProfileImportService';

const { height, width: SCREEN_WIDTH } = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40;

// Base URL for remote video assets
const VIDEO_BASE_URL = 'https://pub-478619cacb0f41448d8ea23825356593.r2.dev/';

/**
 * Builds a video URL from a video name
 * @param videoName - The name of the video file (e.g., "homescreen", "reports")
 * @returns Video source object with URI for react-native-video
 */
const getVideoUrl = (videoName: string): { uri: string } => {
  return {
    uri: `${VIDEO_BASE_URL}${videoName}.mp4`,
  };
};

type WebViewParams = {
  url: string;
  title: string;
};

type RootStackParamList = {
  WebView: WebViewParams;
  INITSTACK: undefined;
};

const InfoModal = ({
  visible,
  onClose,
  title,
  description,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
}) => {

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalDescription}>{description}</Text>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={() => {
              mixpanel.track('Settings Info Modal Got It Pressed', {
                modalTitle: title,
              });
              onClose();
            }}>
            <Text style={styles.modalButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// Individual slider components
const MessagesSlider = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const { width: windowWidth } = useWindowDimensions();

  const sliderWidth = windowWidth * 0.42 - 40; // 42% of screen width minus padding

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <View style={[styles.sliderContainer, { width: windowWidth * 0.42 }]}>
      <View style={styles.labelRow}>
        <Text style={styles.settingLabel}>Amount of messages</Text>
        <TouchableOpacity
          onPress={() => {
            mixpanel.track('Settings Info Button Pressed', {
              infoType: 'Amount of Messages',
            });
            setShowInfo(true);
          }}
          style={styles.infoButton}>
          <Text style={styles.infoIcon}>?</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sliderRow}>
        <Slider
          style={[styles.slider, { width: sliderWidth }]}
          value={localValue}
          minimumValue={5}
          maximumValue={15}
          step={5}
          minimumTrackTintColor="#8E24AA"
          maximumTrackTintColor="#d3d3d3"
          thumbTintColor="#8E24AA"
          onValueChange={setLocalValue}
          onSlidingComplete={onChange}
        />
        <Text style={styles.valueText}>{localValue}</Text>
      </View>
      <InfoModal
        visible={showInfo}
        onClose={() => setShowInfo(false)}
        title="Amount of Messages"
        description="Controls how many messages are returned in a conversation. More messages provide more context but may slow down the response time. Choose 5 for quick responses, 10 for balanced context, or 15 for detailed conversations."
      />
    </View>
  );
};

const RangeSlider = ({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  description: string;
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const { width: windowWidth } = useWindowDimensions();

  const sliderWidth = windowWidth * 0.42 - 40; // 42% of screen width minus padding

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <View style={[styles.sliderContainer, { width: windowWidth * 0.42 }]}>
      <View style={styles.labelRow}>
        <Text style={styles.settingLabel}>{label}</Text>
        <TouchableOpacity
          onPress={() => {
            mixpanel.track('Settings Info Button Pressed', {
              infoType: label,
            });
            setShowInfo(true);
          }}
          style={styles.infoButton}>
          <Text style={styles.infoIcon}>?</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sliderRow}>
        <Slider
          style={[styles.slider, { width: sliderWidth }]}
          value={localValue}
          minimumValue={4}
          maximumValue={8}
          step={1}
          minimumTrackTintColor="#8E24AA"
          maximumTrackTintColor="#d3d3d3"
          thumbTintColor="#8E24AA"
          onValueChange={setLocalValue}
          onSlidingComplete={onChange}
        />
        <Text style={styles.valueText}>{localValue}</Text>
      </View>
      <InfoModal
        visible={showInfo}
        onClose={() => setShowInfo(false)}
        title={label}
        description={description}
      />
    </View>
  );
};

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { preferences, setItem, getItem, clear, restartApp } = useAppSettings();
  // Removed Auth0 - using guest sessions
  const { isTablet } = useAdmin();
  const [isConnected, setIsConnected] = useState(true);

  const [returnedMessages, setReturnedMessages] = useState(5);
  const [topicsCount, setTopicsCount] = useState(4);
  const [actionsCount, setActionsCount] = useState(4);
  const [objectsCount, setObjectsCount] = useState(4);
  const [showOnboardingEnabled, setShowOnboardingEnabled] = useState(true);

  const [showAdminCodeModal, setShowAdminCodeModal] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [isEditingAdminCode, setIsEditingAdminCode] = useState(false);
  const [newAdminCode, setNewAdminCode] = useState('');
  const [adminCodeError, setAdminCodeError] = useState('');
  const [isAdminCodeVisible, setIsAdminCodeVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [gobackAfterSelection, setGobackAfterSelection] = useState(true);
  const [showGobackAfterSelectionInfo, setShowGobackAfterSelectionInfo] =
    useState(false);
  const [showGenderInfo, setShowGenderInfo] = useState(false);
  // Hero name state
  const [heroName, setHeroName] = useState('Name');
  const [isEditingHeroName, setIsEditingHeroName] = useState(false);
  const [newHeroName, setNewHeroName] = useState('');
  const [heroNameError, setHeroNameError] = useState('');
  // Handshake message state
  const [handshakeMessage, setHandshakeMessage] = useState(
    'Hello! How can I help you today?',
  );
  const [isEditingHandshakeMessage, setIsEditingHandshakeMessage] =
    useState(false);
  const [newHandshakeMessage, setNewHandshakeMessage] = useState('');
  const [handshakeMessageError, setHandshakeMessageError] = useState('');
  // Whisper settings state
  const [useLocalWhisper, setUseLocalWhisper] = useState(true);
  const [showWhisperInfo, setShowWhisperInfo] = useState(false);
  const [whisperModelAvailable, setWhisperModelAvailable] = useState(false);
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);

  // Easter egg: tap version 5 times to show assistant ID
  const [aboutTapCount, setAboutTapCount] = useState(0);
  const [showAssistantId, setShowAssistantId] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedVideoSource, setSelectedVideoSource] = useState<any>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [watchedVideos, setWatchedVideos] = useState<Set<number>>(new Set());
  const [sessionResetTrigger, setSessionResetTrigger] = useState(0);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Video list for navigation - using remote URLs
  const videoList = [
    'homescreen',
    'question',
    'convo',
    'reports',
    'personalization',
    'boardCustomize',
  ];

  const genderWrapperStyle = [
    styles.genderImageWrapper,
    { transform: [{ scale: 0.7 }] },
  ];

  // Helper function to get avatar source based on gender
  const getAvatarSource = (gender: string) => {
    switch (gender) {
      case 'white boy':
      case 'boy':
        return require('../assets/gender/wboy.jpg');
      case 'black boy':
        return require('../assets/gender/bboy.jpg');
      case 'asian boy':
        return require('../assets/gender/aboy.jpg');
      case 'white girl':
        return require('../assets/gender/wgirl.jpg');
      case 'black girl':
        return require('../assets/gender/bgirl.jpg');
      case 'asian girl':
        return require('../assets/gender/agirl.jpg');
      default:
        return require('../assets/gender/wboy.jpg'); // fallback
    }
  };

  // Monitor network connection state
  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected ?? false);
    });

    // Subscribe to connection changes
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    mixpanel.track('Settings', {
      Opened: 'Settings',
    });

    // Reset session gates when Settings page is opened
    setSessionResetTrigger(prev => prev + 1);

    const loadSettings = async () => {
      try {
        const savedReturnedMessages = await getItem('returnedMessages');
        const savedTopicsCount = await getItem('topicsCount');
        const savedActionsCount = await getItem('actionsCount');
        const savedObjectsCount = await getItem('objectsCount');
        const wasOnboarded = await getItem('wasOnboarded');
        const savedAdminCode = await getItem('adminCode');
        const savedConversationMode = await getItem('conversationMode');
        const savedGobackAfterSelection = await getItem('gobackAfterSelection');
        const savedHeroName = await getItem('heroName');
        const savedHandshakeMessage = await getItem('handshakeMessage');
        const savedUseLocalWhisper = await getItem('useLocalWhisper');

        setReturnedMessages(parseInt(savedReturnedMessages) || 5);
        setTopicsCount(parseInt(savedTopicsCount) || 4);
        setActionsCount(parseInt(savedActionsCount) || 4);
        setObjectsCount(parseInt(savedObjectsCount) || 4);
        setShowOnboardingEnabled(wasOnboarded !== '1');
        setAdminCode(savedAdminCode || '');
        setGobackAfterSelection(savedGobackAfterSelection === '1');
        setHeroName(
          savedHeroName && savedHeroName.trim() ? savedHeroName : 'Name',
        );
        setHandshakeMessage(
          savedHandshakeMessage && savedHandshakeMessage.trim()
            ? savedHandshakeMessage
            : 'Hello! How can I help you today?',
        );
        setUseLocalWhisper(savedUseLocalWhisper === '1');
        setWhisperModelAvailable(preferences.whisperModelAvailable === '1');
      } catch (e) { }
    };

    loadSettings();
    loadWatchedVideos();

    // Reset tap count and assistant id visibility on unmount
    return () => {
      setAboutTapCount(0);
      setShowAssistantId(false);
    };
  }, []);

  // Detect navigation from Reports and show rating modal
  useFocusEffect(
    React.useCallback(() => {
      const checkForRatingPrompt = async () => {
        try {
          // Get route params to check if we came from Reports
          const params = (route.params as any) || {};
          const fromReports = params.fromReports === true;

          if (fromReports) {
            // Check if user has already dismissed the prompt
            const ratingPromptShown = await getItem('ratingPromptShown');
            const ratingPromptDismissed = await getItem(
              'ratingPromptDismissed',
            );

            // Only show if not permanently dismissed
            // Allow showing again if user hasn't permanently dismissed it
            if (ratingPromptDismissed !== '1') {
              // Small delay to ensure screen is fully rendered
              setTimeout(() => {
                setShowRatingModal(true);
                if (ratingPromptShown !== '1') {
                  setItem('ratingPromptShown', '1');
                }
              }, 500);
            }
          }
        } catch (error) { }
      };

      checkForRatingPrompt();
    }, [route, getItem, setItem]),
  );

  const handleRatingModalClose = async () => {
    setShowRatingModal(false);
  };

  const handleRatingModalDismiss = async () => {
    // Mark as permanently dismissed so it never shows again
    await setItem('ratingPromptDismissed', '1');
  };

  // Removed logout functionality - guest sessions don't need logout

  const handleLinkPress = (url: string, title: string) => {
    mixpanel.track('Settings Legal Link Pressed', {
      linkTitle: title,
      linkUrl: url,
    });
    navigation.navigate(
      'WebView' as never,
      {
        url,
        title,
      } as never,
    );
  };

  const handleMessagesChange = (value: number) => {
    const newValue = Math.round(value);
    setReturnedMessages(newValue);
    setItem('returnedMessages', newValue.toString());
  };

  const handleTopicsChange = (value: number) => {
    const newValue = Math.round(value);
    setTopicsCount(newValue);
    setItem('topicsCount', newValue.toString());
  };

  const handleActionsChange = (value: number) => {
    const newValue = Math.round(value);
    setActionsCount(newValue);
    setItem('actionsCount', newValue.toString());
  };

  const handleObjectsChange = (value: number) => {
    const newValue = Math.round(value);
    setObjectsCount(newValue);
    setItem('objectsCount', newValue.toString());
  };

  const handleOnboardingToggle = async (value: boolean) => {
    setShowOnboardingEnabled(value);
    await setItem('wasOnboarded', value ? '0' : '1');
  };

  const handleGobackAfterSelectionToggle = async (value: boolean) => {
    mixpanel.track('Settings Go Back After Selection Changed', {
      enabled: value,
    });
    setGobackAfterSelection(value);
    await setItem('gobackAfterSelection', value ? '1' : '0');
  };

  const handleWhisperDownloadComplete = async () => {
    try {
      const WhisperModelManager = await import('../utils/WhisperModelManager');
      const modelStatus =
        await WhisperModelManager.default.checkModelAvailabilityAndAdjustSettings(
          setItem,
          getItem,
        );
      mixpanel.track('Settings Whisper Download Completed', {
        success: modelStatus.available,
      });
      setWhisperModelAvailable(modelStatus.available);
    } catch (error) {
      mixpanel.track('Settings Whisper Download Completed', {
        success: false,
        error: 'Failed to verify model',
      });
      setWhisperModelAvailable(false);
      await setItem('whisperModelAvailable', '0');
      await setItem('useLocalWhisper', '0');
    }
  };

  const handleFamilyMemberSelect = (member: FamilyMember) => {
    // You can add additional logic here if needed
  };

  const handleAdminCodeChange = async () => {
    if (newAdminCode.length !== 4) {
      setAdminCodeError('Admin code must be 4 digits');
      return;
    }

    if (isSaving) return;

    setIsSaving(true);
    try {
      await setItem('adminCode', newAdminCode);
      mixpanel.track('Settings Admin Code Changed', {
        success: true,
      });
      setAdminCode(newAdminCode);
      setNewAdminCode('');
      setIsEditingAdminCode(false);
      setAdminCodeError('');
      setIsAdminCodeVisible(false);
    } catch (e) {
      mixpanel.track('Settings Admin Code Changed', {
        success: false,
        error: 'Failed to save',
      });
      setAdminCodeError('Failed to save admin code');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    mixpanel.track('Settings Reset Installation Prompted');
    Alert.alert(
      'Reset Installation',
      'Are you sure you want to reset your installation? This action is irreversible. All your data will be deleted and you will need to go through onboarding again.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            mixpanel.track('Settings Reset Installation Cancelled');
          },
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            mixpanel.track('Settings Reset Installation Confirmed');
            deleteAccount();
          },
        },
      ],
    );
  };

  const deleteAccount = async () => {
    // For guest sessions, reset the installation instead of deleting account
    await setItem('wasOnboarded', '0');

    // Call the delete assistant endpoint if we have an assistant ID
    if (preferences.assistantId) {
      try {
        await fetchHelper(
          'deleteAccount',
          {},
          { assistantId: preferences.assistantId, userId: 'guest' },
        );
      } catch (error) { }
    }

    Alert.alert(
      'Installation Reset',
      'Your installation has been reset. The app will restart with a fresh setup.',
      [
        {
          text: 'OK',
          style: 'destructive',
          onPress: async () => {
            // Reset all user data and session
            await setItem('wasOnboarded', '0');
            await setItem('showInit', '0');
            await setItem('loggedIn', '0');
            await setItem('username', '');
            await setItem('assistantId', '');
            await setItem('conversationMode', 'easy');
            await setItem('gobackAfterSelection', '1');
            await setItem('returnedMessages', '5');
            await setItem('topicsCount', '4');
            await setItem('actionsCount', '4');
            await setItem('objectsCount', '4');
            await setItem('gender', '');
            await setItem('familyPicsData', '');
            await setItem('specialPlaces', '');
            await setItem('pepes', '');

            // Reset guest session
            await sessionManager.resetInstallation();
            await setItem('homeAddress', '');
            await setItem('homeIsCurrentLocation', '0');
            await setItem('schoolAddress', '');
            await setItem('schoolIsCurrentLocation', '0');
            await setItem('therapyAddress', '');
            await setItem('therapyIsCurrentLocation', '0');
            await setItem('wasLocationOnboarded', '0');
            await setItem('adminCode', '');
            await setItem('wasWelcomed', '0');
            await setItem('threadCreatedAt', '');
            await setItem('auth0Id', '');
            await setItem('assistantId', '');
            await setItem('heroName', '');
            await setItem('handshakeMessage', '');

            // Removed handleLogout call - guest sessions don't need logout
          },
        },
      ],
    );
  };

  const cancelAdminCodeEdit = () => {
    mixpanel.track('Settings Admin Code Edit Cancelled');
    setIsEditingAdminCode(false);
    setNewAdminCode('');
    setAdminCodeError('');
  };

  const MemoizedSlider = memo(
    ({
      value,
      min,
      max,
      step,
      onValueChange,
      onSlidingComplete,
    }: {
      value: number;
      min: number;
      max: number;
      step: number;
      onValueChange: (value: number) => void;
      onSlidingComplete: (value: number) => void;
    }) => (
      <Slider
        style={styles.slider}
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        minimumTrackTintColor="#8E24AA"
        maximumTrackTintColor="#d3d3d3"
        thumbTintColor="#8E24AA"
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
      />
    ),
  );

  const ValueSelector = ({
    label,
    value,
    onValueChange,
    min,
    max,
    step = 5,
  }: {
    label: string;
    value: number;
    onValueChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
  }) => {
    const valueRef = useRef(value);
    const [displayValue, setDisplayValue] = useState(value);

    // Update refs and state when prop value changes
    useEffect(() => {
      valueRef.current = value;
      setDisplayValue(value);
    }, [value]);

    return (
      <View style={styles.settingRow}>
        <View style={styles.labelContainer}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.valueText}>{displayValue}</Text>
        </View>
        <View style={styles.sliderContainer}>
          <Slider
            style={styles.slider}
            value={valueRef.current}
            minimumValue={min}
            maximumValue={max}
            step={step}
            minimumTrackTintColor="#8E24AA"
            maximumTrackTintColor="#d3d3d3"
            thumbTintColor="#8E24AA"
            onValueChange={val => {
              valueRef.current = val;
              setDisplayValue(val);
            }}
            onSlidingComplete={val => {
              valueRef.current = val;
              setDisplayValue(val);
              onValueChange(val);
            }}
          />
        </View>
      </View>
    );
  };

  // Hero name handlers
  const handleEditHeroName = () => {
    mixpanel.track('Settings Hero Name Edit Started');
    setNewHeroName(heroName === 'Name' ? '' : heroName);
    setIsEditingHeroName(true);
    setHeroNameError('');
  };

  const handleCancelHeroNameEdit = () => {
    mixpanel.track('Settings Hero Name Edit Cancelled');
    Keyboard.dismiss();
    setIsEditingHeroName(false);
    setNewHeroName('');
    setHeroNameError('');
  };

  const handleSaveHeroName = async () => {
    Keyboard.dismiss();
    if (!newHeroName.trim()) {
      setHeroNameError("Name can't be empty");
      return;
    }
    try {
      const oldName = heroName;
      const newName = newHeroName.trim();
      await setItem('heroName', newName);
      mixpanel.track('Settings Hero Name Changed', {
        oldName: oldName,
        newName: newName,
        success: true,
      });
      setHeroName(newName);
      setIsEditingHeroName(false);
      setHeroNameError('');
    } catch (e) {
      mixpanel.track('Settings Hero Name Changed', {
        success: false,
        error: 'Failed to save',
      });
      setHeroNameError('Failed to save name');
    }
  };

  // Handshake message handlers
  const handleEditHandshakeMessage = () => {
    mixpanel.track('Settings Handshake Message Edit Started');
    setNewHandshakeMessage(handshakeMessage);
    setIsEditingHandshakeMessage(true);
    setHandshakeMessageError('');
  };

  const handleCancelHandshakeMessageEdit = () => {
    mixpanel.track('Settings Handshake Message Edit Cancelled');
    Keyboard.dismiss();
    setIsEditingHandshakeMessage(false);
    setNewHandshakeMessage('');
    setHandshakeMessageError('');
  };

  const handleSaveHandshakeMessage = async () => {
    Keyboard.dismiss();
    if (!newHandshakeMessage.trim()) {
      setHandshakeMessageError("Handshake message can't be empty");
      return;
    }
    try {
      await setItem('handshakeMessage', newHandshakeMessage.trim());
      mixpanel.track('Settings Handshake Message Changed', {
        success: true,
      });
      setHandshakeMessage(newHandshakeMessage.trim());
      setIsEditingHandshakeMessage(false);
      setHandshakeMessageError('');
    } catch (e) {
      mixpanel.track('Settings Handshake Message Changed', {
        success: false,
        error: 'Failed to save',
      });
      setHandshakeMessageError('Failed to save handshake message');
    }
  };

  const handleVideoCardPress = (videoName: string) => {
    mixpanel.track('Settings Video Card Pressed', {
      videoName: videoName,
    });
    const index = videoList.findIndex(video => video === videoName);
    const videoIndex = index >= 0 ? index : 0;
    setCurrentVideoIndex(videoIndex);
    setSelectedVideoSource(videoName);
    setShowVideoModal(true);
    // Mark video as watched when opened
    markVideoAsWatched(videoIndex);
  };

  const handleVideoChange = (index: number) => {
    setCurrentVideoIndex(index);
    setSelectedVideoSource(videoList[index]);
  };

  // Load watched videos from persistence
  const loadWatchedVideos = async () => {
    try {
      const watchedVideosString = await getItem('watchedVideos');
      if (watchedVideosString) {
        const watchedArray = JSON.parse(watchedVideosString);
        setWatchedVideos(new Set(watchedArray));
      }
    } catch (e) { }
  };

  // Save watched videos to persistence
  const saveWatchedVideos = async (watchedSet: Set<number>) => {
    try {
      const watchedArray = Array.from(watchedSet);
      await setItem('watchedVideos', JSON.stringify(watchedArray));
    } catch (e) { }
  };

  // Mark video as watched
  const markVideoAsWatched = async (videoIndex: number) => {
    const newWatchedVideos = new Set(watchedVideos);
    newWatchedVideos.add(videoIndex);
    setWatchedVideos(newWatchedVideos);
    await saveWatchedVideos(newWatchedVideos);
  };

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExportProfile = async () => {
    Alert.alert(
      'Export Profile',
      'This will create a backup of your current configuration and modelling. Inlcuding images you uploaded. Everything will be saved in your device storage. Do you want to continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Export',
          onPress: async () => {
            setIsExporting(true);
            try {
              await ProfileExportService.exportProfile();
            } catch (error) {
              Alert.alert('Export Failed', 'An error occurred while exporting your profile. Please try again.');
              console.error(error);
            } finally {
              setIsExporting(false);
            }
          },
        },
      ],
    );
  };

  const handleImportProfile = async () => {
    Alert.alert(
      'Import Profile',
      'This will replace your current profile data. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Import',
          style: 'destructive',
          onPress: async () => {
            setIsImporting(true);
            try {
              await ProfileImportService.importProfile();
              Alert.alert(
                'Restore Complete',
                'Restore complete. Restarting Matalk.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      // Force app reload to pick up restored data
                      restartApp();
                    },
                  },
                ],
              );
            } catch (error: any) {
              if (error.message !== 'CANCELLED') {
                Alert.alert(
                  'Import Failed',
                  error.message || 'An error occurred while importing your profile. Please try again.',
                );
              }
              console.error(error);
            } finally {
              setIsImporting(false);
            }
          },
        },
      ],
    );
  };


  return (
    <View style={[styles.container, { backgroundColor: '#f8f9fe' }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            mixpanel.track('Settings Back Button Pressed');
            navigation.navigate(views.OPEN);
          }}>
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollContainer}>
        <View style={[styles.section, styles.sectionAccount]}>
          <Text style={styles.sectionTitle}>Account</Text>
          {/* Removed subscription section - this is a paid app */}
        </View>

        {showAccountSettings && (
          <>
            <View style={[styles.section, styles.sectionAccountSettings]}>
              <Text style={styles.sectionTitle}>Account Settings</Text>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Hero Name</Text>
                {/* Hero Name Edit UI */}
                {isEditingHeroName ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}>
                    <TextInput
                      style={[styles.codeInput, { flex: 1 }]}
                      value={newHeroName}
                      onChangeText={setNewHeroName}
                      placeholder="Name"
                      maxLength={32}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveHeroName}
                      blurOnSubmit={true}
                    />
                    <TouchableOpacity
                      style={[
                        styles.adminButton,
                        styles.submitButton,
                        { marginLeft: 8 },
                      ]}
                      onPress={handleSaveHeroName}>
                      <Text style={styles.buttonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.adminButton,
                        styles.cancelButton,
                        { marginLeft: 8 },
                      ]}
                      onPress={handleCancelHeroNameEdit}>
                      <Text style={styles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}>
                    <Text style={{ fontSize: 16, color: '#333', flex: 1 }}>
                      {heroName}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.adminButton,
                        styles.submitButton,
                        { marginLeft: 8 },
                      ]}
                      onPress={handleEditHeroName}>
                      <Text style={styles.buttonText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {heroNameError ? (
                  <Text style={styles.errorText}>{heroNameError}</Text>
                ) : null}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Handshake Message</Text>
                {/* Handshake Message Edit UI */}
                {isEditingHandshakeMessage ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}>
                    <TextInput
                      style={[styles.codeInput, { flex: 1 }]}
                      value={newHandshakeMessage}
                      onChangeText={setNewHandshakeMessage}
                      placeholder="Enter handshake message"
                      maxLength={100}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveHandshakeMessage}
                      blurOnSubmit={true}
                      multiline
                      numberOfLines={2}
                    />
                    <TouchableOpacity
                      style={[
                        styles.adminButton,
                        styles.submitButton,
                        { marginLeft: 8 },
                      ]}
                      onPress={handleSaveHandshakeMessage}>
                      <Text style={styles.buttonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.adminButton,
                        styles.cancelButton,
                        { marginLeft: 8 },
                      ]}
                      onPress={handleCancelHandshakeMessageEdit}>
                      <Text style={styles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}>
                    <Text style={{ fontSize: 16, color: '#333', flex: 1 }}>
                      {handshakeMessage}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.adminButton,
                        styles.submitButton,
                        { marginLeft: 8 },
                      ]}
                      onPress={handleEditHandshakeMessage}>
                      <Text style={styles.buttonText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {handshakeMessageError ? (
                  <Text style={styles.errorText}>{handshakeMessageError}</Text>
                ) : null}
              </View>

              {/*   <View style={styles.sliderGrid}>
                <View style={styles.sliderRow}>
                <MessagesSlider
                  value={returnedMessages}
                  onChange={handleMessagesChange}
                />
                <RangeSlider
                  label="Amount of Topics"
                  value={topicsCount}
                  onChange={handleTopicsChange}
                  description="Determines the number of conversation topics available. More topics provide variety but may make selection more complex. 4-6 topics are recommended for focused conversations, 7-8 for broader discussions."
                />
              </View> */}

              {/* <View style={styles.sliderRow}>
                <RangeSlider
                  label="Amount of Actions"
                  value={actionsCount}
                  onChange={handleActionsChange}
                  description="Sets the number of available actions in conversations. More actions offer flexibility but may increase complexity. 4-6 actions work well for most conversations, 7-8 for more detailed interactions."
                />
                <RangeSlider
                  label="Amount of Objects"
                  value={objectsCount}
                  onChange={handleObjectsChange}
                  description="Controls the number of objects that can be referenced in conversations. More objects allow for richer context but may increase complexity. 4-6 objects are ideal for most cases, 7-8 for detailed scenarios."
                />
              </View>
              </View> */}
            </View>

            <View style={[styles.section, styles.sectionReports]}>
              <Text style={styles.sectionTitle}>
                Reports : Analytics & Insights
              </Text>
              <Text style={styles.aboutDescription}>
                View detailed analytics and insights about usage, performance,
                and engagement metrics.
              </Text>
              <View style={styles.reportsCardsContainer}>
                <TouchableOpacity
                  style={styles.reportsCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    mixpanel.track('Settings Reports Card Pressed', {
                      cardType: 'Total Utterances',
                    });
                    navigation.navigate(views.REPORTS);
                  }}>
                  <View style={styles.reportsCardContent}>
                    <Text style={styles.reportsCardTitle}>
                      Total Utterances
                    </Text>
                    <Text style={styles.reportsCardInsight}>
                      Track usage patterns and most frequently used words
                    </Text>
                    <TouchableOpacity
                      style={styles.reportsCardButton}
                      activeOpacity={0.8}
                      onPress={e => {
                        e.stopPropagation();
                        mixpanel.track('Settings Reports Card Button Pressed', {
                          cardType: 'Total Utterances',
                        });
                        navigation.navigate(views.REPORTS);
                      }}>
                      <Text style={styles.reportsCardButtonText}>
                        enter reports
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reportsCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    mixpanel.track('Settings Reports Card Pressed', {
                      cardType: 'Classic Words Board',
                    });
                    navigation.navigate(views.REPORTS);
                  }}>
                  <View style={styles.reportsCardContent}>
                    <Text style={styles.reportsCardTitle}>
                      Classic Words Board
                    </Text>
                    <Text style={styles.reportsCardInsight}>
                      Monitor sentence building speed and efficiency
                    </Text>
                    <TouchableOpacity
                      style={styles.reportsCardButton}
                      activeOpacity={0.8}
                      onPress={e => {
                        e.stopPropagation();
                        mixpanel.track('Settings Reports Card Button Pressed', {
                          cardType: 'Classic Words Board',
                        });
                        navigation.navigate(views.REPORTS);
                      }}>
                      <Text style={styles.reportsCardButtonText}>
                        enter reports
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reportsCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    mixpanel.track('Settings Reports Card Pressed', {
                      cardType: 'AI Response Time',
                    });
                    navigation.navigate(views.REPORTS);
                  }}>
                  <View style={styles.reportsCardContent}>
                    <Text style={styles.reportsCardTitle}>
                      AI Response Time
                    </Text>
                    <Text style={styles.reportsCardInsight}>
                      Analyze how quickly questions are answered
                    </Text>
                    <TouchableOpacity
                      style={styles.reportsCardButton}
                      activeOpacity={0.8}
                      onPress={e => {
                        e.stopPropagation();
                        mixpanel.track('Settings Reports Card Button Pressed', {
                          cardType: 'AI Response Time',
                        });
                        navigation.navigate(views.REPORTS);
                      }}>
                      <Text style={styles.reportsCardButtonText}>
                        enter reports
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reportsCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    mixpanel.track('Settings Reports Card Pressed', {
                      cardType: 'AI Questions Answered',
                    });
                    navigation.navigate(views.REPORTS);
                  }}>
                  <View style={styles.reportsCardContent}>
                    <Text style={styles.reportsCardTitle}>
                      AI Questions Answered
                    </Text>
                    <Text style={styles.reportsCardInsight}>
                      See question resolution rates and rounds needed
                    </Text>
                    <TouchableOpacity
                      style={styles.reportsCardButton}
                      activeOpacity={0.8}
                      onPress={e => {
                        e.stopPropagation();
                        mixpanel.track('Settings Reports Card Button Pressed', {
                          cardType: 'AI Questions Answered',
                        });
                        navigation.navigate(views.REPORTS);
                      }}>
                      <Text style={styles.reportsCardButtonText}>
                        enter reports
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            {isConnected && (
              <View style={[styles.section, styles.sectionHelpCenter]}>
                <Text style={styles.sectionTitle}>Help and Learn Center</Text>
                <Text style={styles.aboutDescription}>
                  Your help and learn center for getting started with MaTalk AI.
                </Text>

                {/* Checklist Cards Grid - Single Row Layout */}
                <View style={styles.checklistGrid}>
                  <View
                    style={[
                      styles.checklistRow,
                      isTablet && styles.checklistRowTablet,
                    ]}>
                    <TouchableOpacity
                      style={[
                        styles.checklistCard,
                        isTablet && styles.checklistCardTablet,
                      ]}
                      onPress={() => handleVideoCardPress('homescreen')}>
                      <View style={styles.videoContainer}>
                        <Video
                          disableAudioSessionManagement={true}
                          source={getVideoUrl('homescreen')}
                          style={styles.video}
                          resizeMode="cover"
                          paused={true}
                          muted={true}
                          repeat={false}
                          controls={false}
                        />
                        {watchedVideos.has(0) && (
                          <View
                            style={[
                              styles.videoHeartOverlay,
                              isTablet && styles.videoHeartOverlayTablet,
                            ]}>
                            <Text
                              style={[
                                styles.videoHeartIcon,
                                isTablet && styles.videoHeartIconTablet,
                              ]}>
                              ♥
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.checklistCardTitle,
                          isTablet && styles.checklistCardTitleTablet,
                        ]}>
                        Home Screen
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.checklistCard,
                        isTablet && styles.checklistCardTablet,
                      ]}
                      onPress={() => handleVideoCardPress('question')}>
                      <View style={styles.videoContainer}>
                        <Video
                          disableAudioSessionManagement={true}
                          source={getVideoUrl('question')}
                          style={styles.video}
                          resizeMode="cover"
                          paused={true}
                          muted={true}
                          repeat={false}
                          controls={false}
                        />
                        {watchedVideos.has(1) && (
                          <View
                            style={[
                              styles.videoHeartOverlay,
                              isTablet && styles.videoHeartOverlayTablet,
                            ]}>
                            <Text
                              style={[
                                styles.videoHeartIcon,
                                isTablet && styles.videoHeartIconTablet,
                              ]}>
                              ♥
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.checklistCardTitle,
                          isTablet && styles.checklistCardTitleTablet,
                        ]}>
                        Responding to a question
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.checklistCard,
                        isTablet && styles.checklistCardTablet,
                      ]}
                      onPress={() => handleVideoCardPress('convo')}>
                      <View style={styles.videoContainer}>
                        <Video
                          disableAudioSessionManagement={true}
                          source={getVideoUrl('convo')}
                          style={styles.video}
                          resizeMode="cover"
                          paused={true}
                          muted={true}
                          repeat={false}
                          controls={false}
                        />
                        {watchedVideos.has(2) && (
                          <View
                            style={[
                              styles.videoHeartOverlay,
                              isTablet && styles.videoHeartOverlayTablet,
                            ]}>
                            <Text
                              style={[
                                styles.videoHeartIcon,
                                isTablet && styles.videoHeartIconTablet,
                              ]}>
                              ♥
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.checklistCardTitle,
                          isTablet && styles.checklistCardTitleTablet,
                        ]}>
                        Start a conversation
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.checklistCard,
                        isTablet && styles.checklistCardTablet,
                      ]}
                      onPress={() => handleVideoCardPress('reports')}>
                      <View style={styles.videoContainer}>
                        <Video
                          disableAudioSessionManagement={true}
                          source={getVideoUrl('reports')}
                          style={styles.video}
                          resizeMode="cover"
                          paused={true}
                          muted={true}
                          repeat={false}
                          controls={false}
                        />
                        {watchedVideos.has(3) && (
                          <View
                            style={[
                              styles.videoHeartOverlay,
                              isTablet && styles.videoHeartOverlayTablet,
                            ]}>
                            <Text
                              style={[
                                styles.videoHeartIcon,
                                isTablet && styles.videoHeartIconTablet,
                              ]}>
                              ♥
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.checklistCardTitle,
                          isTablet && styles.checklistCardTitleTablet,
                        ]}>
                        Reports
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.checklistCard,
                        isTablet && styles.checklistCardTablet,
                      ]}
                      onPress={() => handleVideoCardPress('personalization')}>
                      <View style={styles.videoContainer}>
                        <Video
                          disableAudioSessionManagement={true}
                          source={getVideoUrl('personalization')}
                          style={styles.video}
                          resizeMode="cover"
                          paused={true}
                          muted={true}
                          repeat={false}
                          controls={false}
                        />
                        {watchedVideos.has(4) && (
                          <View
                            style={[
                              styles.videoHeartOverlay,
                              isTablet && styles.videoHeartOverlayTablet,
                            ]}>
                            <Text
                              style={[
                                styles.videoHeartIcon,
                                isTablet && styles.videoHeartIconTablet,
                              ]}>
                              ♥
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.checklistCardTitle,
                          isTablet && styles.checklistCardTitleTablet,
                        ]}>
                        Personalize Your Experience
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.checklistCard,
                        isTablet && styles.checklistCardTablet,
                      ]}
                      onPress={() => handleVideoCardPress('boardCustomize')}>
                      <View style={styles.videoContainer}>
                        <Video
                          disableAudioSessionManagement={true}
                          source={getVideoUrl('boardCustomize')}
                          style={styles.video}
                          resizeMode="cover"
                          paused={true}
                          muted={true}
                          repeat={false}
                          controls={false}
                        />
                        {watchedVideos.has(5) && (
                          <View
                            style={[
                              styles.videoHeartOverlay,
                              isTablet && styles.videoHeartOverlayTablet,
                            ]}>
                            <Text
                              style={[
                                styles.videoHeartIcon,
                                isTablet && styles.videoHeartIconTablet,
                              ]}>
                              ♥
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.checklistCardTitle,
                          isTablet && styles.checklistCardTitleTablet,
                        ]}>
                        Board Customize
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            <View style={[styles.section, styles.sectionPersonalize]}>
              <Text style={styles.sectionTitle}>
                Personalize Your Experience
              </Text>
              <Text style={styles.aboutDescription}>
                Personalize your experience with MaTalk AI.
              </Text>

              <View style={styles.myPepesSection}>
                <Text style={[styles.settingLabel, { fontWeight: '600' }]}>
                  My People & Stuff
                </Text>
                <Text style={styles.myPepesDescription}>
                  Your people, stuff, food, drinks, places, and tv shows with
                  images, names, and aliases for better conversation context.
                  <Text style={{ fontWeight: '800', color: '#666' }}>
                    All Images are kept on your device only.
                  </Text>
                </Text>
                <MyPepesAndStuff resetSessionTrigger={sessionResetTrigger} />
              </View>

              <View style={styles.my8WordsSection}>
                <Text style={[styles.settingLabel, { fontWeight: '600' }]}>
                  My 8 Words
                </Text>
                <Text style={styles.my8WordsDescription}>
                  Customize the 8 words that appear on your main screen cards.
                  Search for words and their images to personalize your
                  experience.
                  <Text style={{ fontWeight: '800', color: '#666' }}>
                    Images are downloaded and stored on your device only.
                  </Text>
                </Text>
                <My8WordsCustomizer isTablet={isTablet} />
              </View>

              <View style={styles.genderSection}>
                <View style={styles.genderHeader}>
                  <View style={styles.genderLabelContainer}>
                    <Text style={styles.settingLabel}>
                      Your Hero's Avatar(optional)
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        mixpanel.track('Settings Info Button Pressed', {
                          infoType: 'Gender Selection',
                        });
                        setShowGenderInfo(true);
                      }}
                      style={styles.infoButton}>
                      <Text style={styles.infoIcon}>?</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.currentAvatarContainer}>
                  <View style={styles.currentAvatarDisplay}>
                    {preferences.gender === 'other' || !preferences.gender ? (
                      <View style={styles.noAvatarContainer}>
                        <Text style={styles.noAvatarText}>No Avatar</Text>
                      </View>
                    ) : (
                      <View style={styles.selectedAvatarWrapper}>
                        <FastImage
                          source={getAvatarSource(preferences.gender)}
                          style={styles.currentAvatarImage}
                          resizeMode={FastImage.resizeMode.contain}
                        />
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.showMoreButton}
                      onPress={() => {
                        mixpanel.track('Settings Avatar Options Toggled', {
                          showOptions: !showAvatarOptions,
                        });
                        setShowAvatarOptions(!showAvatarOptions);
                      }}>
                      <Text style={styles.showMoreButtonText}>
                        {showAvatarOptions ? 'Hide' : 'Show More'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showAvatarOptions && (
                  <View style={styles.avatarOptionsContainer}>
                    <View style={styles.avatarOptionsGrid}>
                      <TouchableOpacity
                        style={[
                          styles.avatarOption,
                          (preferences.gender === 'white boy' ||
                            preferences.gender === 'boy') &&
                          styles.selectedAvatarOption,
                        ]}
                        onPress={() => {
                          mixpanel.track('Settings Avatar Selected', {
                            avatar: 'white boy',
                            previousAvatar: preferences.gender || 'none',
                          });
                          setItem('gender', 'white boy');
                          setShowAvatarOptions(false);
                        }}>
                        <View style={styles.avatarOptionWrapper}>
                          {(preferences.gender === 'white boy' ||
                            preferences.gender === 'boy') && (
                              <Text style={styles.avatarHeartOverlay}>♥</Text>
                            )}
                          <FastImage
                            source={require('../assets/gender/wboy.jpg')}
                            style={styles.avatarOptionImage}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.avatarOption,
                          preferences.gender === 'black boy' &&
                          styles.selectedAvatarOption,
                        ]}
                        onPress={() => {
                          mixpanel.track('Settings Avatar Selected', {
                            avatar: 'black boy',
                            previousAvatar: preferences.gender || 'none',
                          });
                          setItem('gender', 'black boy');
                          setShowAvatarOptions(false);
                        }}>
                        <View style={styles.avatarOptionWrapper}>
                          {preferences.gender === 'black boy' && (
                            <Text style={styles.avatarHeartOverlay}>♥</Text>
                          )}
                          <FastImage
                            source={require('../assets/gender/bboy.jpg')}
                            style={styles.avatarOptionImage}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.avatarOption,
                          preferences.gender === 'asian boy' &&
                          styles.selectedAvatarOption,
                        ]}
                        onPress={() => {
                          mixpanel.track('Settings Avatar Selected', {
                            avatar: 'asian boy',
                            previousAvatar: preferences.gender || 'none',
                          });
                          setItem('gender', 'asian boy');
                          setShowAvatarOptions(false);
                        }}>
                        <View style={styles.avatarOptionWrapper}>
                          {preferences.gender === 'asian boy' && (
                            <Text style={styles.avatarHeartOverlay}>♥</Text>
                          )}
                          <FastImage
                            source={require('../assets/gender/aboy.jpg')}
                            style={styles.avatarOptionImage}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.avatarOption,
                          preferences.gender === 'white girl' &&
                          styles.selectedAvatarOption,
                        ]}
                        onPress={() => {
                          mixpanel.track('Settings Avatar Selected', {
                            avatar: 'white girl',
                            previousAvatar: preferences.gender || 'none',
                          });
                          setItem('gender', 'white girl');
                          setShowAvatarOptions(false);
                        }}>
                        <View style={styles.avatarOptionWrapper}>
                          {preferences.gender === 'white girl' && (
                            <Text style={styles.avatarHeartOverlay}>♥</Text>
                          )}
                          <FastImage
                            source={require('../assets/gender/wgirl.jpg')}
                            style={styles.avatarOptionImage}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.avatarOption,
                          preferences.gender === 'black girl' &&
                          styles.selectedAvatarOption,
                        ]}
                        onPress={() => {
                          mixpanel.track('Settings Avatar Selected', {
                            avatar: 'black girl',
                            previousAvatar: preferences.gender || 'none',
                          });
                          setItem('gender', 'black girl');
                          setShowAvatarOptions(false);
                        }}>
                        <View style={styles.avatarOptionWrapper}>
                          {preferences.gender === 'black girl' && (
                            <Text style={styles.avatarHeartOverlay}>♥</Text>
                          )}
                          <FastImage
                            source={require('../assets/gender/bgirl.jpg')}
                            style={styles.avatarOptionImage}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.avatarOption,
                          preferences.gender === 'asian girl' &&
                          styles.selectedAvatarOption,
                        ]}
                        onPress={() => {
                          mixpanel.track('Settings Avatar Selected', {
                            avatar: 'asian girl',
                            previousAvatar: preferences.gender || 'none',
                          });
                          setItem('gender', 'asian girl');
                          setShowAvatarOptions(false);
                        }}>
                        <View style={styles.avatarOptionWrapper}>
                          {preferences.gender === 'asian girl' && (
                            <Text style={styles.avatarHeartOverlay}>♥</Text>
                          )}
                          <FastImage
                            source={require('../assets/gender/agirl.jpg')}
                            style={styles.avatarOptionImage}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.avatarOption,
                          preferences.gender === 'other' &&
                          styles.selectedAvatarOption,
                        ]}
                        onPress={() => {
                          mixpanel.track('Settings Avatar Selected', {
                            avatar: 'other',
                            previousAvatar: preferences.gender || 'none',
                          });
                          setItem('gender', 'other');
                          setShowAvatarOptions(false);
                        }}>
                        <View style={styles.avatarOptionWrapper}>
                          {preferences.gender === 'other' && (
                            <Text style={styles.avatarHeartOverlay}>♥</Text>
                          )}
                          <View style={styles.noAvatarOptionContainer}>
                            <Text style={styles.noAvatarOptionText}>Other</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.adminSection}>
                <View style={styles.adminCodeRow}>
                  <View style={styles.adminCodeInfo}>
                    <Text style={styles.settingLabel}>Admin Code</Text>
                    {isEditingAdminCode ? (
                      <View style={styles.adminCodeEditContainer}>
                        <TextInput
                          style={[
                            styles.codeInput,
                            adminCodeError ? styles.errorInput : null,
                          ]}
                          value={newAdminCode}
                          onChangeText={text => {
                            const numericText = text.replace(/[^0-9]/g, '');
                            if (numericText.length <= 4) {
                              setNewAdminCode(numericText);
                              setAdminCodeError('');
                            }
                          }}
                          keyboardType="numeric"
                          maxLength={4}
                          placeholder="Enter new 4-digit code"
                          secureTextEntry={false}
                          editable={!isSaving}
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            if (newAdminCode.length === 4) {
                              handleAdminCodeChange();
                            }
                          }}
                          autoFocus
                        />
                        {adminCodeError ? (
                          <Text style={styles.errorText}>{adminCodeError}</Text>
                        ) : null}
                        <View style={styles.adminCodeButtons}>
                          <Pressable
                            style={[styles.adminButton, styles.cancelButton]}
                            onPress={cancelAdminCodeEdit}
                            disabled={isSaving}>
                            <Text style={styles.buttonText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.adminButton,
                              styles.submitButton,
                              (newAdminCode.length !== 4 || isSaving) &&
                              styles.disabledButton,
                            ]}
                            onPress={handleAdminCodeChange}
                            disabled={newAdminCode.length !== 4 || isSaving}>
                            <Text style={styles.buttonText}>
                              {isSaving ? 'Saving...' : 'Save'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.adminCodeContainer}>
                        <Text style={styles.adminCodeValue}>
                          {isAdminCodeVisible
                            ? adminCode
                            : adminCode
                              ? '••••'
                              : 'Not set'}
                        </Text>
                        <TouchableOpacity
                          style={styles.eyeButton}
                          onPress={() => {
                            mixpanel.track(
                              'Settings Admin Code Visibility Toggled',
                              {
                                visible: !isAdminCodeVisible,
                              },
                            );
                            setIsAdminCodeVisible(!isAdminCodeVisible);
                          }}>
                          <FastImage
                            source={require('../assets/eye.png')}
                            style={[
                              styles.eyeIcon,
                              !isAdminCodeVisible && styles.eyeIconHidden,
                            ]}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {!isEditingAdminCode && (
                    <Pressable
                      style={styles.changeButton}
                      onPress={() => {
                        mixpanel.track('Settings Admin Code Edit Started');
                        setIsEditingAdminCode(true);
                      }}>
                      <Text style={styles.changeButtonText}>Change</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchLabel}>
                  <Text style={styles.settingLabel}>
                    Go Back After Selection
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      mixpanel.track('Settings Info Button Pressed', {
                        infoType: 'Go Back After Selection',
                      });
                      setShowGobackAfterSelectionInfo(true);
                    }}
                    style={styles.infoButton}>
                    <Text style={styles.infoIcon}>?</Text>
                  </TouchableOpacity>
                </View>
                <Switch
                  trackColor={{ false: '#767577', true: '#8E24AA' }}
                  thumbColor={gobackAfterSelection ? '#fff' : '#f4f3f4'}
                  ios_backgroundColor="#3e3e3e"
                  onValueChange={handleGobackAfterSelectionToggle}
                  value={gobackAfterSelection}
                />
              </View>

              {/* Whisper Model Download Section */}
              {(useLocalWhisper || !whisperModelAvailable) && (
                <View style={styles.whisperDownloadSection}>
                  <Text style={styles.settingLabel}>Whisper Model</Text>
                  {whisperModelAvailable ? (
                    <View style={styles.whisperStatusContainer}>
                      <Text style={styles.whisperStatusText}>
                        ✅ Whisper model is downloaded and ready to use
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.whisperDownloadContainer}>
                      <Text style={styles.whisperDownloadText}>
                        {useLocalWhisper
                          ? 'Download the Whisper model to enable local voice transcription'
                          : 'Download the Whisper model to enable local voice transcription (required to use local Whisper)'}
                      </Text>
                      <WhisperDownload
                        onComplete={handleWhisperDownloadComplete}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={[styles.section]}>
              <Text style={styles.sectionTitle}>Data Management</Text>
              <Text style={styles.aboutDescription}>
                Export your profile data to keep a backup or transfer to another device.
              </Text>
              <TouchableOpacity
                style={styles.exportButton}
                onPress={handleExportProfile}
                disabled={isExporting || isImporting}>
                {isExporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Export Profile</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importButton}
                onPress={handleImportProfile}
                disabled={isImporting || isExporting}>
                {isImporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Import Profile</Text>
                )}
              </TouchableOpacity>
            </View>


            <View style={[styles.section, styles.sectionReset]}>
              <Text style={styles.sectionTitle}>Reset Installation</Text>
              <Text style={styles.aboutDescription}>
                Reset your installation and delete all your data. This action is
                irreversible.
              </Text>
              <TouchableOpacity
                style={styles.deleteAccountButton}
                onPress={handleDeleteAccount}>
                <Text style={styles.logoutText}>Reset Installation</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={[styles.section, styles.sectionLegal]}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <Pressable
            style={styles.linkRow}
            onPress={() =>
              handleLinkPress(
                'https://www.verbali.io/matalk-ai-privacy-policy',
                'Privacy Policy',
              )
            }>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>

          <Pressable
            style={styles.linkRow}
            onPress={() =>
              handleLinkPress(
                'https://www.verbali.io/eula',
                'End User License Agreement (EULA)',
              )
            }>
            <Text style={styles.linkText}>
              End User License Agreement (EULA)
            </Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>

          <Pressable
            style={styles.linkRow}
            onPress={() =>
              handleLinkPress(
                'https://www.verbali.io/terms-of-use-standalone',
                'Terms of Use',
              )
            }>
            <Text style={styles.linkText}>Terms of Use</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
        </View>

        <View style={[styles.section, styles.sectionAbout]}>
          <Text style={styles.sectionTitle}>About</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (showAssistantId) return; // Don't increment if already showing
              mixpanel.track('Settings About Version Tapped');
              setAboutTapCount(prev => {
                const next = prev + 1;
                if (next >= 5) {
                  mixpanel.track('Settings Assistant ID Revealed');
                  setShowAssistantId(true);
                }
                return next;
              });
            }}>
            <Text style={styles.aboutText}>MaTalk AI v1.8</Text>
          </TouchableOpacity>


          <Text style={styles.aboutDescription}>
            MaTalk AI is a communication tool designed to help users interact
            more effectively.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2025 Verbali Inc. MaTalk AI</Text>
        </View>

        <InfoModal
          visible={showGobackAfterSelectionInfo}
          onClose={() => {
            mixpanel.track('Settings Info Modal Closed', {
              modalType: 'Go Back After Selection',
            });
            setShowGobackAfterSelectionInfo(false);
          }}
          title="Go Back After Selection"
          description="When enabled, the app will automatically navigate back to the main screen after you select an answer. When disabled, you'll stay on the conversation screen and can continue asking questions without returning to the main screen."
        />

        <InfoModal
          visible={showGenderInfo}
          onClose={() => {
            mixpanel.track('Settings Info Modal Closed', {
              modalType: 'Gender Selection',
            });
            setShowGenderInfo(false);
          }}
          title="Gender Selection"
          description="Gender selection is completely optional and is used only for personalization purposes. You don't have to choose a gender if you prefer not to. This setting helps customize your experience but is not required for the app to function."
        />

        <InfoModal
          visible={showWhisperInfo}
          onClose={() => {
            mixpanel.track('Settings Info Modal Closed', {
              modalType: 'Local Whisper vs Cloud',
            });
            setShowWhisperInfo(false);
          }}
          title="Local Whisper vs Cloud"
          description="When enabled, the app will use the downloaded Whisper model for voice transcription on your device. This provides faster transcription and keeps your audio on your device only. The Whisper model must be downloaded before you can enable local Whisper. If the model is not downloaded, the app will use cloud-based transcription."
        />

        {/* Video Modal */}
        <Modal
          animationType="slide"
          transparent={false}
          visible={showVideoModal}
          supportedOrientations={['landscape-left', 'landscape-right']}
          onRequestClose={() => setShowVideoModal(false)}>
          <View style={styles.videoModalContainer}>
            <View style={styles.videoModalHeader}>
              <TouchableOpacity
                style={styles.videoModalCloseButton}
                onPress={() => {
                  mixpanel.track('Settings Video Modal Closed', {
                    videoName: selectedVideoSource,
                  });
                  setShowVideoModal(false);
                }}>
                <Text style={styles.videoModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.videoModalContent}>
              {selectedVideoSource && (
                <ShowAndTell
                  videoSource={selectedVideoSource}
                  context="settings"
                  videoList={videoList}
                  currentVideoIndex={currentVideoIndex}
                  onVideoChange={handleVideoChange}
                />
              )}
            </View>
          </View>
        </Modal>

        {/* App Rating Modal */}
        <AppRatingModal
          visible={showRatingModal}
          onClose={handleRatingModalClose}
          onDismiss={handleRatingModalDismiss}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fe',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: statusBarHeight - 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 10,
  },
  backButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollContainer: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  sectionAccount: {
    backgroundColor: '#e8f4fc',
  },
  sectionAccountSettings: {
    backgroundColor: '#f3e8fc',
  },
  sectionReports: {
    backgroundColor: '#e8fcf0',
  },
  sectionHelpCenter: {
    backgroundColor: '#fcf8e8',
  },
  sectionPersonalize: {
    backgroundColor: '#fce8f0',
  },
  sectionReset: {
    backgroundColor: '#fce8e8',
  },
  sectionLegal: {
    backgroundColor: '#f0f0f2',
  },
  sectionAbout: {
    backgroundColor: '#e8f8fc',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  settingRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settingLabel: {
    fontSize: 18,
    marginTop: SCREEN_WIDTH * 0.01,
    color: '#333',
    marginBottom: 8,
  },
  logoutButton: {
    backgroundColor: '#f44336',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  deleteAccountButton: {
    backgroundColor: '#f44336',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
    width: SCREEN_WIDTH * 0.2,
    alignSelf: 'center',
  },
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  exportButton: {
    backgroundColor: '#3f51b5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
    width: SCREEN_WIDTH * 0.4,
    alignSelf: 'center',
  },
  importButton: {
    backgroundColor: '#2e7d32',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
    width: SCREEN_WIDTH * 0.4,
    alignSelf: 'center',
  },
  aboutText: {
    fontSize: 16,
    marginVertical: 5,
    color: '#333',
  },
  aboutDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  linkText: {
    fontSize: 16,
    color: '#333',
  },
  linkArrow: {
    fontSize: 18,
    color: '#8E24AA',
    fontWeight: '500',
  },
  reportsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  reportsButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  reportsCardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  reportsCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 2,
    borderColor: '#B3E5FC',
    minWidth: SCREEN_WIDTH * 0.2,
    minHeight: height * 0.12,
  },
  reportsCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportsCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  reportsCardInsight: {
    fontSize: 11,
    color: '#666',
    lineHeight: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  reportsCardButton: {
    backgroundColor: '#34c759',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportsCardButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  valueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E24AA',
    marginLeft: 8,
    minWidth: 24,
    textAlign: 'center',
  },
  sliderContainer: {
    paddingHorizontal: 10,
  },
  slider: {
    height: 40,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap', // Allow wrapping on very narrow screens
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#8E24AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  infoIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
    margin: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: '#8E24AA',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminSection: {
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  adminCodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  adminCodeInfo: {
    flex: 1,
  },
  adminCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminCodeValue: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  changeButton: {
    backgroundColor: '#8E24AA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  changeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  adminCodeEditContainer: {
    width: '100%',
    marginTop: 8,
  },
  adminCodeButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  adminButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  codeInput: {
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  errorInput: {
    borderColor: '#ff3b30',
    backgroundColor: '#fff0f0',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 4,
  },
  eyeButton: {
    padding: 8,
    marginLeft: 8,
  },
  eyeIcon: {
    width: 24,
    height: 24,
    tintColor: '#8E24AA',
  },
  eyeIconHidden: {
    opacity: 0.5,
  },
  cancelButton: {
    backgroundColor: '#ff3b30',
  },
  submitButton: {
    backgroundColor: '#34c759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  genderSection: {
    paddingHorizontal: 10,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 20,
  },
  genderImageWrapper: {
    width: '80%',
    aspectRatio: 1.43,
    borderRadius: 16,
    overflow: 'visible',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  myPepesSection: {
    paddingHorizontal: 10,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 20,
  },
  myPepesDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    marginBottom: 15,
    lineHeight: 20,
  },
  my8WordsSection: {
    paddingHorizontal: 10,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 20,
  },
  my8WordsDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    marginBottom: 15,
    lineHeight: 20,
  },
  genderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  genderLabelContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-start',
    width: '100%',
  },
  whisperDownloadSection: {
    paddingHorizontal: 10,
    marginBottom: 20,

    paddingBottom: 20,
  },
  whisperStatusContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  whisperStatusText: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '500',
  },
  whisperDownloadContainer: {
    marginTop: 8,
  },
  whisperDownloadText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  currentAvatarContainer: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  currentAvatarDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedAvatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  currentAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  noAvatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  noAvatarText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  showMoreButton: {
    backgroundColor: '#8E24AA',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 16,
  },
  showMoreButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarOptionsContainer: {
    paddingHorizontal: 10,
    marginTop: 12,
  },
  avatarOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  avatarOption: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 12,
    padding: 4,
  },
  selectedAvatarOption: {
    // No background color - just show the heart overlay
  },
  avatarOptionWrapper: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatarOptionImage: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
  },
  avatarHeartOverlay: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 10,
    fontSize: 20,
    color: '#FF3B30',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    pointerEvents: 'none',
  },
  noAvatarOptionContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 35,
  },
  noAvatarOptionText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  checklistGrid: {
    marginTop: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  checklistRowTablet: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklistCard: {
    width: (height - 120) / 6, // Height-based calculation for landscape - 6 cards per row
    height: (height - 120) / 6, // Square cards based on height
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  checklistCardTablet: {
    width: (height - 140) / 6, // Height-based calculation for tablet landscape
    height: (height - 140) / 6, // Square cards based on height
    padding: 6,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  videoContainer: {
    width: '70%', // Video container sized for height-based cards
    aspectRatio: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
    backgroundColor: '#f8f9fe',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  checklistCardTitle: {
    fontSize: height * 0.012, // Height-based font size
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    lineHeight: height * 0.015,
  },
  checklistCardTitleTablet: {
    fontSize: height * 0.014, // Height-based font size for tablet
    lineHeight: height * 0.018,
  },
  videoModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  videoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
  },
  videoModalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModalCloseText: {
    fontSize: 18,
    color: '#333',
    fontWeight: 'bold',
  },
  videoModalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  videoHeartOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  videoHeartIcon: {
    fontSize: 12,
    color: '#FF3B30',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  videoHeartOverlayTablet: {
    width: 24,
    height: 24,
    borderRadius: 14,
  },
  videoHeartIconTablet: {
    fontSize: 14,
  },
});

export default SettingsScreen;
