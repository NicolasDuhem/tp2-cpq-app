'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminMode } from '@/components/shared/admin-mode-context';

type SequenceRow = {
  table_schema: string;
  table_name: string;
  pk_column: string;
  sequence_schema: string;
  sequence_name: string;
  sequence_fq_name: string;
  sequence_last_value: number;
  sequence_is_called: boolean;
  sequence_next_value: number;
  table_max_id: number;
  expected_next_value: number;
  status: 'in_sync' | 'out_of_sync';
};

const asTableName = (row: SequenceRow) => `${row.table_schema}.${row.table_name}`;

export default function QPartSequenceAdminPage() {
  const { isAdminMode, isAdminModeReady } = useAdminMode();
  const [rows, setRows] = useState<SequenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningTable, setRunningTable] = useState('');
  const [message, setMessage] = useState('');

  const outOfSyncCount = useMemo(() => rows.filter((row) => row.status === 'out_of_sync').length, [rows]);

  const load = useCallback(async () => {
    if (!isAdminMode) return;
    setLoading(true);
    setMessage('');

    const res = await fetch('/api/admin/db-sequences', {
      headers: { 'x-admin-mode': 'true' },
    });
    const payload = await res.json().catch(() => ({ rows: [] }));

    if (!res.ok) {
      setRows([]);
      setMessage(payload.error || 'Failed to load sequence health.');
      setLoading(false);
      return;
    }

    setRows(payload.rows || []);
    setLoading(false);
  }, [isAdminMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const resyncTable = async (table: string) => {
    setRunningTable(table);
    setMessage('');

    const res = await fetch('/api/admin/db-sequences/resync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-mode': 'true' },
      body: JSON.stringify({ table }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(payload.error || `Failed to resync ${table}.`);
      setRunningTable('');
      return;
    }

    setMessage(`Resynced ${table} successfully.`);
    setRunningTable('');
    await load();
  };

  const resyncAll = async () => {
    setRunningTable('__all__');
    setMessage('');

    const res = await fetch('/api/admin/db-sequences/resync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-mode': 'true' },
      body: JSON.stringify({ all: true }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(payload.error || 'Failed to resync all sequences.');
      setRunningTable('');
      return;
    }

    const repaired = Array.isArray(payload.rows)
      ? payload.rows.filter((row: SequenceRow & { previous_sequence_next_value?: number }) => row.previous_sequence_next_value !== row.sequence_next_value).length
      : 0;
    setMessage(`Resync complete. ${repaired} table(s) adjusted.`);
    setRunningTable('');
    await load();
  };

  if (!isAdminModeReady) {
    return (
      <section className="pageRoot">
        <p className="subtle">Loading admin mode…</p>
      </section>
    );
  }

  if (!isAdminMode) {
    return (
      <section className="pageRoot">
        <div className="compactPageHeader">
          <div>
            <h1>DB Sequence maintenance</h1>
            <p className="subtle">Admin-only utility to inspect and repair sequence-backed primary keys.</p>
          </div>
          <div className="rowButtons">
            <Link className="tab" href="/qpart">Back to QPart home</Link>
          </div>
        </div>
        <div className="note">
          This page requires admin mode. Use <strong>Open as admin</strong> in the top ribbon first.
        </div>
      </section>
    );
  }

  return (
    <section className="pageRoot">
      <div className="compactPageHeader">
        <div>
          <h1>DB Sequence maintenance</h1>
          <p className="subtle">Detect and repair sequence drift caused by manual SQL upload/download/edit operations.</p>
        </div>
        <div className="rowButtons">
          <Link className="tab" href="/qpart">Back to QPart home</Link>
          <button className="tab" onClick={() => void load()} disabled={loading || runningTable.length > 0}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="primary" onClick={() => void resyncAll()} disabled={loading || runningTable.length > 0 || !rows.length}>
            {runningTable === '__all__' ? 'Resyncing…' : 'Resync all'}
          </button>
        </div>
      </div>

      {message ? <div className="note">{message}</div> : null}

      <div className="card" style={{ marginBottom: 12 }}>
        <strong>Out-of-sync tables:</strong> {outOfSyncCount} / {rows.length}
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>PK</th>
              <th>Sequence</th>
              <th>Current next value</th>
              <th>Table max(id)</th>
              <th>Expected next</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const table = asTableName(row);
              const isBusy = runningTable === table || runningTable === '__all__';
              return (
                <tr key={`${table}:${row.pk_column}`}>
                  <td className="codeCell">{table}</td>
                  <td>{row.pk_column}</td>
                  <td className="codeCell">{row.sequence_fq_name}</td>
                  <td>{row.sequence_next_value}</td>
                  <td>{row.table_max_id}</td>
                  <td>{row.expected_next_value}</td>
                  <td>
                    <span className={`statusBadge ${row.status === 'out_of_sync' ? 'inactive' : 'active'}`}>
                      {row.status === 'out_of_sync' ? 'Out of sync' : 'In sync'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="tab"
                      disabled={isBusy}
                      onClick={() => void resyncTable(table)}
                    >
                      {runningTable === table ? 'Resyncing…' : 'Resync'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={8}>{loading ? 'Loading…' : 'No sequence-backed integer PK tables found.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
