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

  if (!isAdminModeReady) return <main className="opPage"><p className="opLoading">Loading admin mode state…</p></main>;
  if (!isAdminMode) {
    return (
      <main className="opPage">
        <header className="opHeader">
          <div className="opHeaderMain">
            <h1>Admin · Data point</h1>
            <p>Internal page-contract and data-flow registry.</p>
          </div>
        </header>
        <div className="opEmpty">
          <strong>Admin mode required</strong>
          Enable admin mode from the top navigation to view data contracts.
        </div>
      </main>
    );
  }

  return (
    <main className="opPage">
      <header className="opHeader">
        <div className="opHeaderMain">
          <h1>Admin · Data point</h1>
          <p>Internal page-contract and data-flow registry. Source paths are implementation-based and should be updated with code changes.</p>
        </div>
        <div className="opHeaderActions">
          <label className="opField" style={{ minWidth: 280 }}>
            Search pages / data points
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try: sampler_result, qpart, push, configure" />
          </label>
        </div>
      </header>

      <section className="dataPointLayout">
        <aside className="opPanel dataPointList">
          <div className="opSectionTitleRow">
            <h2 className="opSectionTitle">Pages</h2>
            <span className="opCount">{filteredPages.length}</span>
          </div>
          <div className="dataPointListItems">
            {filteredPages.map((p) => (
              <button
                key={p.route}
                type="button"
                aria-current={p.route === selected?.route ? 'true' : undefined}
                onClick={() => setSelectedRoute(p.route)}
                className={`dataPointItem${p.route === selected?.route ? ' isSelected' : ''}`}
              >
                <span className="dataPointItemName">{p.pageName}</span>
                <span className="secondaryText">{p.route}</span>
              </button>
            ))}
            {!filteredPages.length ? <div className="opEmpty"><strong>No matches</strong>Try a different search term.</div> : null}
          </div>
        </aside>

        {selected ? (
          <article className="opPanel opPanelStack dataPointDetail">
            <div>
              <h2 className="opModalTitle">{selected.pageName}</h2>
              <div className="dataPointMeta">
                <span><span className="k">Route</span> <span className="codeCellMono">{selected.route}</span></span>
                <span><span className="k">Access</span> {selected.access}</span>
                <span><span className="k">Feature flags</span> {selected.featureFlags?.join(', ') || 'None explicit in this registry'}</span>
              </div>
              <p className="secondaryText" style={{ margin: '6px 0 0' }}>{selected.purpose}</p>
            </div>

            <div className="opTableWrap opTableWrapViewport">
            <table className="opTable">
              <thead>
                <tr>
                  <th>Data point</th><th>Type</th><th>Source</th><th>Target / write path</th><th>Process/API</th><th>Attributes</th>
                </tr>
              </thead>
              <tbody>
                {selected.dataPoints.map((dp) => (
                  <tr key={dp.label}>
                    <td>
                      <div className="emphasis">{dp.label}</div>
                      <div className="secondaryText">{dp.behavior}</div>
                    </td>
                    <td>{dp.componentType}</td>
                    <td>{dp.source}</td>
                    <td>{dp.target ?? 'Read-only (no write target)'}</td>
                    <td>{dp.process ?? 'N/A'}</td>
                    <td>
                      <span className={dp.readOnly ? 'pill pillNeutral' : 'pill pillInfo'}>{dp.readOnly ? 'Read-only' : 'Editable'}</span>{' '}
                      <span className="secondaryText">{dp.dynamic ? 'Dynamic' : 'Static'}</span>
                      {dp.derived ? ' / Derived' : ''}
                      {dp.dependencies ? <div className="secondaryText">Depends on: {dp.dependencies}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </article>
        ) : (
          <article className="opPanel">
            <div className="opEmpty"><strong>No results</strong>Nothing matches the current search.</div>
          </article>
        )}
      </section>
    </main>
  );
}
