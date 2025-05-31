import React, {useContext, useState, useEffect, ReactNode} from 'react';
import NetInfo from '@react-native-community/netinfo';

interface ConnectionContextType {
  isConnected: boolean;
}

const ConnectionContext = React.createContext<ConnectionContextType | null>(
  null,
);

interface ConnectionProviderProps {
  children: ReactNode;
}

export const ConnectionProvider: React.FC<ConnectionProviderProps> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState<boolean>(true);

  useEffect(() => {
    // Get initial connection state
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected ?? false);
    });

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
    });

    // Unsubscribe
    return () => unsubscribe();
  }, []);

  return (
    <ConnectionContext.Provider
      value={{
        isConnected,
      }}>
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = () => {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
};
