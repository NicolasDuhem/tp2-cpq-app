'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AllocationStatus,
  NormalizedSalesBikeAllocationFilters,
  SalesBikeAllocationFilterOptions,
  SalesBikeAllocationRow,
} from '@/lib/sales/bike-allocation/service';
import {
  buildPaginationItems,
  encodeFeatureFilters,
  filterTerritoryRegions,
  flattenTerritoryCountries,
  type AllocationStatusValue,
} from '@/lib/sales/allocation-territory';
import ConfirmModal from '@/components/shared/ConfirmModal';
import CountryFlagLabel from '@/components/shared/CountryFlagLabel';
import Toast from '@/components/shared/Toast';
import AllocationMatrixCell from './allocation-matrix-cell';
import ToolbarPopover from './toolbar-popover';
import styles from './sales-bike-allocation-page.module.css';

type Props = {
  rows: SalesBikeAllocationRow[];
  availableFeatures: string[];
  selectedFeatureColumns: string[];
  countryColumns: string[];
  filterOptions: SalesBikeAllocationFilterOptions;
  filters: NormalizedSalesBikeAllocationFilters;
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  canEdit: boolean;
};

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
type ExternalStatus = { sku: string; countryCode: string; exists: boolean; isActive: boolean | null };
type ExternalStatusMap = Record<string, ExternalStatus>;
type ExternalSyncState = 'pushed' | 'pending_bc' | 'error';
type ExternalSyncResult = { state: ExternalSyncState; sku: string; countryCode: string; message: string; skipped: boolean; variantAction?: string; eligibilityAction?: string };
type ExternalSyncSummary = { attempted: number; pushed: number; pendingBc: number; errors: number };

const CPQ_LAUNCH_REPLAY_STORAGE_PREFIX = 'tp2-cpq-launch-replay:';

/** URL keys owned by the filter panel. Anything else in the URL is preserved. */
const FILTER_PARAM_KEYS = ['ruleset', 'bike_type', 'countries', 'ipn', 'status', 'cols', 'features'] as const;

const STATUS_OPTIONS: Array<{ value: AllocationStatusValue; label: string; hint: string }> = [
  { value: 'active', label: 'Active', hint: 'At least one sampler row is active' },
  { value: 'not_active', label: 'Inactive', hint: 'Sampler rows exist but all are inactive' },
  { value: 'not_configured', label: 'Not configured', hint: 'No sampler row exists yet' },
];

function statusLabel(status: AllocationStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'not_active') return 'Inactive';
  return 'Not configured';
}

function getBCBadgeClass(status: BCStatus): string {
  if (status === 'OK') return `${styles.bcBadge} ${styles.statusActive}`;
  if (status === 'NOK') return `${styles.bcBadge} ${styles.statusNotActive}`;
  if (status === 'ERR') return `${styles.bcBadge} ${styles.bcStatusError}`;
  return `${styles.bcBadge} ${styles.bcStatusDisabled}`;
}

function toUrlList(values: string[]): string {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).join(',');
}

export default function SalesBikeAllocationTableClient({
  rows,
  availableFeatures,
  selectedFeatureColumns,
  countryColumns,
  filterOptions,
  filters,
  pagination,
  canEdit,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filter state is seeded from the server-normalized filters, so refresh,
  // back/forward and shared links all restore the same view.
  const [rulesetFilter, setRulesetFilter] = useState(filters.ruleset);
  const [bikeTypeFilter, setBikeTypeFilter] = useState(filters.bike_type);
  const [countrySelection, setCountrySelection] = useState<string[]>(filters.countryCodes);
  const [statusSelection, setStatusSelection] = useState<AllocationStatusValue[]>(filters.allocationStatuses);
  const [ipnFilter, setIpnFilter] = useState(filters.ipnSearch);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(selectedFeatureColumns);
  const [featureFilters, setFeatureFilters] = useState<Record<string, string>>(filters.featureFilters);
  const [territorySearch, setTerritorySearch] = useState('');

  const [message, setMessage] = useState<Message>(null);
  const [cellActionKey, setCellActionKey] = useState<string | null>(null);
  const [pushActionKey, setPushActionKey] = useState<string | null>(null);
  const [bulkActionRunning, setBulkActionRunning] = useState(false);
  const [bcStatusBySku, setBcStatusBySku] = useState<BCStatusMap>({});
  const [bcStatusLoading, setBcStatusLoading] = useState(false);
  const [bcCheckSummary, setBcCheckSummary] = useState<BCCheckSummary>(null);
  const [externalStatusByKey, setExternalStatusByKey] = useState<ExternalStatusMap>({});
  const [syncStateByKey, setSyncStateByKey] = useState<Record<string, ExternalSyncState>>({});
  const [externalStatusLoading, setExternalStatusLoading] = useState(false);
  const [externalStatusSummary, setExternalStatusSummary] = useState<{ checkedAt: string; pairCount: number; found: number; active: number; inactive: number } | null>(null);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<'active' | 'not_active' | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // --- derived view state -------------------------------------------------

  const visibleFeatureColumns = useMemo(
    () => availableFeatures.filter((feature) => selectedFeatures.includes(feature)),
    [availableFeatures, selectedFeatures],
  );

  /** Territory selection drives the rendered country columns. */
  const renderedCountries = useMemo(() => {
    const selected = countrySelection.filter((countryCode) => countryColumns.includes(countryCode));
    if (!selected.length) return countryColumns;
    return countryColumns.filter((countryCode) => selected.includes(countryCode));
  }, [countryColumns, countrySelection]);

  /** Explicit country targets for mutations. Empty means "no target". */
  const countryTargets = useMemo(
    () => countrySelection.filter((countryCode) => countryColumns.includes(countryCode)),
    [countryColumns, countrySelection],
  );

  const territoryGroups = useMemo(
    () => filterTerritoryRegions(filterOptions.territoryRegions, territorySearch),
    [filterOptions.territoryRegions, territorySearch],
  );
  const allTerritoryCountries = useMemo(
    () => flattenTerritoryCountries(filterOptions.territoryRegions),
    [filterOptions.territoryRegions],
  );

  const effectiveRuleset = rulesetFilter.trim() || filters.ruleset;
  // Bulk targets come from the rows the server returned for THIS page only.
  const currentPageIpnCodes = useMemo(() => [...new Set(rows.map((row) => row.ipnCode))], [rows]);

  // --- URL synchronization ------------------------------------------------

  const serializedFilters = useMemo(() => {
    const params = new URLSearchParams();
    if (rulesetFilter.trim()) params.set('ruleset', rulesetFilter.trim());
    if (bikeTypeFilter.trim()) params.set('bike_type', bikeTypeFilter.trim());
    const countries = toUrlList(countrySelection.map((value) => value.toUpperCase()));
    if (countries) params.set('countries', countries);
    if (ipnFilter.trim()) params.set('ipn', ipnFilter.trim());
    const statuses = toUrlList(statusSelection);
    if (statuses) params.set('status', statuses);
    const cols = toUrlList(selectedFeatures.map((feature) => encodeURIComponent(feature)));
    if (cols) params.set('cols', cols);
    const features = encodeFeatureFilters(featureFilters);
    if (features) params.set('features', features);
    return params.toString();
  }, [rulesetFilter, bikeTypeFilter, countrySelection, ipnFilter, statusSelection, selectedFeatures, featureFilters]);

  /**
   * The filter signature the server actually used to build `rows`. While local
   * filter state is ahead of it (the URL sync is debounced), the rows on screen
   * belong to the previous filter set, so mutations are blocked until the
   * server catches up. This is what stops stale targets leaking into a bulk call.
   */
  const appliedFilters = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.ruleset) params.set('ruleset', filters.ruleset);
    if (filters.bike_type) params.set('bike_type', filters.bike_type);
    const countries = toUrlList(filters.countryCodes);
    if (countries) params.set('countries', countries);
    if (filters.ipnSearch) params.set('ipn', filters.ipnSearch);
    const statuses = toUrlList(filters.allocationStatuses);
    if (statuses) params.set('status', statuses);
    const cols = toUrlList(selectedFeatureColumns.map((feature) => encodeURIComponent(feature)));
    if (cols) params.set('cols', cols);
    const features = encodeFeatureFilters(filters.featureFilters);
    if (features) params.set('features', features);
    return params.toString();
  }, [filters, selectedFeatureColumns]);

  const filtersPending = appliedFilters !== serializedFilters;

  const bulkBlockedReason = !canEdit
    ? 'You need Edit access to change allocation.'
    : filtersPending
      ? 'Applying filters…'
      : !effectiveRuleset
        ? 'Select a specific ruleset first.'
        : !rows.length
          ? 'No rows on this page.'
          : !countryTargets.length
            ? 'Select at least one country in Territory.'
            : null;

  useEffect(() => {
    // Build the URL's current filter view in the same key order the serializer
    // uses, so an unchanged filter set never triggers a replace (no update loop).
    const current = new URLSearchParams(searchParams.toString());
    const currentFilters = new URLSearchParams();
    for (const key of FILTER_PARAM_KEYS) {
      const value = current.get(key);
      if (value) currentFilters.set(key, value);
    }
    if (currentFilters.toString() === serializedFilters) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      FILTER_PARAM_KEYS.forEach((key) => next.delete(key));
      // Legacy deep-link param is migrated into `countries` on first interaction.
      next.delete('country_code');
      new URLSearchParams(serializedFilters).forEach((value, key) => next.set(key, value));
      // Any change to the dataset filters restarts at page 1.
      next.set('page', '1');
      next.set('page_size', String(pagination.pageSize));
      router.replace(`${pathname}?${next.toString()}`);
    }, 300);

    return () => clearTimeout(timer);
  }, [serializedFilters, searchParams, router, pathname, pagination.pageSize]);

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(Math.min(Math.max(1, nextPage), pagination.totalPages)));
    params.set('page_size', String(pagination.pageSize));
    router.replace(`${pathname}?${params.toString()}`);
  };

  const paginationItems = useMemo(
    () => buildPaginationItems(pagination.page, pagination.totalPages),
    [pagination.page, pagination.totalPages],
  );

  // --- filter mutators ----------------------------------------------------

  const updateSelectedFeatures = (values: string[]) => {
    setSelectedFeatures(values);
    setFeatureFilters((prev) => Object.fromEntries(values.map((value) => [value, prev[value] ?? ''])));
  };

  const setFeatureFilterValue = (feature: string, value: string) => {
    setFeatureFilters((prev) => ({ ...prev, [feature]: value }));
  };

  const toggleTerritoryCountry = (countryCode: string, checked: boolean) => {
    setCountrySelection((prev) => {
      if (checked) return prev.includes(countryCode) ? prev : [...prev, countryCode];
      return prev.filter((value) => value !== countryCode);
    });
  };

  const toggleCountryGroup = (codes: string[], select: boolean) => {
    setCountrySelection((prev) =>
      select ? [...new Set([...prev, ...codes])] : prev.filter((countryCode) => !codes.includes(countryCode)),
    );
  };

  const toggleStatus = (status: AllocationStatusValue, checked: boolean) => {
    setStatusSelection((prev) => {
      if (checked) return prev.includes(status) ? prev : [...prev, status];
      return prev.filter((value) => value !== status);
    });
  };

  const clearAllFilters = () => {
    setRulesetFilter('');
    setBikeTypeFilter('');
    setCountrySelection([]);
    setStatusSelection([]);
    setIpnFilter('');
    setSelectedFeatures([]);
    setFeatureFilters({});
    setTerritorySearch('');
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (rulesetFilter.trim()) chips.push({ key: 'ruleset', label: `Ruleset: ${rulesetFilter}`, onRemove: () => setRulesetFilter('') });
    if (bikeTypeFilter.trim()) chips.push({ key: 'bike_type', label: `Bike type: ${bikeTypeFilter}`, onRemove: () => setBikeTypeFilter('') });
    if (ipnFilter.trim()) chips.push({ key: 'ipn', label: `IPN contains "${ipnFilter}"`, onRemove: () => setIpnFilter('') });
    if (countrySelection.length)
      chips.push({
        key: 'countries',
        label: `${countrySelection.length} countr${countrySelection.length === 1 ? 'y' : 'ies'}`,
        onRemove: () => setCountrySelection([]),
      });
    for (const status of statusSelection) {
      chips.push({
        key: `status-${status}`,
        label: STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status,
        onRemove: () => toggleStatus(status, false),
      });
    }
    for (const [feature, value] of Object.entries(featureFilters)) {
      if (!value.trim()) continue;
      chips.push({ key: `feature-${feature}`, label: `${feature}: "${value}"`, onRemove: () => setFeatureFilterValue(feature, '') });
    }
    return chips;
  }, [rulesetFilter, bikeTypeFilter, ipnFilter, countrySelection, statusSelection, featureFilters]);

  // --- external status helpers -------------------------------------------

  const getExternalStatusKey = (sku: string, countryCode: string) => `${sku}::${countryCode}`;

  const getSyncDisplay = (sku: string, countryCode: string, status: AllocationStatus) => {
    const key = getExternalStatusKey(sku, countryCode);
    const transient = syncStateByKey[key];
    if (transient === 'pending_bc') return { label: 'Pending BC', tone: 'pending' as const };
    if (transient === 'error') return { label: 'Error', tone: 'error' as const };
    if (transient === 'pushed') return { label: 'Pushed', tone: 'pushed' as const };
    const bcStatus = bcStatusBySku[sku]?.status;
    if (bcStatus && bcStatus !== 'OK') return { label: 'Pending BC', tone: 'pending' as const };
    const external = externalStatusByKey[key];
    if (!external?.exists) return { label: 'Unknown', tone: 'unknown' as const };
    const internalActive = status === 'active';
    return external.isActive === internalActive ? { label: 'Pushed', tone: 'pushed' as const } : { label: 'Out of sync', tone: 'outOfSync' as const };
  };

  const refreshExternalStatus = useCallback(async () => {
    setExternalStatusLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/sales/bike-allocation/external-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Read-only: the server rebuilds the same filtered dataset and performs
        // one batched external lookup (never per cell).
        body: JSON.stringify({ filters }),
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
  }, [filters]);

  // --- cell actions -------------------------------------------------------

  const onCountryCellClick = async (row: SalesBikeAllocationRow, countryCode: string, status: AllocationStatus) => {
    // "Not configured" has no allocation row to toggle: it opens the CPQ
    // configurator replay flow instead.
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
        result?: { updatedCount: number; targetStatus: 'active' | 'not_active'; externalSync?: ExternalSyncResult | null };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Failed to update cell');
      }

      if (payload.result.externalSync) {
        setSyncStateByKey((prev) => ({ ...prev, [getExternalStatusKey(row.ipnCode, countryCode)]: payload.result!.externalSync!.state }));
        if (payload.result.externalSync.state === 'pushed') {
          setExternalStatusByKey((prev) => ({
            ...prev,
            [getExternalStatusKey(row.ipnCode, countryCode)]: { sku: row.ipnCode, countryCode, exists: true, isActive: payload.result!.targetStatus === 'active' },
          }));
        }
      }
      setMessage({
        type: 'success',
        text: `${row.ipnCode} ${countryCode} updated to ${payload.result.targetStatus === 'active' ? 'Active' : 'Inactive'} (${payload.result.updatedCount} sampler row(s)). ${payload.result.externalSync?.message ?? ''}`.trim(),
      });
      router.refresh();
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
        throw new Error(payload.error ? (detail ? `${payload.error} (${detail})` : payload.error) : 'Failed to push row to external PostgreSQL');
      }

      setMessage({
        type: 'success',
        text: payload.result.skipped
          ? payload.result.message
          : `${row.ipnCode} ${countryCode} pushed (variants ${payload.result.variantResult.action}, eligibility ${payload.result.eligibilityResult.action}).`,
      });
      setSyncStateByKey((prev) => ({ ...prev, [getExternalStatusKey(row.ipnCode, countryCode)]: payload.result!.skipped ? 'pending_bc' : 'pushed' }));
      if (!payload.result.skipped) {
        setExternalStatusByKey((prev) => ({
          ...prev,
          [getExternalStatusKey(row.ipnCode, countryCode)]: {
            sku: row.ipnCode,
            countryCode,
            exists: true,
            isActive: row.countryStatuses[countryCode] === 'active',
          },
        }));
      }
    } catch (error) {
      setSyncStateByKey((prev) => ({ ...prev, [getExternalStatusKey(row.ipnCode, countryCode)]: 'error' }));
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to push row.' });
    } finally {
      setPushActionKey(null);
    }
  };

  // --- bulk actions (current page only) -----------------------------------

  const runBulkAction = async (targetStatus: 'active' | 'not_active') => {
    if (bulkBlockedReason) {
      setMessage({ type: 'error', text: bulkBlockedReason });
      return;
    }

    const label = targetStatus === 'active' ? 'Activate' : 'Deactivate';
    setBulkActionRunning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/sales/bike-allocation/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleset: effectiveRuleset,
          // Exactly the bikes the server returned for this page.
          ipnCodes: currentPageIpnCodes,
          countryCodes: countryTargets,
          targetStatus,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { updatedCount: number; ipnCount: number; countryCount: number; externalSync?: ExternalSyncSummary };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? 'Bulk update failed');
      }

      setMessage({
        type: 'success',
        text: `Bulk ${label.toLowerCase()} done on the current page. Updated ${payload.result.updatedCount} sampler row(s) for ${payload.result.ipnCount} bike(s) x ${payload.result.countryCount} countr${payload.result.countryCount === 1 ? 'y' : 'ies'}. External sync: ${payload.result.externalSync?.pushed ?? 0} pushed, ${payload.result.externalSync?.pendingBc ?? 0} pending BC, ${payload.result.externalSync?.errors ?? 0} errors.`,
      });
      setToastMessage(`Done — ${currentPageIpnCodes.length} bike(s) updated on this page`);
      setToastVisible(true);
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Bulk update failed.' });
    } finally {
      setBulkActionRunning(false);
    }
  };

  const runBulkPushBcOk = async () => {
    if (bulkBlockedReason) {
      setMessage({ type: 'error', text: bulkBlockedReason });
      return;
    }

    setBulkActionRunning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/sales/bike-allocation/bulk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset: effectiveRuleset, ipnCodes: currentPageIpnCodes, countryCodes: countryTargets }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; result?: { targetCount: number; externalSync: ExternalSyncSummary } };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? 'Push all BC OK failed');
      setMessage({ type: 'success', text: `Push all BC OK complete for ${payload.result.targetCount} bike/country row(s) on the current page: ${payload.result.externalSync.pushed} pushed, ${payload.result.externalSync.pendingBc} pending BC, ${payload.result.externalSync.errors} errors.` });
      await refreshExternalStatus();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Push all BC OK failed.' });
    } finally {
      setBulkActionRunning(false);
    }
  };

  const confirmBulkAction = () => {
    if (!pendingBulkStatus) return;
    const targetStatus = pendingBulkStatus;
    setPendingBulkStatus(null);
    void runBulkAction(targetStatus);
  };

  const dismissToast = useCallback(() => setToastVisible(false), []);

  // --- BigCommerce status -------------------------------------------------

  useEffect(() => {
    const skus = [...new Set(rows.map((row) => row.ipnCode.trim()).filter(Boolean))];
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
        if (Object.keys(nextStatuses).length > 0) setBcStatusBySku((prev) => ({ ...prev, ...nextStatuses }));
      } catch (error) {
        console.warn('[BC status][bike-allocation] cached lookup failed', error);
      }
    };

    void loadCachedStatuses();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const runBCStatusCheck = async () => {
    const skus = [...new Set(rows.map((row) => row.ipnCode.trim()).filter(Boolean))];
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
      const payload = (await response.json().catch(() => ({}))) as { items?: Record<string, BCVariantStatusItem> };
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
            itemType: 'BIKE',
            sourcePage: 'bike-allocation',
            items: Object.fromEntries(skus.map((sku) => [sku, payload.items?.[sku] ?? { status: 'ERR', sku }])),
          }),
        });
        if (upsertResponse.ok) router.refresh();
      } catch (error) {
        console.warn('[BC status][bike-allocation] failed to upsert cache', error);
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

  // --- render -------------------------------------------------------------

  const busy = bulkActionRunning || externalStatusLoading;
  const activeFilterCount = activeFilterChips.length;

  /** CSV download link: same query as the page, so the file matches the view. */
  const exportHref = useMemo(() => {
    const params = new URLSearchParams(serializedFilters);
    return `/api/sales/bike-allocation/export?${params.toString()}`;
  }, [serializedFilters]);

  const statusPills = (
    <div className={styles.segmentedFilter} role='group' aria-label='Allocation status filter'>
      {STATUS_OPTIONS.map((option) => {
        const checked = statusSelection.includes(option.value);
        return (
          <label key={option.value} className={checked ? styles.segmentedOptionActive : styles.segmentedOption} title={option.hint}>
            <input type='checkbox' checked={checked} onChange={(event) => toggleStatus(option.value, event.target.checked)} />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <>
      <section className={`${styles.panel} ${styles.toolbar}`} aria-label='Bike allocation filters and actions'>
        <div className={styles.toolbarRow}>
          <ToolbarPopover
            label='Territory'
            badge={countryTargets.length ? String(countryTargets.length) : `all ${countryColumns.length}`}
            triggerClassName={countryTargets.length ? styles.popoverTriggerActive : undefined}
            panelClassName={styles.territoryPanel}
            title='Choose the countries in scope'
          >
            <div className={styles.popoverHeader}>
              <input
                value={territorySearch}
                onChange={(event) => setTerritorySearch(event.target.value.toUpperCase())}
                placeholder='Search code…'
                aria-label='Search country code'
                className={styles.popoverSearch}
              />
              <button type='button' className={styles.textButton} onClick={() => setCountrySelection([...allTerritoryCountries])}>
                All
              </button>
              <button
                type='button'
                className={styles.textButton}
                onClick={() => {
                  setCountrySelection([]);
                  setTerritorySearch('');
                }}
              >
                None
              </button>
            </div>
            <p className={styles.popoverHint}>
              Selected countries set the visible columns, the cells the status filter reads, and the countries bulk
              actions write to. Nothing selected = all {countryColumns.length} columns shown, bulk actions disabled.
            </p>
            <div className={styles.territoryRegionGrid}>
              {territoryGroups.length === 0 ? (
                <p className={styles.emptyFilterValues}>No country matches “{territorySearch}”.</p>
              ) : (
                territoryGroups.map((region) => {
                  const regionCodes = region.subRegions.flatMap((subRegion) => subRegion.countries);
                  const regionSelected = regionCodes.filter((countryCode) => countrySelection.includes(countryCode)).length;
                  const regionAllSelected = regionCodes.length > 0 && regionSelected === regionCodes.length;
                  return (
                    <div key={`region-${region.region}`} className={styles.territoryRegionCard}>
                      <button
                        type='button'
                        className={styles.territoryGroupButton}
                        aria-pressed={regionAllSelected}
                        onClick={() => toggleCountryGroup(regionCodes, !regionAllSelected)}
                      >
                        <span className={styles.territoryRegionTitle}>{region.region}</span>
                        <span className={styles.selectionCount}>
                          {regionSelected}/{regionCodes.length}
                        </span>
                      </button>

                      {region.subRegions.map((subRegion) => {
                        const subSelected = subRegion.countries.filter((countryCode) => countrySelection.includes(countryCode)).length;
                        const subAllSelected = subRegion.countries.length > 0 && subSelected === subRegion.countries.length;
                        return (
                          <div key={`${region.region}-${subRegion.subRegion}`} className={styles.subRegionBlock}>
                            <button
                              type='button'
                              className={styles.territoryGroupButton}
                              aria-pressed={subAllSelected}
                              onClick={() => toggleCountryGroup(subRegion.countries, !subAllSelected)}
                            >
                              <span className={styles.subRegionTitle}>{subRegion.subRegion}</span>
                              <span className={styles.selectionCount}>
                                {subSelected}/{subRegion.countries.length}
                              </span>
                            </button>
                            <div className={styles.countryOptionGrid}>
                              {subRegion.countries.map((countryCode) => (
                                <label key={`${region.region}-${subRegion.subRegion}-${countryCode}`} className={styles.checkboxOption}>
                                  <input
                                    type='checkbox'
                                    checked={countrySelection.includes(countryCode)}
                                    onChange={(event) => toggleTerritoryCountry(countryCode, event.target.checked)}
                                  />
                                  <CountryFlagLabel countryCode={countryCode} className={styles.countryOptionLabel} flagClassName={styles.countryFlag} />
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </ToolbarPopover>

          <label className={styles.inlineField}>
            <span className={styles.srOnly}>Ruleset</span>
            <select
              value={rulesetFilter}
              onChange={(event) => setRulesetFilter(event.target.value)}
              title='Ruleset'
              aria-label='Ruleset'
            >
              <option value=''>All rulesets</option>
              {filterOptions.rulesets.map((ruleset) => (
                <option key={ruleset} value={ruleset}>
                  {ruleset}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.inlineField}>
            <span className={styles.srOnly}>Bike type</span>
            <select
              value={bikeTypeFilter}
              onChange={(event) => setBikeTypeFilter(event.target.value)}
              title='Bike type'
              aria-label='Bike type'
            >
              <option value=''>All bike types</option>
              {filterOptions.bikeTypes.map((bikeType) => (
                <option key={bikeType} value={bikeType}>
                  {bikeType}
                </option>
              ))}
            </select>
          </label>

          {statusPills}

          <span className={styles.matchChip}>
            {pagination.totalRows} bike{pagination.totalRows === 1 ? '' : 's'}
          </span>

          {activeFilterCount ? (
            <ToolbarPopover label='Active filters' badge={String(activeFilterCount)} panelClassName={styles.chipPanel}>
              <div className={styles.chipRow}>
                {activeFilterChips.map((chip) => (
                  <button key={chip.key} type='button' className={styles.filterChip} onClick={chip.onRemove}>
                    {chip.label}
                    <span aria-hidden='true'>×</span>
                    <span className={styles.srOnly}>(remove filter)</span>
                  </button>
                ))}
                <button type='button' className={styles.textButton} onClick={clearAllFilters}>
                  Clear all
                </button>
              </div>
            </ToolbarPopover>
          ) : null}

          <span className={styles.toolbarSpacer} />

          <a
            className={styles.bulkActionButton}
            href={exportHref}
            title='Download every Active/Inactive bike-country pair in the current filtered result (all pages). Not configured is excluded.'
          >
            Export CSV
          </a>

          <ToolbarPopover label='Actions' badge={`page ${rows.length}`} panelClassName={styles.actionsPanel} title='Bulk and sync actions' alignRight>
            <p className={styles.popoverHint}>
              Bulk actions apply to the <strong>{rows.length} bike{rows.length === 1 ? '' : 's'} on this page</strong> and the{' '}
              <strong>
                {countryTargets.length} selected countr{countryTargets.length === 1 ? 'y' : 'ies'}
              </strong>
              . Other pages of this filtered result are untouched.
            </p>
            {bulkBlockedReason ? (
              <p className={styles.guardNote} role='status'>
                Bulk actions unavailable: {bulkBlockedReason}
              </p>
            ) : null}
            <div className={styles.actionsGrid}>
              <button
                type='button'
                className={`${styles.bulkActionButton} ${styles.bulkActionPrimary}`}
                onClick={() => setPendingBulkStatus('active')}
                disabled={busy || Boolean(bulkBlockedReason)}
              >
                {bulkActionRunning ? 'Working…' : 'Bulk activate'}
              </button>
              <button
                type='button'
                className={`${styles.bulkActionButton} ${styles.bulkActionDestructive}`}
                onClick={() => setPendingBulkStatus('not_active')}
                disabled={busy || Boolean(bulkBlockedReason)}
              >
                {bulkActionRunning ? 'Working…' : 'Bulk deactivate'}
              </button>
              <button
                type='button'
                className={styles.bulkActionButton}
                onClick={() => void runBulkPushBcOk()}
                disabled={busy || Boolean(bulkBlockedReason)}
                title='Re-push this page to external PostgreSQL without changing Active/Inactive'
              >
                {bulkActionRunning ? 'Working…' : 'Push all BC OK'}
              </button>
              <button type='button' className={styles.bulkActionButton} onClick={() => void runBCStatusCheck()} disabled={bcStatusLoading || busy}>
                {bcStatusLoading ? 'Checking BC…' : 'Check BC Status'}
              </button>
              <button type='button' className={styles.bulkActionButton} onClick={() => void refreshExternalStatus()} disabled={busy}>
                {externalStatusLoading ? 'Refreshing…' : 'Refresh external status'}
              </button>
            </div>
            {bcCheckSummary ? (
              <p className={styles.bcCheckMeta}>
                BC checked {bcCheckSummary.checkedAt} · {bcCheckSummary.checkedCount} SKUs · {bcCheckSummary.ok} OK / {bcCheckSummary.nok} NOK /{' '}
                {bcCheckSummary.err} ERR
              </p>
            ) : null}
            {externalStatusSummary ? (
              <p className={styles.bcCheckMeta}>
                External refreshed {externalStatusSummary.checkedAt} · {externalStatusSummary.pairCount} pairs ·{' '}
                {externalStatusSummary.found} found ({externalStatusSummary.active} active / {externalStatusSummary.inactive} inactive)
              </p>
            ) : null}
          </ToolbarPopover>

          <ToolbarPopover label='Legend' panelClassName={styles.legendPanel} title='What the cells mean' alignRight>
            <ul className={styles.legendList}>
              <li>
                <span className={`${styles.cellPill} ${styles.cellPillActive}`}>Active</span> allocated — click to deactivate
              </li>
              <li>
                <span className={`${styles.cellPill} ${styles.cellPillInactive}`}>Inactive</span> row exists, not allocated — click to activate
              </li>
              <li>
                <span className={styles.cellDot}>•</span> not configured — click to open the CPQ configurator
              </li>
              <li>
                <span className={`${styles.cellSync} ${styles.cellSync_pushed}`}>✓</span> pushed to external PostgreSQL
              </li>
              <li>
                <span className={`${styles.cellSync} ${styles.cellSync_outOfSync}`}>≠</span> external row disagrees with Neon
              </li>
              <li>
                <span className={`${styles.cellSync} ${styles.cellSync_pending}`}>BC</span> waiting on BigCommerce status
              </li>
              <li>
                <span className={`${styles.cellSync} ${styles.cellSync_error}`}>!</span> last push failed
              </li>
              <li>
                <span className={`${styles.cellSync} ${styles.cellSync_unknown}`}>⤴</span> not checked — click to push manually
              </li>
            </ul>
            <p className={styles.popoverHint}>
              The <strong>BC Status</strong> column is BigCommerce readiness. The icon inside each cell is the external
              PostgreSQL sync state. Use <strong>Refresh external status</strong> to populate it.
            </p>
          </ToolbarPopover>
        </div>

        {!canEdit ? (
          <p className={styles.guardNote} role='status'>
            Read-only access: allocation changes and pushes are disabled.
          </p>
        ) : null}
      </section>

      {message ? (
        <div
          className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </div>
      ) : null}

      <ConfirmModal
        open={pendingBulkStatus !== null}
        title={pendingBulkStatus === 'active' ? 'Bulk activate on the current page?' : 'Bulk deactivate on the current page?'}
        description={`This will ${pendingBulkStatus === 'active' ? 'activate' : 'deactivate'} ${currentPageIpnCodes.length} bike(s) x ${countryTargets.length} countr${countryTargets.length === 1 ? 'y' : 'ies'} (${countryTargets.join(', ')}) on the current page only. Bikes on other pages of this filtered result are not touched.`}
        confirmLabel='Confirm'
        onConfirm={confirmBulkAction}
        onCancel={() => setPendingBulkStatus(null)}
      />
      <Toast message={toastMessage} visible={toastVisible} onDismiss={dismissToast} />

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <strong>No bikes match these filters.</strong>
          <div className={styles.emptyHint}>Try clearing a status, widening the Territory selection, or resetting the ruleset.</div>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.matrixTable}>
              <thead className={styles.stickyHeader}>
                <tr>
                  <th scope='col' className={styles.stickyBCStatus}>
                    BC
                  </th>
                  <th scope='col' className={styles.stickyFirstColumn}>
                    <div className={styles.headerStack}>
                      <span className={styles.headerFeatureTitle}>
                        <span>ipn_code</span>
                        <ToolbarPopover
                              label='+'
                              badge={selectedFeatures.length ? String(selectedFeatures.length) : undefined}
                              panelClassName={styles.columnPickerPanel}
                              triggerClassName={styles.columnPickerTrigger}
                              title='Show or hide feature columns'
                              anchorFixed
                            >
                              <div className={styles.popoverHeader}>
                                <strong className={styles.popoverTitle}>Feature columns</strong>
                                <button type='button' className={styles.textButton} onClick={() => updateSelectedFeatures([...availableFeatures])}>
                                  All
                                </button>
                                <button type='button' className={styles.textButton} onClick={() => updateSelectedFeatures([])}>
                                  None
                                </button>
                              </div>
                              {availableFeatures.length === 0 ? (
                                <p className={styles.emptyFilterValues}>No feature data on these rows.</p>
                              ) : (
                                <div className={styles.columnPickerList}>
                                  {availableFeatures.map((feature) => (
                                    <label key={`col-${feature}`} className={styles.checkboxOption}>
                                      <input
                                        type='checkbox'
                                        checked={selectedFeatures.includes(feature)}
                                        onChange={(event) =>
                                          updateSelectedFeatures(
                                            event.target.checked
                                              ? [...selectedFeatures, feature]
                                              : selectedFeatures.filter((value) => value !== feature),
                                          )
                                        }
                                      />
                                      <span>{feature}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </ToolbarPopover>
                      </span>
                      <input
                        value={ipnFilter}
                        onChange={(event) => setIpnFilter(event.target.value)}
                        placeholder='Search…'
                        aria-label='Search ipn_code'
                        className={styles.headerSearch}
                      />
                    </div>
                  </th>
                  {!effectiveRuleset ? <th scope='col'>ruleset</th> : null}
                  {visibleFeatureColumns.map((feature) => (
                    <th scope='col' key={feature}>
                      <div className={styles.headerStack}>
                        <span className={styles.headerFeatureTitle}>
                          {feature}
                          <button
                            type='button'
                            className={styles.headerRemoveColumn}
                            onClick={() => updateSelectedFeatures(selectedFeatures.filter((value) => value !== feature))}
                            title={`Hide the ${feature} column`}
                            aria-label={`Hide the ${feature} column`}
                          >
                            ×
                          </button>
                        </span>
                        <input
                          value={featureFilters[feature] ?? ''}
                          onChange={(event) => setFeatureFilterValue(feature, event.target.value)}
                          placeholder='contains'
                          aria-label={`Filter ${feature}`}
                          className={styles.headerSearch}
                        />
                      </div>
                    </th>
                  ))}
                  {renderedCountries.map((country) => (
                    <th scope='col' key={country} className={styles.countryHeader}>
                      <CountryFlagLabel countryCode={country} className={styles.countryHeaderLabel} flagClassName={styles.countryFlag} />
                    </th>
                  ))}
                  <th className={styles.fillerColumn} aria-hidden='true' />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.rowRuleset}::${row.ipnCode}`} className={styles.tableBodyRow}>
                    <td className={styles.stickyBCStatus}>
                      {bcStatusLoading && !bcStatusBySku[row.ipnCode] ? (
                        <span className={`${styles.bcBadge} ${styles.bcStatusChecking}`}>…</span>
                      ) : bcStatusBySku[row.ipnCode]?.status ? (
                        bcStatusBySku[row.ipnCode].status === 'NOK' ? (
                          <span className='nokTooltipWrap' title='BC Status: Not OK — this configuration has not passed BigCommerce validation'>
                            <span className={getBCBadgeClass(bcStatusBySku[row.ipnCode].status)}>{bcStatusBySku[row.ipnCode].status}</span>
                            <span className='nokTooltip'>BC Status: Not OK — this configuration has not passed BigCommerce validation</span>
                          </span>
                        ) : (
                          <span className={getBCBadgeClass(bcStatusBySku[row.ipnCode].status)}>{bcStatusBySku[row.ipnCode].status}</span>
                        )
                      ) : (
                        <span className={styles.bcNotChecked} title='BigCommerce status not checked yet'>
                          –
                        </span>
                      )}
                    </td>
                    <td className={styles.stickyFirstColumn}>{row.ipnCode}</td>
                    {!effectiveRuleset ? <td>{row.rowRuleset}</td> : null}
                    {visibleFeatureColumns.map((feature) => (
                      <td key={`${row.rowRuleset}-${row.ipnCode}-${feature}`}>{row.featureValues[feature] || ''}</td>
                    ))}
                    {renderedCountries.map((country) => {
                      const status = row.countryStatuses[country] ?? 'not_configured';
                      const actionKey = `${row.rowRuleset}:${row.ipnCode}:${country}`;
                      const isBusy = cellActionKey === actionKey;
                      const isPushBusy = pushActionKey === actionKey;
                      const syncDisplay = getSyncDisplay(row.ipnCode, country, status);
                      const toggleDisabled = isBusy || bulkActionRunning || isPushBusy || (!canEdit && status !== 'not_configured');
                      return (
                        <td key={`${row.rowRuleset}-${row.ipnCode}-${country}`} className={styles.countryCell}>
                          <AllocationMatrixCell
                            status={status}
                            onToggle={() => void onCountryCellClick(row, country, status)}
                            onPush={row.hasBcIds && canEdit ? () => void pushRowToExternal(row, country) : undefined}
                            toggleDisabled={toggleDisabled}
                            pushDisabled={bulkActionRunning || isBusy || isPushBusy || !canEdit}
                            busy={isBusy}
                            pushBusy={isPushBusy}
                            syncTone={syncDisplay.tone}
                            syncTitle={`${row.ipnCode} ${country} — external sync: ${syncDisplay.label}${canEdit ? '. Click to push manually.' : ''}`}
                            toggleTitle={
                              status === 'not_configured'
                                ? `Not configured — open the CPQ configurator for ${row.ipnCode} in ${country}`
                                : canEdit
                                  ? `${statusLabel(status)} — click to ${status === 'active' ? 'deactivate' : 'activate'} ${row.ipnCode} in ${country}`
                                  : `${statusLabel(status)} (read-only)`
                            }
                            ariaLabel={`${row.ipnCode} ${country}: ${statusLabel(status)}`}
                          />
                        </td>
                      );
                    })}
                    <td className={styles.fillerColumn} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className={styles.paginationBar} aria-label='Bike allocation pagination'>
            <div className={styles.paginationSummary}>
              Page {pagination.page} of {pagination.totalPages} · {pagination.totalRows} bike
              {pagination.totalRows === 1 ? '' : 's'} matched · {pagination.pageSize} per page
            </div>
            <div className={styles.paginationControls}>
              <button type='button' onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page <= 1}>
                Prev
              </button>
              {paginationItems.map((item, index) => (
                <span key={`page-${item}`} className={styles.paginationItem}>
                  {index > 0 && item - paginationItems[index - 1] > 1 ? (
                    <span className={styles.paginationEllipsis} aria-hidden='true'>
                      …
                    </span>
                  ) : null}
                  <button
                    type='button'
                    onClick={() => goToPage(item)}
                    className={item === pagination.page ? styles.paginationCurrent : undefined}
                    aria-current={item === pagination.page ? 'page' : undefined}
                    aria-label={`Go to page ${item}`}
                  >
                    {item}
                  </button>
                </span>
              ))}
              <button type='button' onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
