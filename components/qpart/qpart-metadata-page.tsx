'use client';

import { useEffect, useState } from 'react';
import { QPartMetadataDefinition } from '@/types/qpart';

const fieldTypes = ['text', 'long_text', 'number', 'boolean', 'date', 'single_select', 'multi_select'];
const emptyDraft = {
  key: '',
  label_en: '',
  field_type: 'text',
  is_translatable: false,
  is_required: false,
  is_active: true,
  display_order: 100,
  options_json: '[]',
  validation_json: '{}',
};

export default function QPartMetadataPage() {
  const [rows, setRows] = useState<QPartMetadataDefinition[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState('');

  const load = async () => {
    const res = await fetch('/api/qpart/metadata');
    const payload = await res.json().catch(() => ({ rows: [] }));
    setRows(payload.rows || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    const body = {
      ...draft,
      options_json: JSON.parse(draft.options_json || '[]'),
      validation_json: JSON.parse(draft.validation_json || '{}'),
    };

    const res = await fetch(editingId ? `/api/qpart/metadata/${editingId}` : '/api/qpart/metadata', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(payload.error || 'Failed to save metadata definition');
      return;
    }

    setMessage('Metadata definition saved');
    setEditingId(null);
    setDraft(emptyDraft);
    await load();
  };

  const remove = async (id: number) => {
    await fetch(`/api/qpart/metadata/${id}`, { method: 'DELETE' });
    await load();
  };

  const edit = (row: QPartMetadataDefinition) => {
    setEditingId(row.id);
    setDraft({
      key: row.key,
      label_en: row.label_en,
      field_type: row.field_type,
      is_translatable: row.is_translatable,
      is_required: row.is_required,
      is_active: row.is_active,
      display_order: row.display_order,
      options_json: JSON.stringify(row.options_json || []),
      validation_json: JSON.stringify(row.validation_json || {}),
    });
  };

  return (
    <section className="pageRoot">
      <div className="compactPageHeader">
        <div>
          <h1>QPart Metadata Definitions</h1>
          <p className="subtle">Create/edit dynamic metadata fields rendered on part forms without schema changes.</p>
        </div>
      </div>

      {message ? <div className="note">{message}</div> : null}

      <div className="card">
        <h3>{editingId ? 'Edit definition' : 'Create definition'}</h3>
        <div className="denseGrid4">
          <label>Internal key<input value={draft.key} onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value }))} /></label>
          <label>Label<input value={draft.label_en} onChange={(event) => setDraft((prev) => ({ ...prev, label_en: event.target.value }))} /></label>
          <label>Field type
            <select value={draft.field_type} onChange={(event) => setDraft((prev) => ({ ...prev, field_type: event.target.value }))}>
              {fieldTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>Display order
            <input type="number" value={draft.display_order} onChange={(event) => setDraft((prev) => ({ ...prev, display_order: Number(event.target.value) }))} />
          </label>
        </div>
        <div className="denseGrid4">
          <label>Options JSON<textarea rows={3} value={draft.options_json} onChange={(event) => setDraft((prev) => ({ ...prev, options_json: event.target.value }))} /></label>
          <label>Validation JSON<textarea rows={3} value={draft.validation_json} onChange={(event) => setDraft((prev) => ({ ...prev, validation_json: event.target.value }))} /></label>
        </div>
        <div className="rowButtons">
          <label className="inlineCheck"><input type="checkbox" checked={draft.is_translatable} onChange={(event) => setDraft((prev) => ({ ...prev, is_translatable: event.target.checked }))} />Translatable</label>
          <label className="inlineCheck"><input type="checkbox" checked={draft.is_required} onChange={(event) => setDraft((prev) => ({ ...prev, is_required: event.target.checked }))} />Required</label>
          <label className="inlineCheck"><input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft((prev) => ({ ...prev, is_active: event.target.checked }))} />Active</label>
        </div>
        <div className="rowButtons">
          <button className="primary" onClick={save}>Save</button>
          {editingId ? <button onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>Cancel edit</button> : null}
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead><tr><th>Key</th><th>Label</th><th>Type</th><th>Flags</th><th>Order</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="codeCell">{row.key}</td>
                <td>{row.label_en}</td>
                <td>{row.field_type}</td>
                <td>{row.is_translatable ? 'T' : '-'} / {row.is_required ? 'R' : '-'} / {row.is_active ? 'A' : 'I'}</td>
                <td>{row.display_order}</td>
                <td className="rowButtons"><button onClick={() => edit(row)}>Edit</button><button onClick={() => remove(row.id)}>Delete</button></td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6}>No metadata definitions configured.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
