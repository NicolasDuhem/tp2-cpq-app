'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { QPartHierarchyNode, QPartRecord } from '@/types/qpart';

type LevelSelections = Record<number, string>;

const defaultSelections: LevelSelections = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' };

export default function QPartPartsListPage() {
  const [rows, setRows] = useState<QPartRecord[]>([]);
  const [hierarchyNodes, setHierarchyNodes] = useState<QPartHierarchyNode[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selections, setSelections] = useState<LevelSelections>(defaultSelections);

  const selectedHierarchyNodeId = useMemo(() => {
    for (let level = 7; level >= 1; level -= 1) {
      if (selections[level]) return Number(selections[level]);
    }
    return null;
  }, [selections]);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (selectedHierarchyNodeId) params.set('hierarchy_node_id', String(selectedHierarchyNodeId));

    const [partRes, hierarchyRes] = await Promise.all([
      fetch(`/api/qpart/parts?${params.toString()}`),
      fetch('/api/qpart/hierarchy'),
    ]);

    const partPayload = await partRes.json().catch(() => ({ rows: [] }));
    const hierarchyPayload = await hierarchyRes.json().catch(() => ({ rows: [] }));

    setRows(partPayload.rows || []);
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
        </div>
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
    </section>
  );
}
