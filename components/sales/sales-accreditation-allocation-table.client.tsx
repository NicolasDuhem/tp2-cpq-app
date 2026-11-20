'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccreditationAllocationPageData, AccreditationLevel } from '@/lib/sales/accreditation-allocation/service';
import {
  buildActiveSetLookup,
  buildCategoryIndex,
  categoryMatchesSearch,
  computeEffectiveActiveIds,
  getAncestorIds,
  getDescendantIds,
  selectVisibleCategoryIds,
  type AccreditationCategory,
} from '@/lib/sales/accreditation-allocation/tree';
import { filterTerritoryRegions, flattenTerritoryCountries, type TerritoryRegion } from '@/lib/sales/allocation-territory';
import ConfirmModal from '@/components/shared/ConfirmModal';
import CountryFlagLabel from '@/components/shared/CountryFlagLabel';
import Toast from '@/components/shared/Toast';
import AllocationMatrixCell, { type MatrixSyncTone } from './allocation-matrix-cell';
import ToolbarPopover from './toolbar-popover';
import bikeStyles from './sales-bike-allocation-page.module.css';
import styles from './sales-accreditation-allocation-page.module.css';

type StatusValue = 'active' | 'not_active';

type Props = {
  data: AccreditationAllocationPageData;
  initialFilters: { countryCodes: string[]; levelIds: number[]; search: string; statuses: StatusValue[] };
  canEdit: boolean;
  canAdmin: boolean;
};

type Message = { type: 'success' | 'error'; text: string } | null;
type CountrySyncState = 'pushed' | 'error';
type ExternalSyncSummary = {
  attempted: number;
  pushed: number;
  errors: number;
  countries: Array<{ countryCode: string; state: CountrySyncState; message: string; rowCount: number }>;
};

const STATUS_OPTIONS: Array<{ value: StatusValue; label: string; hint: string }> = [
  { value: 'active', label: 'Active', hint: 'Category is Active in at least one visible country/level column' },
  { value: 'not_active', label: 'Inactive', hint: 'Category is Inactive in at least one visible country/level column' },
];

const toUrlList = (values: Array<string | number>) =>
  [...new Set(values.map(String).filter(Boolean))].sort((a, b) => a.localeCompare(b)).join(',');

const lookupKey = (countryCode: string, levelId: number) => `${countryCode}|${levelId}`;

async function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload;
}

function describeSync(summary: ExternalSyncSummary | null | undefined): string {
  if (!summary) return '';
  if (!summary.errors) return `External push: ${summary.pushed} countr${summary.pushed === 1 ? 'y' : 'ies'} pushed.`;
  const firstError = summary.countries.find((country) => country.state === 'error')?.message ?? '';
  return `External push: ${summary.pushed} pushed, ${summary.errors} error(s)${firstError ? ` — ${firstError}` : ''}.`;
}

export default function SalesAccreditationAllocationTableClient({ data, initialFilters, canEdit, canAdmin }: Props) {
  const router = useRouter();
  const { levels, countryCodes, territoryRegions } = data;

  // --- filter state (seeded from the URL by the server page) -----------------
  const [countrySelection, setCountrySelection] = useState<string[]>(initialFilters.countryCodes);
  const [levelSelection, setLevelSelection] = useState<number[]>(initialFilters.levelIds);
  const [search, setSearch] = useState(initialFilters.search);
  const [statusSelection, setStatusSelection] = useState<StatusValue[]>(initialFilters.statuses);
  const [territorySearch, setTerritorySearch] = useState('');
  const [cascade, setCascade] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // --- action state ------------------------------------------------------------
  const [message, setMessage] = useState<Message>(null);
  const [cellActionKey, setCellActionKey] = useState<string | null>(null);
  const [pushingCountry, setPushingCountry] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [externalLoading, setExternalLoading] = useState(false);
  const [categorySyncRunning, setCategorySyncRunning] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<StatusValue | null>(null);
  const [syncStateByCountry, setSyncStateByCountry] = useState<Record<string, CountrySyncState>>({});
  const [externalByKey, setExternalByKey] = useState<Map<string, boolean>>(new Map());
  const [externalCheckedCountries, setExternalCheckedCountries] = useState<Set<string>>(new Set());
  const [externalSummary, setExternalSummary] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // --- derived data ----------------------------------------------------------------
  const index = useMemo(() => buildCategoryIndex(data.categories), [data.categories]);
  const ownLookup = useMemo(() => buildActiveSetLookup(data.activeCells), [data.activeCells]);
  const levelsById = useMemo(() => new Map(levels.map((level) => [level.id, level])), [levels]);

  const countryTargets = useMemo(() => countrySelection.filter((code) => countryCodes.includes(code)), [countryCodes, countrySelection]);
  const renderedCountries = countryTargets.length ? countryCodes.filter((code) => countryTargets.includes(code)) : countryCodes;
  const renderedLevels = useMemo(() => {
    const selected = levels.filter((level) => levelSelection.includes(level.id));
    return selected.length ? selected : levels;
  }, [levels, levelSelection]);

  const ownSet = useCallback((countryCode: string, levelId: number) => ownLookup.get(lookupKey(countryCode, levelId)) ?? new Set<number>(), [ownLookup]);

  /** Effective sets for the rendered columns only (one pass per column). */
  const effectiveLookup = useMemo(() => {
    const out = new Map<string, Set<number>>();
    for (const countryCode of renderedCountries)
      for (const level of renderedLevels) out.set(lookupKey(countryCode, level.id), computeEffectiveActiveIds(index, ownSet(countryCode, level.id)));
    return out;
  }, [renderedCountries, renderedLevels, index, ownSet]);

  const predicate = useMemo(() => {
    const needle = search.trim();
    if (!needle && !statusSelection.length) return null;
    return (category: AccreditationCategory) => {
      if (needle && !categoryMatchesSearch(category, needle)) return false;
      if (!statusSelection.length) return true;
      for (const countryCode of renderedCountries) {
        for (const level of renderedLevels) {
          const status: StatusValue = ownSet(countryCode, level.id).has(category.categoryId) ? 'active' : 'not_active';
          if (statusSelection.includes(status)) return true;
        }
      }
      return false;
    };
  }, [search, statusSelection, renderedCountries, renderedLevels, ownSet]);

  const matchedIds = useMemo(() => {
    if (!predicate) return null;
    return new Set(index.orderedIds.filter((id) => predicate(index.byId.get(id)!)));
  }, [predicate, index]);
  const visibleIds = useMemo(() => selectVisibleCategoryIds(index, predicate), [index, predicate]);

  const displayRows = useMemo(
    () =>
      index.orderedIds.filter((id) => {
        if (visibleIds && !visibleIds.has(id)) return false;
        return !getAncestorIds(index, id).some((ancestorId) => collapsed.has(ancestorId));
      }),
    [index, visibleIds, collapsed],
  );

  /** Bulk scope: categories matching the filters (ancestors shown for context are excluded). */
  const bulkCategoryIds = useMemo(() => (matchedIds ? [...matchedIds] : [...index.orderedIds]), [matchedIds, index]);

  const territoryGroups = useMemo(() => filterTerritoryRegions(territoryRegions, territorySearch), [territoryRegions, territorySearch]);
  const allTerritoryCountries = useMemo(() => flattenTerritoryCountries(territoryRegions), [territoryRegions]);

  // --- URL sync (shareable view, no server round-trip: all filtering is client-side) ---
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const set = (key: string, value: string) => (value ? params.set(key, value) : params.delete(key));
      set('countries', toUrlList(countrySelection));
      set('levels', toUrlList(levelSelection));
      set('q', search.trim());
      set('status', toUrlList(statusSelection));
      const next = params.toString();
      if (next !== window.location.search.replace(/^\?/, '')) {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${next ? `?${next}` : ''}`);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [countrySelection, levelSelection, search, statusSelection]);

  // --- filter mutators ---------------------------------------------------------------
  const toggleTerritoryCountry = (countryCode: string, checked: boolean) =>
    setCountrySelection((prev) => (checked ? (prev.includes(countryCode) ? prev : [...prev, countryCode]) : prev.filter((value) => value !== countryCode)));
  const toggleCountryGroup = (codes: string[], select: boolean) =>
    setCountrySelection((prev) => (select ? [...new Set([...prev, ...codes])] : prev.filter((code) => !codes.includes(code))));
  const toggleLevel = (levelId: number, checked: boolean) =>
    setLevelSelection((prev) => (checked ? (prev.includes(levelId) ? prev : [...prev, levelId]) : prev.filter((value) => value !== levelId)));
  const toggleStatus = (status: StatusValue, checked: boolean) =>
    setStatusSelection((prev) => (checked ? (prev.includes(status) ? prev : [...prev, status]) : prev.filter((value) => value !== status)));
  const toggleCollapsed = (categoryId: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  const collapseAll = () => setCollapsed(new Set(index.orderedIds.filter((id) => (index.childrenById.get(id) ?? []).length > 0)));
  const expandAll = () => setCollapsed(new Set());

  const clearAllFilters = () => {
    setCountrySelection([]);
    setLevelSelection([]);
    setSearch('');
    setStatusSelection([]);
    setTerritorySearch('');
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (search.trim()) chips.push({ key: 'q', label: `Category contains "${search}"`, onRemove: () => setSearch('') });
    if (countrySelection.length)
      chips.push({
        key: 'countries',
        label: `${countrySelection.length} countr${countrySelection.length === 1 ? 'y' : 'ies'}`,
        onRemove: () => setCountrySelection([]),
      });
    if (levelSelection.length)
      chips.push({ key: 'levels', label: `${levelSelection.length} level${levelSelection.length === 1 ? '' : 's'}`, onRemove: () => setLevelSelection([]) });
    for (const status of statusSelection) {
      chips.push({ key: `status-${status}`, label: STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status, onRemove: () => toggleStatus(status, false) });
    }
    return chips;
  }, [search, countrySelection, levelSelection, statusSelection]);

  // --- external sync display ------------------------------------------------------------
  const applySyncSummary = (summary: ExternalSyncSummary | null | undefined) => {
    if (!summary) return;
    setSyncStateByCountry((prev) => {
      const next = { ...prev };
      for (const country of summary.countries) next[country.countryCode] = country.state;
      return next;
    });
  };

  const getSyncDisplay = (countryCode: string, level: AccreditationLevel, categoryId: number, effective: boolean): { tone: MatrixSyncTone; label: string } => {
    const transient = syncStateByCountry[countryCode];
    if (transient === 'error') return { tone: 'error', label: 'Error (last push for this country failed)' };
    if (transient === 'pushed') return { tone: 'pushed', label: 'Pushed' };
    if (externalCheckedCountries.has(countryCode)) {
      const external = externalByKey.get(`${countryCode}|${level.code}|${categoryId}`);
      if (external === undefined) return { tone: 'outOfSync', label: 'Missing in external PostgreSQL' };
      return external === effective ? { tone: 'pushed', label: 'Pushed' } : { tone: 'outOfSync', label: 'Out of sync' };
    }
    return { tone: 'unknown', label: 'Unknown (not checked)' };
  };

  const refreshExternalStatus = useCallback(async () => {
    setExternalLoading(true);
    setMessage(null);
    try {
      const payload = await postJson<{
        result: { rowCount: number; countryCodes: string[]; items: Array<{ countryCode: string; levelCode: string; categoryId: number; isActive: boolean }> };
      }>('/api/sales/accreditation-allocation/external-status', { countryCodes: renderedCountries });
      const map = new Map<string, boolean>();
      for (const item of payload.result.items) map.set(`${item.countryCode}|${item.levelCode}|${item.categoryId}`, item.isActive);
      setExternalByKey(map);
      setExternalCheckedCountries(new Set(payload.result.countryCodes));
      // A fresh read replaces transient push results for the countries just checked.
      setSyncStateByCountry((prev) => Object.fromEntries(Object.entries(prev).filter(([code]) => !payload.result.countryCodes.includes(code))));
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setExternalSummary(`External refreshed ${time} · ${payload.result.countryCodes.length} countries · ${payload.result.rowCount} rows found`);
      setMessage({ type: 'success', text: `External status refreshed for ${payload.result.countryCodes.length} countr${payload.result.countryCodes.length === 1 ? 'y' : 'ies'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to refresh external status.' });
    } finally {
      setExternalLoading(false);
    }
  }, [renderedCountries]);

  // --- actions -------------------------------------------------------------------------------
  const onCellClick = async (countryCode: string, level: AccreditationLevel, category: AccreditationCategory) => {
    const isActive = ownSet(countryCode, level.id).has(category.categoryId);
    const targetStatus: StatusValue = isActive ? 'not_active' : 'active';
    const categoryIds = cascade ? [category.categoryId, ...getDescendantIds(index, category.categoryId)] : [category.categoryId];
    const actionKey = `${countryCode}:${level.id}:${category.categoryId}`;
    setCellActionKey(actionKey);
    setMessage(null);
    try {
      const payload = await postJson<{ result: { changedCount: number; externalSync: ExternalSyncSummary | null } }>(
        '/api/sales/accreditation-allocation/toggle',
        { countryCode, levelId: level.id, categoryIds, targetStatus },
      );
      applySyncSummary(payload.result.externalSync);
      const scope = categoryIds.length > 1 ? ` and ${categoryIds.length - 1} sub-categor${categoryIds.length - 1 === 1 ? 'y' : 'ies'}` : '';
      setMessage({
        type: payload.result.externalSync?.errors ? 'error' : 'success',
        text: `${category.name}${scope} → ${targetStatus === 'active' ? 'Active' : 'Inactive'} for ${countryCode} ${level.label} (${payload.result.changedCount} cell(s) changed). ${describeSync(payload.result.externalSync)}`.trim(),
      });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update cell.' });
    } finally {
      setCellActionKey(null);
    }
  };

  const pushCountries = async (targets: string[], single = false) => {
    if (!targets.length) return;
    if (single) setPushingCountry(targets[0]);
    else setBulkRunning(true);
    setMessage(null);
    try {
      const payload = await postJson<{ result: ExternalSyncSummary }>('/api/sales/accreditation-allocation/push', { countryCodes: targets });
      applySyncSummary(payload.result);
      setMessage({ type: payload.result.errors ? 'error' : 'success', text: describeSync(payload.result) });
    } catch (error) {
      setSyncStateByCountry((prev) => ({ ...prev, ...Object.fromEntries(targets.map((code) => [code, 'error' as const])) }));
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Push failed.' });
    } finally {
      setPushingCountry(null);
      setBulkRunning(false);
    }
  };

  const bulkBlockedReason = !canEdit
    ? 'You need Edit access to change accreditation.'
    : !countryTargets.length
      ? 'Select at least one country in Territory.'
      : !renderedLevels.length
        ? 'No accreditation level to update.'
        : !bulkCategoryIds.length
          ? 'No category matches the current filters.'
          : null;

  const runBulkAction = async (targetStatus: StatusValue) => {
    if (bulkBlockedReason) {
      setMessage({ type: 'error', text: bulkBlockedReason });
      return;
    }
    setBulkRunning(true);
    setMessage(null);
    try {
      const payload = await postJson<{ result: { changedCount: number; cellCount: number; externalSync: ExternalSyncSummary | null } }>(
        '/api/sales/accreditation-allocation/bulk-update',
        { countryCodes: countryTargets, levelIds: renderedLevels.map((level) => level.id), categoryIds: bulkCategoryIds, targetStatus },
      );
      applySyncSummary(payload.result.externalSync);
      setMessage({
        type: payload.result.externalSync?.errors ? 'error' : 'success',
        text: `Bulk ${targetStatus === 'active' ? 'activate' : 'deactivate'} done: ${payload.result.changedCount} of ${payload.result.cellCount} cell(s) changed. ${describeSync(payload.result.externalSync)}`.trim(),
      });
      setToastMessage(`Done — ${payload.result.changedCount} cell(s) updated`);
      setToastVisible(true);
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Bulk update failed.' });
    } finally {
      setBulkRunning(false);
    }
  };

  const runCategorySync = async () => {
    setCategorySyncRunning(true);
    setMessage(null);
    try {
      const payload = await postJson<{
        result: { channelId: number; treeId: number; treeName: string | null; total: number; added: number; removed: number; changed: number; maxDepth: number };
      }>('/api/sales/accreditation-allocation/categories/sync', {});
      const r = payload.result;
      setMessage({
        type: 'success',
        text: `Categories synced from BigCommerce (channel ${r.channelId}, tree ${r.treeName ?? r.treeId}): ${r.total} categories, ${r.added} added, ${r.changed} renamed/moved, ${r.removed} removed, depth ${r.maxDepth}.${r.added || r.removed ? ' New categories start Inactive everywhere. Push countries to refresh the external table.' : ''}`,
      });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Category sync failed.' });
    } finally {
      setCategorySyncRunning(false);
    }
  };

  const dismissToast = useCallback(() => setToastVisible(false), []);
  const busy = bulkRunning || externalLoading || categorySyncRunning;

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (countryTargets.length) params.set('countries', toUrlList(countryTargets));
    if (levelSelection.length) params.set('levels', toUrlList(levelSelection));
    return `/api/sales/accreditation-allocation/export?${params.toString()}`;
  }, [countryTargets, levelSelection]);

  const lastSynced = data.channel.lastSyncedAt ? new Date(data.channel.lastSyncedAt).toLocaleString() : null;
  const hasCategories = data.categories.length > 0;

  // --- render ----------------------------------------------------------------------------------
  return (
    <>
      <section className={`${bikeStyles.panel} ${bikeStyles.toolbar}`} aria-label='Accreditation allocation filters and actions'>
        <div className={bikeStyles.toolbarRow}>
          <ToolbarPopover
            label='Territory'
            badge={countryTargets.length ? String(countryTargets.length) : `all ${countryCodes.length}`}
            triggerClassName={countryTargets.length ? bikeStyles.popoverTriggerActive : undefined}
            panelClassName={bikeStyles.territoryPanel}
            title='Choose the countries in scope'
          >
            <TerritoryPicker
              regions={territoryGroups}
              selection={countrySelection}
              search={territorySearch}
              onSearch={setTerritorySearch}
              onToggle={toggleTerritoryCountry}
              onToggleGroup={toggleCountryGroup}
              onAll={() => setCountrySelection([...allTerritoryCountries])}
              onNone={() => {
                setCountrySelection([]);
                setTerritorySearch('');
              }}
              hint={`Selected countries set the visible columns and the countries bulk actions and Push write to. Nothing selected = all ${countryCodes.length} countries shown, bulk actions disabled.`}
            />
          </ToolbarPopover>

          <ToolbarPopover
            label='Levels'
            badge={levelSelection.length ? String(levelSelection.length) : `all ${levels.length}`}
            triggerClassName={levelSelection.length ? bikeStyles.popoverTriggerActive : undefined}
            panelClassName={bikeStyles.columnPickerPanel}
            title='Choose the accreditation levels shown'
          >
            <div className={bikeStyles.popoverHeader}>
              <strong className={bikeStyles.popoverTitle}>Accreditation levels</strong>
              <button type='button' className={bikeStyles.textButton} onClick={() => setLevelSelection(levels.map((level) => level.id))}>
                All
              </button>
              <button type='button' className={bikeStyles.textButton} onClick={() => setLevelSelection([])}>
                None
              </button>
            </div>
            <p className={bikeStyles.popoverHint}>Nothing selected = every level shown. Bulk actions apply to the levels shown.</p>
            <div className={bikeStyles.columnPickerList}>
              {levels.map((level) => (
                <label key={`level-${level.id}`} className={bikeStyles.checkboxOption}>
                  <input type='checkbox' checked={levelSelection.includes(level.id)} onChange={(event) => toggleLevel(level.id, event.target.checked)} />
                  <span>
                    {level.label} <span className={styles.categoryId}>{level.code}</span>
                  </span>
                </label>
              ))}
            </div>
          </ToolbarPopover>

          <div className={bikeStyles.segmentedFilter} role='group' aria-label='Status filter'>
            {STATUS_OPTIONS.map((option) => {
              const checked = statusSelection.includes(option.value);
              return (
                <label key={option.value} className={checked ? bikeStyles.segmentedOptionActive : bikeStyles.segmentedOption} title={option.hint}>
                  <input type='checkbox' checked={checked} onChange={(event) => toggleStatus(option.value, event.target.checked)} />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>

          <label className={styles.cascadeToggle} title='When on, clicking a category cell also applies the same status to all its sub-categories.'>
            <input type='checkbox' checked={cascade} onChange={(event) => setCascade(event.target.checked)} />
            Apply to sub-categories
          </label>

          <span className={bikeStyles.matchChip}>
            {matchedIds ? matchedIds.size : data.categories.length} categor{(matchedIds ? matchedIds.size : data.categories.length) === 1 ? 'y' : 'ies'}
          </span>

          {activeFilterChips.length ? (
            <ToolbarPopover label='Active filters' badge={String(activeFilterChips.length)} panelClassName={bikeStyles.chipPanel}>
              <div className={bikeStyles.chipRow}>
                {activeFilterChips.map((chip) => (
                  <button key={chip.key} type='button' className={bikeStyles.filterChip} onClick={chip.onRemove}>
                    {chip.label}
                    <span aria-hidden='true'>×</span>
                    <span className={bikeStyles.srOnly}>(remove filter)</span>
                  </button>
                ))}
                <button type='button' className={bikeStyles.textButton} onClick={clearAllFilters}>
                  Clear all
                </button>
              </div>
            </ToolbarPopover>
          ) : null}

          <span className={bikeStyles.toolbarSpacer} />

          <button
            type='button'
            className={bikeStyles.bulkActionButton}
            onClick={() => setCopyOpen(true)}
            disabled={!canEdit || busy || !hasCategories || !levels.length}
            title={canEdit ? 'Copy one country’s full accreditation setup onto other countries' : 'You need Edit access'}
          >
            Copy country…
          </button>

          <a className={bikeStyles.bulkActionButton} href={exportHref} title='Download every country x level x category cell in scope (own and effective state).'>
            Export CSV
          </a>

          <ToolbarPopover label='Actions' badge={countryTargets.length ? `${countryTargets.length} ctry` : undefined} panelClassName={bikeStyles.actionsPanel} title='Bulk and sync actions' alignRight>
            <p className={bikeStyles.popoverHint}>
              Bulk actions apply to the <strong>{bulkCategoryIds.length} categor{bulkCategoryIds.length === 1 ? 'y' : 'ies'}</strong> matching the
              current filters (including collapsed sub-categories) ×{' '}
              <strong>
                {countryTargets.length} selected countr{countryTargets.length === 1 ? 'y' : 'ies'}
              </strong>{' '}
              × <strong>{renderedLevels.length} level{renderedLevels.length === 1 ? '' : 's'}</strong>.
            </p>
            {bulkBlockedReason ? (
              <p className={bikeStyles.guardNote} role='status'>
                Bulk actions unavailable: {bulkBlockedReason}
              </p>
            ) : null}
            <div className={bikeStyles.actionsGrid}>
              <button
                type='button'
                className={`${bikeStyles.bulkActionButton} ${bikeStyles.bulkActionPrimary}`}
                onClick={() => setPendingBulkStatus('active')}
                disabled={busy || Boolean(bulkBlockedReason)}
              >
                {bulkRunning ? 'Working…' : 'Bulk activate'}
              </button>
              <button
                type='button'
                className={`${bikeStyles.bulkActionButton} ${bikeStyles.bulkActionDestructive}`}
                onClick={() => setPendingBulkStatus('not_active')}
                disabled={busy || Boolean(bulkBlockedReason)}
              >
                {bulkRunning ? 'Working…' : 'Bulk deactivate'}
              </button>
              <button
                type='button'
                className={bikeStyles.bulkActionButton}
                onClick={() => void pushCountries(countryTargets)}
                disabled={busy || !canEdit || !countryTargets.length || !hasCategories}
                title='Re-push the selected countries to external PostgreSQL without changing Active/Inactive'
              >
                {bulkRunning ? 'Working…' : 'Push selected countries'}
              </button>
              <button type='button' className={bikeStyles.bulkActionButton} onClick={() => void refreshExternalStatus()} disabled={busy || !hasCategories}>
                {externalLoading ? 'Refreshing…' : 'Refresh external status'}
              </button>
              <button
                type='button'
                className={bikeStyles.bulkActionButton}
                onClick={() => void runCategorySync()}
                disabled={busy || !canEdit}
                title='Reload the Brompton B2B category tree from BigCommerce'
              >
                {categorySyncRunning ? 'Syncing…' : 'Sync categories from BigCommerce'}
              </button>
              <button type='button' className={bikeStyles.bulkActionButton} onClick={() => setLevelsOpen(true)} disabled={busy}>
                {canAdmin ? 'Manage levels' : 'View levels'}
              </button>
              <button type='button' className={bikeStyles.bulkActionButton} onClick={expandAll} disabled={!hasCategories}>
                Expand all
              </button>
              <button type='button' className={bikeStyles.bulkActionButton} onClick={collapseAll} disabled={!hasCategories}>
                Collapse all
              </button>
            </div>
            {externalSummary ? <p className={bikeStyles.bcCheckMeta}>{externalSummary}</p> : null}
          </ToolbarPopover>

          <ToolbarPopover label='Legend' panelClassName={bikeStyles.legendPanel} title='What the cells mean' alignRight>
            <ul className={bikeStyles.legendList}>
              <li>
                <span className={`${bikeStyles.cellPill} ${bikeStyles.cellPillActive}`}>Active</span> eligible — click to deactivate
              </li>
              <li>
                <span className={`${bikeStyles.cellPill} ${bikeStyles.cellPillInactive}`}>Inactive</span> not eligible — click to activate
              </li>
              <li>
                <span className={`${bikeStyles.cellPill} ${bikeStyles.cellPillActive} ${styles.cellBlocked}`}>Active</span> faded: a parent category is
                Inactive, so it is effectively not eligible
              </li>
              <li>
                <span className={`${bikeStyles.cellSync} ${bikeStyles.cellSync_pushed}`}>✓</span> external PostgreSQL matches
              </li>
              <li>
                <span className={`${bikeStyles.cellSync} ${bikeStyles.cellSync_outOfSync}`}>≠</span> external row differs or is missing
              </li>
              <li>
                <span className={`${bikeStyles.cellSync} ${bikeStyles.cellSync_error}`}>!</span> last push for that country failed
              </li>
              <li>
                <span className={`${bikeStyles.cellSync} ${bikeStyles.cellSync_unknown}`}>⤴</span> not checked — click to push that country
              </li>
            </ul>
            <p className={bikeStyles.popoverHint}>
              Missing cells are Inactive. External PostgreSQL receives the <strong>effective</strong> state (category and all parents Active), one full
              country at a time.
            </p>
          </ToolbarPopover>
        </div>

        <div className={styles.infoBar}>
          {data.channel.channelId ? (
            <>
              <span>
                BigCommerce channel <strong>{data.channel.channelId}</strong>
                {data.channel.treeName ? ` · tree “${data.channel.treeName}”` : ''}
                {data.channel.source === 'env' ? ' (from BIGCOMMERCE_ACCREDITATION_CHANNEL_ID)' : ''}
              </span>
              <span>{data.categories.length} categories</span>
              {lastSynced ? <span>Last synced {lastSynced}</span> : null}
            </>
          ) : (
            <span>No BigCommerce channel synced yet.</span>
          )}
        </div>

        {!canEdit ? (
          <p className={bikeStyles.guardNote} role='status'>
            Read-only access: accreditation changes and pushes are disabled.
          </p>
        ) : null}
      </section>

      {message ? (
        <div className={`${bikeStyles.message} ${message.type === 'success' ? bikeStyles.messageSuccess : bikeStyles.messageError}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.text}
        </div>
      ) : null}

      <ConfirmModal
        open={pendingBulkStatus !== null}
        title={pendingBulkStatus === 'active' ? 'Bulk activate?' : 'Bulk deactivate?'}
        description={`This will ${pendingBulkStatus === 'active' ? 'activate' : 'deactivate'} ${bulkCategoryIds.length} categor${bulkCategoryIds.length === 1 ? 'y' : 'ies'} × ${renderedLevels.length} level(s) (${renderedLevels.map((level) => level.label).join(', ')}) × ${countryTargets.length} countr${countryTargets.length === 1 ? 'y' : 'ies'} (${countryTargets.join(', ')}), then push those countries to external PostgreSQL.`}
        confirmLabel='Confirm'
        onConfirm={() => {
          const target = pendingBulkStatus;
          setPendingBulkStatus(null);
          if (target) void runBulkAction(target);
        }}
        onCancel={() => setPendingBulkStatus(null)}
      />
      <Toast message={toastMessage} visible={toastVisible} onDismiss={dismissToast} />

      {copyOpen ? (
        <CopyCountryModal
          regions={territoryRegions}
          countryCodes={countryCodes}
          defaultSource={countryTargets.length === 1 ? countryTargets[0] : ''}
          levelCount={levels.length}
          categoryCount={data.categories.length}
          onClose={() => setCopyOpen(false)}
          onDone={(text, summary, isError) => {
            applySyncSummary(summary);
            setMessage({ type: isError ? 'error' : 'success', text });
            setCopyOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {levelsOpen ? (
        <ManageLevelsModal
          levels={data.allLevels}
          canAdmin={canAdmin}
          onClose={() => setLevelsOpen(false)}
          onChanged={(text, isError) => {
            setMessage({ type: isError ? 'error' : 'success', text });
            router.refresh();
          }}
        />
      ) : null}

      {!data.channel.channelId || !hasCategories ? (
        <div className={bikeStyles.empty}>
          <strong>No BigCommerce categories synced yet.</strong>
          <div className={bikeStyles.emptyHint}>
            Load the Brompton B2B category tree from BigCommerce to start. Category names are shown here; category ids are what is stored and pushed.
          </div>
          {canEdit ? (
            <p>
              <button type='button' className={`${bikeStyles.bulkActionButton} ${bikeStyles.bulkActionPrimary}`} onClick={() => void runCategorySync()} disabled={busy}>
                {categorySyncRunning ? 'Syncing…' : 'Sync categories from BigCommerce'}
              </button>
            </p>
          ) : null}
        </div>
      ) : !levels.length ? (
        <div className={bikeStyles.empty}>
          <strong>No active accreditation levels.</strong>
          <div className={bikeStyles.emptyHint}>{canAdmin ? 'Add or restore a level in Actions → Manage levels.' : 'Ask an admin to add an accreditation level.'}</div>
        </div>
      ) : displayRows.length === 0 ? (
        <div className={bikeStyles.empty}>
          <strong>No category matches these filters.</strong>
          <div className={bikeStyles.emptyHint}>Try clearing the search or a status, or widening the Territory selection.</div>
        </div>
      ) : (
        <div className={bikeStyles.tableWrap}>
          <table className={bikeStyles.matrixTable}>
            <thead className={bikeStyles.stickyHeader}>
              <tr>
                <th scope='col' className={`${bikeStyles.stickyFirstColumn} ${styles.categoryColumn}`}>
                  <div className={bikeStyles.headerStack}>
                    <span className={bikeStyles.headerFeatureTitle}>
                      <span>Category</span>
                    </span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search name or id…' aria-label='Search category' className={bikeStyles.headerSearch} />
                  </div>
                </th>
                {renderedCountries.map((countryCode) =>
                  renderedLevels.map((level, levelIndex) => (
                    <th
                      scope='col'
                      key={`${countryCode}-${level.id}`}
                      className={`${bikeStyles.countryHeader} ${levelIndex === 0 ? styles.countryGroupStart : ''}`}
                      title={`${countryCode} · ${level.label}`}
                    >
                      <span className={styles.levelHeader}>
                        <CountryFlagLabel countryCode={countryCode} className={bikeStyles.countryHeaderLabel} flagClassName={bikeStyles.countryFlag} />
                        <span className={styles.levelHeaderLabel}>{level.label}</span>
                      </span>
                    </th>
                  )),
                )}
                <th className={bikeStyles.fillerColumn} aria-hidden='true' />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((categoryId) => {
                const category = index.byId.get(categoryId)!;
                const hasChildren = (index.childrenById.get(categoryId) ?? []).length > 0;
                const isContext = matchedIds ? !matchedIds.has(categoryId) : false;
                const depthClass = category.depth === 1 ? styles.depth1 : category.depth === 2 ? styles.depth2 : '';
                return (
                  <tr key={categoryId} className={`${bikeStyles.tableBodyRow} ${isContext ? styles.contextRow : ''}`}>
                    <td className={`${bikeStyles.stickyFirstColumn} ${styles.categoryColumn} ${depthClass}`}>
                      <div className={styles.categoryCellInner} style={{ paddingLeft: `${(Math.max(1, category.depth) - 1) * 18}px` }}>
                        {hasChildren ? (
                          <button
                            type='button'
                            className={styles.caretButton}
                            onClick={() => toggleCollapsed(categoryId)}
                            aria-expanded={!collapsed.has(categoryId)}
                            aria-label={`${collapsed.has(categoryId) ? 'Expand' : 'Collapse'} ${category.name}`}
                          >
                            {collapsed.has(categoryId) ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className={styles.caretSpacer} aria-hidden='true' />
                        )}
                        <span className={styles.categoryName} title={category.name}>
                          {category.name}
                        </span>
                        <span className={styles.categoryId}>#{categoryId}</span>
                        {!category.isVisible ? (
                          <span className={styles.miniTag} title='Hidden in BigCommerce'>
                            hidden
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {renderedCountries.map((countryCode) =>
                      renderedLevels.map((level, levelIndex) => {
                        const own = ownSet(countryCode, level.id).has(categoryId);
                        const effective = effectiveLookup.get(lookupKey(countryCode, level.id))?.has(categoryId) ?? false;
                        const blocked = own && !effective;
                        const actionKey = `${countryCode}:${level.id}:${categoryId}`;
                        const isBusy = cellActionKey === actionKey;
                        const isPushBusy = pushingCountry === countryCode;
                        const sync = getSyncDisplay(countryCode, level, categoryId, effective);
                        const statusText = own ? 'Active' : 'Inactive';
                        const cascadeNote = cascade && hasChildren ? ' and all its sub-categories' : '';
                        return (
                          <td
                            key={`${countryCode}-${level.id}-${categoryId}`}
                            className={`${bikeStyles.countryCell} ${levelIndex === 0 ? styles.countryGroupStart : ''} ${blocked ? styles.cellBlocked : ''}`}
                          >
                            <AllocationMatrixCell
                              status={own ? 'active' : 'not_active'}
                              onToggle={() => void onCellClick(countryCode, level, category)}
                              onPush={canEdit ? () => void pushCountries([countryCode], true) : undefined}
                              toggleDisabled={!canEdit || isBusy || bulkRunning || isPushBusy}
                              pushDisabled={!canEdit || bulkRunning || isBusy || isPushBusy}
                              busy={isBusy}
                              pushBusy={isPushBusy}
                              syncTone={sync.tone}
                              syncTitle={`${countryCode} ${level.label} ${category.name} — external: ${sync.label}${canEdit ? `. Click to push ${countryCode}.` : ''}`}
                              toggleTitle={
                                canEdit
                                  ? `${statusText}${blocked ? ' (blocked by an inactive parent category)' : ''} — click to ${own ? 'deactivate' : 'activate'} ${category.name}${cascadeNote} for ${countryCode} ${level.label}`
                                  : `${statusText}${blocked ? ' (blocked by an inactive parent category)' : ''} (read-only)`
                              }
                              ariaLabel={`${category.name} ${countryCode} ${level.label}: ${statusText}${blocked ? ', blocked by parent' : ''}`}
                            />
                          </td>
                        );
                      }),
                    )}
                    <td className={bikeStyles.fillerColumn} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// --- Territory picker (same layout as Bike Allocation) ----------------------------------------

function TerritoryPicker({
  regions,
  selection,
  search,
  onSearch,
  onToggle,
  onToggleGroup,
  onAll,
  onNone,
  hint,
  exclude,
}: {
  regions: TerritoryRegion[];
  selection: string[];
  search: string;
  onSearch: (value: string) => void;
  onToggle: (countryCode: string, checked: boolean) => void;
  onToggleGroup: (codes: string[], select: boolean) => void;
  onAll: () => void;
  onNone: () => void;
  hint?: string;
  exclude?: string;
}) {
  return (
    <>
      <div className={bikeStyles.popoverHeader}>
        <input value={search} onChange={(event) => onSearch(event.target.value.toUpperCase())} placeholder='Search code…' aria-label='Search country code' className={bikeStyles.popoverSearch} />
        <button type='button' className={bikeStyles.textButton} onClick={onAll}>
          All
        </button>
        <button type='button' className={bikeStyles.textButton} onClick={onNone}>
          None
        </button>
      </div>
      {hint ? <p className={bikeStyles.popoverHint}>{hint}</p> : null}
      <div className={bikeStyles.territoryRegionGrid}>
        {regions.length === 0 ? (
          <p className={bikeStyles.emptyFilterValues}>No country matches “{search}”.</p>
        ) : (
          regions.map((region) => {
            const regionCodes = region.subRegions.flatMap((subRegion) => subRegion.countries).filter((code) => code !== exclude);
            const regionSelected = regionCodes.filter((code) => selection.includes(code)).length;
            const regionAll = regionCodes.length > 0 && regionSelected === regionCodes.length;
            return (
              <div key={`region-${region.region}`} className={bikeStyles.territoryRegionCard}>
                <button type='button' className={bikeStyles.territoryGroupButton} aria-pressed={regionAll} onClick={() => onToggleGroup(regionCodes, !regionAll)}>
                  <span className={bikeStyles.territoryRegionTitle}>{region.region}</span>
                  <span className={bikeStyles.selectionCount}>
                    {regionSelected}/{regionCodes.length}
                  </span>
                </button>
                {region.subRegions.map((subRegion) => {
                  const codes = subRegion.countries.filter((code) => code !== exclude);
                  const subSelected = codes.filter((code) => selection.includes(code)).length;
                  const subAll = codes.length > 0 && subSelected === codes.length;
                  return (
                    <div key={`${region.region}-${subRegion.subRegion}`} className={bikeStyles.subRegionBlock}>
                      <button type='button' className={bikeStyles.territoryGroupButton} aria-pressed={subAll} onClick={() => onToggleGroup(codes, !subAll)}>
                        <span className={bikeStyles.subRegionTitle}>{subRegion.subRegion}</span>
                        <span className={bikeStyles.selectionCount}>
                          {subSelected}/{codes.length}
                        </span>
                      </button>
                      <div className={bikeStyles.countryOptionGrid}>
                        {subRegion.countries.map((countryCode) => (
                          <label key={`${region.region}-${subRegion.subRegion}-${countryCode}`} className={bikeStyles.checkboxOption}>
                            <input
                              type='checkbox'
                              checked={selection.includes(countryCode)}
                              disabled={countryCode === exclude}
                              onChange={(event) => onToggle(countryCode, event.target.checked)}
                            />
                            <CountryFlagLabel countryCode={countryCode} className={bikeStyles.countryOptionLabel} flagClassName={bikeStyles.countryFlag} />
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
    </>
  );
}

// --- Copy country modal ---------------------------------------------------------------------------

function CopyCountryModal({
  regions,
  countryCodes,
  defaultSource,
  levelCount,
  categoryCount,
  onClose,
  onDone,
}: {
  regions: TerritoryRegion[];
  countryCodes: string[];
  defaultSource: string;
  levelCount: number;
  categoryCount: number;
  onClose: () => void;
  onDone: (text: string, summary: ExternalSyncSummary | null, isError: boolean) => void;
}) {
  const [source, setSource] = useState(defaultSource);
  const [targets, setTargets] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveTargets = targets.filter((code) => code !== source);
  const filteredRegions = useMemo(() => filterTerritoryRegions(regions, search), [regions, search]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const payload = await postJson<{ result: { sourceCountryCode: string; targetCountryCodes: string[]; changedCount: number; externalSync: ExternalSyncSummary } }>(
        '/api/sales/accreditation-allocation/copy',
        { sourceCountryCode: source, targetCountryCodes: effectiveTargets },
      );
      const r = payload.result;
      onDone(
        `Copied ${r.sourceCountryCode} onto ${r.targetCountryCodes.join(', ')}: ${r.changedCount} cell(s) changed. ${describeSync(r.externalSync)}`.trim(),
        r.externalSync,
        Boolean(r.externalSync?.errors),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy failed.');
      setRunning(false);
    }
  };

  return (
    <div className='confirmModalBackdrop' onKeyDown={(event) => event.key === 'Escape' && !running && onClose()}>
      <div className={`confirmModalCard ${styles.modalCard}`} role='dialog' aria-modal='true' aria-labelledby='copy-country-title'>
        <h2 id='copy-country-title'>Copy a country’s accreditation onto other countries</h2>
        <div className={styles.modalBody}>
          <label className={styles.modalField}>
            <strong>Source country</strong>
            <select value={source} onChange={(event) => setSource(event.target.value)} aria-label='Source country'>
              <option value=''>Choose…</option>
              {countryCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <strong>Target countries ({effectiveTargets.length})</strong>
          <TerritoryPicker
            regions={filteredRegions}
            selection={targets}
            search={search}
            onSearch={setSearch}
            onToggle={(code, checked) => setTargets((prev) => (checked ? [...new Set([...prev, code])] : prev.filter((value) => value !== code)))}
            onToggleGroup={(codes, select) => setTargets((prev) => (select ? [...new Set([...prev, ...codes])] : prev.filter((code) => !codes.includes(code))))}
            onAll={() => setTargets(countryCodes.filter((code) => code !== source))}
            onNone={() => setTargets([])}
            exclude={source}
          />
          <div className={styles.modalWarning}>
            Overwrite: every target country gets exactly the source’s Active/Inactive state for all {levelCount} active level(s) × {categoryCount} categories.
            Changes are audited and the targets are pushed to external PostgreSQL.
          </div>
          {error ? (
            <div className={`${bikeStyles.message} ${bikeStyles.messageError}`} role='alert'>
              {error}
            </div>
          ) : null}
        </div>
        <div className='confirmModalActions'>
          <button type='button' className='confirmModalCancel' onClick={onClose} disabled={running}>
            Cancel
          </button>
          <button type='button' className='confirmModalConfirm' onClick={() => void run()} disabled={running || !source || !effectiveTargets.length}>
            {running ? 'Copying…' : `Copy ${source || '…'} to ${effectiveTargets.length} countr${effectiveTargets.length === 1 ? 'y' : 'ies'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Manage levels modal --------------------------------------------------------------------------

function ManageLevelsModal({
  levels,
  canAdmin,
  onClose,
  onChanged,
}: {
  levels: AccreditationLevel[];
  canAdmin: boolean;
  onClose: () => void;
  onChanged: (text: string, isError: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, { label: string; displayOrder: string }>>(() =>
    Object.fromEntries(levels.map((level) => [level.id, { label: level.label, displayOrder: String(level.displayOrder) }])),
  );
  const [newLabel, setNewLabel] = useState('');
  const [runningId, setRunningId] = useState<number | 'new' | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep drafts aligned when the server list changes (after router.refresh()).
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, { label: string; displayOrder: string }> = {};
      for (const level of levels) next[level.id] = prev[level.id] ?? { label: level.label, displayOrder: String(level.displayOrder) };
      return next;
    });
  }, [levels]);

  const patch = async (level: AccreditationLevel, body: Record<string, unknown>, successText: string) => {
    setRunningId(level.id);
    setError(null);
    try {
      const payload = await postJson<{ result: { external: { state: string; message: string } } }>('/api/sales/accreditation-allocation/levels', { id: level.id, ...body }, 'PATCH');
      const external = payload.result.external;
      onChanged(`${successText}${external?.message ? ` ${external.message}` : ''}`, external?.state === 'error');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setRunningId(null);
      setConfirmRemoveId(null);
    }
  };

  const create = async () => {
    setRunningId('new');
    setError(null);
    try {
      const payload = await postJson<{ level: AccreditationLevel }>('/api/sales/accreditation-allocation/levels', { label: newLabel });
      setNewLabel('');
      onChanged(`Level ${payload.level.label} (${payload.level.code}) added. It starts Inactive for every category and country.`, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className='confirmModalBackdrop'>
      <div className={`confirmModalCard ${styles.modalCard}`} role='dialog' aria-modal='true' aria-labelledby='manage-levels-title'>
        <h2 id='manage-levels-title'>{canAdmin ? 'Manage accreditation levels' : 'Accreditation levels'}</h2>
        <div className={styles.modalBody}>
          <p style={{ margin: 0 }}>
            Every level is available to every country. The <strong>code</strong> is what external PostgreSQL receives and never changes; the name can be
            renamed. Removing a level hides it, deletes its external rows, and keeps its Neon data so it can be restored.
          </p>
          <table className={styles.levelsTable}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Order</th>
                <th>Status</th>
                {canAdmin ? <th aria-label='Actions' /> : null}
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => {
                const draft = drafts[level.id] ?? { label: level.label, displayOrder: String(level.displayOrder) };
                const dirty = draft.label.trim() !== level.label || Number(draft.displayOrder) !== level.displayOrder;
                const running = runningId === level.id;
                return (
                  <tr key={level.id} className={level.isActive ? '' : styles.removedLevel}>
                    <td>
                      <code>{level.code}</code>
                    </td>
                    <td>
                      {canAdmin ? (
                        <input
                          value={draft.label}
                          onChange={(event) => setDrafts((prev) => ({ ...prev, [level.id]: { ...draft, label: event.target.value } }))}
                          aria-label={`Name of ${level.code}`}
                        />
                      ) : (
                        level.label
                      )}
                    </td>
                    <td>
                      {canAdmin ? (
                        <input
                          className={styles.orderInput}
                          type='number'
                          value={draft.displayOrder}
                          onChange={(event) => setDrafts((prev) => ({ ...prev, [level.id]: { ...draft, displayOrder: event.target.value } }))}
                          aria-label={`Display order of ${level.code}`}
                        />
                      ) : (
                        level.displayOrder
                      )}
                    </td>
                    <td>{level.isActive ? 'Active' : 'Removed'}</td>
                    {canAdmin ? (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type='button'
                          className={bikeStyles.bulkActionButton}
                          disabled={!dirty || running || !draft.label.trim()}
                          onClick={() => void patch(level, { label: draft.label, displayOrder: Number(draft.displayOrder) }, `Level ${level.code} saved.`)}
                        >
                          Save
                        </button>{' '}
                        {level.isActive ? (
                          confirmRemoveId === level.id ? (
                            <button
                              type='button'
                              className={`${bikeStyles.bulkActionButton} ${bikeStyles.bulkActionDestructive}`}
                              disabled={running}
                              onClick={() => void patch(level, { isActive: false }, `Level ${level.code} removed.`)}
                            >
                              {running ? 'Removing…' : 'Confirm remove'}
                            </button>
                          ) : (
                            <button type='button' className={`${bikeStyles.bulkActionButton} ${bikeStyles.bulkActionDestructive}`} disabled={running} onClick={() => setConfirmRemoveId(level.id)}>
                              Remove
                            </button>
                          )
                        ) : (
                          <button type='button' className={bikeStyles.bulkActionButton} disabled={running} onClick={() => void patch(level, { isActive: true }, `Level ${level.code} restored.`)}>
                            Restore
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canAdmin ? (
            <div className={styles.modalField}>
              <strong>Add level</strong>
              <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder='e.g. Platinum' aria-label='New level name' />
              <button type='button' className={`${bikeStyles.bulkActionButton} ${bikeStyles.bulkActionPrimary}`} disabled={!newLabel.trim() || runningId === 'new'} onClick={() => void create()}>
                {runningId === 'new' ? 'Adding…' : 'Add'}
              </button>
            </div>
          ) : (
            <p className={bikeStyles.guardNote}>You need Admin access on this page to add, rename or remove levels.</p>
          )}
          {error ? (
            <div className={`${bikeStyles.message} ${bikeStyles.messageError}`} role='alert'>
              {error}
            </div>
          ) : null}
        </div>
        <div className='confirmModalActions'>
          <button type='button' className='confirmModalCancel' onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

