import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import AVFoundation

@main
class AppDelegate: RCTAppDelegate {
  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    self.moduleName = "VerbaliTalkForever"
    self.dependencyProvider = RCTAppDependencyProvider()

    // You can add your custom initial props in the dictionary below.
    // They will be passed down to the ViewController used by React Native.
    self.initialProps = [:]
    
    // Initialize centralized audio session manager
    // This ensures one consistent audio session configuration for wakeword, Whisper, and TTS
    AudioSessionManager.sharedInstance().configureAudioSession()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
  
  // Handle linking
  override func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return RCTLinkingManager.application(app, open: url, options: options)
  }
  
  // Handle orientation changes for react-native-orientation-locker
  override func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
    return UIInterfaceOrientationMask.landscape
  }
  
}
