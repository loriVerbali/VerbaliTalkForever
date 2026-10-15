import UIKit
import React
import React_RCTAppDelegate

/// UIScene life cycle entry point.
///
/// Apps built with the iOS 27 SDK must adopt the scene-based life cycle or UIKit refuses to
/// launch them ("UIScene life cycle is required for apps built with this SDK"). The process-level
/// setup (React Native factory) stays in AppDelegate; everything window-related lives here.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Keep `UIApplication.shared.delegate?.window` working for libraries that still look it up.
    appDelegate.window = window

    // Under the scene life cycle a cold-start URL is delivered through the connection options
    // instead of didFinishLaunchingWithOptions; mirror it into launchOptions so
    // Linking.getInitialURL() keeps working.
    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }

    factory.startReactNative(
      withModuleName: "MatalkForever",
      in: window,
      launchOptions: launchOptions
    )

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
  }

  // Handle linking (replaces application(_:open:options:) under the scene life cycle)
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
      if let sourceApplication = context.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }
      if let annotation = context.options.annotation {
        options[.annotation] = annotation
      }
      options[.openInPlace] = context.options.openInPlace
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: options)
    }
  }
}
