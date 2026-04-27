'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QPartAllocationStatus,
  SalesQPartAllocationFilterOptions,
  SalesQPartAllocationRow,
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

const defaultHierarchySelection: LevelSelection = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function statusLabel(status: QPartAllocationStatus) {
  return status === 'active' ? 'Active' : 'Inactive';
}

export default function SalesQPartAllocationTableClient({ rows, countryColumns, filterOptions }: Props) {
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [partNumberSearch, setPartNumberSearch] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [hierarchySelection, setHierarchySelection] = useState<LevelSelection>(defaultHierarchySelection);
  const [metadataSelection, setMetadataSelection] = useState<MetadataSelection>({});
  const [countrySelection, setCountrySelection] = useState<string[]>([]);
  const [statusSelection, setStatusSelection] = useState<QPartAllocationStatus[]>([]);
  const [bulkCountrySelection, setBulkCountrySelection] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<Message>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pushBusyKey, setPushBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const selectedBulkCountries = useMemo(
    () => countryColumns.filter((countryCode) => bulkCountrySelection[countryCode]),
    [bulkCountrySelection, countryColumns],
  );

  const visibleCountries = useMemo(
    () => (countrySelection.length ? countryColumns.filter((countryCode) => countrySelection.includes(countryCode)) : countryColumns),
    [countryColumns, countrySelection],
  );

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
      options[field.key] = uniqueSorted(
        hierarchyFilteredRows.flatMap((row) => row.metadataValues[field.key] ?? []),
      );
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
        stage?: string;
        result?: { action: 'inserted' | 'updated' };
      };

      if (!response.ok || !payload.result) {
        const detail = [
          payload.errorType ? `type=${payload.errorType}` : null,
          payload.stage ? `stage=${payload.stage}` : null,
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
    if (!selectedBulkCountries.length) {
      setMessage({ type: 'error', text: 'Select at least one target country for bulk update.' });
      return;
    }

    const label = targetStatus === 'active' ? 'Activate' : 'Deactivate';
    const confirmed = window.confirm(
      `${label} ${filteredRows.length} visible part(s) for ${selectedBulkCountries.length} country column(s): ${selectedBulkCountries.join(', ')}?`,
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
          countryCodes: selectedBulkCountries,
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

  return (
    <>
      <section className={styles.filterPanel}>
        <button type="button" className={styles.collapseToggle} onClick={() => setFiltersOpen((prev) => !prev)}>
          {filtersOpen ? 'Hide filters' : 'Show filters'}
        </button>

        {filtersOpen ? (
          <div className={styles.filters}>
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
                <label className={styles.filterItem} key={`h${level}`}>
                  <span>Hierarchy {level}</span>
                  <select
                    multiple
                    value={hierarchySelection[level] ?? []}
                    onChange={(event) =>
                      setHierarchyLevel(
                        level,
                        Array.from(event.target.selectedOptions).map((option) => option.value),
                      )
                    }
                    className={styles.multiSelect}
                  >
                    {hierarchyOptions[level].map((option) => (
                      <option key={`h${level}-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}

            {filterOptions.metadataFields.map((field) => (
              <label className={styles.filterItem} key={field.key}>
                <span>{field.label}</span>
                <select
                  multiple
                  value={metadataSelection[field.key] ?? []}
                  onChange={(event) =>
                    setMetadataSelection((prev) => ({
                      ...prev,
                      [field.key]: Array.from(event.target.selectedOptions).map((option) => option.value),
                    }))
                  }
                  className={styles.multiSelect}
                >
                  {(metadataOptions[field.key] ?? []).map((option) => (
                    <option key={`${field.key}-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            <label className={styles.filterItem}>
              <span>Countries</span>
              <select
                multiple
                value={countrySelection}
                onChange={(event) => setCountrySelection(Array.from(event.target.selectedOptions).map((option) => option.value))}
                className={styles.multiSelect}
              >
                {filterOptions.countries.map((countryCode) => (
                  <option key={countryCode} value={countryCode}>
                    {countryCode}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterItem}>
              <span>Allocation status</span>
              <select
                multiple
                value={statusSelection}
                onChange={(event) =>
                  setStatusSelection(
                    Array.from(event.target.selectedOptions).map((option) => option.value as QPartAllocationStatus),
                  )
                }
                className={styles.multiSelect}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        ) : null}
      </section>

      <section className={styles.bulkActions}>
        <div className={styles.bulkSummary}>Visible rows: {filteredRows.length}</div>
        <div className={styles.bulkCountryList}>
          {countryColumns.map((countryCode) => (
            <label key={`bulk-${countryCode}`} className={styles.bulkCountryItem}>
              <input
                type="checkbox"
                checked={Boolean(bulkCountrySelection[countryCode])}
                onChange={(event) =>
                  setBulkCountrySelection((prev) => ({
                    ...prev,
                    [countryCode]: event.target.checked,
                  }))
                }
                disabled={bulkBusy}
              />
              {countryCode}
            </label>
          ))}
        </div>
        <div className={styles.bulkButtons}>
          <button type="button" onClick={() => void runBulk('active')} disabled={bulkBusy}>
            {bulkBusy ? 'Working…' : 'Bulk activate'}
          </button>
          <button type="button" onClick={() => void runBulk('inactive')} disabled={bulkBusy}>
            {bulkBusy ? 'Working…' : 'Bulk deactivate'}
          </button>
        </div>
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
                <th className={styles.stickyFirstColumn}>Part</th>
                <th>English title</th>
                <th>Hierarchy</th>
                {visibleCountries.map((countryCode) => (
                  <th key={`head-${countryCode}`}>{countryCode}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.partId}>
                  <td className={styles.stickyFirstColumn}>
                    <Link href={`/qpart/parts/${row.partId}`}>{row.partNumber}</Link>
                  </td>
                  <td>
                    <Link href={`/qpart/parts/${row.partId}`}>{row.englishTitle}</Link>
                  </td>
                  <td>{row.hierarchySummary || '—'}</td>
                  {visibleCountries.map((countryCode) => {
                    const status = row.countryStatuses[countryCode] ?? 'inactive';
                    const cellKey = `${row.partId}:${countryCode}`;
                    return (
                      <td key={`${row.partId}-${countryCode}`}>
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
