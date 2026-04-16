import './globals.css';
import AppShell from '@/components/shared/app-shell';

export const metadata = {
  title: 'TP2 CPQ App',
  description: 'CPQ-only bike builder and setup console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
