'use client';

import { useCallback, useEffect, useState } from 'react';
import { normalizePermissionLevel, type PermissionLevel } from '@/lib/auth/permission-level';

export type CurrentUser = { id: string; email: string; displayName: string; isSystemAdmin: boolean; permissions: Record<string, PermissionLevel> };

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
      const json = await res.json();
      const rawUser = json.user;
      if (!rawUser) {
        setUser(null);
        return;
      }
      const normalizedPermissions = Object.fromEntries(Object.entries(rawUser.permissions ?? {}).map(([key, value]) => [key, normalizePermissionLevel(value)]));
      setUser({ ...rawUser, permissions: normalizedPermissions });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAuthChanged = () => void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('auth:changed', onAuthChanged);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { user, loading, refresh };
}
