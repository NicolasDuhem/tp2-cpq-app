'use client';
import { ReactNode } from 'react';
import AccessNotice from '@/components/shared/AccessNotice';
import { usePagePermission } from './use-page-permission';

export default function PageAccessGate({ pageKey, children }: { pageKey: string; children: (access: ReturnType<typeof usePagePermission>) => ReactNode }) {
  const access = usePagePermission(pageKey);
  if (access.loading) return <main className="opPage"><p className="opLoading">Loading permissions…</p></main>;
  if (!access.user) return <AccessNotice kind="login" />;
  if (!access.canRead) return <AccessNotice kind="denied" />;
  return <>{children(access)}</>;
}
