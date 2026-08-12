'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { usePagePermission } from './use-page-permission';

export default function PageAccessGate({ pageKey, children }: { pageKey: string; children: (access: ReturnType<typeof usePagePermission>) => ReactNode }) {
  const access = usePagePermission(pageKey);
  if (access.loading) return <div className='subtle'>Loading permissions…</div>;
  if (!access.user) return <div className='card'><h3>Please login</h3><p>You must be logged in to access this page.</p><Link href='/login'>Go to login</Link></div>;
  if (!access.canRead) return <div className='card'><h3>Access denied</h3><p>You do not have permission to view this page.</p></div>;
  return <>{children(access)}</>;
}
