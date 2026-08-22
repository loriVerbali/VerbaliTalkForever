#!/bin/bash
# Post-install fixes for node_modules native deps. Runs on every install via
# the postinstall script in package.json.
set -e
cd "$(dirname "$0")/.."

# --- Fix 1: 16 KB page size ---------------------------------------------------
# The DaVoice TTS AAR bundles a libc++_shared.so aligned for 4 KB memory pages,
# which fails Google Play's 16 KB page size requirement. The app already gets a
# 16 KB-aligned libc++_shared.so from the wakeword AAR (resolved via pickFirst
# in android/app/build.gradle), so we strip the bad copy from the TTS AAR.
AAR="node_modules/react-native-davoice-tts/android/libs/com/davoice/tts/1.0.0/tts-1.0.0.aar"

if [ -f "$AAR" ]; then
  if unzip -l "$AAR" | grep -q "libc++_shared.so"; then
    zip -d "$AAR" "jni/*/libc++_shared.so"
    echo "postinstall-fixes: stripped 4 KB-aligned libc++_shared.so from TTS AAR"
  else
    echo "postinstall-fixes: TTS AAR already stripped"
  fi
else
  echo "postinstall-fixes: $AAR not found, skipping"
fi

# --- Fix 2: RN 0.82 API removals in third-party native modules ----------------
# RN 0.82 deprecated ContextContainer::Shared and RN's shared cmake flags add
# -Werror, which can kill the reanimated build. Demote deprecation warnings
# back to warnings for the reanimated target.
F="node_modules/react-native-reanimated/android/CMakeLists.txt"
if [ -f "$F" ] && grep -q "target_compile_reactnative_options(reanimated PUBLIC)" "$F" \
   && ! grep -q "Wno-error=deprecated-declarations" "$F"; then
  perl -pi -e 's/\Qtarget_compile_reactnative_options(reanimated PUBLIC)\E/target_compile_reactnative_options(reanimated PUBLIC)\n  target_compile_options(reanimated PRIVATE -Wno-error=deprecated-declarations)/' "$F"
  echo "postinstall-fixes: allowed deprecated-declarations warnings in reanimated"
fi

# RN 0.82 removed the currentActivity property from
# ReactContextBaseJavaModule; react-native-iap 12.x still reads it. The same
# activity is available via reactApplicationContext.
F="node_modules/react-native-iap/android/src/play/java/com/dooboolab/rniap/RNIapModule.kt"
if [ -f "$F" ] && grep -q "val activity = currentActivity" "$F"; then
  sed -i '' 's/val activity = currentActivity/val activity = reactApplicationContext.currentActivity/' "$F"
  echo "postinstall-fixes: patched currentActivity in react-native-iap for RN 0.82"
fi

# --- Fix 3: DaVoice TTS 1.5 s completion margin -------------------------------
# The DaVoice Android engine defaults completionSafetyMarginMs to 1500 ms:
# stopSpeaking() force-sleeps that long on the RN native-modules thread, and
# onFinishedSpeaking fires that long after audio ends — together adding ~1.5 s
# to every tap-to-speech cycle. Set a 250 ms margin (still covers the device
# audio tail) right after the interface is constructed.
F="node_modules/react-native-davoice-tts/android/src/main/java/com/davoice/tts/rn/DaVoiceTTSBridge.java"
if [ -f "$F" ] && grep -q "new DaVoiceTTSInterface(context);" "$F" \
   && ! grep -q "setCompletionSafetyMarginMs" "$F"; then
  perl -pi -e 's/\Q        this.tts = new DaVoiceTTSInterface(context);\E/        this.tts = new DaVoiceTTSInterface(context);\n        \/\/ Engine defaults completionSafetyMarginMs to 1500 ms; see postinstall-fixes.sh.\n        this.tts.setCompletionSafetyMarginMs(250);/' "$F"
  echo "postinstall-fixes: set DaVoice TTS completion margin to 250 ms"
fi

# --- Fix 4: jcenter() removed in Gradle 9 -------------------------------------
# These packages still reference the defunct jcenter() repository, which is no
# longer a valid method in Gradle 9. Replace with mavenCentral().
for f in \
  "node_modules/react-native-sqlite-storage/platforms/android/build.gradle" \
  "node_modules/react-native-tts/android/build.gradle"; do
  if [ -f "$f" ] && grep -q "jcenter()" "$f"; then
    sed -i '' 's/jcenter()/mavenCentral()/g' "$f"
    echo "postinstall-fixes: replaced jcenter() with mavenCentral() in $f"
  fi
done

# --- Fix 5: DaVoice TTS debug logging -----------------------------------------
# The TTS package ships with verbose debug logging enabled: speech/index.ts has
# VERBOSE=true plus ~24 ungated console.logs, the JS bridges log at module load,
# and DaVoiceTTSBridge.java emits Log.d/Log.i on every playWav call. Silence
# everything except error/warn logging.
F="node_modules/react-native-davoice-tts/speech/index.ts"
if [ -f "$F" ] && grep -q 'const VERBOSE = true;' "$F"; then
  perl -pi -e 's/\Qconst VERBOSE = true;\E/const VERBOSE = false;/' "$F"
  # dbgErr() is real error reporting: route it to console.error before gating.
  perl -pi -e "s/console\\.log\\(ts\\(\\), PFX, '❌', \\.\\.\\.args\\);/console.error(ts(), PFX, '❌', ...args);/" "$F"
  # Gate every remaining ungated console.log behind the VERBOSE flag.
  perl -pi -e 's/(?<!&& )console\.log\(/VERBOSE && console.log(/g' "$F"
  echo "postinstall-fixes: silenced DaVoice speech JS debug logging"
fi

F="node_modules/react-native-davoice-tts/stt/index.ts"
if [ -f "$F" ]; then
  perl -ni -e "print unless /console\\.log\\('STTNative loaded:/" "$F"
fi
F="node_modules/react-native-davoice-tts/tts/DaVoiceTTSBridge.js"
if [ -f "$F" ]; then
  perl -ni -e "print unless /console\\.log\\('DaVoiceTTSBridge is loaded:/" "$F"
fi

# Comment out single-line Log.d/Log.i calls in the Android bridge (Log.w/Log.e
# stay). All active debug Log calls in this file are single-line statements.
F="node_modules/react-native-davoice-tts/android/src/main/java/com/davoice/tts/rn/DaVoiceTTSBridge.java"
if [ -f "$F" ] && grep -qE '^\s*Log\.[di]\(' "$F"; then
  perl -pi -e 's{^(\s*)Log\.([di])\(}{$1// Log.$2(}' "$F"
  echo "postinstall-fixes: silenced Log.d/Log.i in DaVoice TTS Android bridge"
fi
