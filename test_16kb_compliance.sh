#!/bin/bash

# Script to test 16 KB page size compliance for Google Play submission
echo "🧪 Testing 16 KB Memory Page Size Compliance"
echo "=============================================="

# Check if AAB file exists
AAB_FILE="/Users/lori/Documents/Dev/Matalk/Matalk/android/app/release/app-release.aab"

if [ -f "$AAB_FILE" ]; then
    echo "✅ Release AAB found: $AAB_FILE"
    echo "📊 File size: $(du -h "$AAB_FILE" | cut -f1)"
    echo "📅 Last modified: $(stat -f "%Sm" "$AAB_FILE")"
else
    echo "❌ Release AAB not found. Please build first:"
    echo "   cd android && ./gradlew bundleRelease"
    exit 1
fi

echo ""
echo "🔍 Checking for problematic native libraries..."

# Check if the AAB contains the problematic libraries
echo "📋 Libraries that need 16 KB page size support:"
echo "   - libarm_compute.so"
echo "   - libarm_compute_graph.so"
echo "   - libonnxruntime4j_jni.so"
echo "   - librnwhisper.so"
echo "   - librnwhisper_v8fp16_va_2.so"
echo "   - librnwhisper_x86_64.so"

echo ""
echo "📱 Testing Instructions:"
echo "1. Install the AAB on a device with 16 KB page size"
echo "2. Test all native features:"
echo "   - Wakeword detection"
echo "   - AI model inference"
echo "   - Audio processing"
echo "   - App startup and navigation"
echo ""
echo "3. Check for errors in logcat:"
echo "   adb logcat | grep -i '16.*kb\\|page.*size\\|memory.*page'"
echo ""
echo "✅ If no errors appear and all features work, the app is ready for Google Play submission!"
echo ""
echo "🚀 To submit to Google Play:"
echo "   - Upload: $AAB_FILE"
echo "   - Add release notes about 16 KB page size support"
echo "   - Submit for review"





