'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AdminModeContextValue = {
  isAdminMode: boolean;
  isAdminModeReady: boolean;
  enableAdminMode: () => void;
  disableAdminMode: () => void;
};

const STORAGE_KEY = 'tp2-cpq-admin-mode';

const AdminModeContext = createContext<AdminModeContextValue | undefined>(undefined);

export function AdminModeProvider({ children }: { children: React.ReactNode }) {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isAdminModeReady, setIsAdminModeReady] = useState(false);

  useEffect(() => {
    const persisted = window.sessionStorage.getItem(STORAGE_KEY);
    setIsAdminMode(persisted === 'true');
    setIsAdminModeReady(true);
  }, []);

  const value = useMemo<AdminModeContextValue>(
    () => ({
      isAdminMode,
      isAdminModeReady,
      enableAdminMode: () => {
        setIsAdminMode(true);
        window.sessionStorage.setItem(STORAGE_KEY, 'true');
      },
      disableAdminMode: () => {
        setIsAdminMode(false);
        window.sessionStorage.removeItem(STORAGE_KEY);
      },
    }),
    [isAdminMode, isAdminModeReady],
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
