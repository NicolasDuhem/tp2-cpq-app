import { getSalesBikeAllocationPageData } from '@/lib/sales/bike-allocation/service';
import {
  decodeFeatureFilters,
  parseAllocationStatuses,
  parseUrlList,
} from '@/lib/sales/allocation-territory';
import PageHeader from '@/components/shared/PageHeader';
import SalesBikeAllocationTableClient from './sales-bike-allocation-table.client';
import styles from './sales-bike-allocation-page.module.css';
import { getCurrentUser } from '@/lib/auth/session';
import { canEditPage, canReadPage } from '@/lib/auth/permissions';
import Link from 'next/link';

const PAGE_KEY = 'sales.bike_allocation';

type SearchParams = {
  page?: string;
  page_size?: string;
  ruleset?: string;
  bike_type?: string;
  /** Territory selection (comma-separated ISO-2 codes). */
  countries?: string;
  /** Legacy single-country deep link, still honoured for dashboard links. */
  country_code?: string;
  /** `ipn_code` contains-search. */
  ipn?: string;
  /** Allocation-status selection: `active`, `not_active`, `not_configured`. */
  status?: string;
  /** Visible feature columns (comma-separated, URI-encoded labels). */
  cols?: string;
  /** Feature contains-filters, `label~value` pairs joined by `;`. */
  features?: string;
};

export default async function SalesBikeAllocationPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
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

  // Parse defensively: unknown values are ignored rather than failing the page.
  const filters = {
    ruleset: String(resolvedSearch.ruleset ?? '').trim(),
    bike_type: String(resolvedSearch.bike_type ?? '').trim(),
    country_code: String(resolvedSearch.country_code ?? '').trim(),
    countryCodes: parseUrlList(resolvedSearch.countries).map((value) => value.toUpperCase()),
    ipnSearch: String(resolvedSearch.ipn ?? '').trim(),
    allocationStatuses: parseAllocationStatuses(resolvedSearch.status),
    featureFilters: decodeFeatureFilters(resolvedSearch.features),
    page: Number(resolvedSearch.page ?? 1),
    pageSize: Number(resolvedSearch.page_size ?? 100),
  };

  const data = await getSalesBikeAllocationPageData(filters);
  const selectedFeatureColumns = parseUrlList(resolvedSearch.cols)
    .map((value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    })
    .filter((feature) => data.availableFeatures.includes(feature));

  const canEdit = canEditPage(user, PAGE_KEY);
  const level = user.isSystemAdmin ? 'Admin' : (user.permissions[PAGE_KEY] ?? 'none');

  return (
    <div className={styles.page}>
      <PageHeader
        title='Bike Allocation'
        description={`Allocation control plane per bike and country. Access: ${String(level).replace(/^./, (c) => c.toUpperCase())}${canEdit ? '' : ' (read-only)'}`}
      />
      <SalesBikeAllocationTableClient
        rows={data.rows}
        availableFeatures={data.availableFeatures}
        selectedFeatureColumns={selectedFeatureColumns}
        countryColumns={data.countryColumns}
        filterOptions={data.filterOptions}
        filters={data.filters}
        pagination={data.pagination}
        canEdit={canEdit}
      />
    </div>
  );
}
