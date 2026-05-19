'use client';

import { useCurrentUser } from './use-current-user';

const order = ['none', 'read', 'edit', 'admin'];

export function usePagePermission(pageKey: string) {
  const { user, loading, refresh } = useCurrentUser();
  const level = user?.isSystemAdmin ? 'admin' : (user?.permissions?.[pageKey] ?? 'none');
  const canRead = order.indexOf(level) >= order.indexOf('read');
  const canEdit = order.indexOf(level) >= order.indexOf('edit');
  const canAdmin = order.indexOf(level) >= order.indexOf('admin');

  return { user, loading, permissionLevel: level, canRead, canEdit, canAdmin, isSystemAdmin: Boolean(user?.isSystemAdmin), refresh };
}
