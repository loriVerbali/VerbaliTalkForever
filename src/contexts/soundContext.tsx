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
          soundRef.current?.play(success => {
            resolve(success);
          });
        });
      } else {
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
