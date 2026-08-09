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

# --- Fix 3: jcenter() removed in Gradle 9 -------------------------------------
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
