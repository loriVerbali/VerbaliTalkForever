import React, {useContext, useState, useEffect, ReactNode} from 'react';
import DeviceInfo from 'react-native-device-info';

interface AdminContextType {
  showLog: boolean;
  setShowLog: (log: boolean) => void;
  isTablet: boolean;
}

const AdminContext = React.createContext<AdminContextType | null>(null);

interface AdminProviderProps {
  children: ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({children}) => {
  const [showLog, setShowLog] = useState<boolean>(true);
  const [isTablet, setIsTablet] = useState<boolean>(false);

  useEffect(() => {
    const initDeviceInfo = async () => {
      const deviceIsTablet = await DeviceInfo.isTablet();
      setIsTablet(deviceIsTablet);
    };
    initDeviceInfo();
  }, []);

  return (
    <AdminContext.Provider
      value={{
        showLog,
        setShowLog,
        isTablet,
      }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within a AdminProvider');
  }
  return context;
};
