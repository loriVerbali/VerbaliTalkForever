import Foundation
import AVFoundation
import UIKit

@objc(AudioSessionManager)
class AudioSessionManager: NSObject {
  private static let shared = AudioSessionManager()
  private var isConfigured = false
  private var interruptionObserver: NSObjectProtocol?
  private var routeChangeObserver: NSObjectProtocol?
  private let audioQueue = DispatchQueue(label: "AudioSessionManager.queue")
  
  // Track which components are using the session
  private var wakewordActive = false
  private var whisperActive = false
  private var ttsActive = false
  
  private func log(_ message: String) { print("[AudioSession] \(message)") }
  
  override init() {
    super.init()
    setupNotificationObservers()
  }
  
  deinit {
    removeNotificationObservers()
  }
  
  // MARK: - Public Configuration Method
  
  @objc static func sharedInstance() -> AudioSessionManager {
    return shared
  }
  
  @objc func configureAudioSession() {
    log("configureAudioSession called. isConfigured=\(isConfigured)")
    
    let session = AVAudioSession.sharedInstance()
    
    // Set a robust universal state that works for most cases
    // .playAndRecord with defaultToSpeaker is the most versatile
    // Mode .default is best for balanced recording and playback
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [
          .defaultToSpeaker,
          .allowBluetooth,
          .allowBluetoothHFP,
          .allowAirPlay
        ]
      )
      
      try session.setActive(true)
      log("configureAudioSession success: .playAndRecord / .default")
      isConfigured = true
    } catch {
      log("configureAudioSession failed: \(error)")
    }
  }
  
  // MARK: - Session Activation Control
  
  @objc func reactivateSession() {
    log("reactivateSession setActive(true)")
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setActive(true)
    } catch {
      log("reactivateSession failed: \(error)")
    }
  }
  
  @objc func deactivateSession() {
    log("deactivateSession called wakeword=\(wakewordActive) whisper=\(whisperActive) tts=\(ttsActive)")
    // Only deactivate if no components are active
    guard !wakewordActive && !whisperActive && !ttsActive else {
      return
    }
    
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setActive(false, options: .notifyOthersOnDeactivation)
      log("setActive(false) success")
    } catch {
      log("deactivateSession failed: \(error)")
    }
  }
  
  // MARK: - Component Tracking
  
  @objc func setWakewordActive(_ active: Bool) {
    wakewordActive = active
    log("setWakewordActive=\(active)")
  }
  
  @objc func setWhisperActive(_ active: Bool) {
    whisperActive = active
    log("setWhisperActive=\(active)")
  }
  
  @objc func setTTSActive(_ active: Bool) {
    ttsActive = active
    log("setTTSActive=\(active)")
  }
  
  // MARK: - Notification Observers
  
  private func setupNotificationObservers() {
    let notificationCenter = NotificationCenter.default
    
    interruptionObserver = notificationCenter.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      self?.handleInterruption(notification)
    }
    
    routeChangeObserver = notificationCenter.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      self?.handleRouteChange(notification)
    }
  }
  
  private func removeNotificationObservers() {
    if let observer = interruptionObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    if let observer = routeChangeObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }
  
  private func handleInterruption(_ notification: Notification) {
    log("interruption received")
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
      return
    }
    
    if type == .ended {
      if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        if options.contains(.shouldResume) {
          reactivateSession()
          NotificationCenter.default.post(name: NSNotification.Name("AudioSessionInterruptionEnded"), object: nil)
        }
      }
    }
  }
  
  private func handleRouteChange(_ notification: Notification) {
    log("routeChange received")
    guard let userInfo = notification.userInfo,
          let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
      return
    }
    
    if reason == .oldDeviceUnavailable {
      reactivateSession()
    }
  }
  
  // MARK: - Component-Specific Preparation Methods
  
  @objc func prepareForWakeword() {
    // Wakeword can work in playAndRecord
    log("prepareForWakeword requested")
    apply(
      category: .playAndRecord,
      mode: .measurement,
      options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothHFP, .allowAirPlay],
      overrideOutputPort: nil,
      force: false
    )
  }
  
  @objc func prepareForWhisper() {
    log("prepareForWhisper requested")
    apply(
      category: .playAndRecord,
      mode: .measurement,
      options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothHFP, .allowAirPlay],
      overrideOutputPort: nil,
      force: false
    )
  }
  
  @objc func prepareForTTS() {
    log("prepareForTTS requested")
    
    // iPhones treat .playAndRecord differently than iPads.
    // iPhones engage "Voice Processing" (AGC/Ear-piece routing) in communication modes.
    // Switching to .measurement mode on iPhone bypasses most AGC/signal processing.
    let mode: AVAudioSession.Mode = (UIDevice.current.userInterfaceIdiom == .pad) ? .videoChat : .measurement
    log("prepareForTTS device=\(UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone") mode=\(mode.rawValue)")
    
    apply(
      category: .playAndRecord,
      mode: mode,
      options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothHFP, .allowAirPlay, .mixWithOthers],
      overrideOutputPort: .speaker,
      force: true
    )
  }
  
  // MARK: - Safe Apply Method
  
  private func apply(
    category: AVAudioSession.Category,
    mode: AVAudioSession.Mode,
    options: AVAudioSession.CategoryOptions,
    overrideOutputPort: AVAudioSession.PortOverride?,
    force: Bool
  ) {
    let sysVol = AVAudioSession.sharedInstance().outputVolume
    log("apply REQUEST: category=\(category.rawValue) mode=\(mode.rawValue) opts=\(options.rawValue) force=\(force) systemVol=\(sysVol)")
    
    audioQueue.sync {
      let s = AVAudioSession.sharedInstance()
      
      let currentCategory = s.category
      let currentMode = s.mode
      let currentOptions = s.categoryOptions
      
      // bitmask check for options
      let hasRequiredOptions = (currentOptions.rawValue & options.rawValue) == options.rawValue
      
      // LAZY RECONFIGURATION LOGIC
      // We are lenient with category matches to avoid engine-killing transitions
      let isCategoryCompatible = (currentCategory == category) ||
                                  (category == .playAndRecord && currentCategory == .record) ||
                                  (category == .record && currentCategory == .playAndRecord)
      
      // We are lenient with modes: if in voiceChat or default, they usually work for both
      // But we are strict moving between .measurement and .default because TTS engine needs specific state
      let isModeCompatible = (currentMode == mode) ||
                             (mode == .default && currentMode == .voiceChat) ||
                             (mode == .voiceChat && currentMode == .default)
      
      let needsReconfiguration = force || !isCategoryCompatible || !isModeCompatible || !hasRequiredOptions
      
      log("current: \(currentCategory.rawValue)/\(currentMode.rawValue) opts=\(currentOptions.rawValue) -> needsReconfiguration=\(needsReconfiguration)")
      
      if !needsReconfiguration {
        log("Skip setCategory - current state is compatible")
        // Still ensure active and handle override on main thread
        DispatchQueue.main.sync {
          do {
            if let overridePort = overrideOutputPort {
              try s.overrideOutputAudioPort(overridePort)
            }
            try s.setActive(true)
          } catch {
            log("apply fast-path error: \(error)")
          }
        }
        return
      }
      
      // FULL RECONFIGURATION
      do {
        // IMPORTANT: Never call setActive(false) here. Just set category and activate.
        try s.setCategory(category, mode: mode, options: options)
        try s.setActive(true)
        
        if let overridePort = overrideOutputPort {
          DispatchQueue.main.sync {
            try? s.overrideOutputAudioPort(overridePort)
          }
        }
        log("apply full-path success")
      } catch {
        log("apply full-path failed: \(error)")
        // Try to restore minimal active state
        try? s.setActive(true)
      }
    }
  }
  
  // MARK: - Utility Methods
  
  @objc func getCurrentCategory() -> String {
    return AVAudioSession.sharedInstance().category.rawValue
  }
  
  @objc func getCurrentMode() -> String {
    return AVAudioSession.sharedInstance().mode.rawValue
  }
  
  @objc func isSessionActive() -> Bool {
    return !AVAudioSession.sharedInstance().isOtherAudioPlaying
  }
}
