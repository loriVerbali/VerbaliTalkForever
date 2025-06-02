import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react';
import {View, StyleSheet, TextInput, Dimensions} from 'react-native';
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
} from 'react-native-audio-recorder-player';
import {useAssistant} from '../contexts/AssistantContext';

import FastImage from 'react-native-fast-image';

// Create a singleton instance for better memory management and reuse
const audioRecorderPlayer = new AudioRecorderPlayer();

interface InputsProps {
  mode: string;
}

const {width, height} = Dimensions.get('window');

const Inputs: React.FC<InputsProps> = ({mode}) => {
  const [inputText, setInputText] = useState<string>('');

  return (
    <View style={styles.container}>
      {mode === 'Attention' ? (
        <View style={styles.inputContainer}>
          <View style={styles.KBinputContainer} pointerEvents="none">
            <TextInput
              style={styles.textInput}
              value={inputText}
              editable={false}
              onChangeText={setInputText}
              placeholder="Waiting for a sentence..."
              placeholderTextColor="#999"
              selectTextOnFocus={false}
            />
          </View>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <View style={styles.KBinputContainer}>
            <View style={styles.imageWrapper}>
              <FastImage
                style={styles.playIcon}
                source={require('../assets/play.png')}
                resizeMode={FastImage.resizeMode.contain}
              />
            </View>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textKBInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type your message here..."
                placeholderTextColor="#999"
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    marginTop: height * 0.04,
  },
  KBinputContainer: {
    flexDirection: 'row',
    width: '80%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    width: '90%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    padding: 10,
    color: '#000',
    fontSize: 16,
  },
  textKBInput: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    paddingTop: 10,
    paddingBottom: 10,
    color: '#000',
    fontSize: 16,
  },
  iconSize: {
    width: 45,
    height: 45,
    resizeMode: 'contain',
  },
  playIcon: {
    width: width * 0.03,
    height: width * 0.03,
    resizeMode: 'contain',
  },
  imageWrapper: {
    width: '10%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Inputs;
