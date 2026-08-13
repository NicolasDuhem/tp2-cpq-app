import type { AllocationBucket, DashboardPageData } from '@/lib/dashboard/service';
import styles from './dashboard-page.module.css';

type Props = { data: DashboardPageData };

const n = (v: number) => new Intl.NumberFormat('en-US').format(v);

/** Presentation only — renders the same buckets, grouped by their existing region field. */
function GroupTree({ rows }: { rows: AllocationBucket[] }) {
  const byRegion = new Map<string, AllocationBucket[]>();
  rows.forEach((r) => byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r]));
  if (!rows.length) return <div className="opEmpty"><strong>No rows</strong>Nothing matches the current filters.</div>;
  return (
    <div className={styles.tree}>
      {[...byRegion.entries()].map(([region, regionRows]) => (
        <details key={region} open>
          <summary>
            <span>{region}</span>
            <strong>{n(regionRows.reduce((a, r) => a + r.totalCount, 0))}</strong>
          </summary>
          <div className={styles.treeInner}>
            {regionRows.map((r) => (
              <div key={`${r.country}-${r.groupLabel}`} className={styles.row}>
                <span className={styles.rowLabel}>{r.subRegion} / {r.country} / {r.groupLabel}</span>
                <span className={styles.rowMetrics}>
                  <span className="pill pillInfo">{n(r.totalCount)}</span>
                  <span className="pill pillOk">OK {n(r.bcOkCount)}</span>
                  <span className="pill pillDanger">NOK {n(r.bcNokCount)}</span>
                  <span className="pill pillNeutral">A {n(r.activeCount)} / I {n(r.inactiveCount)}</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function SummaryMetrics({ summary }: { summary: { bcOkCount: number; bcNokCount: number; activeCount: number; inactiveCount: number } }) {
  return (
    <div className="opMetrics">
      <div className="opMetric opMetricOk"><span className="opMetricLabel">BC OK</span><span className="opMetricValue">{n(summary.bcOkCount)}</span></div>
      <div className="opMetric opMetricDanger"><span className="opMetricLabel">BC NOK</span><span className="opMetricValue">{n(summary.bcNokCount)}</span></div>
      <div className="opMetric"><span className="opMetricLabel">Active</span><span className="opMetricValue">{n(summary.activeCount)}</span></div>
      <div className="opMetric"><span className="opMetricLabel">Inactive</span><span className="opMetricValue">{n(summary.inactiveCount)}</span></div>
    </div>
  );
}

export default function DashboardPage({ data }: Props) {
  return (
    <div className={`opPage ${styles.page}`}>
      <header className="opHeader">
        <div className="opHeaderMain">
          <h1>Operational Dashboard</h1>
          <p>Allocation health, recent activity and operational gaps across bikes and QParts.</p>
        </div>
        <div className="opHeaderActions">
          <span className={styles.updated}>Updated {new Date(data.generatedAt).toLocaleString()}</span>
        </div>
      </header>

      <form className={`opPanel ${styles.filters}`}>
        <label className="opField">
          Region
          <select name="region" defaultValue={data.filters.region}><option value="">All regions</option>{data.filterOptions.regions.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label className="opField">
          Sub-region
          <select name="sub_region" defaultValue={data.filters.subRegion}><option value="">All sub-regions</option>{data.filterOptions.subRegions.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label className="opField">
          Country
          <select name="country" defaultValue={data.filters.country}><option value="">All countries</option>{data.filterOptions.countries.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label className="opField">
          Bike type
          <select name="bike_type" defaultValue={data.filters.bikeType}><option value="">All bike types</option>{data.filterOptions.bikeTypes.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label className="opField">
          QPart hierarchy
          <select name="h1" defaultValue={data.filters.hierarchyLevel1}><option value="">All qpart hierarchy</option>{data.filterOptions.hierarchyLevel1.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <label className="opField">
          BC status
          <select name="bc_status" defaultValue={data.filters.bcStatus}><option value="all">BC all</option><option value="ok">BC OK</option><option value="nok">BC NOK</option></select>
        </label>
        <label className="opField">
          Active status
          <select name="active_status" defaultValue={data.filters.activeStatus}><option value="all">Status all</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </label>
        <div className={styles.filterActions}>
          <button className="btn btnPrimary" type="submit">Apply</button>
        </div>
      </form>

      <section className={styles.grid2}>
        <article className={`opPanel ${styles.card}`}>
          <h2 className="opSectionTitle">Bike allocation health</h2>
          <SummaryMetrics summary={data.bikeSummary} />
          <GroupTree rows={data.bikeRows} />
        </article>
        <article className={`opPanel ${styles.card}`}>
          <h2 className="opSectionTitle">QPart allocation health</h2>
          <SummaryMetrics summary={data.qpartSummary} />
          <GroupTree rows={data.qpartRows} />
        </article>
      </section>

      <section className={styles.grid2}>
        <article className={`opPanel ${styles.card}`}>
          <h2 className="opSectionTitle">Recent update activity (last 24h)</h2>
          <div className="opMetrics">
            <div className="opMetric"><span className="opMetricLabel">Total</span><span className="opMetricValue">{n(data.audit.last24hTotal)}</span></div>
            <div className="opMetric"><span className="opMetricLabel">Bike</span><span className="opMetricValue">{n(data.audit.bikeUpdates)}</span></div>
            <div className="opMetric"><span className="opMetricLabel">QPart</span><span className="opMetricValue">{n(data.audit.qpartUpdates)}</span></div>
            <div className="opMetric opMetricOk"><span className="opMetricLabel">Activated</span><span className="opMetricValue">{n(data.audit.activeChanges)}</span></div>
            <div className="opMetric"><span className="opMetricLabel">Deactivated</span><span className="opMetricValue">{n(data.audit.inactiveChanges)}</span></div>
            <div className="opMetric"><span className="opMetricLabel">Push events</span><span className="opMetricValue">{n(data.audit.externalPushEvents)}</span></div>
          </div>
          {data.audit.recentRows.length ? (
            <div className={styles.table}>
              {data.audit.recentRows.map((r) => (
                <div key={`${r.createdAt}-${r.itemCode}`} className={styles.activityRow}>
                  <span className={styles.activityTime}>{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="codeCellMono">{r.itemCode}</span>
                  <span className="secondaryText">{r.entityType} · {r.actionType} · {r.countryCode ?? '—'}</span>
                  <span className="secondaryText">{r.user}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="opEmpty"><strong>No activity</strong>No allocation changes recorded in the last 24 hours.</div>
          )}
        </article>

        <article className={`opPanel ${styles.card}`}>
          <h2 className="opSectionTitle">Operational gaps</h2>
          {data.operationalGaps.length ? (
            <div className={styles.gaps}>
              {data.operationalGaps.map((g) => (
                <div key={g.label} className={g.severity === 'high' ? styles.high : styles.medium}>
                  <div className={styles.gapTop}>
                    <strong>{g.label}</strong>
                    <span className={styles.gapValue}>{n(g.value)}</span>
                  </div>
                  <small>{g.note}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="opEmpty"><strong>No gaps</strong>Nothing flagged for the current filters.</div>
          )}
          <h3 className="opSectionTitle" style={{ marginTop: 4 }}>Top users (24h)</h3>
          {data.audit.topUsers.length ? (
            <div className={styles.topUsers}>
              {data.audit.topUsers.map((u) => (
                <div key={u.name} className={styles.row}>
                  <span>{u.name}</span>
                  <span className="pill pillInfo">{n(u.count)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="opLoading">No user activity in the last 24 hours.</p>
          )}
        </article>
      </section>
    </div>
  );
}
