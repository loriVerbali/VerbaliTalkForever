import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Platform,
    TextInput,
    KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import { Mixpanel } from 'mixpanel-react-native';
import HomeButton from '../Components/HomeButton';
import MatalkIcon from '../Components/MatalkIcon';
import TTSService from '../utils/TTSService';
import { polishText } from '../utils/polishApi';
import { useAdmin } from '../contexts/adminContext';
import AudioSessionManager from '../utils/AudioSessionManager';

const { width, height } = Dimensions.get('window');

const KeyboardHomeScreen: React.FC = () => {
    const navigation = useNavigation();
    const { isTablet } = useAdmin();
    const [keyboardInput, setKeyboardInput] = useState('');
    const [isSubmittingKeyboard, setIsSubmittingKeyboard] = useState(false);
    const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);

    const handleKeyboardSubmit = async () => {
        const inputText = keyboardInput.trim();
        if (!inputText || isSubmittingKeyboard) return;

        try {
            setIsSubmittingKeyboard(true);
            // Prepare for TTS before speaking
            await AudioSessionManager.prepareForTTS();
            await TTSService.speak(inputText, true, () => {
                setKeyboardInput('');
            });
        } catch (error) {
        } finally {
            setIsSubmittingKeyboard(false);
        }
    };

    const handleKeyboardCancel = () => {
        setKeyboardInput('');
        setIsSubmittingKeyboard(false);
    };

    const handlePolish = () => {
        if (!keyboardInput.trim()) return;
        polishText(keyboardInput)
            .then((response) => {
                setKeyboardInput(response);
            })
            .catch((error) => {
                console.error(error);
            });
    };

    return (
        <View style={styles.container}>
            <View style={[styles.container, { backgroundColor: '#FFF8E7' }]}>
                <HomeButton navigation={navigation} onReset={() => { }} />
                <View style={styles.matalkIcon}>
                    <MatalkIcon />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[
                        styles.keyboardAvoidingView,
                        isTablet && styles.tabletPaddingTop
                    ]}
                >
                    <View style={styles.contentContainer}>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.textInput}
                                value={keyboardInput}
                                onChangeText={setKeyboardInput}
                                placeholder="Type your message..."
                                placeholderTextColor="#999"
                                multiline={true}
                                autoFocus={true}
                                blurOnSubmit={false}
                            />

                            <View style={styles.divider} />

                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={styles.playButton}
                                    onPress={handleKeyboardSubmit}
                                    disabled={isSubmittingKeyboard || keyboardInput.trim().length === 0}
                                >
                                    <FastImage
                                        source={isSubmittingKeyboard ? require('../assets/movie/output.gif') : require('../assets/playKeyboard.png')}
                                        style={styles.buttonIcon}
                                        resizeMode={FastImage.resizeMode.contain}
                                    />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.smallButton}
                                    onPress={handleKeyboardCancel}
                                    disabled={isSubmittingKeyboard}
                                >
                                    <FastImage
                                        source={require('../assets/undo.png')}
                                        style={styles.buttonIcon}
                                        resizeMode={FastImage.resizeMode.contain}
                                    />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.smallButton}
                                    onPress={handlePolish}
                                    disabled={isSubmittingKeyboard}
                                >
                                    <FastImage
                                        source={require('../assets/polish.png')}
                                        style={styles.buttonIcon}
                                        resizeMode={FastImage.resizeMode.contain}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    matalkIcon: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        transform: [{ scale: 0.8 }],
    },
    keyboardAvoidingView: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 20,
    },
    tabletPaddingTop: {
        paddingTop: height * 0.15,
    },
    contentContainer: {
        width: '95%',
        alignItems: 'center',
    },
    inputContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 10,
        borderLeftWidth: 4,
        borderLeftColor: '#007AFF',
        minHeight: 80,
        maxHeight: 140,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    textInput: {
        flex: 1,
        fontSize: 18,
        color: '#333',
        textAlignVertical: 'top',
        padding: 5,
    },
    divider: {
        width: 2,
        backgroundColor: '#3518dcff',
        marginHorizontal: 10,
        height: '100%',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        width: 135,
        height: '100%',
    },
    playButton: {
        width: 40,
        height: 40,
    },
    smallButton: {
        width: 40,
        height: 40,
    },
    buttonIcon: {
        width: '100%',
        height: '100%',
    },
});

export default KeyboardHomeScreen;
