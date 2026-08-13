import { Platform, PermissionsAndroid } from 'react-native';
import Voice from '../../../utils/STTService';
import { MicPermission } from '../state/verbiTypes';

/**
 * Resolves the microphone (and, on iOS, speech-recognition) permission Verbi's
 * partner listening needs. Both are normally granted during onboarding, so this
 * usually resolves silently; the request path only runs on a fresh install or
 * after the user revoked access.
 */
export async function ensureVerbiMicPermission(): Promise<MicPermission> {
  try {
    if (Platform.OS === 'ios') {
      const hasMic = await Voice.hasIOSMicPermissions();
      const micGranted = hasMic ? true : await Voice.requestIOSMicPermissions(10000);
      if (!micGranted) return 'denied';

      const hasSpeech = await Voice.hasIOSSpeechRecognitionPermissions();
      const speechGranted = hasSpeech
        ? true
        : await Voice.requestIOSSpeechRecognitionPermissions(10000);
      return speechGranted ? 'granted' : 'denied';
    }

    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (alreadyGranted) return 'granted';

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Matalk needs the microphone to follow the conversation.',
        buttonPositive: 'OK',
      },
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch (error) {
    console.warn('[Verbi] microphone permission check failed:', error);
    return 'denied';
  }
}
