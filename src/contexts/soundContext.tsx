import React, {createContext, useContext, useEffect, useRef} from 'react';
import Sound from 'react-native-sound';
import {Platform} from 'react-native';

type SoundContextType = {
  playAttention: () => Promise<boolean>;
  playThisSound: (audioPath: string) => Promise<boolean>;
};

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export const SoundProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const soundRef = useRef<Sound | null>(null);

  useEffect(() => {
    // Enable sound playback in silence mode (iOS)
    Sound.setCategory('Playback');

    // Platform-specific sound loading
    const loadSound = () => {
      if (Platform.OS === 'android') {
        // For Android, load from res/raw (without .mp3 extension)
        const sound = new Sound('snap', Sound.MAIN_BUNDLE, error => {
          if (error) {
            console.error('Failed to load Android sound:', error);
            return;
          }
          sound.setVolume(1.0);
          sound.setNumberOfLoops(2);
          soundRef.current = sound;
        });
      } else {
        // For iOS, use the standard approach
        const sound = new Sound('snap.mp3', Sound.MAIN_BUNDLE, error => {
          if (error) {
            console.error('Failed to load iOS sound:', error);
            return;
          }
          sound.setVolume(1.0);
          sound.setNumberOfLoops(2);
          soundRef.current = sound;
        });
      }
    };

    loadSound();

    return () => {
      soundRef.current?.release();
    };
  }, []);

  const playAttention = (): Promise<boolean> => {
    return new Promise(resolve => {
      if (!soundRef.current) {
        resolve(false);
        return;
      }

      const sound = soundRef.current;
      
      // Stop any current playback without waiting for callback
      // This prevents blocking on the stop operation
      try {
        sound.stop(() => {
          // Stop callback - continue with play
        });
      } catch (e) {
        // Ignore stop errors - sound might not be playing
      }

      // Use a minimal delay to ensure stop completes, then play immediately
      // This is much faster than waiting for the stop callback
      setTimeout(() => {
        if (!soundRef.current) {
          resolve(false);
          return;
        }

        // Reset sound to beginning and set loops
        soundRef.current.setNumberOfLoops(0);
        soundRef.current.setCurrentTime(0);

        // Start playing immediately
        soundRef.current.play(success => {
          if (!success) {
            resolve(false);
            return;
          }

          // Resolve immediately after play starts (don't wait for full duration)
          // This allows recording to start faster
          resolve(true);
        });
      }, 10); // Very short delay to let stop complete if needed
    });
  };

  const playThisSound = (audioPath: string): Promise<boolean> => {
    return new Promise(resolve => {
      // For recorded files, don't use MAIN_BUNDLE - use the file system path directly
      // Remove file:// prefix if present for react-native-sound
      const cleanPath = audioPath.replace('file://', '');

      const sound = new Sound(cleanPath, '', error => {
        if (error) {
          resolve(false);
          return;
        }

        sound.setVolume(1.0);
        sound.setNumberOfLoops(0);

        sound.play(success => {
          if (!success) {
            sound.release();
            resolve(false);
            return;
          }

          // Get the duration and wait for it to complete
          const duration = sound.getDuration();

          setTimeout(() => {
            sound.release();
            resolve(true);
          }, Math.max(100, duration * 1000)); // Convert to milliseconds
        });
      });
    });
  };

  return (
    <SoundContext.Provider value={{playAttention, playThisSound}}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used within SoundProvider');
  return ctx;
};
