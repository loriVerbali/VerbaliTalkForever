// wakeWord.ts  – Type‑safe, singleton Wake‑Word listener for "Hey Matalk"

import Vosk from 'react-native-vosk';

export type WakeWordCallback = () => void;

class WakeWordService {
  private static instance: WakeWordService;
  private vosk = new Vosk();
  private loaded = false;
  private subscription?: {remove: () => void};
  private wakeWord = 'hey matan';

  // Detection tracking
  private lastDetectionTime = 0;
  private lastActivationTime = 0;
  private cooldownPeriod = 3000; // 3 second cooldown after activation
  private lastRecognizedTexts: string[] = []; // Store recent recognitions for debugging
  private detectionStartTime = 0; // When we started seeing a potential detection sequence

  // Known bad patterns that should never trigger activation
  private blacklistedPatterns = [
    '[unk]', // Unknown tokens
    'hey [unk]', // "hey" followed by unknown token
  ];

  // Mouse click / noise filter
  private minDetectionDuration = 1200; // Min 1.2 seconds between first "hey" and activation
  private consecutiveRequirement = 3; // Need 3 consecutive "hey" to consider it valid
  private consecutiveCount = 0;
  private lastHeyTime = 0;

  private constructor() {}

  /** Singleton accessor */
  static get(): WakeWordService {
    if (!WakeWordService.instance) {
      WakeWordService.instance = new WakeWordService();
    }
    return WakeWordService.instance;
  }

  private checkShouldActivate(): boolean {
    const now = Date.now();

    // Record this detection
    this.lastDetectionTime = now;

    // If we're in the cooldown period after a recent activation, ignore this detection
    if (now - this.lastActivationTime < this.cooldownPeriod) {
      console.log('⏲️ In cooldown period, ignoring detection');
      return false;
    }

    // Allow activation and update activation time
    this.lastActivationTime = now;
    this.consecutiveCount = 0; // Reset consecutive counter
    return true;
  }

  /** Check if the recognition is valid and not a false positive */
  private isValidWakeWordMatch(text: string): boolean {
    const now = Date.now();

    // Must be exactly the wake word
    if (text !== this.wakeWord) {
      return false;
    }

    // Check against blacklisted patterns
    for (const pattern of this.blacklistedPatterns) {
      if (text.includes(pattern)) {
        console.log(`❌ Rejected due to blacklisted pattern: "${pattern}"`);
        return false;
      }
    }

    // Ensure minimum detection duration between first "hey" and activation
    if (
      this.detectionStartTime > 0 &&
      now - this.detectionStartTime < this.minDetectionDuration
    ) {
      console.log(
        `❌ Rejected: Detection too quick (${now - this.detectionStartTime}ms)`,
      );
      return false;
    }

    // Check if there's exactly one occurrence of "hey" and one of "matan"
    const heyCount = (text.match(/hey/g) || []).length;
    const matanCount = (text.match(/matan/g) || []).length;

    if (heyCount !== 1 || matanCount !== 1) {
      console.log(
        `❌ Rejected due to wrong word count: hey=${heyCount}, matan=${matanCount}`,
      );
      return false;
    }

    // Check the pattern of the last recognitions
    // If we see isolated "matan" in the history without the user saying a complete phrase,
    // it's likely a false positive
    const recentTexts = this.lastRecognizedTexts.slice(-5);
    const containsIsolatedMatan = recentTexts.some(
      t => t.includes('PARTIAL: matan') || t.includes('FULL: matan'),
    );
    const containsCompletePhrase = recentTexts.some(
      t => t.includes('PARTIAL: hey matan') || t.includes('FULL: hey matan'),
    );

    if (containsIsolatedMatan && !containsCompletePhrase) {
      console.log(
        '❌ Rejected due to isolated "matan" in history without complete phrase',
      );
      return false;
    }

    return true;
  }

  /** Track "hey" detections to build confidence over time */
  private trackPartialHey(text: string): void {
    const now = Date.now();

    if (text === 'hey') {
      // If this is first "hey" detection, set detection start time
      if (this.detectionStartTime === 0) {
        this.detectionStartTime = now;
        this.consecutiveCount = 1;
        console.log('👂 First "hey" detected, starting detection sequence');
      }
      // Check if this is a consecutive "hey" within reasonable time (within 800ms of last one)
      else if (now - this.lastHeyTime < 800) {
        this.consecutiveCount++;
        console.log(`👂 Consecutive "hey" #${this.consecutiveCount} detected`);
      }
      // If too much time passed, reset and start over
      else if (now - this.lastHeyTime > 2000) {
        console.log('⏱️ Too much time between "hey" detections, resetting');
        this.detectionStartTime = now;
        this.consecutiveCount = 1;
      }

      this.lastHeyTime = now;
    }
    // If we detect something other than "hey", reduce confidence
    else if (
      text &&
      text !== '' &&
      text !== 'matan' &&
      this.consecutiveCount > 0
    ) {
      this.consecutiveCount = Math.max(0, this.consecutiveCount - 1);
      console.log(
        `⬇️ Non-"hey" detected, reducing consecutive count to ${this.consecutiveCount}`,
      );
    }
  }

  /** Reset the speech recognition to clear any potential state */
  private async resetRecognition() {
    try {
      // Stop and restart with the same grammar to clear internal state
      await this.vosk.stop();
      //  await this.vosk.start({grammar: [this.wakeWord]});
      await this.vosk.start({
        grammar: ['hey ', 'hey', '[unk]'],
      });
      console.log('🔄 Reset recognition engine');

      // Reset all tracking variables
      this.lastRecognizedTexts = [];
      this.detectionStartTime = 0;
      this.consecutiveCount = 0;
    } catch (error) {
      console.error('Error resetting recognition:', error);
    }
  }

  /** Call once (e.g. in App.tsx) */
  async startListening(onWake: WakeWordCallback) {
    if (!this.loaded) {
      // ✅ load the bundled model once
      await this.vosk.loadModel('vosk-model-small-en-us-0.15');
      this.loaded = true;
    }

    console.log('🎤 Listening for wake word:', this.wakeWord);
    this.lastRecognizedTexts = []; // Clear history
    this.detectionStartTime = 0;
    this.consecutiveCount = 0;

    // Grammar = wake word + "[unk]" token to ignore everything else
    await this.vosk.start({grammar: [this.wakeWord]});

    // Clean up any prior subscription
    this.subscription?.remove();

    // Subscribe to recognition results
    this.subscription = this.vosk.onResult(text => {
      const cleanText = text.toLowerCase().trim();
      console.log('📝 Full result:', cleanText);

      // Add to history for debugging
      this.lastRecognizedTexts.push(`FULL: ${cleanText}`);
      if (this.lastRecognizedTexts.length > 10) {
        this.lastRecognizedTexts.shift();
      }

      // Print recent history for debugging
      console.log('Recent recognitions:', this.lastRecognizedTexts);

      // Only activate if it passes our strict validation
      if (cleanText === 'hey matan' && this.isValidWakeWordMatch(cleanText)) {
        console.log('🔔 Wake word detected and validated!');
        console.log('Recent history:', this.lastRecognizedTexts);

        if (this.checkShouldActivate()) {
          console.log('✅ Activating!');
          onWake();
          // Reset recognition after activation
          this.resetRecognition();
        }
      }
    });

    // this.subscription = this.vosk.onPartialResult(text => {
    //   const cleanText = text.toLowerCase().trim();

    //   // Ignore empty results
    //   if (!cleanText) return;

    //   // Add to history for debugging
    //   this.lastRecognizedTexts.push(`PARTIAL: ${cleanText}`);
    //   if (this.lastRecognizedTexts.length > 10) {
    //     this.lastRecognizedTexts.shift();
    //   }

    //   console.log('🔍 PARTIAL result:', cleanText);

    //   // Track "hey" detections to build confidence
    //   this.trackPartialHey(cleanText);

    //   // No activation on partial results - too prone to false positives
    //   // Just log for debugging
    //   if (cleanText === 'hey') {
    //     console.log('👂 "Hey" component detected');
    //   } else if (cleanText === 'matan') {
    //     console.log('👂 "Matan" component detected');
    //   } else if (cleanText === 'hey matan') {
    //     console.log(
    //       '👂 Complete phrase in partial result (waiting for full result)',
    //     );
    //   }

    //   // Reset if we see isolated "matan" when it's likely a false positive
    //   if (cleanText === 'matan' && this.lastRecognizedTexts.length > 2) {
    //     const previousResults = this.lastRecognizedTexts.slice(-3, -1);
    //     const hasHey = previousResults.some(
    //       r => r.includes('PARTIAL: hey') || r.includes('FULL: hey'),
    //     );

    //     if (!hasHey) {
    //       console.log(
    //         '⚠️ Isolated "matan" detected without "hey" - resetting recognition',
    //       );
    //       this.resetRecognition();
    //     }
    //   }

    //   // Reset if we're getting too many consecutive empty or garbage recognitions
    //   // This helps clear the state when there's just ambient noise
    //   const recentTexts = this.lastRecognizedTexts.slice(-5);
    //   const emptyOrGarbageCount = recentTexts.filter(
    //     t => t.endsWith(': ') || t.includes('[unk]'),
    //   ).length;

    //   if (emptyOrGarbageCount >= 4) {
    //     console.log(
    //       '⚠️ Too many empty/garbage recognitions - resetting engine',
    //     );
    //     this.resetRecognition();
    //   }
    // });
  }

  /** Call when you want to stop listening (e.g. on logout) */
  async stopListening() {
    this.subscription?.remove();
    await this.vosk.stop();
  }
}

export default WakeWordService.get();
