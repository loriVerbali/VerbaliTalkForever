# iOS Wake Word Service Fix

## Problem
The wake word service ("Hey Verbi") was not working on iOS, showing errors like "Ensure wake word service is active."

## Root Cause
iOS requires proper audio session initialization before the wake word service can access the microphone. Additionally, the wake word model file path needs proper verification, and better error handling is needed for debugging.

## Fixes Applied

### 1. Audio Session Initialization (AppDelegate.swift)
**File:** `ios/Matalk/AppDelegate.swift`

Added audio session initialization in `application:didFinishLaunchingWithOptions` to properly configure the audio session for voice processing before the wake word service starts.

```swift
// Initialize audio session for wake word service and TTS
enableVoiceProcessingSession()
```

This ensures the microphone and audio system are ready for the wake word detector.

### 2. Enhanced Wake Word Service (wakewordService.ts)
**File:** `src/utils/wakewordService.ts`

#### Added Model File Verification
- Verifies the wake word model file exists before attempting initialization
- Platform-specific paths for iOS (MainBundle) and Android (assets)
- Provides clear error messages if model file is missing

#### Enhanced Logging
- Added detailed console logs for every step of initialization
- Prefixed all logs with `[WakeWord]` for easy filtering
- Logs include configuration details and success/failure status

#### Better Error Messages
- User-friendly error messages for common issues:
  - Missing model file
  - License validation failure
  - Microphone permission denied
  - Generic initialization errors
- Helps users quickly identify and fix issues

## How to Apply These Fixes

### Step 1: Rebuild iOS App
Since we modified native code (AppDelegate.swift), you need to rebuild the iOS app:

```bash
cd ios
rm -rf build
pod install
cd ..
npx react-native run-ios
```

### Step 2: Check Console Logs
Watch for `[WakeWord]` prefixed logs in the console to see detailed initialization progress:

```
[WakeWord] Starting initialization...
[WakeWord] Verifying model file at: /path/to/model
[WakeWord] Model file verified successfully
[WakeWord] Creating keyword instance...
[WakeWord] License validated successfully
[WakeWord] Initialization complete
[WakeWord] Starting listening...
[WakeWord] Now listening for wake word
```

## Troubleshooting

### Error: "Model file not found"
**Cause:** The `hey_verbi_v1.onnx` file is not included in the iOS build.

**Solution:**
1. Verify the file exists at `ios/models/hey_verbi_v1.onnx`
2. Check Xcode project that the file is included in "Copy Bundle Resources"
3. Rebuild the app

### Error: "License validation failed"
**Cause:** The WAKEWORD_LICENSE in .env is missing or invalid.

**Solution:**
1. Check `.env` file contains `WAKEWORD_LICENSE=...`
2. Restart Metro bundler: `yarn start --reset-cache`
3. Rebuild iOS app
4. Your current license expires: December 31, 2025 (valid until then)

### Error: "Microphone permission denied"
**Cause:** User hasn't granted microphone permissions.

**Solution:**
1. Go to iOS Settings > MaTalk AI > Microphone
2. Enable microphone access
3. Restart the app

### Service Still Not Working
If the service still doesn't work after applying fixes:

1. **Complete clean rebuild:**
   ```bash
   # Clean everything
   cd ios
   rm -rf build Pods Podfile.lock
   cd ..
   rm -rf node_modules yarn.lock
   
   # Reinstall
   yarn install
   cd ios && pod install && cd ..
   
   # Rebuild
   npx react-native run-ios
   ```

2. **Check audio session in Xcode:**
   - Open the app in Xcode
   - Run the app with debugger
   - Look for any AVAudioSession errors in the console

3. **Verify model file in Xcode:**
   - Open `ios/Matalk.xcodeproj` in Xcode
   - Navigate to the project
   - Check "Build Phases" > "Copy Bundle Resources"
   - Ensure `hey_verbi_v1.onnx` is listed
   - If not, add it manually

4. **Test on physical device:**
   - The wake word service may not work properly in the iOS Simulator
   - Always test on a real iPhone/iPad for accurate results

## Expected Behavior After Fix

1. **On App Launch:**
   - Audio session initializes automatically
   - Wake word service initializes in background
   - Console shows `[WakeWord]` logs indicating progress

2. **On Open Screen:**
   - Wake word service starts listening automatically
   - Console shows: `[WakeWord] Now listening for wake word`
   - No error messages

3. **When Saying "Hey Verbi":**
   - Wake word is detected
   - App navigates to HOME screen
   - Service stops listening (as designed)
   - Service restarts after conversation ends

## Verification Checklist

- [ ] Audio session initializes on app launch (check logs)
- [ ] Model file exists and is verified
- [ ] License validates successfully
- [ ] Microphone permission granted
- [ ] Wake word service starts without errors
- [ ] Console shows `[WakeWord] Now listening for wake word`
- [ ] Saying "Hey Verbi" triggers navigation
- [ ] Service works consistently on physical device

## Additional Notes

### License Expiration
Your current wake word license expires on **December 31, 2025**. You'll need to request a new license before this date to continue using the wake word feature.

### iOS Simulator Limitations
The wake word detector may not work properly in the iOS Simulator due to:
- Audio input limitations
- Different audio session behavior
- Model loading differences

**Always test on a real iOS device** for accurate wake word functionality.

### Model File Details
- **File:** `hey_verbi_v1.onnx`
- **Location (iOS):** `ios/models/hey_verbi_v1.onnx`
- **Wake phrase:** "Hey Verbi"
- **Detection threshold:** 0.9999 (very high confidence required)
- **Buffer count:** 3 frames

## Support

If issues persist after following all troubleshooting steps:

1. Check console logs for `[WakeWord]` messages
2. Note the exact error message
3. Verify all checklist items above
4. Check the device is not in Low Power Mode (affects microphone)
5. Ensure iOS version is compatible (iOS 15.1+)

## Files Modified

- `ios/Matalk/AppDelegate.swift` - Added audio session initialization
- `src/utils/wakewordService.ts` - Enhanced error handling and logging



