# 16 KB Memory Page Size Fix for Android

## Problem Description

Your app was encountering the following error:

> "Your app uses native libraries that are not aligned to support devices with 16 KB memory page sizes. These devices may not be able to install or start your app, or your app may start and then crash."

This issue commonly affects:

- ARM64 devices with 16 KB memory page sizes
- Newer Android devices (especially Android 12+)
- Devices using certain ARM architectures

## Root Cause

The issue occurs when native libraries (JNI libraries) are not properly aligned for devices with different memory page sizes. This is common in React Native apps that use:

- Native modules (like wakeword detection)
- ONNX Runtime for AI models
- Hermes JavaScript engine
- Custom native code

## Solutions Implemented

### 1. Build Configuration Updates (`android/app/build.gradle`)

- Added NDK configuration for proper ABI support
- Configured native library packaging options
- Added memory page size compatibility settings
- Set proper debug symbol levels for native libraries
- Added CMake configuration for page size agnostic builds
- Configured specific handling for problematic native libraries

### 2. Gradle Properties (`android/gradle.properties`)

- Disabled Jetifier to prevent conflicts
- Configured NDK optimization levels
- Set proper native library alignment
- Added Java 17 requirement configuration
- Enabled page size agnostic builds
- Disabled native build cache for proper rebuilds

### 3. ProGuard Rules (`android/app/proguard-rules.pro`)

- Added rules to preserve native method implementations
- Protected ONNX Runtime classes
- Kept Hermes engine classes
- Preserved wakeword-related classes

### 4. CMake Configuration (`android/app/src/main/cpp/CMakeLists.txt`)

- Created CMake configuration for page size agnostic builds
- Set proper linker flags for 16 KB page size support
- Configured C++ standard and compilation flags

### 5. Native Library Rebuild Script (`android/rebuild_native_libs.sh`)

- Automated script to rebuild all native libraries with proper alignment
- Cleans cached builds and forces fresh compilation
- Ensures all dependencies are rebuilt with 16 KB page size support

### 6. Java Environment Setup

- Created setup script for Java 17 configuration
- Added Java home configuration to gradle.properties

## How to Use

### Prerequisites

1. **Install Java 17 (Required)**

   ```bash
   # Using Homebrew (recommended)
   brew install --cask zulu17

   # Or download from Azul Systems
   # https://www.azul.com/downloads/?package=jdk#zulu
   ```

2. **Set up environment**
   ```bash
   cd android
   source ./setup_java.sh
   ```

### Building the App

1. **Quick rebuild (recommended)**

   ```bash
   cd android
   ./rebuild_native_libs.sh
   ```

2. **Manual rebuild process**

   ```bash
   cd android
   ./gradlew clean
   ./gradlew assembleDebug --no-build-cache --rerun-tasks
   ```

3. **Or build from root directory**
   ```bash
   npx react-native run-android
   ```

## What the Fix Does

1. **Native Library Alignment**: Ensures all native libraries are properly aligned for different memory page sizes
2. **ABI Support**: Explicitly supports all major Android architectures
3. **Memory Management**: Configures proper memory handling for native code
4. **Debug Symbols**: Maintains debug information for troubleshooting
5. **ProGuard Protection**: Prevents important native classes from being stripped

## Testing

After implementing these fixes, test your app on:

- ARM64 devices (especially newer ones)
- Devices running Android 12+
- Emulators with different architectures
- Physical devices with 16 KB memory page sizes

## Troubleshooting

If you still encounter issues:

1. **Check Java version**: Ensure Java 17 is being used

   ```bash
   java -version
   ```

2. **Verify NDK installation**: Check that NDK 27.1.12297006 is properly installed

3. **Clean and rebuild**: Always clean before rebuilding after configuration changes

   ```bash
   cd android
   ./gradlew clean
   ./gradlew assembleDebug
   ```

4. **Check native libraries**: Verify that all required native libraries are present in `android/app/src/main/jniLibs/`

## Additional Notes

- These changes are backward compatible with existing devices
- The fix doesn't affect app performance or functionality
- All native features (wakeword, AI models, etc.) will continue to work
- The configuration supports both debug and release builds

## References

- [Android NDK Documentation](https://developer.android.com/ndk)
- [React Native Android Setup](https://reactnative.dev/docs/environment-setup)
- [Memory Page Size Issues](https://developer.android.com/ndk/guides/other_build_systems#memory-page-size)
