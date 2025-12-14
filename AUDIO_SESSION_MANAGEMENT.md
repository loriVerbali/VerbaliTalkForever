# Audio Session Management Fix

## Problem

Three components (Wakeword, Whisper, TTS) were independently configuring `AVAudioSession`, causing conflicts:

- **Wakeword**: Needs recording always on
- **Whisper**: Needs recording + often different sample rate/buffer
- **TTS**: Needs playback (sometimes steals the route)

When each library configures `AVAudioSession` independently (category/mode/options + activate/deactivate), they stomp each other.

## Solution

Created a centralized **AudioSessionManager** that:

1. Configures the audio session **once** at app startup
2. Uses a single category/mode that works for all three components
3. Handles interruptions and route changes automatically
4. Prevents libraries from changing the session configuration

## Implementation

### Files Created

1. **`ios/Matalk/AudioSessionManager.swift`**

   - Centralized audio session configuration
   - Handles interruptions (Siri, phone calls, etc.)
   - Handles route changes (Bluetooth, headphones, etc.)
   - Tracks component states (optional)

2. **`ios/Matalk/AudioSessionManagerModule.swift`** + **`.m`**

   - React Native bridge module
   - Exposes methods to JavaScript (optional)
   - Emits events for interruptions

3. **`src/utils/AudioSessionManager.ts`**
   - TypeScript wrapper for JavaScript access
   - Optional - services can use this to notify the manager

### Configuration

The audio session is configured with:

- **Category**: `playAndRecord` (supports both recording and playback)
- **Mode**: `voiceChat` (optimized for voice communication)
  - Can be changed to `measurement` if ASR quality is better
- **Options**:
  - `defaultToSpeaker` - Audio plays through speaker by default
  - `allowBluetooth` - Allows Bluetooth audio devices
  - `allowBluetoothA2DP` - Allows high-quality Bluetooth audio

### Key Features

1. **Single Configuration Point**

   - Session is configured once at app startup in `AppDelegate`
   - All libraries use the same session configuration

2. **Automatic Recovery**

   - Handles interruptions (phone calls, Siri, etc.)
   - Automatically reactivates session when interruption ends
   - Detects route changes (Bluetooth connect/disconnect)
   - Reconfigures if another library tries to change the category

3. **Component Tracking** (Optional)
   - Services can notify the manager when they start/stop
   - Helps with debugging and future optimizations

## Usage

### Automatic (Recommended)

The audio session is automatically configured at app startup. No code changes needed in services.

### Optional: Notify Manager

If you want to track component states, you can optionally notify the manager:

```typescript
import AudioSessionManager from './utils/AudioSessionManager';

// In wakewordService.ts
AudioSessionManager.setWakewordActive(true); // When starting
AudioSessionManager.setWakewordActive(false); // When stopping

// In WhisperService.ts
AudioSessionManager.setWhisperActive(true); // When starting
AudioSessionManager.setWhisperActive(false); // When stopping

// In TTSService.ts
AudioSessionManager.setTTSActive(true); // When playing
AudioSessionManager.setTTSActive(false); // When stopped
```

### Manual Reactivation

If needed, you can manually reactivate the session:

```typescript
import AudioSessionManager from './utils/AudioSessionManager';

// After an interruption or error
await AudioSessionManager.reactivate();
```

## Testing

1. **Test Wakeword**

   - Wakeword should work continuously in background
   - Should recover after interruptions

2. **Test Whisper**

   - Recording should work when wakeword triggers
   - Should use correct sample rate/buffer

3. **Test TTS**

   - Playback should work without stealing the route
   - Should work after Whisper recording

4. **Test Interruptions**

   - Trigger Siri or phone call
   - Verify all services recover after interruption ends

5. **Test Route Changes**
   - Connect/disconnect Bluetooth headphones
   - Verify session remains active

## Troubleshooting

### If ASR quality is poor with `voiceChat` mode:

Edit `ios/Matalk/AudioSessionManager.swift` and change:

```swift
mode: .voiceChat, // Try .measurement if ASR quality is worse
```

to:

```swift
mode: .measurement, // Better for ASR, but test both
```

### If libraries still change the session:

The route change handler will detect category changes and reconfigure. Check logs for:

```
[AudioSessionManager] ⚠️ Audio category changed - reconfiguring...
```

### Debugging:

Check audio session status:

```typescript
const status = await AudioSessionManager.getStatus();
console.log('Audio session:', status);
```

## Next Steps

1. Rebuild the iOS app (native code changed):

   ```bash
   cd ios
   rm -rf build
   pod install
   cd ..
   npx react-native run-ios
   ```

2. Test all three components together
3. Monitor logs for any session conflicts
4. Adjust mode (`voiceChat` vs `measurement`) based on ASR quality

## Notes

- The session is kept active throughout the app lifecycle
- Components should **pause/resume** their engines rather than deactivating the session
- If any library calls `setActive(false)`, the route change handler will detect and reactivate

