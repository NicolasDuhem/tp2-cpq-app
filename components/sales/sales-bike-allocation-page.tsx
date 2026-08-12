import { getSalesBikeAllocationPageData } from '@/lib/sales/bike-allocation/service';
import PageHeader from '@/components/shared/PageHeader';
import SalesBikeAllocationTableClient from './sales-bike-allocation-table.client';
import styles from './sales-bike-allocation-page.module.css';
import { getCurrentUser } from '@/lib/auth/session';
import { canEditPage, canReadPage } from '@/lib/auth/permissions';
import Link from 'next/link';

const PAGE_KEY = 'sales.bike_allocation';
type SearchParams = { ruleset?: string; country_code?: string; bike_type?: string; page?: string; page_size?: string };

export default async function SalesBikeAllocationPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) return <div className='card'><h3>Please login</h3><p>You must be logged in to access this page.</p><Link href='/login'>Go to login</Link></div>;
  if (!canReadPage(user, PAGE_KEY)) return <div className='card'><h3>Access denied</h3><p>You do not have permission to view this page.</p></div>;
  const resolvedSearch = (await searchParams) ?? {};
  const filters = { ruleset: String(resolvedSearch.ruleset ?? '').trim(), country_code: String(resolvedSearch.country_code ?? '').trim(), bike_type: String(resolvedSearch.bike_type ?? '').trim(), page: Number(resolvedSearch.page ?? 1), pageSize: Number(resolvedSearch.page_size ?? 100) };
  const data = await getSalesBikeAllocationPageData(filters);
  const level = user.isSystemAdmin ? 'Admin' : (user.permissions[PAGE_KEY] ?? 'none');
  return <div className={styles.page}><PageHeader title='Bike Allocation' description={`Active = has active sampler rows. Inactive = rows exist but all inactive. Not configured = no rows. Access: ${String(level).replace(/^./,c=>c.toUpperCase())}`} /><SalesBikeAllocationTableClient rows={data.rows} availableFeatures={data.availableFeatures} countryColumns={data.countryColumns} filterOptions={data.filterOptions} filters={data.filters} pagination={data.pagination} /></div>;
}
