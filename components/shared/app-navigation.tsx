'use client';
import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAdminMode } from '@/components/shared/admin-mode-context';
import UserStatus from '@/components/auth/user-status';
import { useCurrentUser } from '@/components/auth/use-current-user';

type NavLink = { href: string; label: string; adminOnly?: boolean; pageKey?: string };
const ADMIN_PASSWORD = 'Br0mpt0n';
const links: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/cpq/process', label: 'Process' },
  { href: '/sales/bike-allocation', label: 'Bike Allocation', pageKey: 'sales.bike_allocation' },
  { href: '/sales/qpart-allocation', label: 'QPart Allocation', pageKey: 'sales.qpart_allocation' },
  { href: '/cpq', label: 'Bike Builder', pageKey: 'cpq.configure' },
  { href: '/cpq/setup?tab=accounts', label: 'Setup Accounts', pageKey: 'cpq.setup.accounts' },
  { href: '/cpq/setup?tab=rulesets', label: 'Setup Rulesets', pageKey: 'cpq.setup.rulesets' },
  { href: '/cpq/setup?tab=pictures', label: 'Setup Pictures', pageKey: 'cpq.setup.pictures' },
  { href: '/setup/users', label: 'Setup User', pageKey: 'setup.users' },
  { href: '/qpart/parts', label: 'QPart PIM', pageKey: 'qpart.parts' },
  { href: '/cpq/results', label: 'Sampler Results', adminOnly: true },
];
export default function AppNavigation() { const pathname = usePathname(); const { user } = useCurrentUser(); const { isAdminMode, enableAdminMode, disableAdminMode } = useAdminMode(); const [adminPromptOpen, setAdminPromptOpen] = useState(false); const [password, setPassword] = useState(''); const [passwordError, setPasswordError] = useState('');
  const visibleLinks = useMemo(() => links.filter((link) => {
    if (!isAdminMode && link.adminOnly) return false;
    if (!user || user.isSystemAdmin || !link.pageKey) return true;
    return (user.permissions?.[link.pageKey] ?? 'none') !== 'none';
  }), [isAdminMode, user]);
  const submitAdminPassword=(e:FormEvent)=>{e.preventDefault(); if(password===ADMIN_PASSWORD){enableAdminMode();setAdminPromptOpen(false);setPassword('');setPasswordError('');return;} setPasswordError('Wrong password. Admin mode was not enabled.');};
  return <><nav className='tabs' aria-label='Primary navigation'>{visibleLinks.map((link)=>{const isActive=pathname===link.href.split('?')[0];return <Link className={`tab ${isActive?'tabActive':''}`} key={link.href} href={link.href}>{link.label}</Link>;})}<div className='adminModeActions'><UserStatus />{!isAdminMode ? <button className='tab tabAdminAction' type='button' onClick={() => setAdminPromptOpen(true)}>Open as admin</button> : <><span className='adminModePill'>Admin mode</span><button className='tab tabAdminAction' type='button' onClick={disableAdminMode}>Close admin mode</button></>}</div></nav>{adminPromptOpen ? <div className='modalBackdrop' onClick={() => setAdminPromptOpen(false)}><div className='modalCard adminModeModal' onClick={(event) => event.stopPropagation()}><h3 style={{ margin: 0 }}>Open as admin</h3><form onSubmit={submitAdminPassword} className='adminModeForm'><label className='modalLabel'>Password<input autoFocus type='password' value={password} onChange={(event) => { setPassword(event.target.value); if (passwordError) setPasswordError(''); }} /></label>{passwordError ? <div className='adminModeError'>{passwordError}</div> : null}<div className='modalActions'><button type='button' onClick={() => setAdminPromptOpen(false)}>Cancel</button><button className='primary' type='submit'>Open as admin</button></div></form></div></div> : null}</>;
}
