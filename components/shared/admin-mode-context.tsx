'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AdminModeContextValue = {
  isAdminMode: boolean;
  enableAdminMode: () => void;
  disableAdminMode: () => void;
};

const STORAGE_KEY = 'tp2-cpq-admin-mode';

const AdminModeContext = createContext<AdminModeContextValue | undefined>(undefined);

export function AdminModeProvider({ children }: { children: React.ReactNode }) {
  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    const persisted = window.sessionStorage.getItem(STORAGE_KEY);
    setIsAdminMode(persisted === 'true');
  }, []);

  const value = useMemo<AdminModeContextValue>(
    () => ({
      isAdminMode,
      enableAdminMode: () => {
        setIsAdminMode(true);
        window.sessionStorage.setItem(STORAGE_KEY, 'true');
      },
      disableAdminMode: () => {
        setIsAdminMode(false);
        window.sessionStorage.removeItem(STORAGE_KEY);
      },
    }),
    [isAdminMode],
  );

  return <AdminModeContext.Provider value={value}>{children}</AdminModeContext.Provider>;
}

export function useAdminMode() {
  const context = useContext(AdminModeContext);
  if (!context) {
    throw new Error('useAdminMode must be used inside AdminModeProvider.');
  }
  return context;
}
