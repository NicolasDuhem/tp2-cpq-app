'use client';

import { useEffect, useState } from 'react';

type ReferenceValue = {
  id: number;
  bike_type: string;
  feature_label: string;
  option_value: string;
  option_label: string | null;
  is_active: boolean;
};

const emptyDraft = { bike_type: '', feature_label: '', option_value: '', option_label: '', is_active: true };

export default function QPartCompatibilityPage() {
  const [rows, setRows] = useState<ReferenceValue[]>([]);
  const [bikeTypes, setBikeTypes] = useState<string[]>([]);
  const [selectedBikeTypes, setSelectedBikeTypes] = useState<string[]>([]);
  const [deriveRows, setDeriveRows] = useState<Array<Record<string, unknown>>>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);

  const load = async () => {
    const [refRes, bikeTypeRes] = await Promise.all([
      fetch('/api/qpart/compatibility/reference-values'),
      fetch('/api/qpart/bike-types'),
    ]);

    const refPayload = await refRes.json().catch(() => ({ rows: [] }));
    const bikeTypePayload = await bikeTypeRes.json().catch(() => ({ bikeTypes: [] }));

    setRows(refPayload.rows || []);
    setBikeTypes(bikeTypePayload.bikeTypes || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    await fetch(editingId ? `/api/qpart/compatibility/reference-values/${editingId}` : '/api/qpart/compatibility/reference-values', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setEditingId(null);
    setDraft(emptyDraft);
    await load();
  };

  const derive = async () => {
    const res = await fetch('/api/qpart/compatibility/derive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bike_types: selectedBikeTypes }),
    });
    const payload = await res.json().catch(() => ({ rows: [] }));
    setDeriveRows(payload.rows || []);
  };

  return (
    <section className="pageRoot">
      <div className="compactPageHeader">
        <div>
          <h1>QPart Compatibility Reference</h1>
          <p className="subtle">Manage manual/reference feature-option values and preview derived candidates from sampler JSON.</p>
        </div>
      </div>

      <div className="card">
        <h3>{editingId ? 'Edit reference value' : 'Create reference value'}</h3>
        <div className="denseGrid4">
          <label>Bike type<input value={draft.bike_type} onChange={(event) => setDraft((prev) => ({ ...prev, bike_type: event.target.value }))} /></label>
          <label>Feature label<input value={draft.feature_label} onChange={(event) => setDraft((prev) => ({ ...prev, feature_label: event.target.value }))} /></label>
          <label>Option value<input value={draft.option_value} onChange={(event) => setDraft((prev) => ({ ...prev, option_value: event.target.value }))} /></label>
          <label>Option label<input value={draft.option_label} onChange={(event) => setDraft((prev) => ({ ...prev, option_label: event.target.value }))} /></label>
        </div>
        <label className="inlineCheck"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((prev) => ({ ...prev, is_active: event.target.checked }))} />Active</label>
        <button className="primary" onClick={save}>Save</button>
      </div>

      <div className="card">
        <h3>Derive preview from CPQ_sampler_result</h3>
        <label>Bike types
          <select multiple className="multiSelect" value={selectedBikeTypes} onChange={(event) => setSelectedBikeTypes(Array.from(event.target.selectedOptions).map((opt) => opt.value))}>
            {bikeTypes.map((bikeType) => <option key={bikeType} value={bikeType}>{bikeType}</option>)}
          </select>
        </label>
        <button onClick={derive}>Preview derived candidates</button>
        <div className="tableWrap" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Bike type</th><th>Feature</th><th>Option value</th><th>Option label</th><th>Source</th></tr></thead>
            <tbody>
              {deriveRows.map((row, index) => (
                <tr key={index}><td>{String(row.bike_type || '')}</td><td>{String(row.feature_label || '')}</td><td>{String(row.option_value || '')}</td><td>{String(row.option_label || '')}</td><td>{String(row.source || '')}</td></tr>
              ))}
              {!deriveRows.length ? <tr><td colSpan={5}>No derived rows yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead><tr><th>Bike type</th><th>Feature</th><th>Option value</th><th>Option label</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.bike_type}</td>
                <td>{row.feature_label}</td>
                <td>{row.option_value}</td>
                <td>{row.option_label || '—'}</td>
                <td>{row.is_active ? 'Yes' : 'No'}</td>
                <td className="rowButtons">
                  <button onClick={() => { setEditingId(row.id); setDraft({ bike_type: row.bike_type, feature_label: row.feature_label, option_value: row.option_value, option_label: row.option_label || '', is_active: row.is_active }); }}>Edit</button>
                  <button onClick={async () => { await fetch(`/api/qpart/compatibility/reference-values/${row.id}`, { method: 'DELETE' }); await load(); }}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6}>No reference values configured.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
