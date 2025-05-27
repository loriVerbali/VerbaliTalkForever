import React, {createContext, useContext, useEffect, useRef} from 'react';
import Sound from 'react-native-sound';

type SoundContextType = {
  playAttention: () => Promise<boolean>;
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

  return (
    <SoundContext.Provider value={{playAttention}}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used within SoundProvider');
  return ctx;
};
