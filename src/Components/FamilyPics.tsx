import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Alert,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {
  launchImageLibrary,
  ImagePickerResponse,
  MediaType,
} from 'react-native-image-picker';
import {useAppSettings} from '../utils/persistance';

const {width, height} = Dimensions.get('window');

export interface FamilyMember {
  id: string;
  name: string;
  imageUri?: string;
  isDefault: boolean;
}

interface FamilyPicsProps {
  onFamilyMemberSelect?: (member: FamilyMember) => void;
}

const FamilyPics: React.FC<FamilyPicsProps> = ({onFamilyMemberSelect}) => {
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([
    {id: 'me', name: 'I', isDefault: true},
    {id: 'mom', name: 'Mom', isDefault: true},
    {id: 'dad', name: 'Dad', isDefault: true},
  ]);
  const [newMemberName, setNewMemberName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [newMemberImage, setNewMemberImage] = useState<string | undefined>();

  const {setItem, getItem} = useAppSettings();

  // Load saved family data on component mount
  useEffect(() => {
    loadFamilyData();
  }, []);

  const loadFamilyData = async () => {
    try {
      const savedData = await getItem('familyPicsData');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setFamilyMembers(parsedData);
      }
    } catch (error) {
      console.error('Error loading family data:', error);
    }
  };

  const saveFamilyData = async () => {
    try {
      await setItem('familyPicsData', JSON.stringify(familyMembers));
    } catch (error) {
      console.error('Error saving family data:', error);
    }
  };

  // Save family data whenever it changes
  useEffect(() => {
    if (familyMembers.length > 0) {
      saveFamilyData();
    }
  }, [familyMembers]);

  const selectImage = (memberId: string) => {
    const options = {
      mediaType: 'photo' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8 as const,
    };

    launchImageLibrary(options, (response: ImagePickerResponse) => {
      if (response.didCancel || response.errorMessage) {
        return;
      }

      if (response.assets && response.assets[0]) {
        const imageUri = response.assets[0].uri;
        updateMemberImage(memberId, imageUri);
      }
    });
  };

  const selectImageForNewMember = () => {
    const options = {
      mediaType: 'photo' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8 as const,
    };
    setShowAddInput(true);

    launchImageLibrary(options, (response: ImagePickerResponse) => {
      if (response.didCancel || response.errorMessage) {
        return;
      }

      if (response.assets && response.assets[0]) {
        const imageUri = response.assets[0].uri;

        setNewMemberImage(imageUri);
      }
    });
  };

  const updateMemberImage = (memberId: string, imageUri?: string) => {
    setFamilyMembers(prev =>
      prev.map(member =>
        member.id === memberId ? {...member, imageUri} : member,
      ),
    );
  };

  const cancelAddingMember = () => {
    setNewMemberName('');
    setNewMemberImage(undefined);
    setShowAddInput(false);
  };

  const finishAddingMember = () => {
    if (newMemberName.trim() && newMemberImage) {
      const newMember: FamilyMember = {
        id: Date.now().toString(),
        name: newMemberName.trim(),
        imageUri: newMemberImage,
        isDefault: false,
      };
      setFamilyMembers(prev => [...prev, newMember]);
      setShowAddInput(false);
      setNewMemberName('');
      setNewMemberImage(undefined);
    } else {
      Alert.alert(
        'Missing Information',
        `Please ${!newMemberImage ? 'select a photo' : ''}${
          !newMemberImage && !newMemberName.trim() ? ' and ' : ''
        }${!newMemberName.trim() ? 'enter a name' : ''}.`,
      );
    }
  };

  const deleteMember = (memberId: string) => {
    const member = familyMembers.find(m => m.id === memberId);
    if (member?.isDefault) {
      Alert.alert('Cannot Delete', 'Default family members cannot be deleted.');
      return;
    }

    Alert.alert(
      'Delete Family Member',
      'Are you sure you want to delete this family member?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setFamilyMembers(prev => prev.filter(m => m.id !== memberId));
          },
        },
      ],
    );
  };

  const handleMemberPress = (member: FamilyMember) => {
    if (onFamilyMemberSelect) {
      onFamilyMemberSelect(member);
    }
  };

  const renderFamilyMember = (member: FamilyMember) => (
    <View key={member.id} style={styles.gridItem}>
      <Pressable
        style={styles.gridImageContainer}
        onPress={() => selectImage(member.id)}
        onLongPress={() => handleMemberPress(member)}>
        {member.imageUri ? (
          <FastImage
            source={{uri: member.imageUri}}
            style={{
              width: width * 0.1,
              height: width * 0.1,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
            resizeMode={FastImage.resizeMode.cover}
          />
        ) : (
          <FastImage
            source={require('../assets/personPlus.png')}
            style={{
              width: width * 0.1,
              height: width * 0.1,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
            resizeMode={FastImage.resizeMode.cover}
          />
        )}
      </Pressable>
      <View style={styles.gridLabelContainer}>
        <Text style={styles.labelGrid}>{member.name}</Text>
      </View>
      {!member.isDefault && (
        <Pressable
          style={styles.deleteButton}
          onPress={() => deleteMember(member.id)}>
          <Text style={styles.deleteButtonText}>×</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={{
          marginBottom: height * 0.01,
          padding: height * 0.01,
        }}
        contentContainerStyle={styles.membersWrapper}
        showsHorizontalScrollIndicator={false}
        horizontal={true}>
        {familyMembers.map(renderFamilyMember)}
        <View style={styles.gridItem}>
          <Pressable
            style={styles.gridImageContainer}
            onPress={selectImageForNewMember}>
            {newMemberImage ? (
              <FastImage
                source={{uri: newMemberImage}}
                style={{
                  width: width * 0.1,
                  height: width * 0.1,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                }}
                resizeMode={FastImage.resizeMode.cover}
              />
            ) : (
              <View
                style={{
                  width: width * 0.1,
                  height: width * 0.1,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: '#e0e0e0',
                  borderWidth: 2,
                  borderColor: '#3A89FF',
                  borderStyle: 'dashed',
                }}>
                <Text
                  style={{fontSize: 12, color: '#3A89FF', textAlign: 'center'}}>
                  Tap to{'\n'}select photo
                </Text>
              </View>
            )}
          </Pressable>
          <View style={styles.gridLabelContainer}>
            <Text style={styles.labelGrid}>New</Text>
          </View>
        </View>
      </ScrollView>

      {showAddInput ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter family member name"
            placeholderTextColor="#888"
            value={newMemberName}
            onChangeText={setNewMemberName}
            autoCapitalize="words"
            autoComplete="name-given"
            maxLength={20}
          />

          <View style={styles.buttonContainer}>
            <Pressable style={styles.cancelButton} onPress={cancelAddingMember}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.addButton,
                (!newMemberName.trim() || !newMemberImage) &&
                  styles.addButtonDisabled,
              ]}
              onPress={() => {
                finishAddingMember();
              }}
              disabled={!newMemberName.trim() || !newMemberImage}>
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    alignContent: 'center',
  },
  inputContainer: {
    width: width,
    marginTop: 20,
    paddingHorizontal: 16,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: 20,
    fontSize: width * 0.04,
    textAlign: 'center',
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
  addButton: {
    flex: 1,
    backgroundColor: '#3A89FF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  deleteButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  gridItem: {
    borderRadius: 16,
    overflow: 'visible',
    backgroundColor: 'white',
    position: 'relative',
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: 'gray',
        shadowOpacity: 0.8,
        shadowRadius: 5,
        shadowOffset: {width: 0, height: 8},
      },
      android: {
        elevation: 8,
      },
    }),
  },
  gridImageContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  gridLabelContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingVertical: 8,
  },
  labelGrid: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
  },
  membersWrapper: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignContent: 'center',
  },
});

export default FamilyPics;
