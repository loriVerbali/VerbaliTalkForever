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
      if (soundRef.current) {
        soundRef.current.stop(() => {
          // Get the duration of the sound
          const duration = soundRef.current?.getDuration() || 0;

          // Reset sound to beginning and set loops
          if (soundRef.current) {
            soundRef.current.setNumberOfLoops(0);
            soundRef.current.setCurrentTime(0);

            soundRef.current.play(success => {
              if (!success) {
                resolve(false);
                return;
              }

              // Wait for the full sound duration before resolving
              setTimeout(() => {
                resolve(true);
              }, Math.max(100, duration * 1000)); // Convert to milliseconds
            });
          } else {
            resolve(false);
          }
        });
      } else {
        resolve(false);
      }
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
