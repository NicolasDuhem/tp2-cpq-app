import './globals.css';
import AppNavigation from '@/components/shared/app-navigation';

export const metadata = {
  title: 'TP2 CPQ App',
  description: 'CPQ-only bike builder and setup console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
