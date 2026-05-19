'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type MeUser = { id: string; email: string; displayName: string; isSystemAdmin: boolean; permissions: Record<string, string> };

export default function UserStatus() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const json = await res.json();
      setUser(json.user ?? null);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setOpen(false); await load(); };
  if (loading) return <span className='subtle'>Checking login…</span>;
  if (!user) return <Link className='tab' href='/login'>Login</Link>;
  return <div className='userStatus'><button type='button' className='tab' onClick={() => setOpen((v) => !v)}>👤 {user.displayName || user.email}</button>{open ? <div className='userMenu'><div className='subtle'>Logged in as: <strong>{user.displayName || user.email}</strong></div>{user.isSystemAdmin ? <div className='adminModePill'>System admin</div> : null}<button type='button' onClick={logout}>Logout</button></div> : null}</div>;
}
