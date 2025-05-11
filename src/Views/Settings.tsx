import React, {useRef, useEffect, useState, useCallback, memo} from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Switch,
  Pressable,
  Dimensions,
  StatusBar,
  Linking,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import {useAppSettings} from '../utils/persistance';
import {useAuth0} from 'react-native-auth0';
import {views} from '../utils/constants';
import Slider from '@react-native-community/slider';

const {height, width: SCREEN_WIDTH} = Dimensions.get('window');
const statusBarHeight = StatusBar.currentHeight || 40;

type WebViewParams = {
  url: string;
  title: string;
};

type RootStackParamList = {
  WebView: WebViewParams;
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
}) => (
  <Modal
    animationType="fade"
    transparent={true}
    visible={visible}
    onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalDescription}>{description}</Text>
        <TouchableOpacity style={styles.modalButton} onPress={onClose}>
          <Text style={styles.modalButtonText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

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
  const {width: windowWidth} = useWindowDimensions();

  const sliderWidth = windowWidth * 0.42 - 40; // 42% of screen width minus padding

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <View style={[styles.sliderContainer, {width: windowWidth * 0.42}]}>
      <View style={styles.labelRow}>
        <Text style={styles.settingLabel}>Amount of messages</Text>
        <TouchableOpacity
          onPress={() => setShowInfo(true)}
          style={styles.infoButton}>
          <Text style={styles.infoIcon}>?</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sliderRow}>
        <Slider
          style={[styles.slider, {width: sliderWidth}]}
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
  const {width: windowWidth} = useWindowDimensions();

  const sliderWidth = windowWidth * 0.42 - 40; // 42% of screen width minus padding

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <View style={[styles.sliderContainer, {width: windowWidth * 0.42}]}>
      <View style={styles.labelRow}>
        <Text style={styles.settingLabel}>{label}</Text>
        <TouchableOpacity
          onPress={() => setShowInfo(true)}
          style={styles.infoButton}>
          <Text style={styles.infoIcon}>?</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sliderRow}>
        <Slider
          style={[styles.slider, {width: sliderWidth}]}
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
  const {preferences, setItem, getItem} = useAppSettings();
  const {user, clearSession} = useAuth0();

  const [returnedMessages, setReturnedMessages] = useState(5);
  const [topicsCount, setTopicsCount] = useState(4);
  const [actionsCount, setActionsCount] = useState(4);
  const [objectsCount, setObjectsCount] = useState(4);

  useEffect(() => {
    // Load saved settings
    const loadSettings = async () => {
      try {
        const savedReturnedMessages = await getItem('returnedMessages');
        const savedTopicsCount = await getItem('topicsCount');
        const savedActionsCount = await getItem('actionsCount');
        const savedObjectsCount = await getItem('objectsCount');

        setReturnedMessages(parseInt(savedReturnedMessages) || 5);
        setTopicsCount(parseInt(savedTopicsCount) || 4);
        setActionsCount(parseInt(savedActionsCount) || 4);
        setObjectsCount(parseInt(savedObjectsCount) || 4);
      } catch (e) {
        console.log('Error loading settings:', e);
      }
    };

    loadSettings();
  }, []);

  const handleLogout = async () => {
    try {
      await clearSession();
      await setItem('loggedIn', '0');
      await setItem('username', '');
      navigation.navigate(views.LOGIN as never);
    } catch (e) {
      console.log('Log out cancelled', e);
    }
  };

  const handleLinkPress = (url: string, title: string) => {
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

  return (
    <LinearGradient colors={['#ffffff', '#f8f9fe']} style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.profileSection}>
            <View style={styles.profileInfo}>
              <Text style={styles.userName}>{user?.name || 'User'}</Text>
              <Text style={styles.userEmail}>
                {user?.email || 'No email provided'}
              </Text>
            </View>
          </View>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <View style={styles.sliderGrid}>
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
            </View>

            <View style={styles.sliderRow}>
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
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <Pressable
            style={styles.linkRow}
            onPress={() =>
              handleLinkPress('https://verbali.io/privacy', 'Privacy Policy')
            }>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>

          <Pressable
            style={styles.linkRow}
            onPress={() =>
              handleLinkPress('https://verbali.io/termsofuse', 'Terms of Use')
            }>
            <Text style={styles.linkText}>Terms of Use</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>Matalk v1.0.0</Text>
          <Text style={styles.aboutDescription}>
            Matalk is a communication tool designed to help users interact more
            effectively.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2023 Matalk</Text>
        </View>
      </ScrollView>
    </LinearGradient>
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
    paddingTop: statusBarHeight,
    paddingHorizontal: 20,
    paddingVertical: 15,
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
    fontSize: 14,
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
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
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
  sliderGrid: {
    width: '100%',
    paddingHorizontal: 10,
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
});

export default SettingsScreen;
