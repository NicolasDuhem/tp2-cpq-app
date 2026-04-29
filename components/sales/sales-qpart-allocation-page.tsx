import { getSalesQPartAllocationPageData } from '@/lib/sales/qpart-allocation/service';
import SalesQPartAllocationTableClient from './sales-qpart-allocation-table.client';
import styles from './sales-qpart-allocation-page.module.css';

type SearchParams = { page?: string; page_size?: string };

export default async function SalesQPartAllocationPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolved = (await searchParams) ?? {};
  const data = await getSalesQPartAllocationPageData({ page: Number(resolved.page ?? 1), pageSize: Number(resolved.page_size ?? 200) });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Sales - QPart allocation</h1>
          <p>Review and manage QPart activation by market. Toggle status or push specific country changes without leaving the matrix.</p>
        </div>
      </header>
      <SalesQPartAllocationTableClient rows={data.rows} countryColumns={data.countries} filterOptions={data.filterOptions} pagination={data.pagination} />
    </div>
  );
}
