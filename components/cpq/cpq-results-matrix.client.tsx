'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CpqMatrixRowViewModel, CpqResultsFilterOptions, CpqResultsFilters } from '@/lib/cpq/results/service';
import styles from './cpq-results-page.module.css';

type Props = {
  rows: CpqMatrixRowViewModel[];
  featureColumns: string[];
  countryColumns: string[];
  rowIdentityDescription: string;
  filterOptions: CpqResultsFilterOptions;
  filters: CpqResultsFilters;
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
};

export default function CpqResultsMatrixClient({ rows, featureColumns, countryColumns, rowIdentityDescription, filterOptions, filters, pagination }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visibleFeatures, setVisibleFeatures] = useState<string[]>(featureColumns);
  const [skuSearch, setSkuSearch] = useState(filters.sku_code ?? '');
  const [countryPresence, setCountryPresence] = useState('');

  const updateFilter = (key: 'ruleset' | 'bike_type' | 'sku_code' | 'page', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.set('page', '1');
    params.set('page_size', String(pagination.pageSize));
    router.replace(`${pathname}?${params.toString()}`);
  };
  useEffect(() => {
    const t = setTimeout(() => {
      const value = skuSearch.trim();
      updateFilter('sku_code', value.length >= 3 ? value : '');
    }, 350);
    return () => clearTimeout(t);
  }, [skuSearch]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (countryPresence && !row.countryDetailIds[countryPresence]) return false;
      return true;
    });
  }, [rows, countryPresence]);

  const toggleFeature = (feature: string) => {
    setVisibleFeatures((current) => (current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]));
  };

  return (
    <>
      <section className={styles.filters}>
        <label className={styles.filterItem}>
          <span>ruleset</span>
          <select value={filters.ruleset ?? ''} onChange={(event) => updateFilter('ruleset', event.target.value)}>
            <option value="">All</option>
            {filterOptions.rulesets.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>bike_type</span>
          <select value={filters.bike_type ?? ''} onChange={(event) => updateFilter('bike_type', event.target.value)}>
            <option value="">All</option>
            {filterOptions.bikeTypes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>sku_code search</span>
          <input value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} placeholder="Search sku_code (3+ chars)" />
        </label>

        <label className={styles.filterItem}>
          <span>country presence</span>
          <select value={countryPresence} onChange={(event) => setCountryPresence(event.target.value)}>
            <option value="">Any</option>
            {countryColumns.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </section>

      <section className={styles.columnPicker}>
        <div className={styles.columnPickerTitle}>Feature column visibility</div>
        <div className={styles.columnPickerGrid}>
          {featureColumns.map((feature) => (
            <label key={feature} className={styles.columnPickerItem}>
              <input type="checkbox" checked={visibleFeatures.includes(feature)} onChange={() => toggleFeature(feature)} />
              <span>{feature}</span>
            </label>
          ))}
        </div>
      </section>

      <div className={styles.identity}>{rowIdentityDescription}</div>
      <div className={styles.identity}>
        Page {pagination.page}, rows returned {rows.length}. Use Prev/Next for server pagination.
        <button type="button" onClick={() => updateFilter('page', String(Math.max(1, pagination.page - 1)))} disabled={pagination.page <= 1}>Prev</button>
        <button type="button" onClick={() => updateFilter('page', String(pagination.page + 1))} disabled={rows.length < pagination.pageSize}>Next</button>
      </div>

      {filteredRows.length === 0 ? (
        <div className={styles.empty}>No CPQ sampler results found for the selected filters.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th>sku_code</th>
                <th>bike_type</th>
                {featureColumns.filter((feature) => visibleFeatures.includes(feature)).map((feature) => (
                  <th key={feature}>{feature}</th>
                ))}
                {countryColumns.map((country) => (
                  <th key={country}>{country}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.rowKey}>
                  <td>{row.sku_code}</td>
                  <td>{row.bike_type || '-'}</td>
                  {featureColumns.filter((feature) => visibleFeatures.includes(feature)).map((feature) => (
                    <td key={`${row.rowKey}-${feature}`}>{row.featureValues[feature] || '-'}</td>
                  ))}
                  {countryColumns.map((country) => {
                    const detailId = row.countryDetailIds[country];
                    return (
                      <td key={`${row.rowKey}-${country}`} className={detailId ? undefined : styles.countryMissing}>
                        {detailId || '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
