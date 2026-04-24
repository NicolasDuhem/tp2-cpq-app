'use client';

import { useEffect, useMemo, useState } from 'react';
import { QPartHierarchyNode } from '@/types/qpart';

const emptyDraft = { level: 1, code: '', label_en: '', parent_id: '', is_active: true };

export default function QPartHierarchyPage() {
  const [rows, setRows] = useState<QPartHierarchyNode[]>([]);
  const [levelFilter, setLevelFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ level: number; code: string; label_en: string; parent_id: string; is_active: boolean }>(emptyDraft);
  const [message, setMessage] = useState('');

  const load = async () => {
    const params = new URLSearchParams();
    if (levelFilter) params.set('level', levelFilter);
    const res = await fetch(`/api/qpart/hierarchy?${params.toString()}`);
    const payload = await res.json().catch(() => ({ rows: [] }));
    setRows(payload.rows || []);
  };

  useEffect(() => {
    void load();
  }, [levelFilter]);

  const availableParents = useMemo(() => rows.filter((row) => row.level === draft.level - 1), [rows, draft.level]);

  const save = async () => {
    const body = {
      level: draft.level,
      code: draft.code,
      label_en: draft.label_en,
      parent_id: draft.parent_id ? Number(draft.parent_id) : null,
      is_active: draft.is_active,
    };

    const res = await fetch(editingId ? `/api/qpart/hierarchy/${editingId}` : '/api/qpart/hierarchy', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(payload.error || 'Failed to save hierarchy node');
      return;
    }

    setMessage('Hierarchy node saved');
    setEditingId(null);
    setDraft(emptyDraft);
    await load();
  };

  const remove = async (id: number) => {
    await fetch(`/api/qpart/hierarchy/${id}`, { method: 'DELETE' });
    await load();
  };

  const edit = (row: QPartHierarchyNode) => {
    setEditingId(row.id);
    setDraft({
      level: row.level,
      code: row.code,
      label_en: row.label_en,
      parent_id: row.parent_id ? String(row.parent_id) : '',
      is_active: row.is_active,
    });
  };

  return (
    <section className="pageRoot">
      <div className="compactPageHeader">
        <div>
          <h1>QPart Hierarchy</h1>
          <p className="subtle">Manage hierarchy levels 1 through 7 with parent-level validation.</p>
        </div>
      </div>

      {message ? <div className="note">{message}</div> : null}

      <div className="card">
        <h3>{editingId ? 'Edit node' : 'Create node'}</h3>
        <div className="denseGrid4">
          <label>Level
            <select value={draft.level} onChange={(event) => setDraft((prev) => ({ ...prev, level: Number(event.target.value), parent_id: '' }))}>
              {[1, 2, 3, 4, 5, 6, 7].map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <label>Code<input value={draft.code} onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))} /></label>
          <label>English label<input value={draft.label_en} onChange={(event) => setDraft((prev) => ({ ...prev, label_en: event.target.value }))} /></label>
          <label>Parent
            <select value={draft.parent_id} onChange={(event) => setDraft((prev) => ({ ...prev, parent_id: event.target.value }))} disabled={draft.level === 1}>
              <option value="">{draft.level === 1 ? 'No parent' : 'Select parent'}</option>
              {availableParents.map((parent) => <option key={parent.id} value={parent.id}>{parent.parent_path || parent.label_en}</option>)}
            </select>
          </label>
        </div>
        <label className="inlineCheck"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((prev) => ({ ...prev, is_active: event.target.checked }))} />Active</label>
        <div className="rowButtons">
          <button className="primary" onClick={save}>Save</button>
          {editingId ? <button onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>Cancel edit</button> : null}
        </div>
      </div>

      <div className="toolbar">
        <label>Filter level
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="">All levels</option>
            {[1, 2, 3, 4, 5, 6, 7].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
      </div>

      <div className="tableWrap">
        <table>
          <thead><tr><th>Level</th><th>Code</th><th>Label</th><th>Parent path</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.level}</td>
                <td className="codeCell">{row.code}</td>
                <td>{row.label_en}</td>
                <td>{row.parent_path || '—'}</td>
                <td>{row.is_active ? 'Yes' : 'No'}</td>
                <td className="rowButtons">
                  <button onClick={() => edit(row)}>Edit</button>
                  <button onClick={() => remove(row.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6}>No hierarchy nodes found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
