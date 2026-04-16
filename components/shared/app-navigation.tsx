'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAdminMode } from '@/components/shared/admin-mode-context';

type NavLink = { href: string; label: string; adminOnly?: boolean };

const ADMIN_PASSWORD = 'Br0mpt0n';

const links: NavLink[] = [
  { href: '/cpq/process', label: 'CPQ - Process' },
  { href: '/cpq', label: 'CPQ - Bike Builder' },
  { href: '/cpq/setup', label: 'CPQ - Setup' },
  { href: '/cpq/stock-bike-img', label: 'Stock_bike_img_ Experiment', adminOnly: true },
  { href: '/cpq/results', label: 'CPQ - Sampler Results', adminOnly: true },
  { href: '/cpq/ui-docs', label: 'CPQ - UI Docs', adminOnly: true },
];

export default function AppNavigation() {
  const pathname = usePathname();
  const { isAdminMode, enableAdminMode, disableAdminMode } = useAdminMode();
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const visibleLinks = useMemo(() => links.filter((link) => isAdminMode || !link.adminOnly), [isAdminMode]);

  const submitAdminPassword = (event: FormEvent) => {
    event.preventDefault();
    if (password === ADMIN_PASSWORD) {
      enableAdminMode();
      setAdminPromptOpen(false);
      setPassword('');
      setPasswordError('');
      return;
    }
    setPasswordError('Wrong password. Admin mode was not enabled.');
  };

  return (
    <>
      <nav className="tabs" aria-label="Primary navigation">
        {visibleLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              className={`tab ${isActive ? 'tabActive' : ''}`}
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
            >
              {link.label}
            </Link>
          );
        })}
        <div className="adminModeActions">
          {!isAdminMode ? (
            <button className="tab tabAdminAction" type="button" onClick={() => setAdminPromptOpen(true)}>
              Open as admin
            </button>
          ) : (
            <>
              <span className="adminModePill">Admin mode</span>
              <button className="tab tabAdminAction" type="button" onClick={disableAdminMode}>
                Close admin mode
              </button>
            </>
          )}
        </div>
      </nav>
      {adminPromptOpen ? (
        <div className="modalBackdrop" onClick={() => setAdminPromptOpen(false)}>
          <div className="modalCard adminModeModal" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Open as admin</h3>
            <p className="subtle" style={{ margin: '4px 0 0' }}>
              Enter admin password to unlock technical pages and debug surfaces.
            </p>
            <form onSubmit={submitAdminPassword} className="adminModeForm">
              <label className="modalLabel">
                Password
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                />
              </label>
              {passwordError ? <div className="adminModeError">{passwordError}</div> : null}
              <div className="modalActions">
                <button type="button" onClick={() => setAdminPromptOpen(false)}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  Open as admin
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
