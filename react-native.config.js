const path = require('path');

module.exports = {
  dependencies: {
    'react-native-sherpa-onnx-offline-tts': {
      platforms: {
        android: null, // disable Android platform auto linking
      },
    },
    'whisper.rn': {
      root: path.join(__dirname, 'node_modules/whisper.rn'),
    },
  },
};
