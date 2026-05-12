'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  QPartAllocationStatus,
  QPartBCStatusFilter,
  SalesQPartAllocationFilterOptions,
  SalesQPartAllocationRow,
  SalesQPartTerritoryFilterRegion,
} from '@/lib/sales/qpart-allocation/service';
import ConfirmModal from '@/components/shared/ConfirmModal';
import Toast from '@/components/shared/Toast';
import styles from './sales-qpart-allocation-page.module.css';

type Props = {
  rows: SalesQPartAllocationRow[];
  countryColumns: string[];
  filterOptions: SalesQPartAllocationFilterOptions;
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
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
type ExternalStatus = { sku: string; countryCode: string; exists: boolean; isActive: boolean | null };
type ExternalStatusMap = Record<string, ExternalStatus>;

const defaultHierarchySelection: LevelSelection = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}


function parseParamList(searchParams: { get: (key: string) => string | null }, key: string) {
  return uniqueSorted(
    (searchParams.get(key) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function setParamList(params: URLSearchParams, key: string, values: string[]) {
  const normalized = uniqueSorted(values);
  if (normalized.length) params.set(key, normalized.join(','));
  else params.delete(key);
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

function HierarchyFilter({
  level,
  options,
  selected,
  onChange,
  compact = false,
}: {
  level: number;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  if (!options.length) return null;

  const content = (
    <div className={styles.checkboxList}>
      {options.map((option) => {
        const checked = selected.includes(option);
        return (
          <label key={`hierarchy-${level}-${option}`} className={styles.checkboxOption}>
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
      })}
    </div>
  );

  const actions = (
    <span className={styles.hierarchyActions}>
      <button type="button" className={styles.textButton} onClick={() => onChange(options)}>
        Select all
      </button>
      <button type="button" className={styles.textButton} onClick={() => onChange([])}>
        Clear
      </button>
    </span>
  );

  if (compact) {
    return (
      <details className={styles.hierarchyDetails}>
        <summary>
          <span>Hierarchy {level}</span>
          {actions}
        </summary>
        {content}
      </details>
    );
  }

  return (
    <div className={styles.filterItem}>
      <span className={styles.hierarchyTitleRow}>
        <span>Hierarchy {level}</span>
        {actions}
      </span>
      {content}
    </div>
  );
}

export default function SalesQPartAllocationTableClient({ rows, countryColumns, filterOptions, pagination }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [partNumberSearch, setPartNumberSearch] = useState(() => searchParams.get('part') ?? '');
  const [titleSearch, setTitleSearch] = useState(() => searchParams.get('title') ?? '');
  const [territorySearch, setTerritorySearch] = useState('');
  const [hierarchySelection, setHierarchySelection] = useState<LevelSelection>(() => ({
    ...defaultHierarchySelection,
    ...Object.fromEntries(Array.from({ length: 7 }).map((_, index) => [index + 1, parseParamList(searchParams, `h${index + 1}`)])),
  }));
  const [metadataSelection, setMetadataSelection] = useState<MetadataSelection>({});
  const [countrySelection, setCountrySelection] = useState<string[]>(() => parseParamList(searchParams, 'countries').map((value) => value.toUpperCase()));
  const [bcStatusSelection, setBcStatusSelection] = useState<QPartBCStatusFilter[]>(() =>
    parseParamList(searchParams, 'bc_status')
      .map((value) => value.toLowerCase())
      .filter((value): value is QPartBCStatusFilter => value === 'ok' || value === 'nok'),
  );
  const [updateAllEnabled, setUpdateAllEnabled] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pushBusyKey, setPushBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bcStatusBySku, setBcStatusBySku] = useState<BCStatusMap>({});
  const [bcStatusLoading, setBcStatusLoading] = useState(false);
  const [bcCheckSummary, setBcCheckSummary] = useState<BCCheckSummary>(null);
  const [externalStatusByKey, setExternalStatusByKey] = useState<ExternalStatusMap>({});
  const [externalStatusLoading, setExternalStatusLoading] = useState(false);
  const [externalStatusSummary, setExternalStatusSummary] = useState<{ checkedAt: string; pairCount: number; found: number; active: number; inactive: number } | null>(null);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<QPartAllocationStatus | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const visibleCountries = useMemo(() => {
    if (!countrySelection.length) return countryColumns;
    const selected = new Set(countrySelection);
    return countryColumns.filter((countryCode) => selected.has(countryCode));
  }, [countryColumns, countrySelection]);

  const renderedCountries = visibleCountries;

  const serializedFilters = useMemo(() => {
    const params = new URLSearchParams();
    const part = partNumberSearch.trim();
    const title = titleSearch.trim();
    if (part) params.set('part', part);
    if (title) params.set('title', title);
    setParamList(params, 'countries', countrySelection.map((value) => value.toUpperCase()));
    setParamList(params, 'bc_status', bcStatusSelection);
    for (let level = 1; level <= 7; level += 1) {
      setParamList(params, `h${level}`, hierarchySelection[level] ?? []);
    }
    return params.toString();
  }, [partNumberSearch, titleSearch, countrySelection, bcStatusSelection, hierarchySelection]);

  useEffect(() => {
    const filterKeys = ['part', 'title', 'countries', 'bc_status', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'];
    const current = new URLSearchParams(searchParams.toString());
    const currentFilters = new URLSearchParams();
    for (const key of filterKeys) {
      const value = current.get(key);
      if (value) currentFilters.set(key, value);
    }

    if (currentFilters.toString() === serializedFilters) return;

    const next = new URLSearchParams(searchParams.toString());
    const filters = new URLSearchParams(serializedFilters);
    filterKeys.forEach((key) => next.delete(key));
    filters.forEach((value, key) => next.set(key, value));
    next.set('page', '1');
    next.set('page_size', String(pagination.pageSize));

    router.replace(`${pathname}?${next.toString()}`);
  }, [serializedFilters, searchParams, router, pathname, pagination.pageSize]);


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

  const hierarchyOptions = filterOptions.hierarchyOptions;

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

  const metadataFilteredRows = useMemo(
    () =>
      hierarchyFilteredRows.filter((row) =>
        (Object.entries(metadataSelection) as Array<[string, string[]]>).every(([key, selectedValues]) => {
          if (!selectedValues.length) return true;
          const partValues = row.metadataValues[key] ?? [];
          return selectedValues.some((value) => partValues.includes(value));
        }),
      ),
    [hierarchyFilteredRows, metadataSelection],
  );

  const filteredRows = useMemo(
    () =>
      metadataFilteredRows.filter((row) => !bcStatusSelection.length || bcStatusSelection.includes(row.bcStatus)),
    [metadataFilteredRows, bcStatusSelection],
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


  const setBCStatusFilter = (status: QPartBCStatusFilter, checked: boolean) => {
    setBcStatusSelection((prev) => {
      if (checked) return prev.includes(status) ? prev : [...prev, status];
      return prev.filter((value) => value !== status);
    });
  };

  const requestUpdateAllChange = async (checked: boolean) => {
    if (!checked) {
      setUpdateAllEnabled(false);
      return;
    }

    const password = window.prompt('Enter the Update all password to apply bulk changes across every filtered page.');
    if (!password) return;

    try {
      const response = await fetch('/api/sales/qpart-allocation/update-all-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error('Invalid update-all password.');
      setUpdateAllEnabled(true);
      setMessage({ type: 'success', text: 'Update all enabled for this session.' });
    } catch (error) {
      setUpdateAllEnabled(false);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Invalid update-all password.' });
    }
  };

  const getExternalStatusKey = (sku: string, countryCode: string) => `${sku}::${countryCode}`;

  const getPushDisplay = (sku: string, countryCode: string) => {
    const status = externalStatusByKey[getExternalStatusKey(sku, countryCode)];
    if (!status?.exists) return { label: 'Push', className: styles.pushButton };
    return {
      label: 'Update',
      className: `${styles.pushButton} ${status.isActive ? styles.pushButtonActive : styles.pushButtonInactive}`,
    };
  };

  const buildBulkFilterCriteria = () => ({
    partNumberSearch,
    titleSearch,
    countryCodes: countrySelection,
    hierarchySelection: Object.fromEntries(
      Object.entries(hierarchySelection).map(([level, values]) => [level, values]),
    ),
    metadataSelection,
    bcStatuses: bcStatusSelection,
  });

  const refreshExternalStatus = async () => {
    setExternalStatusLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/sales/qpart-allocation/external-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterCriteria: buildBulkFilterCriteria() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { pairCount: number; items: ExternalStatusMap };
      };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? 'Failed to refresh external status.');

      const items = payload.result.items ?? {};
      const statuses = Object.values(items);
      const found = statuses.filter((item) => item.exists).length;
      const active = statuses.filter((item) => item.exists && item.isActive === true).length;
      const inactive = statuses.filter((item) => item.exists && item.isActive === false).length;
      setExternalStatusByKey(items);
      setExternalStatusSummary({
        checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pairCount: payload.result.pairCount,
        found,
        active,
        inactive,
      });
      setMessage({ type: 'success', text: `External status refreshed for ${payload.result.pairCount} SKU/country pair(s) across all filtered pages.` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to refresh external status.' });
    } finally {
      setExternalStatusLoading(false);
    }
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
        result?: { skipped: boolean; message: string; variantResult: { action: 'inserted' | 'updated' | 'skipped' }; eligibilityResult: { action: 'inserted' | 'updated' | 'skipped' } };
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

      setMessage({
        type: 'success',
        text: payload.result.skipped
          ? payload.result.message
          : `${row.partNumber} ${countryCode} pushed (variants ${payload.result.variantResult.action}, eligibility ${payload.result.eligibilityResult.action}).`,
      });
      if (!payload.result.skipped) {
        setExternalStatusByKey((prev) => ({
          ...prev,
          [getExternalStatusKey(row.partNumber, countryCode)]: {
            sku: row.partNumber,
            countryCode,
            exists: true,
            isActive: row.countryStatuses[countryCode] === 'active',
          },
        }));
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to push allocation' });
    } finally {
      setPushBusyKey(null);
    }
  };



  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(Math.min(Math.max(1, nextPage), pagination.totalPages)));
    params.set('page_size', String(pagination.pageSize));
    router.replace(`${pathname}?${params.toString()}`);
  };

  const pageItems = useMemo(() => {
    const p = pagination.page; const t = pagination.totalPages; const w = [p-1,p,p+1,p+2].filter((n)=>n>=1&&n<=t);
    const items:number[] = [1, ...w, t].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
    return items;
  }, [pagination.page, pagination.totalPages]);

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

    setBulkBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/sales/qpart-allocation/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partIds: updateAllEnabled ? [] : filteredRows.map((row) => row.partId),
          countryCodes: visibleCountries,
          targetStatus,
          updateAll: updateAllEnabled,
          filterCriteria: updateAllEnabled ? buildBulkFilterCriteria() : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { updatedCount: number; partCount: number; countryCount: number; targetStatus: QPartAllocationStatus; mode?: string };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Bulk update failed');
      }

      setMessage({
        type: 'success',
        text: `Bulk ${label.toLowerCase()} complete: ${payload.result.updatedCount} allocation cells updated (${payload.result.partCount} parts × ${payload.result.countryCount} countries, ${payload.result.mode === 'all-filtered' ? 'all filtered pages' : 'current page'}).`,
      });
      setToastMessage(`Done — ${payload.result.partCount} items updated`);
      setToastVisible(true);
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Bulk update failed' });
    } finally {
      setBulkBusy(false);
    }
  };

  const requestBulk = (targetStatus: QPartAllocationStatus) => {
    setPendingBulkStatus(targetStatus);
  };

  const confirmBulk = () => {
    if (!pendingBulkStatus) return;
    const targetStatus = pendingBulkStatus;
    setPendingBulkStatus(null);
    void runBulk(targetStatus);
  };

  const dismissToast = useCallback(() => setToastVisible(false), []);


  useEffect(() => {
    const skus: string[] = Array.from(new Set<string>(filteredRows.map((row) => row.partNumber.trim()).filter((sku): sku is string => Boolean(sku))));
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
    const skus: string[] = Array.from(new Set<string>(filteredRows.map((row) => row.partNumber.trim()).filter((sku): sku is string => Boolean(sku))));
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

      try {
        const upsertResponse = await fetch('/api/bigcommerce/item-map/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemType: 'QPART',
            sourcePage: 'qpart-allocation',
            items: Object.fromEntries(skus.map((sku) => [sku, payload.items?.[sku] ?? { status: 'ERR', sku }])),
          }),
        });
        if (upsertResponse.ok) router.refresh();
      } catch (error) {
        console.warn('[BC status][qpart-allocation] failed to upsert cache', error);
      }
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
            {(countrySelection.length > 0 || partNumberSearch || titleSearch) && (
              <span
                style={{
                  fontSize: 11,
                  color: '#475569',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f4',
                  borderRadius: 999,
                  padding: '3px 10px',
                  fontWeight: 600,
                }}
              >
                {pagination.totalRows} parts matched
              </span>
            )}
          </div>
          <div className={styles.filterHeaderActions}>
            <div className={styles.bulkSelection}>
              Countries in scope: <strong>{visibleCountries.length}</strong> · Mode:{' '}
              <strong>{updateAllEnabled ? 'all filtered pages' : 'current page'}</strong>
            </div>
            <button type="button" className={styles.bulkActionButton} onClick={() => void runBCStatusCheck()} disabled={bcStatusLoading || bulkBusy}>
              {bcStatusLoading ? 'Checking BC Status...' : 'Check BC Status'}
            </button>
            {bcCheckSummary ? (
              <span className={styles.bcCheckMeta}>
                Last checked: {bcCheckSummary.checkedAt} · Checked {bcCheckSummary.checkedCount} SKUs · {bcCheckSummary.ok} OK / {bcCheckSummary.nok} NOK / {bcCheckSummary.err} ERR
              </span>
            ) : null}
            <button type="button" className={styles.bulkActionButton} onClick={() => void refreshExternalStatus()} disabled={externalStatusLoading || bulkBusy}>
              {externalStatusLoading ? 'Refreshing external status…' : 'Refresh external status'}
            </button>
            {externalStatusSummary ? (
              <span className={styles.bcCheckMeta}>
                Last refreshed: {externalStatusSummary.checkedAt} · Checked {externalStatusSummary.pairCount} pairs · {externalStatusSummary.found} found ({externalStatusSummary.active} active / {externalStatusSummary.inactive} inactive)
              </span>
            ) : null}
            <button type="button" className={styles.bulkActionButton} onClick={() => requestBulk('active')} disabled={bulkBusy}>
              {bulkBusy ? 'Working…' : 'Bulk activate'}
            </button>
            <button type="button" className={styles.bulkActionButton} onClick={() => requestBulk('inactive')} disabled={bulkBusy}>
              {bulkBusy ? 'Working…' : 'Bulk deactivate'}
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className={styles.filterSections}>
            <section className={styles.filterSection}>
              <div className={styles.sectionTitleRow}>
                <h3>Territory</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className={styles.textButton} onClick={() => setCountrySelection([...countryColumns])}>
                    All
                  </button>
                  <button type="button" className={styles.textButton} onClick={clearTerritorySelection}>
                    None
                  </button>
                </div>
              </div>
              <label className={styles.filterItem}>
                <span>Search</span>
                <input
                  value={territorySearch}
                  onChange={(event) => setTerritorySearch(event.target.value.toUpperCase())}
                  placeholder="e.g. DE, FR..."
                />
              </label>
              <div className={styles.territoryRegionGrid}>
                {territoryGroups.map((region: SalesQPartTerritoryFilterRegion) => {
                  const regionCodes = region.subRegions.flatMap((subRegion) => subRegion.countries);
                  const selectedCount = regionCodes.filter((countryCode) => countrySelection.includes(countryCode)).length;
                  return (
                    <div key={`region-${region.region}`} className={styles.territoryRegionCard}>
                      <div
                        className={styles.territoryRegionTitle}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                        onClick={() => {
                          const allSelected = regionCodes.every((countryCode) => countrySelection.includes(countryCode));
                          if (allSelected) {
                            setCountrySelection((prev) => prev.filter((countryCode) => !regionCodes.includes(countryCode)));
                          } else {
                            setCountrySelection((prev) => [...new Set([...prev, ...regionCodes])]);
                          }
                        }}
                      >
                        <span>{region.region}</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                          {selectedCount}/{regionCodes.length}
                        </span>
                      </div>

                      {region.subRegions.map((subRegion) => {
                        const subSelectedCount = subRegion.countries.filter((countryCode) => countrySelection.includes(countryCode)).length;
                        return (
                          <div key={`${region.region}-${subRegion.subRegion}`} className={styles.subRegionBlock}>
                            <div
                              className={styles.subRegionTitle}
                              style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
                              onClick={() => {
                                const allSelected = subRegion.countries.every((countryCode) => countrySelection.includes(countryCode));
                                if (allSelected) {
                                  setCountrySelection((prev) => prev.filter((countryCode) => !subRegion.countries.includes(countryCode)));
                                } else {
                                  setCountrySelection((prev) => [...new Set([...prev, ...subRegion.countries])]);
                                }
                              }}
                            >
                              <span>{subRegion.subRegion}</span>
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                {subSelectedCount}/{subRegion.countries.length}
                              </span>
                            </div>
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
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`${styles.filterSection} ${styles.partSection}`}>
              <div className={styles.sectionTitleRow}>
                <h3>Part filters</h3>
              </div>
              <div className={styles.partFilterGrid}>
                <div className={styles.partSearchStack}>
                  <label className={styles.filterItem}>
                    <span>Part number</span>
                    <input value={partNumberSearch} onChange={(event) => setPartNumberSearch(event.target.value)} placeholder="Search part number" />
                  </label>
                  <label className={styles.filterItem}>
                    <span>English title</span>
                    <input value={titleSearch} onChange={(event) => setTitleSearch(event.target.value)} placeholder="Search title" />
                  </label>
                  <div className={styles.filterItem}>
                    <span>BC status</span>
                    <div className={styles.segmentedFilter} aria-label="BC status filter">
                      <label className={bcStatusSelection.includes('ok') ? styles.segmentedOptionActive : styles.segmentedOption}>
                        <input
                          type="checkbox"
                          checked={bcStatusSelection.includes('ok')}
                          onChange={(event) => setBCStatusFilter('ok', event.target.checked)}
                        />
                        <span>OK</span>
                      </label>
                      <label className={bcStatusSelection.includes('nok') ? styles.segmentedOptionActive : styles.segmentedOption}>
                        <input
                          type="checkbox"
                          checked={bcStatusSelection.includes('nok')}
                          onChange={(event) => setBCStatusFilter('nok', event.target.checked)}
                        />
                        <span>NOK</span>
                      </label>
                    </div>
                  </div>
                </div>
                <HierarchyFilter
                  level={1}
                  options={hierarchyOptions[1]}
                  selected={hierarchySelection[1] ?? []}
                  onChange={(values) => setHierarchyLevel(1, values)}
                />
                <div className={styles.hierarchyCompactGrid}>
                  {Array.from({ length: 6 }).map((_, index) => {
                    const level = index + 2;
                    const levelOptions = hierarchyOptions[level] ?? [];
                    const selectedLevel = (hierarchySelection[level] ?? []) as string[];
                    return (
                      <HierarchyFilter
                        key={`h${level}`}
                        level={level}
                        options={levelOptions}
                        selected={selectedLevel}
                        onChange={(values) => setHierarchyLevel(level, values)}
                        compact
                      />
                    );
                  })}
                </div>
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

      <ConfirmModal
        open={pendingBulkStatus !== null}
        title={pendingBulkStatus === 'active' ? 'Bulk activate?' : 'Bulk deactivate?'}
        description={`This will ${pendingBulkStatus === 'active' ? 'activate' : 'deactivate'} ${updateAllEnabled ? 'all parts matching the current filters across all pages' : `${filteredRows.length} currently loaded items`} across all selected markets.`}
        confirmLabel="Confirm"
        onConfirm={confirmBulk}
        onCancel={() => setPendingBulkStatus(null)}
      />
      <Toast message={toastMessage} visible={toastVisible} onDismiss={dismissToast} />

      {filteredRows.length ? (
        <section className={styles.tableSection}>
          <div className={styles.tableWrap}>
            <table className={styles.matrixTable}>
            <thead className={styles.stickyHeader}>
              <tr>
                <th className={`${styles.stickyColumn} ${styles.stickyBCStatus}`}>BC Status</th>
                <th className={`${styles.stickyColumn} ${styles.stickyPart}`}>Part</th>
                <th className={styles.titleCell}>English title</th>
                <th style={{ minWidth: 80, textAlign: 'center', fontSize: 11 }}>Active</th>
                {renderedCountries.map((countryCode) => (
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
              {filteredRows.map((row) => {
                const activeCount = renderedCountries.filter((countryCode) => row.countryStatuses[countryCode] === 'active').length;
                return (
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
                  <td className={styles.titleCell}>
                    <Link className={styles.titleLink} href={`/qpart/parts/${row.partId}`}>
                      <span className={styles.titleText}>{row.englishTitle}</span>
                    </Link>
                  </td>
                  <td style={{ minWidth: 80, textAlign: 'center', fontSize: 11 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: activeCount > 0 ? '#ecfdf5' : '#f8fafc',
                        color: activeCount > 0 ? '#166534' : '#6b7280',
                        border: `1px solid ${activeCount > 0 ? '#bbf7d0' : '#e2e8f0'}`,
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontWeight: 700,
                      }}
                    >
                      {activeCount}/{renderedCountries.length}
                    </span>
                  </td>
                  {renderedCountries.map((countryCode) => {
                    const status = row.countryStatuses[countryCode] ?? 'inactive';
                    const cellKey = `${row.partId}:${countryCode}`;
                    const pushDisplay = getPushDisplay(row.partNumber, countryCode);
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
                          {row.hasBcIds ? (
                            <button
                              type="button"
                              className={pushDisplay.className}
                              onClick={() => void pushCell(row, countryCode)}
                              disabled={busyKey === cellKey || pushBusyKey === cellKey || bulkBusy}
                              title={`${pushDisplay.label} this QPart + country row in external PostgreSQL`}
                            >
                              {pushBusyKey === cellKey ? 'Pushing…' : pushDisplay.label}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
            </table>
          </div>
          <div className={styles.paginationBar}>
            <span className={styles.paginationSummary}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalRows} rows)
            </span>
            <div className={styles.paginationCenter}>
              <label className={`${styles.updateAllControl} ${updateAllEnabled ? styles.updateAllActive : ''}`}>
                <input
                  type="checkbox"
                  checked={updateAllEnabled}
                  onChange={(event) => void requestUpdateAllChange(event.target.checked)}
                  disabled={bulkBusy}
                />
                <span>Update all</span>
              </label>
            </div>
            <div className={styles.paginationControls}>
              <button type="button" onClick={() => goToPage(Math.max(1, pagination.page - 1))} disabled={pagination.page <= 1}>
                Prev
              </button>
              {pageItems.map((item, index) => (
                <span key={`p-${item}`}>
                  {index > 0 && item - pageItems[index - 1] > 1 ? <span className={styles.paginationEllipsis}>…</span> : null}
                  <button
                    type="button"
                    className={item === pagination.page ? styles.paginationCurrent : undefined}
                    onClick={() => goToPage(item)}
                    disabled={item === pagination.page}
                  >
                    {item}
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => goToPage(Math.min(pagination.totalPages, pagination.page + 1))}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className={styles.empty} style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 700, color: '#334155', marginBottom: 4 }}>No parts match your filters</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Try clearing some filters or expanding your territory selection.</div>
        </div>
      )}
    </>
  );
}
