# Migration Guide: Replacing Whisper.rn with @dev-amirzubair/react-native-voice

## Overview

This guide explains how to replace your current Whisper-based transcription system with `@dev-amirzubair/react-native-voice` for real-time streaming transcription.

## Benefits

✅ **Real-time streaming** - Get transcription results as the user speaks via `onSpeechPartialResults`  
✅ **No audio file recording** - Library handles microphone access internally  
✅ **No Whisper models** - Uses device's built-in speech recognition (smaller app size)  
✅ **Simpler code** - No need to manage audio files, recording, and transcription separately  
✅ **Better performance** - No file I/O, no model loading, instant results

## Trade-offs

⚠️ **Different accuracy** - Uses device speech recognition (Google/Siri) instead of Whisper models  
⚠️ **Platform dependencies** - Android requires Google Search app for offline recognition  
⚠️ **iOS limitation** - Only works on physical devices (not simulators)

## Installation

1. **Install the library:**

```bash
yarn add @dev-amirzubair/react-native-voice
# or
npm install @dev-amirzubair/react-native-voice --save
```

2. **iOS Setup:**

```bash
cd ios && pod install
```

3. **Android Setup:**

   - No additional setup needed (autolinking handles it)
   - Ensure `RECORD_AUDIO` permission is in `AndroidManifest.xml` (you already have this)

4. **iOS Permissions (Info.plist):**
   - Add `NSMicrophoneUsageDescription`
   - Add `NSSpeechRecognitionUsageDescription`
   - (You may already have these)

## Code Changes

### Before (Current Flow):

1. `handleRecord()` → Start audio recording to file
2. `stopRecording()` → Stop recording, get file path
3. `transcribeAudioWithWhisper()` → Process audio file with Whisper
4. Get final transcription

### After (New Flow):

1. `startListening()` → Start voice recognition
2. `onSpeechPartialResults` → Get real-time streaming text
3. `onSpeechResults` → Get final transcription
4. `stopListening()` → Stop recognition

## Example Integration

See the updated `Home.android.tsx` and `Home.ios.tsx` files for full implementation.

### Key Changes:

1. **Replace imports:**

```typescript
// Remove:
import WhisperService from '../utils/WhisperService';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import AudioRecord from 'react-native-audio-record';

// Add:
import VoiceService from '../utils/VoiceService';
```

2. **Replace recording logic:**

```typescript
// OLD: handleRecord()
const handleRecord = async () => {
  // Start recording to file...
  AudioRecord.start();
  // or audioRecorderPlayer.startRecorder(...)
};

// NEW: handleRecord()
const handleRecord = async () => {
  await VoiceService.startListening(
    'en-US',
    (text, isFinal) => {
      // Real-time streaming updates
      if (!isFinal) {
        setTranscribedText(text); // Update UI in real-time
      }
    },
    finalText => {
      // Final transcription
      setTranscribedText(finalText);
      processTranscription(finalText);
    },
  );
};
```

3. **Replace stop recording:**

```typescript
// OLD: stopRecording()
const stopRecording = async () => {
  const filePath = await AudioRecord.stop();
  await transcribeAudioWithWhisper(filePath);
};

// NEW: stopRecording()
const stopRecording = async () => {
  await VoiceService.stopListening();
  // Final text is already available via callback
};
```

4. **Remove transcription function:**
   - No need for `transcribeAudioWithWhisper()` - transcription happens automatically
   - No need for `transcribeAudio()` - use the callback from `startListening()`

## What You Can Remove

✅ `whisper.rn` package  
✅ `react-native-audio-recorder-player` (if only used for transcription)  
✅ `react-native-audio-record` (if only used for transcription)  
✅ `WhisperService.ts`  
✅ `WhisperModelManager.ts` (if only used for Whisper)  
✅ Whisper model download logic  
✅ Audio file management code

## Important Notes

1. **Silence Detection**: The library handles this automatically on Android. On iOS, you may need to manually stop after detecting silence.

2. **Error Handling**: The library provides `onSpeechError` for error handling.

3. **Permissions**: Ensure microphone and speech recognition permissions are properly configured.

4. **Testing**: Test on physical devices, especially iOS (simulators don't support speech recognition).

## Migration Checklist

- [ ] Install `@dev-amirzubair/react-native-voice`
- [ ] Run `pod install` for iOS
- [ ] Replace `WhisperService` with `VoiceService` in Home screens
- [ ] Update `handleRecord()` to use `VoiceService.startListening()`
- [ ] Update `stopRecording()` to use `VoiceService.stopListening()`
- [ ] Remove audio recording code
- [ ] Remove Whisper transcription code
- [ ] Test on physical devices
- [ ] Remove unused packages (`whisper.rn`, audio recorders if not used elsewhere)
- [ ] Remove Whisper model files from app bundle
