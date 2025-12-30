# App Launch Flow Analysis

## Flow on App Launch

### 1. **App.tsx Initialization**

- `index.js` → `App.tsx`
- **App.tsx** initializes:
  - Mixpanel (analytics)
  - TTS Service (`TTSService.initialize()`)
  - App state listeners for wake word management
  - **Note**: WhisperService is explicitly NOT pre-initialized here

### 2. **Context Providers Setup** (App.tsx)

Providers initialize in this order:

- `ToastProvider`
- `ConnectionProvider`
- `AppSettingsProvider` ⚠️ **CRITICAL DELAY POINT**
- `DatabaseProvider`
- `AdminProvider`
- `ChatContextProvider`
- `SoundProvider`
- `RootControllerView`

### 3. **AppSettingsProvider Initialization** (persistance.tsx)

- **Sequential storage reads**: Loops through ALL preference keys and reads from `DefaultPreference` one by one
- **Receipt validation**: Sets a 3-second timeout to validate iOS purchase receipt
- **Session manager**: Initializes guest session
- **Impact**: This happens synchronously and blocks rendering

### 4. **RootControllerView** (RootControllerView.tsx)

- Checks `wasOnboarded` from storage
- If `wasOnboarded !== '1'` → Shows `InitNavigation` (Onboarding)
- If `wasOnboarded === '1'` → Shows `LoggedNavigation` (Main App)

---

## Flow After Onboarding Completes

### 1. **Onboarding Completion** (Onboarding.tsx)

- User completes last step
- `handleNext()` is called:
  - Sets `wasOnboarded = '1'` in storage
  - Calls `completeOnboarding()` from context
  - This triggers `RootControllerView` to switch to `LoggedNavigation`

### 2. **LoggedNavigation Mounts** (LoggedNavigation.tsx)

- **Immediate check**: Reads `wasOnboarded` from storage (redundant - already checked in RootControllerView)
- **Waits for Open.tsx**: Polls wake word service status every 200ms for up to 3 seconds
  ```typescript
  maxWaitTime = 3000ms
  checkInterval = 200ms
  ```
- **After wake word ready**: Initializes WhisperService
  - Checks if model file exists (`RNFS.exists()`)
  - Checks file size (`RNFS.stat()`)
  - Detects device capabilities
  - Initializes Whisper
- **Restarts wake word**: After Whisper init, stops and restarts wake word (300ms delay)

### 3. **Open.tsx Mounts** (Open.tsx)

- **Initial delay**: 1.5 seconds (`INITIAL_DELAY_MS + 1000ms`)
  ```typescript
  await new Promise(resolve => setTimeout(resolve, 500 + 1000));
  ```
- **Permission check**: Checks microphone permission (iOS only) - ⚠️ **REDUNDANT** (already checked in onboarding)
- **Storage reads**: Reads 3 items sequentially:
  ```typescript
  const [isIOSActive, isInTrial, trialInstallationDate] = await Promise.all([
    getItem('isIOSActive'),
    getItem('isInTrial'),
    getItem('trialInstallationDate'),
  ]);
  ```
- **Wake word initialization**: Calls `wakeWordService.startListening()`
  - If not initialized, calls `initialize()` first
  - Has retry logic with exponential backoff (up to 3 retries)

### 4. **WakeWordService Initialization** (wakewordService.ts)

- **Device detection**: Happens in constructor (async, but doesn't block)
- **Initialization retries**: Up to 3 attempts with exponential backoff
  - Base delay: 1000ms
  - Retry delays: 1000ms, 2000ms, 4000ms
- **Native bridge calls**:
  - `createKeyWordRNBridgeInstance()`
  - `createInstance()` with model configuration
  - `setKeywordDetectionLicense()`
- **No file checks**: Model file is expected to be in bundle/assets (no verification)

---

## Identified Delays and Redundant Checks

### ⚠️ **Major Delays**

1. **Open.tsx initial delay: 1.5 seconds**

   - Location: `Open.tsx` line 323-325
   - Purpose: "Give LoggedNavigation time to initialize first"
   - **Issue**: This is backwards - LoggedNavigation waits for Open.tsx, not the other way around
   - **Recommendation**: Remove or reduce to 100-200ms

2. **LoggedNavigation polling: Up to 3 seconds**

   - Location: `LoggedNavigation.tsx` lines 48-66
   - Purpose: Wait for Open.tsx to initialize wake word
   - **Issue**: Open.tsx has a 1.5s delay, so this often waits the full 3 seconds
   - **Recommendation**: Reduce maxWaitTime to 2 seconds, or use event-based signaling

3. **WhisperService file checks**

   - Location: `WhisperService.ts` lines 92-112
   - Operations: `RNFS.exists()` + `RNFS.stat()`
   - **Issue**: File system I/O on every initialization
   - **Recommendation**: Cache result after first successful check

4. **Wake word restart after Whisper: 300ms delay**
   - Location: `LoggedNavigation.tsx` line 97
   - Purpose: Brief delay before restarting wake word
   - **Recommendation**: Could potentially be reduced to 100ms

### ⚠️ **Redundant Checks**

1. **Microphone permission check in Open.tsx**

   - Location: `Open.tsx` lines 336-374
   - **Issue**: Permission was already requested and granted during onboarding
   - **Recommendation**: Skip if onboarding was completed (permission already granted)

2. **wasOnboarded check in LoggedNavigation**

   - Location: `LoggedNavigation.tsx` line 33
   - **Issue**: Already checked in RootControllerView before mounting LoggedNavigation
   - **Recommendation**: Remove (LoggedNavigation only mounts if onboarded)

3. **Storage reads in Open.tsx wake word callback**

   - Location: `Open.tsx` lines 275-283 (in callback)
   - **Issue**: Reads same values that were already read during initialization
   - **Recommendation**: Cache values in component state

4. **Storage reads in Open.tsx initialization**

   - Location: `Open.tsx` lines 377-382
   - **Issue**: These values are read but only used for logging
   - **Recommendation**: Only read when actually needed (in callback)

5. **Device detection in WakeWordService**
   - Location: `wakewordService.ts` lines 58-66
   - **Issue**: Async operation in constructor, but doesn't block initialization
   - **Status**: Not a major issue, but could be lazy-loaded

### ⚠️ **Sequential Operations That Could Be Parallel**

1. **AppSettingsProvider preference loading**

   - Location: `persistance.tsx` lines 203-213
   - **Issue**: Reads all preferences sequentially in a loop
   - **Recommendation**: Use `Promise.all()` to read in parallel (if DefaultPreference supports it)

2. **Storage reads in Open.tsx**
   - Already using `Promise.all()` - ✅ Good

---

## Recommended Optimizations (Priority Order)

### 🔴 **High Priority - Quick Wins**

1. **Remove/reduce Open.tsx 1.5s delay**

   - Current: 1500ms
   - Recommended: 100-200ms (or remove entirely)
   - **Impact**: Saves ~1.3 seconds

2. **Skip microphone permission check in Open.tsx**

   - Only check if onboarding was skipped or permission was denied
   - **Impact**: Saves ~50-100ms + avoids unnecessary permission dialog

3. **Reduce LoggedNavigation maxWaitTime**

   - Current: 3000ms
   - Recommended: 2000ms
   - **Impact**: Saves up to 1 second if wake word initializes quickly

4. **Cache Whisper model file check**
   - Store result in memory after first check
   - **Impact**: Saves ~50-100ms on subsequent initializations

### 🟡 **Medium Priority**

5. **Remove redundant wasOnboarded check in LoggedNavigation**

   - **Impact**: Saves ~10-20ms

6. **Reduce wake word restart delay**
   - Current: 300ms
   - Recommended: 100ms
   - **Impact**: Saves 200ms

### 🟢 **Low Priority - Requires More Testing**

8. **Parallel preference loading in AppSettingsProvider**

   - Requires testing if DefaultPreference supports concurrent reads
   - **Impact**: Could save 100-200ms on first launch

9. **Event-based signaling instead of polling**
   - Replace LoggedNavigation polling with event emitter
   - **Impact**: More responsive, but requires refactoring

---

## Estimated Time Savings

If all high-priority optimizations are applied:

- **Current total delay**: ~4.5-5.5 seconds
- **Optimized delay**: ~2.5-3 seconds
- **Savings**: ~2 seconds faster to "Hey Verbi" ready

---

## Notes

- The wake word service doesn't verify model file existence (assumes it's in bundle)
- WhisperService does verify model file (downloaded to Documents directory)
- Permission checks during onboarding are necessary and should remain
- The retry logic in wake word service is important for reliability
