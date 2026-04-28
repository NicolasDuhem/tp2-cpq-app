import { getSalesQPartAllocationPageData } from '@/lib/sales/qpart-allocation/service';
import SalesQPartAllocationTableClient from './sales-qpart-allocation-table.client';
import styles from './sales-qpart-allocation-page.module.css';

export default async function SalesQPartAllocationPage() {
  const data = await getSalesQPartAllocationPageData();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Sales - QPart allocation</h1>
          <p>Review and manage QPart activation by market. Toggle status or push specific country changes without leaving the matrix.</p>
        </div>
      </header>
      <SalesQPartAllocationTableClient rows={data.rows} countryColumns={data.countries} filterOptions={data.filterOptions} />
    </div>
  );
}
