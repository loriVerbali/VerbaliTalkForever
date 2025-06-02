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
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import {useAppSettings} from '../utils/persistance';
import {useAuth0} from 'react-native-auth0';
import {views} from '../utils/constants';
import Slider from '@react-native-community/slider';
import FamilyPics, {FamilyMember} from '../Components/FamilyPics';

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
  const [showOnboardingEnabled, setShowOnboardingEnabled] = useState(false);
  const [showOnboardingInfo, setShowOnboardingInfo] = useState(false);
  const [showAdminCodeModal, setShowAdminCodeModal] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [isEditingAdminCode, setIsEditingAdminCode] = useState(false);
  const [newAdminCode, setNewAdminCode] = useState('');
  const [adminCodeError, setAdminCodeError] = useState('');
  const [isAdminCodeVisible, setIsAdminCodeVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedReturnedMessages = await getItem('returnedMessages');
        const savedTopicsCount = await getItem('topicsCount');
        const savedActionsCount = await getItem('actionsCount');
        const savedObjectsCount = await getItem('objectsCount');
        const wasOnboarded = await getItem('wasOnboarded');
        const savedAdminCode = await getItem('adminCode');

        setReturnedMessages(parseInt(savedReturnedMessages) || 5);
        setTopicsCount(parseInt(savedTopicsCount) || 4);
        setActionsCount(parseInt(savedActionsCount) || 4);
        setObjectsCount(parseInt(savedObjectsCount) || 4);
        setShowOnboardingEnabled(wasOnboarded !== '1');
        setAdminCode(savedAdminCode || '');
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

  const handleOnboardingToggle = async (value: boolean) => {
    setShowOnboardingEnabled(value);
    await setItem('wasOnboarded', value ? '0' : '1');
  };

  const handleFamilyMemberSelect = (member: FamilyMember) => {
    console.log('Selected family member:', member);
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
      setAdminCode(newAdminCode);
      setNewAdminCode('');
      setIsEditingAdminCode(false);
      setAdminCodeError('');
      setIsAdminCodeVisible(false);
    } catch (e) {
      console.log('Error saving admin code:', e);
      setAdminCodeError('Failed to save admin code');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelAdminCodeEdit = () => {
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

            <View style={styles.genderSection}>
              <Text style={styles.settingLabel}>Gender</Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[
                    styles.genderOption,
                    preferences.gender === 'boy' && styles.selectedGender,
                  ]}
                  onPress={() => setItem('gender', 'boy')}>
                  <FastImage
                    source={require('../assets/boy.png')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text
                    style={[
                      styles.genderText,
                      preferences.gender === 'boy' && styles.selectedGenderText,
                    ]}>
                    Boy
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.genderOption,
                    preferences.gender === 'girl' && styles.selectedGender,
                  ]}
                  onPress={() => setItem('gender', 'girl')}>
                  <FastImage
                    source={require('../assets/girl.png')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text
                    style={[
                      styles.genderText,
                      preferences.gender === 'girl' &&
                        styles.selectedGenderText,
                    ]}>
                    Girl
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.genderOption,
                    preferences.gender === 'other' && styles.selectedGender,
                  ]}
                  onPress={() => setItem('gender', 'other')}>
                  <FastImage
                    source={require('../assets/person.png')}
                    style={styles.genderImage}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text
                    style={[
                      styles.genderText,
                      preferences.gender === 'other' &&
                        styles.selectedGenderText,
                    ]}>
                    Other
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.familyPicsSection}>
              <Text style={styles.settingLabel}>Family Members</Text>
              <Text style={styles.familyDescription}>
                Manage family member photos for conversations
              </Text>
              <FamilyPics onFamilyMemberSelect={handleFamilyMemberSelect} />
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
                        onPress={() =>
                          setIsAdminCodeVisible(!isAdminCodeVisible)
                        }>
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
                    onPress={() => setIsEditingAdminCode(true)}>
                    <Text style={styles.changeButtonText}>Change</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.settingLabel}>Show Onboarding</Text>
                <TouchableOpacity
                  onPress={() => setShowOnboardingInfo(true)}
                  style={styles.infoButton}>
                  <Text style={styles.infoIcon}>?</Text>
                </TouchableOpacity>
              </View>
              <Switch
                trackColor={{false: '#767577', true: '#8E24AA'}}
                thumbColor={showOnboardingEnabled ? '#fff' : '#f4f3f4'}
                ios_backgroundColor="#3e3e3e"
                onValueChange={handleOnboardingToggle}
                value={showOnboardingEnabled}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <Pressable
            style={styles.linkRow}
            onPress={() =>
              handleLinkPress('https://verbali.io/', 'Privacy Policy')
            }>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>

          <Pressable
            style={styles.linkRow}
            onPress={() =>
              handleLinkPress('https://verbali.io/', 'Terms of Use')
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

        <InfoModal
          visible={showOnboardingInfo}
          onClose={() => setShowOnboardingInfo(false)}
          title="Show Onboarding"
          description="Enable this option to see the onboarding screens again on your next app launch. This can be helpful if you want to review the app's features and functionality."
        />
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
  genderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 12,
  },
  genderOption: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    width: SCREEN_WIDTH * 0.25,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedGender: {
    borderColor: '#8E24AA',
    backgroundColor: 'rgba(142, 36, 170, 0.1)',
  },
  genderImage: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  genderText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  selectedGenderText: {
    color: '#8E24AA',
    fontWeight: 'bold',
  },
  familyPicsSection: {
    paddingHorizontal: 10,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 20,
  },
  familyDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    lineHeight: 20,
  },
});

export default SettingsScreen;
