// Simple test to verify audio recording configuration
const AudioRecorderPlayer = require('react-native-audio-recorder-player');

// Test the configuration
const testConfig = {
  AVEncoderAudioQualityKeyIOS: 'high',
  AVNumberOfChannelsKeyIOS: 1,
  AVFormatIDKeyIOS: 'aac',
};

console.log('Test configuration:', testConfig);
console.log('AudioRecorderPlayer available:', !!AudioRecorderPlayer);
console.log(
  'startRecorder method available:',
  !!AudioRecorderPlayer.startRecorder,
);
