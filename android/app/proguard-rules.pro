# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Keep native libraries for 16 KB memory page size support
-keep class com.verbali.matalkai.** { *; }

# Keep native method implementations
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep ONNX Runtime classes
-keep class ai.onnxruntime.** { *; }
-keep class com.microsoft.onnxruntime.** { *; }

# Keep Hermes engine classes
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep React Native native modules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.react.bridge.** { *; }

# Keep wakeword related classes
-keep class com.reactnativewakeword.** { *; }

# whisper.rn
-keep class com.rnwhisper.** { *; }