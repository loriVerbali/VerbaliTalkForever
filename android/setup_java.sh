#!/bin/bash

# Setup script for Java 17 and Android build environment
echo "Setting up Java 17 for Android builds..."

# Check if Java 17 is available
if [ -d "/opt/homebrew/Cellar/openjdk@17/17.0.16/libexec/openjdk.jdk" ]; then
    echo "✅ Java 17 (Homebrew OpenJDK) found at /opt/homebrew/Cellar/openjdk@17/17.0.16/libexec/openjdk.jdk"
    export JAVA_HOME="/opt/homebrew/Cellar/openjdk@17/17.0.16/libexec/openjdk.jdk/Contents/Home"
    echo "JAVA_HOME set to: $JAVA_HOME"
elif [ -d "/Library/Java/JavaVirtualMachines/zulu-17.jdk" ]; then
    echo "✅ Java 17 (Zulu) found at /Library/Java/JavaVirtualMachines/zulu-17.jdk"
    export JAVA_HOME="/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home"
    echo "JAVA_HOME set to: $JAVA_HOME"
else
    echo "❌ Java 17 not found. Please install Java 17:"
    echo "   brew install openjdk@17"
    echo "   or brew install --cask zulu17"
    echo "   or download from: https://www.azul.com/downloads/?package=jdk#zulu"
    exit 1
fi

# Check Java version
java_version=$("$JAVA_HOME/bin/java" -version 2>&1 | head -n 1 | cut -d'"' -f2)
echo "Java version: $java_version"

# Set environment variables
export PATH="$JAVA_HOME/bin:$PATH"

echo ""
echo "Environment setup complete. You can now run:"
echo "  cd android"
echo "  ./gradlew clean"
echo "  ./gradlew assembleDebug"
echo ""
echo "Or build from the root directory:"
echo "  npx react-native run-android"
