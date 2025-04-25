import React, {useContext, useState, useEffect, ReactNode} from 'react';

interface AdminContextType {
  showLog: boolean;
  setShowLog: (log: boolean) => void;
}

const AdminContext = React.createContext<AdminContextType | null>(null);

interface AdminProviderProps {
  children: ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({children}) => {
  const [showLog, setShowLog] = useState<boolean>(true);

  return (
    <AdminContext.Provider
      value={{
        showLog,
        setShowLog,
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
