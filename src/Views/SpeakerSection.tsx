import React from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet} from 'react-native';

interface SpeakerSectionProps {
  onSpeakerChange: (speaker: string) => void;
  onAudienceChange: (audience: string) => void;
  onTypeChange: (type: string) => void;
}

const SpeakerSection: React.FC<SpeakerSectionProps> = ({
  onSpeakerChange,
  onAudienceChange,
  onTypeChange,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>The speaker:</Text>
        <View style={styles.imageContainer}>
          <TouchableOpacity
            style={styles.imageButton}
            onPress={() => onSpeakerChange('I')}>
            <Image
              source={require('../../assets/speaker-placeholder.png')}
              style={styles.image}
            />
            <Text style={styles.buttonText}>I</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>The audience:</Text>
        <View style={styles.imageContainer}>
          <TouchableOpacity
            style={styles.imageButton}
            onPress={() => onAudienceChange('Mom')}>
            <Image
              source={require('../../assets/mom-placeholder.png')}
              style={styles.image}
            />
            <Text style={styles.buttonText}>Mom</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Type of sentence:</Text>
        <View style={styles.imageContainer}>
          <TouchableOpacity
            style={styles.imageButton}
            onPress={() => onTypeChange('statement')}>
            <Image
              source={require('../../assets/statement-icon.png')}
              style={styles.image}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 200,
    backgroundColor: '#E5E5E5',
    borderRadius: 15,
    padding: 15,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  imageContainer: {
    alignItems: 'center',
  },
  imageButton: {
    alignItems: 'center',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  buttonText: {
    marginTop: 5,
    fontSize: 14,
    color: '#333',
  },
});

export default SpeakerSection;
