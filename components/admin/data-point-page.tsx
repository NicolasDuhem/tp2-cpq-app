'use client';

import { useMemo, useState } from 'react';
import { useAdminMode } from '@/components/shared/admin-mode-context';
import { PAGE_DATA_CONTRACTS } from '@/lib/admin/data-point-registry';

export default function DataPointPage() {
  const { isAdminMode, isAdminModeReady } = useAdminMode();
  const [query, setQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(PAGE_DATA_CONTRACTS[0]?.route ?? '');

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGE_DATA_CONTRACTS;
    return PAGE_DATA_CONTRACTS.filter((p) => {
      const haystack = [p.pageName, p.route, p.purpose, ...p.dataPoints.map((dp) => `${dp.label} ${dp.source} ${dp.target ?? ''}`)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const selected = filteredPages.find((p) => p.route === selectedRoute) ?? filteredPages[0];

  if (!isAdminModeReady) return <main className="panel"><p>Loading admin mode state…</p></main>;
  if (!isAdminMode) {
    return (
      <main className="panel">
        <h1>Admin - Data point</h1>
        <p>This page is internal-only. Enable admin mode from the top navigation to view data contracts.</p>
      </main>
    );
  }

  return (
    <main className="panel" style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Admin - Data point</h1>
        <p className="subtle" style={{ marginTop: 8 }}>
          Internal page-contract and data-flow registry. Source paths are implementation-based and should be updated with code changes.
        </p>
      </header>

      <label style={{ display: 'grid', gap: 6 }}>
        Search pages / data points
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try: sampler_result, qpart, push, configure" />
      </label>

      <section style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
        <aside className="panel" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <strong>Pages ({filteredPages.length})</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {filteredPages.map((p) => (
              <button
                key={p.route}
                type="button"
                onClick={() => setSelectedRoute(p.route)}
                style={{ textAlign: 'left', padding: 8, borderRadius: 8, border: p.route === selected?.route ? '2px solid #0ea5e9' : '1px solid #d1d5db' }}
              >
                <div style={{ fontWeight: 600 }}>{p.pageName}</div>
                <div className="subtle" style={{ fontSize: 12 }}>{p.route}</div>
              </button>
            ))}
          </div>
        </aside>

        {selected ? (
          <article className="panel" style={{ overflowX: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>{selected.pageName}</h2>
            <p><strong>Route:</strong> {selected.route}</p>
            <p><strong>Purpose:</strong> {selected.purpose}</p>
            <p><strong>Access:</strong> {selected.access}</p>
            <p><strong>Feature flags:</strong> {selected.featureFlags?.join(', ') || 'None explicit in this registry'}</p>

            <table>
              <thead>
                <tr>
                  <th>Data point</th><th>Type</th><th>Source</th><th>Target / write path</th><th>Process/API</th><th>Attributes</th>
                </tr>
              </thead>
              <tbody>
                {selected.dataPoints.map((dp) => (
                  <tr key={dp.label}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{dp.label}</div>
                      <div className="subtle" style={{ fontSize: 12 }}>{dp.behavior}</div>
                    </td>
                    <td>{dp.componentType}</td>
                    <td>{dp.source}</td>
                    <td>{dp.target ?? 'Read-only (no write target)'}</td>
                    <td>{dp.process ?? 'N/A'}</td>
                    <td>
                      {dp.readOnly ? 'Read-only' : 'Editable'} / {dp.dynamic ? 'Dynamic' : 'Static'}
                      {dp.derived ? ' / Derived' : ''}
                      {dp.dependencies ? <div className="subtle" style={{ fontSize: 12 }}>Depends on: {dp.dependencies}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ) : (
          <article className="panel">No results for current search.</article>
        )}
      </section>
    </main>
  );
}
