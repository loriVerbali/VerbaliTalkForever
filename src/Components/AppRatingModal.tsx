import React, {useState, useEffect} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import InAppReview from 'react-native-in-app-review';
import {Mixpanel} from 'mixpanel-react-native';

const {width, height} = Dimensions.get('window');

type RatingModalState =
  | 'initial' // "Do you like MaTalk AI?"
  | 'rating' // Rating prompt with store links
  | 'feedback' // Feedback checklist
  | 'confirmation'; // Thanks message

interface AppRatingModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => Promise<void>;
}

const FEEDBACK_OPTIONS = [
  'Hard to find words or buttons',
  "Suggestions aren't relevant or helpful",
  'Performance issues or crashes',
  'Missing words/phrases/images I need',
  'Too many steps/taps to say something',
  "Voice/speech output quality isn't good",
  'Visual design is confusing or not accessible',
  "Doesn't work well offline or on my device",
];

const AppRatingModal: React.FC<AppRatingModalProps> = ({
  visible,
  onClose,
  onDismiss,
}) => {
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);
  const [state, setState] = useState<RatingModalState>('initial');
  const [selectedFeedback, setSelectedFeedback] = useState<Set<string>>(
    new Set(),
  );
  const [reviewAvailable, setReviewAvailable] = useState(false);

  // Check if in-app review is available when modal opens
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const available = await InAppReview.isAvailable();
        setReviewAvailable(available);
      } catch (error) {
        console.error('Error checking review availability:', error);
        setReviewAvailable(false);
      }
    };

    if (visible && state === 'initial') {
      checkAvailability();
    }
  }, [visible, state]);

  const handleYes = async () => {
    // Mark as dismissed so it never shows again
    if (onDismiss) {
      await onDismiss();
    }
    // If native review is available, request it directly without showing intermediate state
    if (reviewAvailable) {
      try {
        await InAppReview.RequestInAppReview();
        onClose();
        resetState();
        return;
      } catch (error) {
        console.error('Error requesting in-app review:', error);
        // Fallback to showing rating state if review fails
      }
    }
    // Show rating UI as fallback if native review not available
    setState('rating');
  };

  const handleNo = async () => {
    // Mark as dismissed so it never shows again
    if (onDismiss) {
      await onDismiss();
    }
    setState('feedback');
  };

  const handleSkip = async () => {
    // Mark as dismissed so it never shows again
    if (onDismiss) {
      await onDismiss();
    }
    onClose();
    resetState();
  };

  const handleRate = async () => {
    // Mark as dismissed so it never shows again
    if (onDismiss) {
      await onDismiss();
    }
    try {
      // Use native in-app review API
      await InAppReview.RequestInAppReview();
      onClose();
      resetState();
    } catch (error) {
      console.error('Error requesting in-app review:', error);
      // On error, just close the modal
      onClose();
      resetState();
    }
  };

  const handleMaybeLater = async () => {
    // Mark as dismissed so it never shows again
    if (onDismiss) {
      await onDismiss();
    }
    onClose();
    resetState();
  };

  const handleFeedbackToggle = (option: string) => {
    const newSelection = new Set(selectedFeedback);
    if (newSelection.has(option)) {
      newSelection.delete(option);
    } else {
      newSelection.add(option);
    }
    setSelectedFeedback(newSelection);
  };

  const handleSubmitFeedback = () => {
    // Track feedback in Mixpanel
    const feedbackArray = Array.from(selectedFeedback);
    mixpanel.track('feedback', {
      feedback: feedbackArray,
    });

    console.log('Feedback submitted:', feedbackArray);

    setState('confirmation');
  };

  const handleDone = async () => {
    // Mark as dismissed so it never shows again (user already provided feedback)
    if (onDismiss) {
      await onDismiss();
    }
    onClose();
    resetState();
  };

  const resetState = () => {
    setState('initial');
    setSelectedFeedback(new Set());
  };

  const renderInitial = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.title}>Quick question before you go</Text>
      <Text style={styles.body}>Do you like MaTalk AI?</Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleYes}>
          <Text style={styles.primaryButtonText}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleNo}>
          <Text style={styles.secondaryButtonText}>No</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tertiaryLink} onPress={handleSkip}>
          <Text style={styles.tertiaryLinkText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRating = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.body}>
        {reviewAvailable
          ? 'Opening the native review dialog...'
          : 'Native review is not available. Please rate us in the app store.'}
      </Text>
      <View style={styles.buttonContainer}>
        {!reviewAvailable && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleRate}>
            <Text style={styles.primaryButtonText}>
              {Platform.OS === 'ios'
                ? 'Rate on the App Store'
                : 'Rate on Google Play'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleMaybeLater}>
          <Text style={styles.secondaryButtonText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFeedback = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.title}>How can we improve MaTalk AI?</Text>
      <Text style={styles.body}>Pick all that apply.</Text>
      <ScrollView
        style={styles.feedbackScrollView}
        contentContainerStyle={styles.feedbackContent}>
        {FEEDBACK_OPTIONS.map((option, index) => {
          const isSelected = selectedFeedback.has(option);
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.feedbackOption,
                isSelected && styles.feedbackOptionSelected,
              ]}
              onPress={() => handleFeedbackToggle(option)}>
              <View style={styles.checkboxContainer}>
                <View
                  style={[
                    styles.checkbox,
                    isSelected && styles.checkboxChecked,
                  ]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text
                  style={[
                    styles.feedbackOptionText,
                    isSelected && styles.feedbackOptionTextSelected,
                  ]}>
                  {option}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            selectedFeedback.size === 0 && styles.primaryButtonDisabled,
          ]}
          onPress={handleSubmitFeedback}
          disabled={selectedFeedback.size === 0}>
          <Text style={styles.primaryButtonText}>Submit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConfirmation = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.title}>
        Thanks—your feedback helps us build a better MaTalk AI.
      </Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleDone}>
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {state === 'initial' && renderInitial()}
          {state === 'rating' && renderRating()}
          {state === 'feedback' && renderFeedback()}
          {state === 'confirmation' && renderConfirmation()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: width * 0.85,
    maxWidth: 500,
    maxHeight: height * 0.8,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  contentContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#8E24AA',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8E24AA',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: '#8E24AA',
    fontSize: 16,
    fontWeight: '600',
  },
  tertiaryLink: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tertiaryLinkText: {
    color: '#8E24AA',
    fontSize: 14,
    fontWeight: '500',
  },
  feedbackScrollView: {
    maxHeight: height * 0.4,
    width: '100%',
    marginBottom: 20,
  },
  feedbackContent: {
    gap: 12,
  },
  feedbackOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f8f9fe',
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  feedbackOptionSelected: {
    backgroundColor: '#f3e5f5',
    borderColor: '#8E24AA',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#8E24AA',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#8E24AA',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  feedbackOptionText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    lineHeight: 20,
  },
  feedbackOptionTextSelected: {
    color: '#8E24AA',
    fontWeight: '500',
  },
});

export default AppRatingModal;
