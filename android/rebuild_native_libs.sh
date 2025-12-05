#!/bin/bash

# Script to rebuild native libraries with 16 KB page size support
# This script ensures all native dependencies are rebuilt with proper alignment

echo "🔧 Rebuilding native libraries for 16 KB page size support..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
./gradlew clean

# Remove node_modules native builds to force rebuild
echo "🗑️  Removing cached native builds from node_modules..."
find ../node_modules -name "*.so" -path "*/android/build/*" -delete 2>/dev/null || true
find ../node_modules -name "build" -path "*/android/*" -type d -exec rm -rf {} + 2>/dev/null || true

# Clean React Native cache
echo "🧹 Cleaning React Native cache..."
cd ..
npx react-native start --reset-cache &
CACHE_PID=$!
sleep 5
kill $CACHE_PID 2>/dev/null || true
cd android

# Rebuild with proper configuration
echo "🔨 Rebuilding with 16 KB page size support..."
./gradlew assembleDebug --no-build-cache --rerun-tasks

echo "✅ Native library rebuild complete!"
echo ""
echo "📱 The app should now support devices with 16 KB memory page sizes."
echo "🧪 Test on ARM64 devices running Android 12+ to verify the fix."





