#!/bin/bash

# Script to configure the app for Amazon Appstore submission
# This script applies Amazon-specific changes:
# 1. Updates Subscription.tsx to use 'matalk.yearly' instead of 'matalk.annual'
# 2. Updates build.gradle to only include ARM architectures and exclude whisper optimizations
# 3. Updates proguard-rules.pro to keep AndroidX multidex unobfuscated
# 4. Updates gradle.properties to ensure ARM-only architecture configuration

set -e  # Exit on error

echo "🔧 Configuring app for Amazon Appstore..."
echo "=========================================="

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SUBSCRIPTION_FILE="$SCRIPT_DIR/src/Components/Subscription.tsx"
BUILD_GRADLE_FILE="$SCRIPT_DIR/android/app/build.gradle"
PROGUARD_FILE="$SCRIPT_DIR/android/app/proguard-rules.pro"
GRADLE_PROPERTIES_FILE="$SCRIPT_DIR/android/gradle.properties"

# Check if files exist
if [ ! -f "$SUBSCRIPTION_FILE" ]; then
    echo "❌ Error: Subscription.tsx not found at $SUBSCRIPTION_FILE"
    exit 1
fi

if [ ! -f "$BUILD_GRADLE_FILE" ]; then
    echo "❌ Error: build.gradle not found at $BUILD_GRADLE_FILE"
    exit 1
fi

if [ ! -f "$PROGUARD_FILE" ]; then
    echo "❌ Error: proguard-rules.pro not found at $PROGUARD_FILE"
    exit 1
fi

if [ ! -f "$GRADLE_PROPERTIES_FILE" ]; then
    echo "❌ Error: gradle.properties not found at $GRADLE_PROPERTIES_FILE"
    exit 1
fi

# 1. Update Subscription.tsx - change matalk.annual to matalk.yearly
echo ""
echo "📝 Step 1: Updating Subscription.tsx..."
echo "   Changing 'matalk.annual' to 'matalk.yearly' for Android..."

# Use sed to replace matalk.annual with matalk.yearly (only for Android lines)
# This preserves iOS references to matalkai.annual
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS requires empty string after -i
    sed -i '' "s/'matalk\.annual'/'matalk.yearly'/g" "$SUBSCRIPTION_FILE"
else
    # Linux
    sed -i "s/'matalk\.annual'/'matalk.yearly'/g" "$SUBSCRIPTION_FILE"
fi

echo "   ✅ Subscription.tsx updated"

# 2. Update build.gradle - configure for Amazon compliance
echo ""
echo "📝 Step 2: Updating build.gradle..."
echo "   - Setting ARM-only architectures (armeabi-v7a, arm64-v8a)"
echo "   - Adding packagingOptions to exclude whisper optimization libraries"

# Create a temporary file for the updated build.gradle
TEMP_FILE=$(mktemp)

# Track if we're inside packagingOptions block
inside_packaging_options=false
added_whisper_excludes=false

# Process the file line by line
while IFS= read -r line; do
    # Replace the abiFilters line if it includes x86
    if [[ "$line" == *"abiFilters"* ]] && [[ "$line" == *"x86"* ]]; then
        echo "            abiFilters 'armeabi-v7a', 'arm64-v8a'" >> "$TEMP_FILE"
    # Track when we enter packagingOptions block
    elif [[ "$line" == *"packagingOptions"* ]]; then
        echo "$line" >> "$TEMP_FILE"
        inside_packaging_options=true
    # If we're closing packagingOptions and haven't added excludes yet, add them before the closing brace
    elif $inside_packaging_options && [[ "$line" == *"}"* ]] && ! $added_whisper_excludes; then
        echo "        " >> "$TEMP_FILE"
        echo "        // Amazon Appstore compliance: Exclude architecture-specific optimized whisper libraries" >> "$TEMP_FILE"
        echo "        // to ensure exact library name matching between 32-bit and 64-bit folders" >> "$TEMP_FILE"
        echo "        // Only keep the base librnwhisper.so in both architectures" >> "$TEMP_FILE"
        echo "        exclude \"**/librnwhisper_vfpv4.so\"          // 32-bit ARMv7 optimization" >> "$TEMP_FILE"
        echo "        exclude \"**/librnwhisper_v8fp16_va_2.so\"    // 64-bit ARM v8 optimization" >> "$TEMP_FILE"
        echo "$line" >> "$TEMP_FILE"
        inside_packaging_options=false
        added_whisper_excludes=true
    # Skip existing whisper exclude lines if they're already there
    elif [[ "$line" == *"librnwhisper_vfpv4.so"* ]] || [[ "$line" == *"librnwhisper_v8fp16_va_2.so"* ]]; then
        added_whisper_excludes=true
        echo "$line" >> "$TEMP_FILE"
    # Skip existing Amazon comment lines if they're already there
    elif [[ "$line" == *"Amazon Appstore compliance: Exclude architecture-specific"* ]]; then
        echo "$line" >> "$TEMP_FILE"
    else
        echo "$line" >> "$TEMP_FILE"
    fi
done < "$BUILD_GRADLE_FILE"

# Replace the original file
mv "$TEMP_FILE" "$BUILD_GRADLE_FILE"

echo "   ✅ build.gradle updated"

# 3. Update proguard-rules.pro - add AndroidX multidex keep rule
echo ""
echo "📝 Step 3: Updating proguard-rules.pro..."
echo "   Adding AndroidX multidex keep rule for Amazon Appstore..."

# Check if the rule already exists
if grep -q "androidx.multidex" "$PROGUARD_FILE"; then
    echo "   ℹ️  AndroidX multidex rule already exists"
else
    # Add the rule at the end of the file
    echo "" >> "$PROGUARD_FILE"
    echo "# Keep AndroidX multidex classes unobfuscated (required for Amazon Appstore)" >> "$PROGUARD_FILE"
    echo "-keep class androidx.multidex.** { *; }" >> "$PROGUARD_FILE"
    echo "   ✅ proguard-rules.pro updated"
fi

# 4. Update gradle.properties - ensure ARM-only configuration
echo ""
echo "📝 Step 4: Updating gradle.properties..."
echo "   Ensuring ARM-only architecture configuration..."

# Check if reactNativeArchitectures is already set to ARM-only
if grep -q "reactNativeArchitectures=armeabi-v7a,arm64-v8a" "$GRADLE_PROPERTIES_FILE"; then
    echo "   ℹ️  gradle.properties already configured for ARM-only"
else
    # Update or add the reactNativeArchitectures line
    if grep -q "reactNativeArchitectures=" "$GRADLE_PROPERTIES_FILE"; then
        # Replace existing line
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/reactNativeArchitectures=.*/reactNativeArchitectures=armeabi-v7a,arm64-v8a/" "$GRADLE_PROPERTIES_FILE"
        else
            sed -i "s/reactNativeArchitectures=.*/reactNativeArchitectures=armeabi-v7a,arm64-v8a/" "$GRADLE_PROPERTIES_FILE"
        fi
        echo "   ✅ gradle.properties updated"
    else
        # Add new line
        echo "" >> "$GRADLE_PROPERTIES_FILE"
        echo "# ARM-only architectures for Amazon Appstore compliance" >> "$GRADLE_PROPERTIES_FILE"
        echo "reactNativeArchitectures=armeabi-v7a,arm64-v8a" >> "$GRADLE_PROPERTIES_FILE"
        echo "   ✅ gradle.properties updated"
    fi
fi

echo ""
echo "✅ Amazon Appstore configuration complete!"
echo ""
echo "📋 Changes made:"
echo "   1. Subscription.tsx: Changed 'matalk.annual' → 'matalk.yearly' (Android)"
echo "   2. build.gradle: Set ARM-only architectures + excluded whisper optimizations"
echo "   3. proguard-rules.pro: Added AndroidX multidex keep rule"
echo "   4. gradle.properties: Confirmed ARM-only architecture configuration"
echo ""
echo "📱 Next steps:"
echo "   1. Clean build: cd android && ./gradlew clean"
echo "   2. Build release APK: ./gradlew assembleRelease"
echo "   3. Verify 64-bit compliance:"
echo "      unzip -l app/build/outputs/apk/release/app-release.apk | grep 'lib/'"
echo ""
echo "📦 Files modified:"
echo "   - $SUBSCRIPTION_FILE"
echo "   - $BUILD_GRADLE_FILE"
echo "   - $PROGUARD_FILE"
echo "   - $GRADLE_PROPERTIES_FILE"
echo ""
