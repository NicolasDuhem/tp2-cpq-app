import { getCurrentUser } from '@/lib/auth/session';
import { canReadPage } from '@/lib/auth/permissions';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import AccessNotice from '@/components/shared/AccessNotice';
import AllocationAuditPageClient from '@/components/sales/allocation-audit-page.client';

export default async function AllocationAuditPage({ searchParams }: { searchParams?: Promise<{ itemCode?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <AccessNotice kind='login' />;
  if (!canReadPage(user, PAGE_KEYS.salesAllocationAudit)) return <AccessNotice kind='denied' />;
  const params = (await searchParams) ?? {};
  return <AllocationAuditPageClient initialItemCode={String(params.itemCode ?? '')} />;
}
