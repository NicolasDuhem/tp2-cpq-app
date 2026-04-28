'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QPartAllocationStatus,
  SalesQPartAllocationFilterOptions,
  SalesQPartAllocationRow,
  SalesQPartTerritoryFilterRegion,
} from '@/lib/sales/qpart-allocation/service';
import styles from './sales-qpart-allocation-page.module.css';

type Props = {
  rows: SalesQPartAllocationRow[];
  countryColumns: string[];
  filterOptions: SalesQPartAllocationFilterOptions;
};

type Message = { type: 'success' | 'error'; text: string } | null;

type LevelSelection = Record<number, string[]>;

type MetadataSelection = Record<string, string[]>;
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

const defaultHierarchySelection: LevelSelection = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function statusLabel(status: QPartAllocationStatus) {
  return status === 'active' ? 'Active' : 'Inactive';
}

function getCountryFlagUrl(countryCode: string) {
  const normalizedCode = countryCode.toUpperCase();
  const flagCode = normalizedCode === 'EL' ? 'gr' : normalizedCode.toLowerCase();
  return `https://flagcdn.com/${flagCode}.svg`;
}

function getBCBadgeClass(status: BCStatus) {
  if (status === 'OK') return `${styles.bcBadge} ${styles.statusActive}`;
  if (status === 'NOK') return `${styles.bcBadge} ${styles.statusNotActive}`;
  if (status === 'ERR') return `${styles.bcBadge} ${styles.bcStatusError}`;
  return `${styles.bcBadge} ${styles.bcStatusDisabled}`;
}

function CheckboxListFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className={styles.filterItem}>
      <span>{label}</span>
      <div className={styles.checkboxList}>
        {options.length ? (
          options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={`${label}-${option}`} className={styles.checkboxOption}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onChange(event.target.checked ? [...selected, option] : selected.filter((value) => value !== option))
                  }
                />
                <span>{option}</span>
              </label>
            );
          })
        ) : (
          <div className={styles.emptyFilterValues}>No values</div>
        )}
      </div>
    </div>
  );
}

export default function SalesQPartAllocationTableClient({ rows, countryColumns, filterOptions }: Props) {
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [partNumberSearch, setPartNumberSearch] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [hierarchySelection, setHierarchySelection] = useState<LevelSelection>(defaultHierarchySelection);
  const [metadataSelection, setMetadataSelection] = useState<MetadataSelection>({});
  const [countrySelection, setCountrySelection] = useState<string[]>([]);
  const [statusSelection, setStatusSelection] = useState<QPartAllocationStatus[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pushBusyKey, setPushBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bcStatusBySku, setBcStatusBySku] = useState<BCStatusMap>({});
  const [bcStatusLoading, setBcStatusLoading] = useState(false);
  const [bcCheckSummary, setBcCheckSummary] = useState<BCCheckSummary>(null);

  const visibleCountries = useMemo(() => {
    if (!countrySelection.length) return countryColumns;
    const selected = new Set(countrySelection);
    return countryColumns.filter((countryCode) => selected.has(countryCode));
  }, [countryColumns, countrySelection]);

  const territoryGroups = useMemo(() => {
    const search = territorySearch.trim().toLowerCase();
    return filterOptions.territoryRegions
      .map((region) => ({
        ...region,
        subRegions: region.subRegions
          .map((subRegion) => ({
            ...subRegion,
            countries: subRegion.countries.filter((countryCode) =>
              search ? countryCode.toLowerCase().includes(search) : true,
            ),
          }))
          .filter((subRegion) => subRegion.countries.length),
      }))
      .filter((region) => region.subRegions.length);
  }, [filterOptions.territoryRegions, territorySearch]);

  const textFilteredRows = useMemo(() => {
    const partFilter = partNumberSearch.trim().toLowerCase();
    const titleFilter = titleSearch.trim().toLowerCase();

    return rows.filter((row) => {
      if (partFilter && !row.partNumber.toLowerCase().includes(partFilter)) return false;
      if (titleFilter && !row.englishTitle.toLowerCase().includes(titleFilter)) return false;
      return true;
    });
  }, [rows, partNumberSearch, titleSearch]);

  const hierarchyOptions = useMemo(() => {
    const options: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

    for (let level = 1; level <= 7; level += 1) {
      const filtered = textFilteredRows.filter((row) => {
        for (let parentLevel = 1; parentLevel < level; parentLevel += 1) {
          const selected = hierarchySelection[parentLevel] ?? [];
          if (!selected.length) continue;
          const value = row.hierarchyLevels[parentLevel - 1] ?? '';
          if (!selected.includes(value)) return false;
        }
        return true;
      });

      options[level] = uniqueSorted(filtered.map((row) => row.hierarchyLevels[level - 1] ?? '').filter(Boolean));
    }

    return options;
  }, [textFilteredRows, hierarchySelection]);

  const hierarchyFilteredRows = useMemo(
    () =>
      textFilteredRows.filter((row) => {
        for (let level = 1; level <= 7; level += 1) {
          const selected = hierarchySelection[level] ?? [];
          if (!selected.length) continue;
          const value = row.hierarchyLevels[level - 1] ?? '';
          if (!selected.includes(value)) return false;
        }
        return true;
      }),
    [textFilteredRows, hierarchySelection],
  );

  const metadataOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of filterOptions.metadataFields) {
      options[field.key] = uniqueSorted(hierarchyFilteredRows.flatMap((row) => row.metadataValues[field.key] ?? []));
    }
    return options;
  }, [hierarchyFilteredRows, filterOptions.metadataFields]);

  const metadataFilteredRows = useMemo(
    () =>
      hierarchyFilteredRows.filter((row) =>
        Object.entries(metadataSelection).every(([key, selectedValues]) => {
          if (!selectedValues.length) return true;
          const partValues = row.metadataValues[key] ?? [];
          return selectedValues.some((value) => partValues.includes(value));
        }),
      ),
    [hierarchyFilteredRows, metadataSelection],
  );

  const filteredRows = useMemo(
    () =>
      metadataFilteredRows.filter((row) => {
        if (!statusSelection.length) return true;
        const targetCountries = visibleCountries.length ? visibleCountries : countryColumns;
        return targetCountries.some((countryCode) => statusSelection.includes(row.countryStatuses[countryCode]));
      }),
    [metadataFilteredRows, statusSelection, visibleCountries, countryColumns],
  );

  const setHierarchyLevel = (level: number, values: string[]) => {
    const next: LevelSelection = { ...hierarchySelection, [level]: values };
    for (let deeper = level + 1; deeper <= 7; deeper += 1) {
      next[deeper] = [];
    }
    setHierarchySelection(next);
  };

  const toggleTerritoryCountry = (countryCode: string, checked: boolean) => {
    setCountrySelection((prev) => {
      if (checked) return prev.includes(countryCode) ? prev : [...prev, countryCode];
      return prev.filter((value) => value !== countryCode);
    });
  };

  const clearTerritorySelection = () => {
    setCountrySelection([]);
    setTerritorySearch('');
  };

  const toggleCell = async (row: SalesQPartAllocationRow, countryCode: string, currentStatus: QPartAllocationStatus) => {
    const targetStatus: QPartAllocationStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const key = `${row.partId}:${countryCode}`;
    setBusyKey(key);
    setMessage(null);

    try {
      const response = await fetch('/api/sales/qpart-allocation/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partId: row.partId, countryCode, targetStatus }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { updatedCount: number; targetStatus: QPartAllocationStatus };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Failed to update allocation');
      }

      setMessage({
        type: 'success',
        text: `${row.partNumber} ${countryCode} updated to ${payload.result.targetStatus === 'active' ? 'Active' : 'Inactive'}.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update allocation' });
    } finally {
      setBusyKey(null);
    }
  };

  const pushCell = async (row: SalesQPartAllocationRow, countryCode: string) => {
    const key = `${row.partId}:${countryCode}`;
    setPushBusyKey(key);
    setMessage(null);

    try {
      const response = await fetch('/api/sales/qpart-allocation/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partId: row.partId, countryCode }),
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
        throw new Error(payload.error ? (detail ? `${payload.error} (${detail})` : payload.error) : 'Failed to push allocation to external PostgreSQL');
      }

      setMessage({ type: 'success', text: `${row.partNumber} ${countryCode} pushed (${payload.result.action}).` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to push allocation' });
    } finally {
      setPushBusyKey(null);
    }
  };

  const runBulk = async (targetStatus: QPartAllocationStatus) => {
    if (!filteredRows.length) {
      setMessage({ type: 'error', text: 'No visible parts to update.' });
      return;
    }
    if (!visibleCountries.length) {
      setMessage({ type: 'error', text: 'Select at least one target country for bulk update.' });
      return;
    }

    const label = targetStatus === 'active' ? 'Activate' : 'Deactivate';
    const confirmed = window.confirm(
      `${label} ${filteredRows.length} visible part(s) for ${visibleCountries.length} country column(s): ${visibleCountries.join(', ')}?`,
    );
    if (!confirmed) return;

    setBulkBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/sales/qpart-allocation/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partIds: filteredRows.map((row) => row.partId),
          countryCodes: visibleCountries,
          targetStatus,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { updatedCount: number; partCount: number; countryCount: number; targetStatus: QPartAllocationStatus };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Bulk update failed');
      }

      setMessage({
        type: 'success',
        text: `Bulk ${label.toLowerCase()} complete: ${payload.result.updatedCount} allocation cells updated (${payload.result.partCount} parts × ${payload.result.countryCount} countries).`,
      });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Bulk update failed' });
    } finally {
      setBulkBusy(false);
    }
  };


  useEffect(() => {
    const skus: string[] = [...new Set(filteredRows.map((row) => row.partNumber.trim()).filter((sku): sku is string => Boolean(sku)))];
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
        console.warn('[BC status][qpart-allocation] cached lookup failed', error);
      }
    };

    void loadCachedStatuses();
    return () => {
      cancelled = true;
    };
  }, [filteredRows]);

  const runBCStatusCheck = async () => {
    const skus: string[] = [...new Set(filteredRows.map((row) => row.partNumber.trim()).filter((sku): sku is string => Boolean(sku)))];
    console.info('[BC status][qpart-allocation]', {
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
          itemType: 'QPART',
          sourcePage: 'qpart-allocation',
          items: Object.fromEntries(skus.map((sku) => [sku, payload.items?.[sku] ?? { status: 'ERR', sku }])),
        }),
      }).catch((error) => {
        console.warn('[BC status][qpart-allocation] failed to upsert cache', error);
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
      <section className={`${styles.panel} ${styles.filterPanel}`}>
        <div className={styles.filterHeaderRow}>
          <div className={styles.filterHeaderLeft}>
            <button type="button" className={styles.collapseToggle} onClick={() => setFiltersOpen((prev) => !prev)}>
              {filtersOpen ? 'Hide filters' : 'Show filters'}
            </button>
            <div className={styles.rowCountBadge}>Rows in table: {filteredRows.length}</div>
          </div>
          <div className={styles.filterHeaderActions}>
            <div className={styles.bulkSelection}>
              Countries in scope: <strong>{visibleCountries.length}</strong>
            </div>
            <button type="button" className={styles.bulkActionButton} onClick={() => void runBCStatusCheck()} disabled={bcStatusLoading || bulkBusy}>
              {bcStatusLoading ? 'Checking BC Status...' : 'Check BC Status'}
            </button>
            {bcCheckSummary ? (
              <span className={styles.bcCheckMeta}>
                Last checked: {bcCheckSummary.checkedAt} · Checked {bcCheckSummary.checkedCount} SKUs · {bcCheckSummary.ok} OK / {bcCheckSummary.nok} NOK / {bcCheckSummary.err} ERR
              </span>
            ) : null}
            <button type="button" className={styles.bulkActionButton} onClick={() => void runBulk('active')} disabled={bulkBusy}>
              {bulkBusy ? 'Working…' : 'Bulk activate'}
            </button>
            <button type="button" className={styles.bulkActionButton} onClick={() => void runBulk('inactive')} disabled={bulkBusy}>
              {bulkBusy ? 'Working…' : 'Bulk deactivate'}
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className={styles.filterSections}>
            <section className={`${styles.filterSection} ${styles.territorySection}`}>
              <div className={styles.sectionTitleRow}>
                <h3>Territory filters</h3>
                <button type="button" className={styles.textButton} onClick={clearTerritorySelection}>
                  Clear
                </button>
              </div>
              <label className={styles.filterItem}>
                <span>Country code search</span>
                <input
                  value={territorySearch}
                  onChange={(event) => setTerritorySearch(event.target.value.toUpperCase())}
                  placeholder="Search country code"
                />
              </label>
              <div className={styles.territoryRegionGrid}>
                {territoryGroups.map((region: SalesQPartTerritoryFilterRegion) => (
                  <div key={`region-${region.region}`} className={styles.territoryRegionCard}>
                    <div className={styles.territoryRegionTitle}>{region.region}</div>
                    <div className={styles.checkboxList}>
                      {region.subRegions.map((subRegion) => (
                        <div key={`${region.region}-${subRegion.subRegion}`} className={styles.subRegionBlock}>
                          <div className={styles.subRegionTitle}>{subRegion.subRegion}</div>
                          {subRegion.countries.map((countryCode) => (
                            <label key={`${region.region}-${subRegion.subRegion}-${countryCode}`} className={styles.checkboxOption}>
                              <input
                                type="checkbox"
                                checked={countrySelection.includes(countryCode)}
                                onChange={(event) => toggleTerritoryCountry(countryCode, event.target.checked)}
                              />
                              <span className={styles.countryOptionLabel}>
                                <img src={getCountryFlagUrl(countryCode)} alt="" className={styles.countryFlag} loading="lazy" />
                                <span>{countryCode}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${styles.filterSection} ${styles.partSection}`}>
              <div className={styles.sectionTitleRow}>
                <h3>Part filters</h3>
              </div>
              <div className={styles.partFilterGrid}>
                <label className={styles.filterItem}>
                  <span>Part number</span>
                  <input value={partNumberSearch} onChange={(event) => setPartNumberSearch(event.target.value)} placeholder="Search part number" />
                </label>
                <label className={styles.filterItem}>
                  <span>English title</span>
                  <input value={titleSearch} onChange={(event) => setTitleSearch(event.target.value)} placeholder="Search title" />
                </label>

                {Array.from({ length: 7 }).map((_, index) => {
                  const level = index + 1;
                  return (
                    <CheckboxListFilter
                      key={`h${level}`}
                      label={`Hierarchy ${level}`}
                      options={hierarchyOptions[level]}
                      selected={hierarchySelection[level] ?? []}
                      onChange={(values) => setHierarchyLevel(level, values)}
                    />
                  );
                })}

                {filterOptions.metadataFields.map((field) => (
                  <CheckboxListFilter
                    key={field.key}
                    label={field.label}
                    options={metadataOptions[field.key] ?? []}
                    selected={metadataSelection[field.key] ?? []}
                    onChange={(values) =>
                      setMetadataSelection((prev) => ({
                        ...prev,
                        [field.key]: values,
                      }))
                    }
                  />
                ))}

                <CheckboxListFilter
                  label="Allocation status"
                  options={['active', 'inactive']}
                  selected={statusSelection}
                  onChange={(values) => setStatusSelection(values as QPartAllocationStatus[])}
                />
              </div>
            </section>
          </div>
        ) : null}
      </section>

      {message ? (
        <div className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}>
          {message.text}
        </div>
      ) : null}

      {filteredRows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th className={`${styles.stickyColumn} ${styles.stickyBCStatus}`}>BC Status</th>
                <th className={`${styles.stickyColumn} ${styles.stickyPart}`}>Part</th>
                <th className={`${styles.stickyColumn} ${styles.stickyTitle}`}>English title</th>
                <th className={`${styles.stickyColumn} ${styles.stickyHierarchy}`}>Hierarchy</th>
                {visibleCountries.map((countryCode) => (
                  <th key={`head-${countryCode}`} className={styles.countryHeader}>
                    <span className={styles.countryHeaderLabel}>
                      <img src={getCountryFlagUrl(countryCode)} alt="" className={styles.countryFlag} loading="lazy" />
                      <span>{countryCode}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.partId} className={styles.tableRow}>
                  <td className={`${styles.stickyColumn} ${styles.stickyBCStatus}`}>
                    {bcStatusLoading && !bcStatusBySku[row.partNumber] ? (
                      <span className={`${styles.bcBadge} ${styles.bcStatusChecking}`}>Checking...</span>
                    ) : bcStatusBySku[row.partNumber]?.status ? (
                      <span className={getBCBadgeClass(bcStatusBySku[row.partNumber].status)}>{bcStatusBySku[row.partNumber].status}</span>
                    ) : (
                      <span className={styles.bcNotChecked}>Not checked</span>
                    )}
                  </td>
                  <td className={`${styles.stickyColumn} ${styles.stickyPart}`}>
                    <Link className={styles.partLink} href={`/qpart/parts/${row.partId}`}>
                      {row.partNumber}
                    </Link>
                  </td>
                  <td className={`${styles.titleCell} ${styles.stickyColumn} ${styles.stickyTitle}`}>
                    <Link className={styles.titleLink} href={`/qpart/parts/${row.partId}`}>
                      <span className={styles.titleText}>{row.englishTitle}</span>
                    </Link>
                  </td>
                  <td className={`${styles.hierarchyCell} ${styles.stickyColumn} ${styles.stickyHierarchy}`}>{row.hierarchySummary || '—'}</td>
                  {visibleCountries.map((countryCode) => {
                    const status = row.countryStatuses[countryCode] ?? 'inactive';
                    const cellKey = `${row.partId}:${countryCode}`;
                    return (
                      <td key={`${row.partId}-${countryCode}`} className={styles.countryCell}>
                        <div className={styles.cellActions}>
                          <button
                            type="button"
                            className={`${styles.statusButton} ${status === 'active' ? styles.statusActive : styles.statusNotActive}`}
                            onClick={() => void toggleCell(row, countryCode, status)}
                            disabled={busyKey === cellKey || pushBusyKey === cellKey}
                          >
                            {statusLabel(status)}
                          </button>
                          <button
                            type="button"
                            className={styles.pushButton}
                            onClick={() => void pushCell(row, countryCode)}
                            disabled={busyKey === cellKey || pushBusyKey === cellKey || bulkBusy}
                          >
                            {pushBusyKey === cellKey ? 'Pushing…' : 'Push'}
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
      ) : (
        <div className={styles.empty}>No QPart allocation rows match the current filters.</div>
      )}
    </>
  );
}
