'use client';

import { useCallback, useEffect, useState } from 'react';

export type CurrentUser = { id: string; email: string; displayName: string; isSystemAdmin: boolean; permissions: Record<string, string> };

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
      const json = await res.json();
      setUser(json.user ?? null);
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
