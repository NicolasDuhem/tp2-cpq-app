'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AllocationStatus,
  SalesBikeAllocationFilterOptions,
  SalesBikeAllocationFilters,
  SalesBikeAllocationRow,
} from '@/lib/sales/bike-allocation/service';
import styles from './sales-bike-allocation-page.module.css';

type Props = {
  rows: SalesBikeAllocationRow[];
  availableFeatures: string[];
  countryColumns: string[];
  filterOptions: SalesBikeAllocationFilterOptions;
  filters: SalesBikeAllocationFilters;
};

function statusLabel(status: AllocationStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'not_active') return 'Not active';
  return 'Not configured';
}

function statusClass(status: AllocationStatus): string {
  if (status === 'active') return styles.statusActive;
  if (status === 'not_active') return styles.statusNotActive;
  return styles.statusNotConfigured;
}

export default function SalesBikeAllocationTableClient({
  rows,
  availableFeatures,
  countryColumns,
  filterOptions,
  filters,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const selectedFeatureSet = useMemo(() => new Set(selectedFeatures), [selectedFeatures]);

  const visibleFeatureColumns = availableFeatures.filter((feature) => selectedFeatureSet.has(feature));

  const updateFilter = (key: 'ruleset' | 'country_code', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const onFeatureSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setSelectedFeatures(values);
  };

  if (!rows.length) {
    return (
      <>
        <section className={styles.filters}>
          <label className={styles.filterItem}>
            <span>Ruleset</span>
            <select value={filters.ruleset ?? ''} onChange={(event) => updateFilter('ruleset', event.target.value)}>
              <option value="">All</option>
              {filterOptions.rulesets.map((ruleset) => (
                <option key={ruleset} value={ruleset}>
                  {ruleset}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterItem}>
            <span>Country code</span>
            <select
              value={filters.country_code ?? ''}
              onChange={(event) => updateFilter('country_code', event.target.value)}
            >
              <option value="">All</option>
              {filterOptions.countryCodes.map((countryCode) => (
                <option key={countryCode} value={countryCode}>
                  {countryCode}
                </option>
              ))}
            </select>
          </label>
        </section>
        <div className={styles.empty}>No bike allocation records found for the selected filters.</div>
      </>
    );
  }

  return (
    <>
      <section className={styles.filters}>
        <label className={styles.filterItem}>
          <span>Ruleset</span>
          <select value={filters.ruleset ?? ''} onChange={(event) => updateFilter('ruleset', event.target.value)}>
            <option value="">All</option>
            {filterOptions.rulesets.map((ruleset) => (
              <option key={ruleset} value={ruleset}>
                {ruleset}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>Country code</span>
          <select value={filters.country_code ?? ''} onChange={(event) => updateFilter('country_code', event.target.value)}>
            <option value="">All</option>
            {filterOptions.countryCodes.map((countryCode) => (
              <option key={countryCode} value={countryCode}>
                {countryCode}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterItem}>
          <span>Feature columns</span>
          <select multiple value={selectedFeatures} onChange={onFeatureSelectChange} className={styles.multiSelect}>
            {availableFeatures.map((feature) => (
              <option key={feature} value={feature}>
                {feature}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className={styles.tableWrap}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th>ipn_code</th>
              {visibleFeatureColumns.map((feature) => (
                <th key={feature}>{feature}</th>
              ))}
              {countryColumns.map((country) => (
                <th key={country}>{country}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ipnCode}>
                <td>{row.ipnCode}</td>
                {visibleFeatureColumns.map((feature) => (
                  <td key={`${row.ipnCode}-${feature}`}>{row.featureValues[feature] || ''}</td>
                ))}
                {countryColumns.map((country) => {
                  const status = row.countryStatuses[country];
                  return (
                    <td key={`${row.ipnCode}-${country}`}>
                      <span className={`${styles.statusPill} ${statusClass(status)}`}>{statusLabel(status)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
