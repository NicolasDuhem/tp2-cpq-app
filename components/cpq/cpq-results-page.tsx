import { getCpqResultsPageData } from '@/lib/cpq/results/service';
import styles from './cpq-results-page.module.css';

type SearchParams = {
  ruleset?: string;
  account_code?: string;
  country_code?: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function CpqResultsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearch = (await searchParams) ?? {};
  const filters = {
    ruleset: String(resolvedSearch.ruleset ?? '').trim(),
    account_code: String(resolvedSearch.account_code ?? '').trim(),
    country_code: String(resolvedSearch.country_code ?? '').trim(),
  };

  const { filterOptions, tiles } = await getCpqResultsPageData(filters);

  return (
    <div className={styles.page}>
      <form className={styles.filters}>
        <label className={styles.filterItem}>
          <span>ruleset</span>
          <select name="ruleset" defaultValue={filters.ruleset}>
            <option value="">All</option>
            {filterOptions.rulesets.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>account_code</span>
          <select name="account_code" defaultValue={filters.account_code}>
            <option value="">All</option>
            {filterOptions.accountCodes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>country_code</span>
          <select name="country_code" defaultValue={filters.country_code}>
            <option value="">All</option>
            {filterOptions.countryCodes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>Apply filters</span>
          <button type="submit">Apply</button>
        </label>
      </form>

      {tiles.length === 0 ? (
        <div className={styles.empty}>No CPQ sampler results found for the selected filters.</div>
      ) : (
        <div className={styles.grid}>
          {tiles.map((tile) => (
            <article key={tile.ipn_code} className={styles.tile}>
              <div className={styles.imageWrap}>
                {tile.imageLayers.length ? (
                  tile.imageLayers.map((layer, index) => (
                    <img key={`${tile.ipn_code}-${layer.slot}-${index}`} className={styles.imageLayer} src={layer.pictureLink} alt="Bike layer" />
                  ))
                ) : (
                  <div className={styles.placeholder}>No image layers available</div>
                )}
              </div>

              <div className={styles.ipn}>{tile.ipn_code}</div>
              <div className={styles.line}>Line: {tile.lineLabel || '-'}</div>
              <div className={styles.spec}>{tile.specSummary || '-'}</div>
              <div className={styles.colour}>Colour detail: {tile.colourDetail || '-'}</div>

              <details className={styles.meta}>
                <summary>Details</summary>
                <div>ruleset: {tile.ruleset}</div>
                <div>account_code: {tile.account_code}</div>
                <div>country_code: {tile.country_code || '-'}</div>
                <div>created_at: {formatDate(tile.created_at)}</div>
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
