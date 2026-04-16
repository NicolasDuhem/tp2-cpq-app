'use client';

import AppNavigation from '@/components/shared/app-navigation';
import { AdminModeProvider } from '@/components/shared/admin-mode-context';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminModeProvider>
      <div className="shell">
        <header className="brandbar">
          <div>
            <div className="brandtitle">Brompton</div>
            <div className="brandSubtitle">TP2 CPQ App</div>
          </div>
        </header>
        <AppNavigation />
        {children}
      </div>
    </AdminModeProvider>
  );
}
