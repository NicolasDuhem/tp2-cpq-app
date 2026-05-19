import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { canReadPage } from '@/lib/auth/permissions';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import AllocationAuditPageClient from '@/components/sales/allocation-audit-page.client';

export default async function AllocationAuditPage({ searchParams }: { searchParams?: Promise<{ itemCode?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div className='card'><h3>Please login</h3><p>You must be logged in to access this page.</p><Link href='/login'>Go to login</Link></div>;
  if (!canReadPage(user, PAGE_KEYS.salesAllocationAudit)) return <div className='card'><h3>Access denied</h3><p>You do not have permission to view this page.</p></div>;
  const params = (await searchParams) ?? {};
  return <AllocationAuditPageClient initialItemCode={String(params.itemCode ?? '')} />;
}
