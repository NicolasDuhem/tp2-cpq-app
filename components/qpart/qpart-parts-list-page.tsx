'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { QPartHierarchyNode, QPartRecord } from '@/types/qpart';

type LevelSelections = Record<number, string>;

const defaultSelections: LevelSelections = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' };

export default function QPartPartsListPage() {
  const [rows, setRows] = useState<QPartRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 200, totalRows: 0, totalPages: 1 });
  const [hierarchyNodes, setHierarchyNodes] = useState<QPartHierarchyNode[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<Record<string, unknown> | null>(null);
  const [importError, setImportError] = useState('');
  const [selections, setSelections] = useState<LevelSelections>(defaultSelections);

  const selectedHierarchyNodeId = useMemo(() => {
    for (let level = 7; level >= 1; level -= 1) {
      if (selections[level]) return Number(selections[level]);
    }
    return null;
  }, [selections]);

  const load = async (nextPage = 1) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (selectedHierarchyNodeId) params.set('hierarchy_node_id', String(selectedHierarchyNodeId));
    params.set('page', String(nextPage));
    params.set('page_size', String(pagination.pageSize));

    const [partRes, hierarchyRes] = await Promise.all([
      fetch(`/api/qpart/parts?${params.toString()}`),
      fetch('/api/qpart/hierarchy'),
    ]);

    const partPayload = await partRes.json().catch(() => ({ rows: [] }));
    const hierarchyPayload = await hierarchyRes.json().catch(() => ({ rows: [] }));

    setRows(partPayload.rows || []);
    setPagination(partPayload.pagination || { page: 1, pageSize: pagination.pageSize, totalRows: 0, totalPages: 1 });
    setHierarchyNodes(hierarchyPayload.rows || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [search, selectedHierarchyNodeId]);

  const getLevelOptions = (level: number) => {
    if (level === 1) return hierarchyNodes.filter((node) => node.level === 1);
    const parentId = selections[level - 1];
    if (!parentId) return [];
    return hierarchyNodes.filter((node) => node.level === level && String(node.parent_id ?? '') === parentId);
  };

  const onLevelSelect = (level: number, value: string) => {
    const next = { ...selections, [level]: value };
    for (let l = level + 1; l <= 7; l += 1) next[l] = '';
    setSelections(next);
  };

  const runImport = async (dryRun: boolean) => {
    if (!importFile) {
      setImportError('Choose a CSV file first.');
      return;
    }

    setImporting(true);
    setImportError('');
    setImportSummary(null);

    const formData = new FormData();
    formData.set('file', importFile);
    formData.set('dry_run', dryRun ? 'true' : 'false');

    const res = await fetch('/api/qpart/parts/import', {
      method: 'POST',
      body: formData,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload.summary) {
      setImportError(payload.error || 'Import failed');
      setImporting(false);
      return;
    }

    setImportSummary(payload.summary || null);
    setImporting(false);
    if (!dryRun && res.ok) await load(pagination.page);
  };

  const pageItems = useMemo(() => {
    const page = pagination.page;
    const total = pagination.totalPages;
    const around = [page - 1, page, page + 1, page + 2].filter((value) => value >= 1 && value <= total);
    return [1, ...around, total].filter((value, index, array) => array.indexOf(value) === index).sort((a, b) => a - b);
  }, [pagination.page, pagination.totalPages]);

  return (
    <section className="pageRoot">
      <div className="compactPageHeader">
        <div>
          <h1>QPart Parts</h1>
          <p className="subtle">Search and manage spare parts under isolated /qpart APIs.</p>
        </div>
        <div className="rowButtons">
          <Link className="tab" href="/qpart">Back to QPart home</Link>
          <Link className="tab tabActive" href="/qpart/parts/new">Create part</Link>
          <a className="tab" href="/api/qpart/parts/export">Export CSV</a>
        </div>
      </div>

      <div className="card">
        <h3>CSV import</h3>
        <p className="subtle">CSV uses business columns with dynamic metadata and locale translation fields. Preview (dry-run) before apply.</p>
        <div className="rowButtons">
          <input type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
          <button className="tab" onClick={() => void runImport(true)} disabled={importing}>{importing ? 'Running…' : 'Preview import'}</button>
          <button className="primary" onClick={() => void runImport(false)} disabled={importing}>{importing ? 'Applying…' : 'Apply import'}</button>
        </div>
        {importError ? <p className="errorText">{importError}</p> : null}
        {importSummary ? (
          <div className="note" style={{ marginTop: 12 }}>
            <strong>Summary:</strong>{' '}
            created {String(importSummary.created ?? 0)}, updated {String(importSummary.updated ?? 0)}, skipped {String(importSummary.skipped ?? 0)}, errors {String(importSummary.errors ?? 0)}
            <details style={{ marginTop: 8 }}>
              <summary>Row details</summary>
              <pre>{JSON.stringify(importSummary.rowResults ?? [], null, 2)}</pre>
            </details>
          </div>
        ) : null}
      </div>

      <div className="denseGrid4">
        <label>
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Part number or name" />
        </label>
        {Array.from({ length: 7 }).map((_, index) => {
          const level = index + 1;
          const options = getLevelOptions(level);
          return (
            <label key={level}>
              Hierarchy L{level}
              <select value={selections[level]} onChange={(event) => onLevelSelect(level, event.target.value)}>
                <option value="">All</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label_en}</option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Part number</th>
              <th>English title</th>
              <th>Hierarchy path</th>
              <th>Status</th>
              <th>Compatibility</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="codeCell">{row.part_number}</td>
                <td>{row.default_name}</td>
                <td>{row.hierarchy_path || '—'}</td>
                <td><span className={`statusBadge ${row.status === 'active' ? 'active' : 'inactive'}`}>{row.status}</span></td>
                <td>{row.bike_types.join(', ') || 'None'} ({row.compatibility_count})</td>
                <td>{row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}</td>
                <td><Link className="tab" href={`/qpart/parts/${row.id}`}>Edit</Link></td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7}>{loading ? 'Loading…' : 'No parts found'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rowButtons" style={{ justifyContent: 'space-between' }}>
        <span className="subtle">Page {pagination.page} of {pagination.totalPages} ({pagination.totalRows} rows)</span>
        <div className="rowButtons">
          <button className="tab" onClick={() => void load(Math.max(1, pagination.page - 1))} disabled={pagination.page <= 1}>Prev</button>
          {pageItems.map((item, index) => (
            <span key={item}>
              {index > 0 && item - pageItems[index - 1] > 1 ? <span className="subtle">… </span> : null}
              <button className={`tab ${item === pagination.page ? 'tabActive' : ''}`} onClick={() => void load(item)}>{item}</button>
            </span>
          ))}
          <button className="tab" onClick={() => void load(Math.min(pagination.totalPages, pagination.page + 1))} disabled={pagination.page >= pagination.totalPages}>Next</button>
        </div>
      </div>
    </section>
  );
}
