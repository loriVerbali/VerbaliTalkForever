import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react';
import {View, StyleSheet, TextInput, Dimensions, Platform} from 'react-native';
import {useAdmin} from '../contexts/adminContext';

interface InputsProps {
  mode: string;
  onInputChange?: (text: string) => void;
}

export interface InputsRef {
  clearInput: () => void;
  setInput: (text: string) => void;
}

const {width, height} = Dimensions.get('window');

const Inputs = forwardRef<InputsRef, InputsProps>(
  ({mode, onInputChange}, ref) => {
    const [inputText, setInputText] = useState<string>('');
    const {isTablet} = useAdmin();

    // Responsive font sizes and container height
    const responsiveFontSize = isTablet ? 16 : 14;
    const responsiveContainerHeight = isTablet ? undefined : 50;

    const handleTextChange = (text: string) => {
      setInputText(text);
      if (onInputChange) {
        onInputChange(text);
      }
    };

    useImperativeHandle(ref, () => ({
      clearInput: () => {
        setInputText('');
        if (onInputChange) {
          onInputChange('');
        }
      },
      setInput: (text: string) => {
        setInputText(text);
        if (onInputChange) {
          onInputChange(text);
        }
      },
    }));

    return (
      <View style={styles.container}>
        {mode === 'Attention' ? (
          <View style={styles.inputContainer}>
            <View
              style={[
                styles.KBinputContainer,
                {height: responsiveContainerHeight},
              ]}
              pointerEvents="none">
              <TextInput
                style={[
                  styles.textInput,
                  {fontSize: responsiveFontSize},
                  Platform.OS === 'android' && {
                    textAlignVertical: 'center',
                    paddingVertical: 15,
                  },
                ]}
                value={inputText}
                editable={false}
                onChangeText={handleTextChange}
                placeholder="The recorded sentence will appear here. No editing"
                placeholderTextColor="#999"
                selectTextOnFocus={false}
              />
            </View>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <View
              style={[
                styles.KBinputContainer,
                {height: responsiveContainerHeight},
              ]}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[
                    styles.textKBInput,
                    {fontSize: responsiveFontSize},
                    Platform.OS === 'android' && {
                      textAlignVertical: 'center',
                      paddingHorizontal: 15,
                    },
                  ]}
                  value={inputText}
                  onChangeText={handleTextChange}
                  placeholder="Type your message here..."
                  placeholderTextColor="#999"
                />
              </View>
            </View>
          </View>
        )}
      </View>
    );
  },
);

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
    // height is now handled dynamically (only applied on phones)
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
    padding: 20,
    color: '#000',
    minHeight: 40, // Ensure minimum height for proper text display
    // fontSize is now handled dynamically
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
    paddingHorizontal: 10, // Add default horizontal padding
    color: '#000',
    minHeight: 40, // Ensure minimum height for proper text display
    // fontSize is now handled dynamically
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
