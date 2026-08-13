'use client';
import { useEffect, useMemo, useState } from 'react';

type Row = { id:number; createdAt:string; actorDisplayName:string|null; actorEmail:string|null; pageKey:string; sourceProcess:string; entityType:string; itemCode:string; countryCode:string|null; actionType:string; statusBefore:boolean|null; statusAfter:boolean|null; bigcommerceStatus:string|null; metadata:Record<string, unknown>; };

// Presentation only: maps an existing boolean status to a pill tone.
const statusPill = (value: boolean | null) => {
  if (value == null) return <span className="secondaryText">—</span>;
  return <span className={value ? 'pill pillOk' : 'pill pillNeutral'}>{value ? 'Active' : 'Inactive'}</span>;
};

const bcPill = (value: string | null) => {
  if (!value) return <span className="secondaryText">—</span>;
  const normalized = value.trim().toUpperCase();
  const tone = normalized === 'OK' ? 'pillOk' : normalized === 'NOK' || normalized === 'ERR' ? 'pillDanger' : 'pillNeutral';
  return <span className={`pill ${tone}`}>{value}</span>;
};

export default function AllocationAuditPageClient({ initialItemCode }: { initialItemCode: string }) {
  const [itemCode, setItemCode] = useState(initialItemCode);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState('all');
  const [sort, setSort] = useState<'asc'|'desc'>('desc');
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    if (!itemCode.trim()) return;
    setLoading(true);
    const qs = new URLSearchParams({ itemCode: itemCode.trim(), entityType, sort });
    const res = await fetch(`/api/sales/allocation-audit?${qs.toString()}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setSearched(true);
    setLoading(false);
  }

  useEffect(() => { if (initialItemCode.trim()) void runSearch(); }, []);

  const summary = useMemo(() => ({ count: rows.length, first: rows[rows.length-1]?.createdAt ?? null, last: rows[0]?.createdAt ?? null }), [rows]);

  return (
    <main className="opPage">
      <header className="opHeader">
        <div className="opHeaderMain">
          <h1>Allocation audit history</h1>
          <p>Search a bike or QPart code to see its Active/Inactive and creation history.</p>
        </div>
        {rows.length ? (
          <div className="opHeaderActions">
            <span className="opCount">{summary.count} record{summary.count === 1 ? '' : 's'}</span>
          </div>
        ) : null}
      </header>

      <section className="opPanel">
        <form
          className="opBar"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <label className="opField" style={{ minWidth: 280, flex: 1 }}>
            Item code
            <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Enter bike IPN/SKU or QPart code" />
          </label>
          <label className="opField" style={{ minWidth: 120 }}>
            Type
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="all">All</option>
              <option value="bike">Bike</option>
              <option value="qpart">QPart</option>
            </select>
          </label>
          <label className="opField" style={{ minWidth: 140 }}>
            Order
            <select value={sort} onChange={(e) => setSort(e.target.value as 'asc'|'desc')}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
          <div className="opBarGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnPrimary" type="submit" disabled={loading || !itemCode.trim()}>
              {loading ? 'Searching…' : 'Search'}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => { setItemCode(''); setRows([]); setSearched(false); }}
            >
              Clear
            </button>
          </div>
        </form>
      </section>

      {rows.length ? (
        <div className="opBar">
          <span className="opCount">Item {itemCode}</span>
          <span className="opBarNote">First event {summary.first ? new Date(summary.first).toLocaleString() : '—'}</span>
          <span className="opBarNote">Last event {summary.last ? new Date(summary.last).toLocaleString() : '—'}</span>
        </div>
      ) : null}

      {loading ? <p className="opLoading">Loading…</p> : null}

      {!loading && !rows.length ? (
        <div className="opEmpty">
          <strong>{searched ? 'No audit records found' : 'Nothing searched yet'}</strong>
          {searched ? 'No allocation history exists for that item code and filter combination.' : 'Enter an item code above to view its audit history.'}
        </div>
      ) : null}

      {rows.length ? (
        <div className="opTableWrap opTableWrapTall">
          <table className="opTable">
            <thead>
              <tr>
                <th>Date/time</th>
                <th>Item code</th>
                <th>Type</th>
                <th>Country</th>
                <th>Action</th>
                <th>Before</th>
                <th>After</th>
                <th>BC status</th>
                <th>User</th>
                <th>Source</th>
                <th>Page</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrapCell">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="codeCellMono">{r.itemCode}</td>
                  <td>{r.entityType}</td>
                  <td>{r.countryCode ?? '—'}</td>
                  <td>{r.actionType}</td>
                  <td>{statusPill(r.statusBefore)}</td>
                  <td>{statusPill(r.statusAfter)}</td>
                  <td>{bcPill(r.bigcommerceStatus)}</td>
                  <td>
                    {r.actorDisplayName ?? 'System / Unknown'}
                    {r.actorEmail ? <div className="secondaryText">{r.actorEmail}</div> : null}
                  </td>
                  <td className="secondaryText">{r.sourceProcess}</td>
                  <td className="secondaryText">{r.pageKey}</td>
                  <td>
                    <details>
                      <summary className="btn btnSmall btnGhost" style={{ display: 'inline-flex' }}>View</summary>
                      <pre className="apiDocsExample" style={{ marginTop: 6, maxWidth: 420 }}>{JSON.stringify(r.metadata ?? {}, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
