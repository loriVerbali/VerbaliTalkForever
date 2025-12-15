import Foundation
import AVFoundation

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
    guard !isConfigured else {
      log("already configured -> reactivateSession")
      reactivateSession()
      return
    }
    
    let session = AVAudioSession.sharedInstance()
    log("setCategory .playAndRecord mode .measurement opts [.defaultToSpeaker,.allowBluetooth]")
    
    do {
      // Configure category with options that work for all three components
      // playAndRecord: supports both recording (wakeword/whisper) and playback (TTS)
      // measurement mode: best for Whisper accuracy (no voice processing)
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [
          .defaultToSpeaker,
          .allowBluetoothHFP
        ]
      )
      
      // Activate the session
      try session.setActive(true)
      log("setActive(true) success")
      
      isConfigured = true
    } catch {
      log("configureAudioSession failed: \(error)")
      // Configuration failed
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
      // Reactivation failed
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
      try session.setActive(false)
      log("setActive(false) success")
    } catch {
      log("deactivateSession failed: \(error)")
      // Deactivation failed
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
    
    // Handle audio interruptions (Siri, phone calls, etc.)
    interruptionObserver = notificationCenter.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      self?.handleInterruption(notification)
    }
    log("observer registered: interruption")
    
    // Handle route changes (Bluetooth connect/disconnect, headphones, etc.)
    routeChangeObserver = notificationCenter.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      self?.handleRouteChange(notification)
    }
    log("observer registered: routeChange")
  }
  
  private func removeNotificationObservers() {
    if let observer = interruptionObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    if let observer = routeChangeObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }
  
  // MARK: - Interruption Handling
  
  private func handleInterruption(_ notification: Notification) {
    log("interruption received")
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
      return
    }
    log("interruption type=\(type.rawValue)")
    
    switch type {
    case .began:
      // Don't deactivate - let the system handle it
      break
      
    case .ended:
      // Check if we should resume
      if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        if options.contains(.shouldResume) {
          // Reconfigure and reactivate
          configureAudioSession()
          
          // Notify React Native that interruption ended
          NotificationCenter.default.post(
            name: NSNotification.Name("AudioSessionInterruptionEnded"),
            object: nil
          )
          log("interruption ended -> reconfigured + posting event")
        }
      }
      
    @unknown default:
      break
    }
  }
  
  // MARK: - Route Change Handling
  
  private func handleRouteChange(_ notification: Notification) {
    log("routeChange received")
    guard let userInfo = notification.userInfo,
          let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
      return
    }
    log("routeChange reason=\(reason.rawValue)")
    
    switch reason {
    case .newDeviceAvailable:
      // New audio device available
      break
      
    case .oldDeviceUnavailable:
      // Audio device removed - reactivate to ensure session is still active
      reactivateSession()
      log("oldDeviceUnavailable -> reactivateSession")
      
    case .categoryChange:
      // Don't reconfigure - let other libraries manage their own category settings
      break
      
    default:
      break
    }
  }
  
  // MARK: - Component-Specific Preparation Methods
  
  @objc func prepareForWakeword() {
    log("prepareForWakeword -> category=record mode=measurement opts=[allowBluetooth]")
    apply(
      category: .record,
      mode: .measurement,
      options: [.allowBluetooth],
      overrideOutputPort: nil
    )
  }
  
  @objc func prepareForWhisper() {
    log("prepareForWhisper -> category=playAndRecord mode=measurement opts=[defaultToSpeaker,allowBluetooth]")
    apply(
      category: .playAndRecord,
      mode: .measurement,
      options: [.defaultToSpeaker, .allowBluetooth],
      overrideOutputPort: nil
    )
  }
  
  @objc func prepareForTTS() {
    log("prepareForTTS -> category=playback mode=spokenAudio opts=[defaultToSpeaker,allowBluetooth] overridePort=speaker")
    apply(
      category: .playback,
      mode: .spokenAudio,
      options: [.defaultToSpeaker, .allowBluetooth],
      overrideOutputPort: .speaker
    )
  }
  
  // MARK: - Safe Apply Method
  
  private func apply(
    category: AVAudioSession.Category,
    mode: AVAudioSession.Mode,
    options: AVAudioSession.CategoryOptions,
    overrideOutputPort: AVAudioSession.PortOverride?
  ) {
    log("apply category=\(category.rawValue) mode=\(mode.rawValue) opts=\(options.rawValue) override=\(String(describing: overrideOutputPort))")
    // Use sync to ensure configuration completes before returning
    // This is critical for TTS to work at full volume
    audioQueue.sync {
      let s = AVAudioSession.sharedInstance()
      
      // Early return if already in desired state (reduces churn)
      let needsReconfiguration = s.category != category || s.mode != mode || s.categoryOptions != options
      log("needsReconfiguration=\(needsReconfiguration)")
      
      if !needsReconfiguration {
        // Session is already configured, but still apply/refresh output port override if specified
        // This is critical for TTS to ensure speaker override is always active
        if let overridePort = overrideOutputPort {
          log("override-only path: overriding port and reactivating")
          DispatchQueue.main.sync {
            do {
              try s.overrideOutputAudioPort(overridePort)
              // Reactivate to ensure override takes effect
              try s.setActive(true)
              log("overrideOutputAudioPort(\(overridePort)) success")
            } catch {
              log("apply error: \(error)")
              // Override failed
            }
          }
        }
        return
      }
      
      // Deactivate first to avoid -50 errors
      do {
        try s.setActive(false, options: .notifyOthersOnDeactivation)
        log("deactivated for reconfiguration")
      } catch {
        log("apply error: \(error)")
        // Ignore deactivation errors - session might not be active
      }
      
      // Set category and mode, then activate
      do {
        try s.setCategory(category, mode: mode, options: options)
        log("setCategory success")
        try s.setActive(true)
        log("setActive(true) after setCategory success")
        
        // Override output port if specified (for TTS to force speaker)
        // Override must be on main thread for it to take effect
        if let overridePort = overrideOutputPort {
          DispatchQueue.main.sync {
            do {
              try s.overrideOutputAudioPort(overridePort)
              log("overrideOutputAudioPort(\(overridePort)) success")
            } catch {
              log("apply error: \(error)")
              // Override failed
            }
          }
        }
      } catch {
        log("apply error: \(error)")
        // Apply failed
      }
    }
  }
  
  // MARK: - Utility Methods
  
  @objc func getCurrentCategory() -> String {
    let session = AVAudioSession.sharedInstance()
    log("getCurrentCategory -> \(session.category.rawValue)")
    return session.category.rawValue
  }
  
  @objc func getCurrentMode() -> String {
    let session = AVAudioSession.sharedInstance()
    log("getCurrentMode -> \(session.mode.rawValue)")
    return session.mode.rawValue
  }
  
  @objc func isSessionActive() -> Bool {
    let session = AVAudioSession.sharedInstance()
    log("isSessionActive -> \(!session.isOtherAudioPlaying)")
    return session.isOtherAudioPlaying == false
  }
}

