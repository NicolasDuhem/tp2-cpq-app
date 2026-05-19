'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useCurrentUser } from './use-current-user';

type MeUser = { id: string; email: string; displayName: string; isSystemAdmin: boolean; permissions: Record<string, string> };

export default function UserStatus() {
  const { user, loading, refresh } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store', credentials: 'include' });
    window.dispatchEvent(new Event('auth:changed'));
    setOpen(false);
    await refresh();
  };
  if (loading) return <span className='subtle'>Checking login…</span>;
  if (!user) return <Link className='tab' href='/login'>Login</Link>;
  return <div className='userStatus'><button type='button' className='tab' onClick={() => setOpen((v) => !v)}>👤 {user.displayName || user.email}</button>{open ? <div className='userMenu'><div className='subtle'>Logged in as: <strong>{user.displayName || user.email}</strong></div>{user.isSystemAdmin ? <div className='adminModePill'>System admin</div> : null}<button type='button' onClick={logout}>Logout</button></div> : null}</div>;
}
