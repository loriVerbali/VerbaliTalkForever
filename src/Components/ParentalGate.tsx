import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import {useAdmin} from '../contexts/adminContext';
import TTSService from '../utils/TTSService';

const {width, height} = Dimensions.get('window');

interface ParentalGateProps {
  onSuccess: () => void;
  isSettingsContext?: boolean;
  message?: string;
}

const ParentalGate: React.FC<ParentalGateProps> = ({
  onSuccess,
  isSettingsContext = false,
  message,
}) => {
  const {isTablet} = useAdmin();
  const [currentSequence, setCurrentSequence] = useState<string[]>([]);
  const [userInput, setUserInput] = useState<string[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showSequence, setShowSequence] = useState(false);

  // Generate random sequence of 4 numbers
  const generateSequence = () => {
    const numbers = [
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
    ];
    const sequence: string[] = [];

    while (sequence.length < 4) {
      const randomIndex = Math.floor(Math.random() * numbers.length);
      const number = numbers[randomIndex];
      if (!sequence.includes(number)) {
        sequence.push(number);
      }
    }

    return sequence;
  };

  useEffect(() => {
    const newSequence = generateSequence();
    setCurrentSequence(newSequence);
    setUserInput([]);
    setIsCorrect(null);
    setShowSequence(true);
  }, []);

  const handleNumberPress = (number: string) => {
    const newInput = [...userInput, number];
    setUserInput(newInput);

    // Check if sequence is complete
    if (newInput.length === 4) {
      const isSequenceCorrect = newInput.every(
        (num, index) => num === currentSequence[index],
      );
      setIsCorrect(isSequenceCorrect);

      if (isSequenceCorrect) {
        setTimeout(() => {
          onSuccess();
        }, 1000);
      } else {
        // Reset for retry
        setTimeout(() => {
          setUserInput([]);
          setIsCorrect(null);
          const newSequence = generateSequence();
          setCurrentSequence(newSequence);
          setShowSequence(true);
        }, 2000);
      }
    }
  };

  const numberWords = [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
  ];

  const getNumberDisplay = (number: string) => {
    const numberMap: {[key: string]: string} = {
      one: '1',
      two: '2',
      three: '3',
      four: '4',
      five: '5',
      six: '6',
      seven: '7',
      eight: '8',
      nine: '9',
    };
    return numberMap[number] || number;
  };

  const dynamicStyles = {
    container: {
      ...styles.container,
      width: isTablet ? width * 0.4 : width * 0.9,
    },
    keypadContainer: {
      ...styles.keypadContainer,
      width: isTablet ? width * 0.35 : width * 0.8,
    },
    soundButton: {
      ...styles.soundButton,
      marginLeft: isTablet ? 20 : 15,
      padding: isTablet ? 8 : 12,
      borderRadius: isTablet ? 22 : 25,
      width: isTablet ? 44 : 50,
      height: isTablet ? 44 : 50,
    },
    soundIcon: {
      ...styles.soundIcon,
      fontSize: isTablet ? 22 : 24,
    },
  };

  return (
    <View style={isSettingsContext ? styles.settingsOverlay : styles.overlay}>
      <View style={styles.simpleContainer}>
        {/* Simple Message Row */}
        <View style={styles.messageRow}>
          <Text style={styles.messageText}>
            {message || 'Ask your parents to continue this a protected area:'}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 10,
            }}>
            <Text
              style={[styles.messageText, {fontWeight: '900', color: 'red'}]}>
              {`Tap: ${showSequence && currentSequence.join(', ')}`}
            </Text>
            <TouchableOpacity
              style={dynamicStyles.soundButton}
              onPress={() => {
                TTSService.speak(
                  'Please ask your parents to help you with this next step',
                  true,
                );
              }}>
              <Text style={dynamicStyles.soundIcon}>🔊</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Keypad */}
        <View style={dynamicStyles.keypadContainer}>
          <View style={styles.keypadGrid}>
            {numberWords.map((number, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.keypadButton,
                  userInput.includes(number) && styles.pressedButton,
                ]}
                onPress={() => handleNumberPress(number)}
                disabled={userInput.length >= 4}>
                <Text
                  style={[
                    styles.keypadButtonText,
                    userInput.includes(number) && styles.pressedButtonText,
                  ]}>
                  {getNumberDisplay(number)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Status Messages */}
        {isCorrect === false && (
          <View style={styles.statusContainer}>
            <Text style={styles.errorText}>Incorrect sequence. Try again.</Text>
          </View>
        )}

        {isCorrect === true && (
          <View style={styles.statusContainer}>
            <Text style={styles.successText}>Correct! Proceeding...</Text>
          </View>
        )}

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          {[0, 1, 2, 3].map(index => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index < userInput.length && styles.progressDotFilled,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  settingsOverlay: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  simpleContainer: {
    backgroundColor: 'white',
    padding: 20,
    alignItems: 'center',
    borderRadius: 10,
  },
  messageRow: {
    marginBottom: 20,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 16,
    color: '#146CF0',
    textAlign: 'center',
    fontWeight: '600',
  },
  soundButton: {
    marginLeft: 15,
    padding: 12,
    borderRadius: 25,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    width: 50,
    height: 50,
  },
  soundIcon: {
    fontSize: 24,
    color: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
    justifyContent: 'center',
    minHeight: 80,
    paddingVertical: 20,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#146CF0',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  sequenceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#146CF0',
    textTransform: 'capitalize',
  },

  keypadContainer: {
    marginBottom: 20,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
  },
  keypadButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#146CF0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#146CF0',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  pressedButton: {
    backgroundColor: '#47B76F',
    transform: [{scale: 0.95}],
  },
  keypadButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  pressedButtonText: {
    color: 'white',
  },
  statusContainer: {
    marginBottom: 15,
  },
  errorText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  successText: {
    color: '#47B76F',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  progressDotFilled: {
    backgroundColor: '#146CF0',
  },
});

export default ParentalGate;
