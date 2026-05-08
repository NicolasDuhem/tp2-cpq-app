'use client';

import AppNavigation from '@/components/shared/app-navigation';
import { AdminModeProvider } from '@/components/shared/admin-mode-context';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminModeProvider>
      <div className="shell">
        <header className="brandbar">
          <div>
            <div className="brandtitle">
              Brompton <span className="brandSubtitle">Operations</span>
            </div>
          </div>
        </header>
        <AppNavigation />
        {children}
      </div>
    </AdminModeProvider>
  );
}
