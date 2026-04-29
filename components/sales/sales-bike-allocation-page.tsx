import { getSalesBikeAllocationPageData } from '@/lib/sales/bike-allocation/service';
import SalesBikeAllocationTableClient from './sales-bike-allocation-table.client';
import styles from './sales-bike-allocation-page.module.css';

type SearchParams = {
  ruleset?: string;
  country_code?: string;
  bike_type?: string;
  page?: string;
  page_size?: string;
};

export default async function SalesBikeAllocationPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearch = (await searchParams) ?? {};
  const filters = {
    ruleset: String(resolvedSearch.ruleset ?? '').trim(),
    country_code: String(resolvedSearch.country_code ?? '').trim(),
    bike_type: String(resolvedSearch.bike_type ?? '').trim(),
    page: Number(resolvedSearch.page ?? 1),
    pageSize: Number(resolvedSearch.page_size ?? 100),
  };

  const data = await getSalesBikeAllocationPageData(filters);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Sales - bike allocation</h1>
        <p>
          Active = one or more matching sampler rows have active=true. Not active = matching rows exist but all are
          active=false. Not configured = no sampler configuration found for country.
        </p>
      </header>
      <SalesBikeAllocationTableClient
        rows={data.rows}
        availableFeatures={data.availableFeatures}
        countryColumns={data.countryColumns}
        filterOptions={data.filterOptions}
        filters={data.filters}
        pagination={data.pagination}
      />
    </div>
  );
}
