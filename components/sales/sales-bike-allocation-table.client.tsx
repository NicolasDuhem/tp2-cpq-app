'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
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
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
};

type CountryStatusFilter = 'all' | 'active' | 'not_active' | 'not_configured';
type Message = { type: 'success' | 'error'; text: string } | null;
type BCStatus = 'OK' | 'NOK' | 'ERR' | 'DISABLED';
type BCStatusMap = Record<string, { status: BCStatus }>;
type BCVariantStatusItem = {
  status?: BCStatus;
  exists?: boolean;
  sku?: string;
  variantId?: number;
  productId?: number;
  skuId?: number;
  productName?: string;
  imageUrl?: string;
  calculatedPrice?: number;
  inventoryLevel?: number;
  purchasingDisabled?: boolean;
  isVisible?: boolean;
  variantJson?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
};
type BCCheckSummary = { checkedAt: string; checkedCount: number; ok: number; nok: number; err: number } | null;
const CPQ_LAUNCH_REPLAY_STORAGE_PREFIX = 'tp2-cpq-launch-replay:';

function statusLabel(status: AllocationStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'not_active') return 'Inactive';
  return 'Not configured';
}

function statusClass(status: AllocationStatus): string {
  if (status === 'active') return styles.statusActive;
  if (status === 'not_active') return styles.statusNotActive;
  return styles.statusNotConfigured;
}

function getBCBadgeClass(status: BCStatus): string {
  if (status === 'OK') return `${styles.bcBadge} ${styles.statusActive}`;
  if (status === 'NOK') return `${styles.bcBadge} ${styles.statusNotActive}`;
  if (status === 'ERR') return `${styles.bcBadge} ${styles.bcStatusError}`;
  return `${styles.bcBadge} ${styles.bcStatusDisabled}`;
}

export default function SalesBikeAllocationTableClient({
  rows,
  availableFeatures,
  countryColumns,
  filterOptions,
  filters,
  pagination,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [ipnFilter, setIpnFilter] = useState('');
  const [featureFilters, setFeatureFilters] = useState<Record<string, string>>({});
  const [countryFilters, setCountryFilters] = useState<Record<string, CountryStatusFilter>>({});
  const [message, setMessage] = useState<Message>(null);
  const [cellActionKey, setCellActionKey] = useState<string | null>(null);
  const [pushActionKey, setPushActionKey] = useState<string | null>(null);
  const [bulkActionRunning, setBulkActionRunning] = useState(false);
  const [bulkCountrySelection, setBulkCountrySelection] = useState<Record<string, boolean>>({});
  const [bcStatusBySku, setBcStatusBySku] = useState<BCStatusMap>({});
  const [bcStatusLoading, setBcStatusLoading] = useState(false);
  const [bcCheckSummary, setBcCheckSummary] = useState<BCCheckSummary>(null);

  const selectedFeatureSet = useMemo(() => new Set(selectedFeatures), [selectedFeatures]);
  const selectedCountryTargets = useMemo(
    () => countryColumns.filter((countryCode) => bulkCountrySelection[countryCode]),
    [bulkCountrySelection, countryColumns],
  );

  const visibleFeatureColumns = availableFeatures.filter((feature) => selectedFeatureSet.has(feature));
  const effectiveRuleset = String(filters.ruleset ?? '').trim();

  const filteredRows = useMemo(() => {
    const normalizedIpnFilter = ipnFilter.trim().toLowerCase();

    return rows.filter((row) => {
      if (normalizedIpnFilter && !row.ipnCode.toLowerCase().includes(normalizedIpnFilter)) {
        return false;
      }

      for (const feature of visibleFeatureColumns) {
        const valueFilter = String(featureFilters[feature] ?? '').trim().toLowerCase();
        if (!valueFilter) continue;
        const value = String(row.featureValues[feature] ?? '').toLowerCase();
        if (!value.includes(valueFilter)) return false;
      }

      for (const country of countryColumns) {
        const statusFilter = countryFilters[country] ?? 'all';
        if (statusFilter === 'all') continue;
        if (row.countryStatuses[country] !== statusFilter) return false;
      }

      return true;
    });
  }, [rows, ipnFilter, visibleFeatureColumns, featureFilters, countryColumns, countryFilters]);

  const updateFilter = (key: 'ruleset' | 'country_code' | 'bike_type', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    params.set('page_size', String(pagination.pageSize));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const onFeatureSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setSelectedFeatures(values);
    setFeatureFilters((prev) => Object.fromEntries(values.map((value) => [value, prev[value] ?? ''])));
  };

  const setFeatureFilterValue = (feature: string, value: string) => {
    setFeatureFilters((prev) => ({ ...prev, [feature]: value }));
  };

  const setCountryFilterValue = (country: string, value: CountryStatusFilter) => {
    setCountryFilters((prev) => ({ ...prev, [country]: value }));
  };

  const runRefresh = () => {
    router.refresh();
  };

  const onCountryCellClick = async (row: SalesBikeAllocationRow, countryCode: string, status: AllocationStatus) => {
    if (status === 'not_configured') {
      setCellActionKey(`${row.rowRuleset}:${row.ipnCode}:${countryCode}`);
      setMessage(null);
      try {
        const response = await fetch('/api/sales/bike-allocation/launch-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruleset: row.rowRuleset, ipnCode: row.ipnCode, countryCode }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          resolved?: {
            ruleset: string;
            accountCode: string | null;
            countryCode: string;
            ipnCode: string;
            replay?: {
              sourceSamplerId: number | null;
              sourceCountryCode: string | null;
              selectedOptions: Array<{ featureLabel: string; optionLabel: string; optionValue: string }>;
            };
          };
        };
        if (!response.ok || !payload.resolved) {
          throw new Error(payload.error ?? 'Failed to resolve CPQ launch context');
        }

        const cpqParams = new URLSearchParams();
        cpqParams.set('ruleset', payload.resolved.ruleset);
        cpqParams.set('country_code', payload.resolved.countryCode);
        cpqParams.set('ipn_code', payload.resolved.ipnCode);
        if (payload.resolved.accountCode) cpqParams.set('account_code', payload.resolved.accountCode);
        const replayToken = crypto.randomUUID();
        cpqParams.set('replay_token', replayToken);
        if (typeof window !== 'undefined') {
          const replayPayload = {
            source: 'sales-bike-allocation-not-configured',
            createdAt: new Date().toISOString(),
            launchIpnCode: row.ipnCode,
            targetCountryCode: payload.resolved.countryCode,
            ruleset: payload.resolved.ruleset,
            accountCode: payload.resolved.accountCode,
            selectedOptions: payload.resolved.replay?.selectedOptions ?? [],
            sourceSamplerId: payload.resolved.replay?.sourceSamplerId ?? null,
            sourceCountryCode: payload.resolved.replay?.sourceCountryCode ?? null,
          };
          window.sessionStorage.setItem(`${CPQ_LAUNCH_REPLAY_STORAGE_PREFIX}${replayToken}`, JSON.stringify(replayPayload));
        }

        router.push(`/cpq?${cpqParams.toString()}`);
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to open configurator flow.' });
      } finally {
        setCellActionKey(null);
      }
      return;
    }

    const targetStatus: 'active' | 'not_active' = status === 'active' ? 'not_active' : 'active';
    const actionKey = `${row.rowRuleset}:${row.ipnCode}:${countryCode}`;
    setCellActionKey(actionKey);
    setMessage(null);

    try {
      const response = await fetch('/api/sales/bike-allocation/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleset: row.rowRuleset,
          ipnCode: row.ipnCode,
          countryCode,
          targetStatus,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { updatedCount: number; targetStatus: 'active' | 'not_active' };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Failed to update cell');
      }

      setMessage({
        type: 'success',
        text: `${row.ipnCode} ${countryCode} updated to ${payload.result.targetStatus === 'active' ? 'Active' : 'Inactive'} (${payload.result.updatedCount} sampler row(s)).`,
      });
      runRefresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update cell.' });
    } finally {
      setCellActionKey(null);
    }
  };



  const pushRowToExternal = async (row: SalesBikeAllocationRow, countryCode: string) => {
    const actionKey = `${row.rowRuleset}:${row.ipnCode}:${countryCode}`;
    setPushActionKey(actionKey);
    setMessage(null);

    try {
      const response = await fetch('/api/sales/bike-allocation/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleset: row.rowRuleset,
          ipnCode: row.ipnCode,
          countryCode,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        errorType?: string;
        errorCode?: string;
        errorDetail?: string;
        errorHint?: string;
        stage?: string;
        result?: { action: 'inserted' | 'updated' };
      };

      if (!response.ok || !payload.result) {
        const detail = [
          payload.errorType ? `type=${payload.errorType}` : null,
          payload.errorCode ? `code=${payload.errorCode}` : null,
          payload.stage ? `stage=${payload.stage}` : null,
          payload.errorDetail ? `detail=${payload.errorDetail}` : null,
          payload.errorHint ? `hint=${payload.errorHint}` : null,
        ]
          .filter(Boolean)
          .join(', ');
        throw new Error(payload.error ? (detail ? `${payload.error} (${detail})` : payload.error) : 'Failed to push row to external PostgreSQL');
      }

      setMessage({
        type: 'success',
        text: `${row.ipnCode} ${countryCode} pushed (${payload.result.action}).`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to push row.' });
    } finally {
      setPushActionKey(null);
    }
  };

  const runBulkAction = async (targetStatus: 'active' | 'not_active') => {
    if (!effectiveRuleset) {
      setMessage({ type: 'error', text: 'Select a specific ruleset before running bulk actions.' });
      return;
    }
    if (!filteredRows.length) {
      setMessage({ type: 'error', text: 'No visible rows to update.' });
      return;
    }
    if (!selectedCountryTargets.length) {
      setMessage({ type: 'error', text: 'Choose at least one target country column for bulk update.' });
      return;
    }

    const label = targetStatus === 'active' ? 'Activate' : 'Deactivate';
    const confirm = window.confirm(
      `${label} ${filteredRows.length} visible IPN row(s) across ${selectedCountryTargets.length} country column(s): ${selectedCountryTargets.join(', ')}?\nOnly existing sampler rows will be updated.`,
    );
    if (!confirm) return;

    setBulkActionRunning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/sales/bike-allocation/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleset: effectiveRuleset,
          ipnCodes: filteredRows.map((row) => row.ipnCode),
          countryCodes: selectedCountryTargets,
          targetStatus,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { updatedCount: number; ipnCount: number; countryCount: number };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Bulk update failed');
      }

      setMessage({
        type: 'success',
        text: `Bulk ${label.toLowerCase()} done. Updated ${payload.result.updatedCount} sampler row(s) for ${payload.result.ipnCount} IPN(s) x ${payload.result.countryCount} countr${payload.result.countryCount === 1 ? 'y' : 'ies'}.`,
      });
      runRefresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Bulk update failed.' });
    } finally {
      setBulkActionRunning(false);
    }
  };


  useEffect(() => {
    const skus: string[] = [...new Set(filteredRows.map((row) => row.ipnCode.trim()).filter((sku): sku is string => Boolean(sku)))];
    if (!skus.length) return;

    let cancelled = false;
    const loadCachedStatuses = async () => {
      try {
        const response = await fetch('/api/bigcommerce/item-map/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          items?: Record<string, { bcStatus?: BCStatus }>;
        };
        if (!response.ok || !payload.items || cancelled) return;

        const nextStatuses: BCStatusMap = {};
        for (const sku of skus) {
          const status = payload.items?.[sku]?.bcStatus;
          if (status === 'OK' || status === 'NOK' || status === 'ERR' || status === 'DISABLED') {
            nextStatuses[sku] = { status };
          }
        }

        if (Object.keys(nextStatuses).length > 0) {
          setBcStatusBySku((prev) => ({ ...prev, ...nextStatuses }));
        }
      } catch (error) {
        console.warn('[BC status][bike-allocation] cached lookup failed', error);
      }
    };

    void loadCachedStatuses();
    return () => {
      cancelled = true;
    };
  }, [filteredRows]);

  const runBCStatusCheck = async () => {
    const skus: string[] = [...new Set(filteredRows.map((row) => row.ipnCode.trim()).filter((sku): sku is string => Boolean(sku)))];
    console.info('[BC status][bike-allocation]', {
      loadedRowCount: rows.length,
      visibleRowCount: filteredRows.length,
      nonEmptySkuCount: skus.length,
      firstSkus: skus.slice(0, 5),
    });
    if (!skus.length) {
      setBcCheckSummary({
        checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        checkedCount: 0,
        ok: 0,
        nok: 0,
        err: 0,
      });
      return;
    }

    setBcStatusLoading(true);
    try {
      const response = await fetch('/api/bigcommerce/variant-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        items?: Record<string, BCVariantStatusItem>;
      };
      if (!response.ok || !payload.items) throw new Error('Failed to load BigCommerce variant status.');

      const nextStatuses: BCStatusMap = {};
      let ok = 0;
      let nok = 0;
      let err = 0;
      for (const sku of skus) {
        const status = payload.items?.[sku]?.status;
        const mapped: BCStatus = status === 'OK' || status === 'NOK' || status === 'ERR' || status === 'DISABLED' ? status : 'ERR';
        nextStatuses[sku] = { status: mapped };
        if (mapped === 'OK') ok += 1;
        else if (mapped === 'NOK') nok += 1;
        else err += 1;
      }
      setBcStatusBySku((prev) => ({ ...prev, ...nextStatuses }));
      setBcCheckSummary({
        checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        checkedCount: skus.length,
        ok,
        nok,
        err,
      });

      void fetch('/api/bigcommerce/item-map/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'BIKE',
          sourcePage: 'bike-allocation',
          items: Object.fromEntries(skus.map((sku) => [sku, payload.items?.[sku] ?? { status: 'ERR', sku }])),
        }),
      }).catch((error) => {
        console.warn('[BC status][bike-allocation] failed to upsert cache', error);
      });
    } catch {
      const failedStatuses = Object.fromEntries(skus.map((sku) => [sku, { status: 'ERR' as const }])) as BCStatusMap;
      setBcStatusBySku((prev) => ({ ...prev, ...failedStatuses }));
      setBcCheckSummary({
        checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        checkedCount: skus.length,
        ok: 0,
        nok: 0,
        err: skus.length,
      });
    } finally {
      setBcStatusLoading(false);
    }
  };

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
          <span>Bike type</span>
          <select value={filters.bike_type ?? ''} onChange={(event) => updateFilter('bike_type', event.target.value)}>
            <option value="">All</option>
            {filterOptions.bikeTypes.map((bikeType) => (
              <option key={bikeType} value={bikeType}>
                {bikeType}
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
      <section className={styles.filters}>
        <div>
          Page {pagination.page} of {pagination.totalPages} ({pagination.totalRows} rows)
        </div>
        <button type="button" onClick={() => setPage(pagination.page - 1)} disabled={pagination.page <= 1}>
          Prev
        </button>
        <button
          type="button"
          onClick={() => setPage(pagination.page + 1)}
          disabled={pagination.page >= pagination.totalPages}
        >
          Next
        </button>
      </section>

      <section className={styles.bulkActions}>
        <div className={styles.bulkSummary}>Visible rows: {filteredRows.length}</div>
        <div className={styles.bcCheckActions}>
          <button type="button" onClick={() => void runBCStatusCheck()} disabled={bcStatusLoading}>
            {bcStatusLoading ? 'Checking BC Status...' : 'Check BC Status'}
          </button>
          {bcCheckSummary ? (
            <span className={styles.bcCheckMeta}>
              Last checked: {bcCheckSummary.checkedAt} · Checked {bcCheckSummary.checkedCount} SKUs · {bcCheckSummary.ok} OK / {bcCheckSummary.nok} NOK / {bcCheckSummary.err} ERR
            </span>
          ) : null}
        </div>
        <div className={styles.bulkCountryList}>
          {countryColumns.map((countryCode) => (
            <label key={`bulk-${countryCode}`} className={styles.bulkCountryItem}>
              <input
                type="checkbox"
                checked={Boolean(bulkCountrySelection[countryCode])}
                onChange={(event) =>
                  setBulkCountrySelection((prev) => ({ ...prev, [countryCode]: event.target.checked }))
                }
                disabled={bulkActionRunning}
              />
              {countryCode}
            </label>
          ))}
        </div>
        <div className={styles.bulkButtons}>
          <button type="button" onClick={() => void runBulkAction('active')} disabled={bulkActionRunning}>
            {bulkActionRunning ? 'Working…' : 'Bulk activate'}
          </button>
          <button type="button" onClick={() => void runBulkAction('not_active')} disabled={bulkActionRunning}>
            {bulkActionRunning ? 'Working…' : 'Bulk deactivate'}
          </button>
        </div>
      </section>

      <div className={styles.helperText}>
        <strong>Cell actions:</strong> Active / Inactive are clickable toggles. Not configured opens the CPQ configurator flow. Use <strong>Push</strong> to upsert a row-country record into external PostgreSQL.
      </div>

      {message ? (
        <div className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}>
          {message.text}
        </div>
      ) : null}

      {rows.length === 0 ? <div className={styles.empty}>No bike allocation records found for the selected filters.</div> : null}

      {rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th className={styles.stickyBCStatus}>BC Status</th>
                <th className={styles.stickyFirstColumn}>ipn_code</th>
                {!effectiveRuleset ? <th>ruleset</th> : null}
                {visibleFeatureColumns.map((feature) => (
                  <th key={feature}>{feature}</th>
                ))}
                {countryColumns.map((country) => (
                  <th key={country}>{country}</th>
                ))}
              </tr>
              <tr className={styles.filterRow}>
                <th className={styles.stickyBCStatusFilter} />
                <th className={styles.stickyFirstColumnFilter}>
                  <input
                    value={ipnFilter}
                    onChange={(event) => setIpnFilter(event.target.value)}
                    placeholder="contains"
                    aria-label="Filter ipn_code"
                  />
                </th>
                {!effectiveRuleset ? <th /> : null}
                {visibleFeatureColumns.map((feature) => (
                  <th key={`f-${feature}`}>
                    <input
                      value={featureFilters[feature] ?? ''}
                      onChange={(event) => setFeatureFilterValue(feature, event.target.value)}
                      placeholder="contains"
                      aria-label={`Filter ${feature}`}
                    />
                  </th>
                ))}
                {countryColumns.map((country) => (
                  <th key={`c-${country}`}>
                    <select
                      value={countryFilters[country] ?? 'all'}
                      onChange={(event) => setCountryFilterValue(country, event.target.value as CountryStatusFilter)}
                      aria-label={`Filter ${country} status`}
                    >
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="not_active">Inactive</option>
                      <option value="not_configured">Not configured</option>
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={`${row.rowRuleset}::${row.ipnCode}`}>
                  <td className={styles.stickyBCStatus}>
                    {bcStatusLoading && !bcStatusBySku[row.ipnCode] ? (
                      <span className={`${styles.bcBadge} ${styles.bcStatusChecking}`}>Checking...</span>
                    ) : bcStatusBySku[row.ipnCode]?.status ? (
                      <span className={getBCBadgeClass(bcStatusBySku[row.ipnCode].status)}>{bcStatusBySku[row.ipnCode].status}</span>
                    ) : (
                      <span className={styles.bcNotChecked}>Not checked</span>
                    )}
                  </td>
                  <td className={styles.stickyFirstColumn}>{row.ipnCode}</td>
                  {!effectiveRuleset ? <td>{row.rowRuleset}</td> : null}
                  {visibleFeatureColumns.map((feature) => (
                    <td key={`${row.rowRuleset}-${row.ipnCode}-${feature}`}>{row.featureValues[feature] || ''}</td>
                  ))}
                  {countryColumns.map((country) => {
                    const status = row.countryStatuses[country];
                    const actionKey = `${row.rowRuleset}:${row.ipnCode}:${country}`;
                    const isBusy = cellActionKey === actionKey;
                    return (
                      <td key={`${row.rowRuleset}-${row.ipnCode}-${country}`}>
                        <div className={styles.cellActions}>
                          <button
                            type="button"
                            className={`${styles.statusButton} ${statusClass(status)}`}
                            onClick={() => void onCountryCellClick(row, country, status)}
                            disabled={isBusy || bulkActionRunning || pushActionKey === actionKey}
                            title={status === 'not_configured' ? 'Open CPQ configurator for this bike + country' : 'Toggle status'}
                          >
                            {isBusy ? 'Saving…' : statusLabel(status)}
                          </button>
                          <button
                            type="button"
                            className={styles.pushButton}
                            onClick={() => void pushRowToExternal(row, country)}
                            disabled={status === 'not_configured' || bulkActionRunning || isBusy || pushActionKey === actionKey}
                            title={status === 'not_configured' ? 'No sampler row exists yet for this bike + country' : 'Push this bike + country row to external PostgreSQL'}
                          >
                            {pushActionKey === actionKey ? 'Pushing…' : 'Push'}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
