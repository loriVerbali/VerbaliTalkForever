# Wake Word Service Troubleshooting Guide

## Problem: "Wake word service force restart failed"

This error occurs when the wake word service fails to restart after an initial failure. Here's how to diagnose and fix the issue.

## Quick Diagnosis

Run the diagnostic script to identify the root cause:

```javascript
const {testWakeWord} = require('./test_wakeword');
testWakeWord();
```

## Common Causes and Solutions

### 1. **Model File Missing**

**Symptoms**: Service fails to initialize, "model not found" errors

**Solution**:

- Verify `hey_verbi_v1.onnx` exists in:
  - iOS: `ios/models/hey_verbi_v1.onnx`
  - Android: `android/app/src/main/assets/hey_verbi_v1.onnx`
- Check file permissions
- Rebuild the app if files are missing

### 2. **License Issues**

**Symptoms**: "License validation failed" errors

**Solution**:

- Check `.env` file for `WAKEWORD_LICENSE`
- Verify license is valid and not expired
- Ensure license format is correct

### 3. **Audio Session Conflicts**

**Symptoms**: Service starts but doesn't detect wake words

**Solution**:

- Check if other audio services are running
- Ensure proper audio session configuration
- Restart the app to clear audio session conflicts

### 4. **Permission Issues**

**Symptoms**: Service fails to start, microphone access denied

**Solution**:

- Check microphone permissions in device settings
- Request permissions explicitly if needed
- Restart app after granting permissions

### 5. **Instance Already Exists**

**Symptoms**: "Instance already exists" errors

**Solution**:

- The service now handles this automatically
- If persistent, restart the app completely
- Check for multiple service instances

## Debugging Steps

### Step 1: Check Service Status

```javascript
const WakeWordService = require('./src/utils/wakewordService').default;
const status = WakeWordService.getInstance().getStatus();
console.log('Service status:', status);
```

### Step 2: Run Full Diagnostics

```javascript
const WakeWordDebugger = require('./src/utils/wakewordDebugger').default;
const issues = await WakeWordDebugger.runDiagnostics();
console.log('Issues found:', issues);
```

### Step 3: Test Service Manually

```javascript
const WakeWordService = require('./src/utils/wakewordService').default;
const service = WakeWordService.getInstance();

try {
  await service.startListening();
  console.log('Service started successfully');

  // Wait 5 seconds
  setTimeout(async () => {
    await service.stopListening();
    console.log('Service stopped successfully');
  }, 5000);
} catch (error) {
  console.error('Service test failed:', error);
}
```

## Improved Error Handling

The wake word service now includes:

1. **Better Logging**: Detailed console logs for each step
2. **Restart Protection**: Prevents multiple simultaneous restarts
3. **Retry Limits**: Maximum 3 restart attempts before giving up
4. **State Management**: Proper cleanup and state tracking
5. **Error Recovery**: Automatic handling of common errors

## Force Restart Improvements

The `forceRestart()` method now:

- Prevents multiple simultaneous restarts
- Tracks restart attempts
- Provides detailed logging
- Handles cleanup more thoroughly
- Resets state properly

## Common Error Messages

### "Instance already exists"

- **Cause**: Multiple service instances
- **Solution**: Service now handles this automatically

### "Failed to create instance"

- **Cause**: Model file missing or corrupted
- **Solution**: Check model file location and integrity

### "License validation failed"

- **Cause**: Invalid or missing license
- **Solution**: Check `.env` file and license validity

### "Wake word instance not available"

- **Cause**: Service not properly initialized
- **Solution**: Call `initialize()` before using

## Prevention Tips

1. **Always check service status** before operations
2. **Handle errors gracefully** in UI components
3. **Use proper cleanup** in component unmount
4. **Monitor restart attempts** to prevent infinite loops
5. **Test on real devices** (not just simulator)

## Testing Checklist

- [ ] Model file exists and is accessible
- [ ] License is valid and properly configured
- [ ] Microphone permissions are granted
- [ ] No audio session conflicts
- [ ] Service initializes without errors
- [ ] Service starts listening successfully
- [ ] Service stops cleanly
- [ ] Force restart works when needed

## Emergency Recovery

If the service is completely broken:

1. **Restart the app completely**
2. **Clear app data/cache**
3. **Reinstall the app**
4. **Check device audio settings**
5. **Verify all dependencies are up to date**

## Support Information

When reporting issues, include:

1. Platform (iOS/Android)
2. Device model and OS version
3. App version
4. Error messages from console
5. Service status output
6. Diagnostic results

## Files Modified

- `src/utils/wakewordService.ts` - Enhanced error handling and logging
- `src/utils/wakewordDebugger.ts` - New debugging utility
- `src/Views/Open.tsx` - Improved error handling
- `test_wakeword.js` - Test script for debugging

## Next Steps

1. Run the diagnostic script to identify specific issues
2. Check console logs for detailed error information
3. Verify all prerequisites are met
4. Test the service manually
5. Contact support with specific error details if issues persist
