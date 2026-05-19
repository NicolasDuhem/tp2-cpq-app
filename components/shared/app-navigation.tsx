'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAdminMode } from '@/components/shared/admin-mode-context';
import UserStatus from '@/components/auth/user-status';
import { useCurrentUser } from '@/components/auth/use-current-user';

type NavLink = { href: string; label: string; adminOnly?: boolean; pageKey?: string; section: string };

const ADMIN_PASSWORD = 'Br0mpt0n';
const sections = ['Information', 'Sales Allocation', 'Bike Configurator', 'QPart Data Management', 'User Management'] as const;

const links: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', section: 'Information' },
  { href: '/cpq/process', label: 'Process', section: 'Information' },
  { href: '/sales/bike-allocation', label: 'Bike Allocation', pageKey: 'sales.bike_allocation', section: 'Sales Allocation' },
  { href: '/sales/qpart-allocation', label: 'QPart Allocation', pageKey: 'sales.qpart_allocation', section: 'Sales Allocation' },
  { href: '/sales/allocation-audit', label: 'Allocation audit', pageKey: 'sales.allocation_audit', section: 'Sales Allocation' },
  { href: '/cpq', label: 'Bike Builder', pageKey: 'cpq.configure', section: 'Bike Configurator' },
  { href: '/cpq/setup?tab=accounts', label: 'Setup Accounts', pageKey: 'cpq.setup.accounts', section: 'Bike Configurator' },
  { href: '/cpq/setup?tab=rulesets', label: 'Setup Rulesets', pageKey: 'cpq.setup.rulesets', section: 'Bike Configurator' },
  { href: '/cpq/setup?tab=pictures', label: 'Setup Pictures', pageKey: 'cpq.setup.pictures', section: 'Bike Configurator' },
  { href: '/qpart/parts', label: 'QPart PIM', pageKey: 'qpart.parts', section: 'QPart Data Management' },
  { href: '/setup/users', label: 'Setup User', pageKey: 'setup.users', section: 'User Management' },
  { href: '/cpq/results', label: 'Sampler Results', adminOnly: true, section: 'Information' },
];

export default function AppNavigation() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const { isAdminMode, enableAdminMode, disableAdminMode } = useAdminMode();
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMobileSection, setOpenMobileSection] = useState<string | null>(sections[0]);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleLinks = useMemo(
    () =>
      links.filter((link) => {
        if (!isAdminMode && link.adminOnly) return false;
        if (!user || user.isSystemAdmin || !link.pageKey) return true;
        return (user.permissions?.[link.pageKey] ?? 'none') !== 'none';
      }),
    [isAdminMode, user]
  );

  const groupedLinks = useMemo(
    () => sections.map((section) => ({ section, links: visibleLinks.filter((link) => link.section === section) })),
    [visibleLinks]
  );

  useEffect(() => {
    if (!isMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
      if (event.key === 'Tab' && containerRef.current) {
        const focusables = containerRef.current.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMenuOpen]);

  const submitAdminPassword = (e: FormEvent) => {
    e.preventDefault();
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
      {isMenuOpen ? <div className="megaMenuBackdrop" onClick={() => setIsMenuOpen(false)} /> : null}
      <div className="appNavWrap" ref={containerRef}>
        <div className="menuAnchor">
          <button
            className={`menuTrigger ${isMenuOpen ? 'isOpen' : ''}`}
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="mega-menu-panel"
            aria-label="Open navigation menu"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <span aria-hidden="true">⊞</span> Menu
          </button>
          {isMenuOpen ? (
            <nav id="mega-menu-panel" className="megaMenuPanel" role="navigation" aria-label="Primary navigation">
              {groupedLinks.map(({ section, links: sectionLinks }) => (
                <section key={section} className="megaMenuSection">
                  <button
                    type="button"
                    className={`mega-menu-section-header ${openMobileSection === section ? 'isExpanded' : ''}`}
                    onClick={() => setOpenMobileSection((prev) => (prev === section ? null : section))}
                  >
                    {section}
                  </button>
                  <div className={`megaMenuLinks ${openMobileSection === section ? 'isOpen' : ''}`}>
                    {sectionLinks.map((link) => {
                      const isActive = pathname === link.href.split('?')[0];
                      return (
                        <Link
                          className={`megaMenuLink ${isActive ? 'isActive' : ''}`}
                          key={link.href}
                          href={link.href}
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <span>{link.label}</span>
                          <span className="menuChevron" aria-hidden="true">
                            ›
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
          ) : null}
        </div>
        <div className="adminModeActions">
          <UserStatus />
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

      </div>

      {adminPromptOpen ? (
        <div className="modalBackdrop" onClick={() => setAdminPromptOpen(false)}>
          <div className="modalCard adminModeModal" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Open as admin</h3>
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
