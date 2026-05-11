import { getSalesQPartAllocationPageData, QPartBCStatusFilter } from '@/lib/sales/qpart-allocation/service';
import SalesQPartAllocationTableClient from './sales-qpart-allocation-table.client';
import styles from './sales-qpart-allocation-page.module.css';

type SearchParams = {
  page?: string;
  page_size?: string;
  part?: string;
  title?: string;
  countries?: string;
  bc_status?: string;
  h1?: string;
  h2?: string;
  h3?: string;
  h4?: string;
  h5?: string;
  h6?: string;
  h7?: string;
};

function parseList(value: string | undefined) {
  return [...new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean))];
}

function parseBCStatuses(value: string | undefined): QPartBCStatusFilter[] {
  return parseList(value)
    .map((item) => item.toLowerCase())
    .filter((item): item is QPartBCStatusFilter => item === 'ok' || item === 'nok');
}

export default async function SalesQPartAllocationPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolved = (await searchParams) ?? {};
  const hierarchySelection = Object.fromEntries(
    Array.from({ length: 7 }).map((_, index) => {
      const level = index + 1;
      return [String(level), parseList(resolved[`h${level}` as keyof SearchParams])];
    }),
  );
  const data = await getSalesQPartAllocationPageData({
    page: Number(resolved.page ?? 1),
    pageSize: Number(resolved.page_size ?? 200),
    filterCriteria: {
      partNumberSearch: resolved.part,
      titleSearch: resolved.title,
      countryCodes: parseList(resolved.countries).map((countryCode) => countryCode.toUpperCase()),
      hierarchySelection,
      bcStatuses: parseBCStatuses(resolved.bc_status),
    },
  });

  return (
    <div className={styles.page}>
      <SalesQPartAllocationTableClient rows={data.rows} countryColumns={data.countries} filterOptions={data.filterOptions} pagination={data.pagination} />
    </div>
  );
}
