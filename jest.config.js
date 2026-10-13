module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/iep/.*/helpers\\.ts$'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-gesture-handler|react-native-reanimated|react-native-vector-icons|react-native-fs|react-native-svg|react-native-share|@react-navigation/.*)/)',
  ],
};
