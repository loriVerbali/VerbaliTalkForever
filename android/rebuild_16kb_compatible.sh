#!/bin/bash

# Script to rebuild ALL native libraries with 16 KB page size support
# This addresses the specific libraries mentioned in Google Play Console error

echo "🔧 Rebuilding ALL native libraries for 16 KB page size compatibility..."
echo "================================================================"

# Clean everything
echo "🧹 Cleaning all builds and caches..."
./gradlew clean
rm -rf app/.cxx
rm -rf app/build
rm -rf build
rm -rf .gradle

# Remove ALL cached native builds from node_modules
echo "🗑️  Removing ALL cached native builds from node_modules..."
find ../node_modules -name "*.so" -delete 2>/dev/null || true
find ../node_modules -name "build" -path "*/android/*" -type d -exec rm -rf {} + 2>/dev/null || true
find ../node_modules -name ".cxx" -type d -exec rm -rf {} + 2>/dev/null || true

# Clean React Native cache
echo "🧹 Cleaning React Native cache..."
cd ..
npx react-native start --reset-cache &
CACHE_PID=$!
sleep 5
kill $CACHE_PID 2>/dev/null || true
cd android

# Force rebuild with specific flags for 16 KB page size
echo "🔨 Rebuilding with 16 KB page size support..."
echo "This will rebuild ALL native libraries including:"
echo "  - libarm_compute.so (wakeword detection)"
echo "  - libonnxruntime4j_jni.so (AI models)"
echo "  - librnwhisper.so (audio processing)"
echo ""

# Build with specific flags to ensure 16 KB page size support
./gradlew bundleRelease \
    --no-build-cache \
    --rerun-tasks \
    -Pandroid.ndk.pageSizeAgnostic=true \
    -Pandroid.bundle.enableUncompressedNativeLibs=false

echo ""
echo "✅ Native library rebuild complete!"
echo ""
echo "📱 The new AAB should now support devices with 16 KB memory page sizes."
echo "🧪 Upload this new build to Google Play Console for testing."
echo ""
echo "📁 New AAB location:"
echo "   android/app/build/outputs/bundle/release/app-release.aab"





