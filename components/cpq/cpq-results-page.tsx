import { getCpqResultsPageData } from '@/lib/cpq/results/service';
import CpqResultsMatrixClient from './cpq-results-matrix.client';
import styles from './cpq-results-page.module.css';

type SearchParams = {
  ruleset?: string;
  bike_type?: string;
  sku_code?: string;
};

export default async function CpqResultsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearch = (await searchParams) ?? {};
  const filters = {
    ruleset: String(resolvedSearch.ruleset ?? '').trim(),
    bike_type: String(resolvedSearch.bike_type ?? '').trim(),
    sku_code: String(resolvedSearch.sku_code ?? '').trim(),
  };

  const data = await getCpqResultsPageData(filters);

  return (
    <div className={styles.page}>
      <CpqResultsMatrixClient
        rows={data.rows}
        featureColumns={data.featureColumns}
        countryColumns={data.countryColumns}
        rowIdentityDescription={data.rowIdentityDescription}
      />
    </div>
  );
}
