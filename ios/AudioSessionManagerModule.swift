import Foundation
import React

@objc(AudioSessionManagerModule)
class AudioSessionManagerModule: RCTEventEmitter {
  
  private func log(_ msg: String) { print("[AudioSession][Module] \(msg)") }
  private var hasListeners = false
  
  override init() {
    super.init()
    // Listen for interruption ended events
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruptionEnded),
      name: NSNotification.Name("AudioSessionInterruptionEnded"),
      object: nil
    )
    log("module initialized")
  }
  
  deinit {
    NotificationCenter.default.removeObserver(self)
  }
  
  @objc
  func handleInterruptionEnded() {
    if hasListeners {
      sendEvent(withName: "audioSessionInterruptionEnded", body: nil)
    }
  }
  
  override func startObserving() {
    hasListeners = true
    log("startObserving")
  }
  
  override func stopObserving() {
    hasListeners = false
    log("stopObserving")
  }
  
  @objc override func addListener(_ eventName: String!) {
    // React Native calls this method to register listeners.
    // We handle presence of listeners with hasListeners flag.
  }
  
  @objc override func removeListeners(_ count: Double) {
    // React Native calls this method on removing listeners.
    // No-op in this implementation.
  }
  
  // MARK: - RCTBridgeModule
  
  @objc
  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  override func supportedEvents() -> [String]! {
    return ["audioSessionInterruptionEnded"]
  }
  
  // MARK: - Exposed Methods
  
  @objc
  func configure(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.log("configure() called")
      AudioSessionManager.sharedInstance().configureAudioSession()
      resolve(true)
    }
  }
  
  @objc
  func reactivate(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.log("reactivate() called")
      AudioSessionManager.sharedInstance().reactivateSession()
      resolve(true)
    }
  }
  
  @objc
  func setWakewordActive(_ active: Bool) {
    log("setWakewordActive(\(active)) called")
    AudioSessionManager.sharedInstance().setWakewordActive(active)
  }
  
  @objc
  func setWhisperActive(_ active: Bool) {
    log("setWhisperActive(\(active)) called")
    AudioSessionManager.sharedInstance().setWhisperActive(active)
  }
  
  @objc
  func setTTSActive(_ active: Bool) {
    log("setTTSActive(\(active)) called")
    AudioSessionManager.sharedInstance().setTTSActive(active)
  }
  
  @objc
  func getStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    log("getStatus() called")
    let manager = AudioSessionManager.sharedInstance()
    let status: [String: Any] = [
      "category": manager.getCurrentCategory(),
      "mode": manager.getCurrentMode(),
      "isActive": manager.isSessionActive()
    ]
    resolve(status)
  }
  
  @objc
  func prepareForWakeword(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    log("prepareForWakeword() called")
    AudioSessionManager.sharedInstance().prepareForWakeword()
    resolve(true)
  }
  
  @objc
  func prepareForWhisper(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    log("prepareForWhisper() called")
    AudioSessionManager.sharedInstance().prepareForWhisper()
    resolve(true)
  }
  
  @objc
  func prepareForTTS(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    log("prepareForTTS() called")
    AudioSessionManager.sharedInstance().prepareForTTS()
    resolve(true)
  }
  
  @objc
  func endTTS(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    log("endTTS() called")
    // currently a no-op; could deactivate or clear ttsActive
    AudioSessionManager.sharedInstance().setTTSActive(false)
    resolve(true)
  }
  
  @objc
  func endWakeword(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    log("endWakeword() called")
    AudioSessionManager.sharedInstance().setWakewordActive(false)
    resolve(true)
  }
  
  @objc
  func hardResetSession(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    log("hardResetSession() called")
    DispatchQueue.main.async {
      AudioSessionManager.sharedInstance().deactivateSession()
      AudioSessionManager.sharedInstance().configureAudioSession()
      resolve(true)
    }
  }
}

