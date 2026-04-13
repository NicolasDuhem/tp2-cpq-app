'use client';

import { useMemo, useState } from 'react';
import { CpqMatrixRowViewModel } from '@/lib/cpq/results/service';
import styles from './cpq-results-page.module.css';

type Props = {
  rows: CpqMatrixRowViewModel[];
  featureColumns: string[];
  countryColumns: string[];
  rowIdentityDescription: string;
};

export default function CpqResultsMatrixClient({ rows, featureColumns, countryColumns, rowIdentityDescription }: Props) {
  const [visibleFeatures, setVisibleFeatures] = useState<string[]>(featureColumns);
  const [rulesetFilter, setRulesetFilter] = useState('');
  const [bikeTypeFilter, setBikeTypeFilter] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [countryPresence, setCountryPresence] = useState('');

  const rulesets = useMemo(() => [...new Set(rows.map((row) => row.ruleset))].sort((a, b) => a.localeCompare(b)), [rows]);
  const bikeTypes = useMemo(() => [...new Set(rows.map((row) => row.bike_type).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSkuSearch = skuSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (rulesetFilter && row.ruleset !== rulesetFilter) return false;
      if (bikeTypeFilter && row.bike_type !== bikeTypeFilter) return false;
      if (normalizedSkuSearch && !row.sku_code.toLowerCase().includes(normalizedSkuSearch)) return false;
      if (countryPresence && !row.countryDetailIds[countryPresence]) return false;
      return true;
    });
  }, [rows, rulesetFilter, bikeTypeFilter, skuSearch, countryPresence]);

  const toggleFeature = (feature: string) => {
    setVisibleFeatures((current) => (current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]));
  };

  return (
    <>
      <section className={styles.filters}>
        <label className={styles.filterItem}>
          <span>ruleset</span>
          <select value={rulesetFilter} onChange={(event) => setRulesetFilter(event.target.value)}>
            <option value="">All</option>
            {rulesets.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>bike_type</span>
          <select value={bikeTypeFilter} onChange={(event) => setBikeTypeFilter(event.target.value)}>
            <option value="">All</option>
            {bikeTypes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>sku_code search</span>
          <input value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} placeholder="Search sku_code" />
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
