import { getSalesBikeAllocationPageData } from '@/lib/sales/bike-allocation/service';
import SalesBikeAllocationTableClient from './sales-bike-allocation-table.client';
import styles from './sales-bike-allocation-page.module.css';

type SearchParams = {
  ruleset?: string;
  country_code?: string;
};

export default async function SalesBikeAllocationPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearch = (await searchParams) ?? {};
  const filters = {
    ruleset: String(resolvedSearch.ruleset ?? '').trim(),
    country_code: String(resolvedSearch.country_code ?? '').trim(),
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
      />
    </div>
  );
}
