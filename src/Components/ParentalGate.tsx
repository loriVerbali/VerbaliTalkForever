import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import {useAdmin} from '../contexts/adminContext';
import TTSService from '../utils/TTSService';

interface ParentalGateProps {
  onSuccess: () => void;
  onCancel?: () => void;
  isSettingsContext?: boolean;
  message?: string;
  /** Rendered below the gate card — for actions kids may take without a parent */
  footer?: React.ReactNode;
}

const ParentalGate: React.FC<ParentalGateProps> = ({
  onSuccess,
  onCancel,
  isSettingsContext = false,
  message,
  footer,
}) => {
  const {isTablet} = useAdmin();
  const {width, height} = useWindowDimensions();
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

  // Phones get a tighter layout so the whole gate (plus any footer) fits
  // without the keypad or the Go Back link being pushed off screen.
  const isCompactPhone = !isTablet && height < 780;
  const cardWidth = isTablet
    ? Math.min(width * 0.6, 640)
    : Math.min(width * 0.92, 420);
  const keypadButtonSize = isTablet ? 78 : isCompactPhone ? 54 : 62;
  const keypadGap = isTablet ? 18 : isCompactPhone ? 10 : 12;
  // Fixed width forces a 3x3 grid regardless of card width
  const keypadWidth = keypadButtonSize * 3 + keypadGap * 2;

  const content = (
    <>
      <View
        style={[
          styles.card,
          {width: cardWidth},
          isCompactPhone && styles.cardCompact,
        ]}>
        <View style={[styles.lockBadge, isCompactPhone && styles.lockBadgeCompact]}>
          <Text style={[styles.lockIcon, isCompactPhone && styles.lockIconCompact]}>
            🔒
          </Text>
        </View>
        <Text style={[styles.title, isCompactPhone && styles.titleCompact]}>
          Adults Only
        </Text>
        <Text
          style={[styles.messageText, isCompactPhone && styles.messageTextCompact]}>
          {message ||
            'Ask your parents or a caregiver to continue, this is a protected area:'}
        </Text>

        <View style={[styles.tapRow, isCompactPhone && styles.tapRowCompact]}>
          <View style={styles.tapPill}>
            <Text style={styles.tapText}>
              {`Tap: ${showSequence ? currentSequence.join(', ') : ''}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.soundButton}
            onPress={() => {
              TTSService.speak(
                'Please ask your parents to help you with this next step',
                true,
              );
            }}>
            <Text style={styles.soundIcon}>🔊</Text>
          </TouchableOpacity>
        </View>

        {/* Keypad */}
        <View
          style={[
            styles.keypadGrid,
            {width: keypadWidth, gap: keypadGap},
            isCompactPhone && styles.keypadGridCompact,
          ]}>
          {numberWords.map((number, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.keypadButton,
                {
                  width: keypadButtonSize,
                  height: keypadButtonSize,
                  borderRadius: keypadButtonSize / 2,
                },
                userInput.includes(number) && styles.pressedButton,
              ]}
              onPress={() => handleNumberPress(number)}
              disabled={userInput.length >= 4}>
              <Text
                style={[
                  styles.keypadButtonText,
                  isCompactPhone && styles.keypadButtonTextCompact,
                ]}>
                {getNumberDisplay(number)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Status Messages */}
        <View
          style={[
            styles.statusContainer,
            isCompactPhone && styles.statusContainerCompact,
          ]}>
          {isCorrect === false && (
            <Text style={styles.errorText}>Incorrect sequence. Try again.</Text>
          )}
          {isCorrect === true && (
            <Text style={styles.successText}>Correct! Proceeding...</Text>
          )}
        </View>

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

        {onCancel && (
          <TouchableOpacity
            style={[
              styles.cancelButton,
              isCompactPhone && styles.cancelButtonCompact,
            ]}
            onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Go Back</Text>
          </TouchableOpacity>
        )}
      </View>
      {footer}
    </>
  );

  // Tablets keep the original centered, non-scrolling layout. Phones scroll so
  // the keypad, Go Back and any footer stay reachable on short screens.
  if (isTablet || isSettingsContext) {
    return (
      <View style={isSettingsContext ? styles.settingsOverlay : styles.overlay}>
        {content}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollOverlay}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  // Fully opaque so the screen underneath is never visible through the gate
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8f9fe',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  // ScrollView on phones: the outer frame carries no layout props of its own so
  // the content container is free to size itself.
  scrollOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8f9fe',
    zIndex: 1000,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  settingsOverlay: {
    width: '100%',
    backgroundColor: '#f8f9fe',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    zIndex: 1000,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(20, 108, 240, 0.12)',
    shadowColor: '#146CF0',
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  cardCompact: {
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  lockBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(20, 108, 240, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  lockIcon: {
    fontSize: 26,
  },
  lockBadgeCompact: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginBottom: 8,
  },
  lockIconCompact: {
    fontSize: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#146CF0',
    marginBottom: 8,
  },
  messageText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 22,
    marginBottom: 16,
    maxWidth: 420,
  },
  titleCompact: {
    fontSize: 19,
    marginBottom: 6,
  },
  messageTextCompact: {
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 12,
  },
  tapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  tapRowCompact: {
    marginBottom: 14,
  },
  tapPill: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  tapText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FF6B35',
  },
  soundButton: {
    marginLeft: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(20, 108, 240, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soundIcon: {
    fontSize: 20,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
  },
  keypadGridCompact: {
    marginBottom: 10,
  },
  keypadButton: {
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
    fontSize: 24,
    fontWeight: 'bold',
  },
  keypadButtonTextCompact: {
    fontSize: 20,
  },
  statusContainer: {
    minHeight: 20,
    marginBottom: 12,
    justifyContent: 'center',
  },
  statusContainerCompact: {
    minHeight: 18,
    marginBottom: 8,
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
  cancelButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  cancelButtonCompact: {
    marginTop: 10,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default ParentalGate;
