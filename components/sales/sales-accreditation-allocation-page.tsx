import Link from 'next/link';
import PageHeader from '@/components/shared/PageHeader';
import { getCurrentUser } from '@/lib/auth/session';
import { canAdminPage, canEditPage, canReadPage } from '@/lib/auth/permissions';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { getAccreditationAllocationPageData } from '@/lib/sales/accreditation-allocation/service';
import { parseCsvParam } from '@/lib/sales/accreditation-allocation/tree';
import SalesAccreditationAllocationTableClient from './sales-accreditation-allocation-table.client';
import bikeStyles from './sales-bike-allocation-page.module.css';
import styles from './sales-accreditation-allocation-page.module.css';

const PAGE_KEY = PAGE_KEYS.salesAccreditationAllocation;

type SearchParams = {
  /** Territory selection (comma-separated ISO-2 codes). */
  countries?: string;
  /** Visible accreditation level ids (comma-separated). Empty = all. */
  levels?: string;
  /** Category name / id search. */
  q?: string;
  /** Status filter: `active`, `not_active`. */
  status?: string;
};

export default async function SalesAccreditationAllocationPage({ searchParams }: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user)
    return (
      <div className='card'>
        <h3>Please login</h3>
        <p>You must be logged in to access this page.</p>
        <Link href='/login'>Go to login</Link>
      </div>
    );
  if (!canReadPage(user, PAGE_KEY))
    return (
      <div className='card'>
        <h3>Access denied</h3>
        <p>You do not have permission to view this page.</p>
      </div>
    );

  const resolvedSearch = (await searchParams) ?? {};
  const data = await getAccreditationAllocationPageData();
  const canEdit = canEditPage(user, PAGE_KEY);
  const canAdmin = canAdminPage(user, PAGE_KEY);
  const level = user.isSystemAdmin ? 'Admin' : (user.permissions[PAGE_KEY] ?? 'none');

  const initialFilters = {
    countryCodes: parseCsvParam(resolvedSearch.countries)
      .map((value) => value.toUpperCase())
      .filter((code) => data.countryCodes.includes(code)),
    levelIds: parseCsvParam(resolvedSearch.levels)
      .map(Number)
      .filter((id) => data.levels.some((entry) => entry.id === id)),
    search: String(resolvedSearch.q ?? '').trim(),
    statuses: parseCsvParam(resolvedSearch.status).filter(
      (value): value is 'active' | 'not_active' => value === 'active' || value === 'not_active',
    ),
  };

  return (
    <div className={bikeStyles.page}>
      <PageHeader
        title='Accreditation Allocation'
        description={`Category eligibility per country and accreditation level for the BigCommerce Brompton B2B channel. Access: ${String(level).replace(/^./, (c) => c.toUpperCase())}${canEdit ? '' : ' (read-only)'}`}
      />
      {data.setupError ? (
        <div className={styles.setupCard} role='alert'>
          <strong>Setup required.</strong> {data.setupError}
        </div>
      ) : (
        <SalesAccreditationAllocationTableClient data={data} initialFilters={initialFilters} canEdit={canEdit} canAdmin={canAdmin} />
      )}
    </div>
  );
}
