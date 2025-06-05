import React, {createContext, useContext, useEffect, useRef} from 'react';
import Sound from 'react-native-sound';

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
    const sound = new Sound('snap.mp3', Sound.MAIN_BUNDLE, error => {
      if (error) {
        console.log('Failed to load the sound', error);
        return;
      }
      sound.setVolume(1.0);
      sound.setNumberOfLoops(2);
      soundRef.current = sound;
    });

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
          console.log('Sound duration:', duration);

          // Reset sound to beginning and set loops
          if (soundRef.current) {
            soundRef.current.setNumberOfLoops(0);
            soundRef.current.setCurrentTime(0);

            soundRef.current.play(success => {
              if (!success) {
                // If play failed, resolve immediately
                console.log('Sound play failed');
                resolve(false);
                return;
              }

              // Wait for the full sound duration before resolving
              setTimeout(() => {
                console.log('Sound play complete');
                resolve(true);
              }, Math.max(100, duration * 100)); // At least 1 second, convert to milliseconds
            });
          } else {
            resolve(false);
          }
        });
      } else {
        console.log('No sound available');
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
          console.log('Failed to load the sound:', cleanPath, error);
          resolve(false);
          return;
        }

        sound.setVolume(1.0);
        sound.setNumberOfLoops(0);

        sound.play(success => {
          if (!success) {
            console.log('Sound play failed for:', cleanPath);
            sound.release();
            resolve(false);
            return;
          }

          // Get the duration and wait for it to complete
          const duration = sound.getDuration();
          console.log('Playing sound:', cleanPath, 'Duration:', duration);

          setTimeout(() => {
            console.log('Sound play complete for:', cleanPath);
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
