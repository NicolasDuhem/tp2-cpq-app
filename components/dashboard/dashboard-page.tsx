import PageHeader from '@/components/shared/PageHeader';
import type { AllocationBucket, DashboardPageData } from '@/lib/dashboard/service';
import styles from './dashboard-page.module.css';

type Props = { data: DashboardPageData };

const n = (v: number) => new Intl.NumberFormat('en-US').format(v);

function GroupTree({ rows }: { rows: AllocationBucket[] }) {
  const byRegion = new Map<string, AllocationBucket[]>();
  rows.forEach((r) => byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r]));
  return (
    <div className={styles.tree}>
      {[...byRegion.entries()].map(([region, regionRows]) => (
        <details key={region} open>
          <summary>+ / - Region: {region} <strong>{n(regionRows.reduce((a, r) => a + r.totalCount, 0))}</strong></summary>
          <div className={styles.treeInner}>{regionRows.map((r) => <div key={`${r.country}-${r.groupLabel}`} className={styles.row}>{r.subRegion} / {r.country} / {r.groupLabel}<span>{n(r.totalCount)} • OK {n(r.bcOkCount)} • NOK {n(r.bcNokCount)} • A {n(r.activeCount)} • I {n(r.inactiveCount)}</span></div>)}</div>
        </details>
      ))}
    </div>
  );
}

export default function DashboardPage({ data }: Props) {
  return (
    <div className={`pageRoot ${styles.page}`}>
      <PageHeader title='Operational Dashboard' actions={<span className={styles.updated}>Updated {new Date(data.generatedAt).toLocaleString()}</span>} />
      <form className={styles.filters}>
        <select name='region' defaultValue={data.filters.region}><option value=''>All regions</option>{data.filterOptions.regions.map((v) => <option key={v}>{v}</option>)}</select>
        <select name='sub_region' defaultValue={data.filters.subRegion}><option value=''>All sub-regions</option>{data.filterOptions.subRegions.map((v) => <option key={v}>{v}</option>)}</select>
        <select name='country' defaultValue={data.filters.country}><option value=''>All countries</option>{data.filterOptions.countries.map((v) => <option key={v}>{v}</option>)}</select>
        <select name='bike_type' defaultValue={data.filters.bikeType}><option value=''>All bike types</option>{data.filterOptions.bikeTypes.map((v) => <option key={v}>{v}</option>)}</select>
        <select name='h1' defaultValue={data.filters.hierarchyLevel1}><option value=''>All qpart hierarchy</option>{data.filterOptions.hierarchyLevel1.map((v) => <option key={v}>{v}</option>)}</select>
        <select name='bc_status' defaultValue={data.filters.bcStatus}><option value='all'>BC all</option><option value='ok'>BC OK</option><option value='nok'>BC NOK</option></select>
        <select name='active_status' defaultValue={data.filters.activeStatus}><option value='all'>Status all</option><option value='active'>Active</option><option value='inactive'>Inactive</option></select>
        <button type='submit'>Apply</button>
      </form>

      <section className={styles.grid2}>
        <article className={styles.card}><h3>Bike allocation health</h3><p>OK {n(data.bikeSummary.bcOkCount)} • NOK {n(data.bikeSummary.bcNokCount)} • Active {n(data.bikeSummary.activeCount)} • Inactive {n(data.bikeSummary.inactiveCount)}</p><GroupTree rows={data.bikeRows} /></article>
        <article className={styles.card}><h3>QPart allocation health</h3><p>OK {n(data.qpartSummary.bcOkCount)} • NOK {n(data.qpartSummary.bcNokCount)} • Active {n(data.qpartSummary.activeCount)} • Inactive {n(data.qpartSummary.inactiveCount)}</p><GroupTree rows={data.qpartRows} /></article>
      </section>

      <section className={styles.grid2}>
        <article className={styles.card}><h3>Recent update activity (last 24h)</h3><p>Total {n(data.audit.last24hTotal)} • Bike {n(data.audit.bikeUpdates)} • QPart {n(data.audit.qpartUpdates)} • Activated {n(data.audit.activeChanges)} • Deactivated {n(data.audit.inactiveChanges)} • Push events {n(data.audit.externalPushEvents)}</p><div className={styles.table}>{data.audit.recentRows.map((r) => <div key={`${r.createdAt}-${r.itemCode}`}>{new Date(r.createdAt).toLocaleString()} | {r.user} | {r.entityType} | {r.actionType} | {r.countryCode ?? '-'} | {r.itemCode}</div>)}</div></article>
        <article className={styles.card}><h3>Operational gaps</h3><div className={styles.gaps}>{data.operationalGaps.map((g) => <div key={g.label} className={g.severity === 'high' ? styles.high : styles.medium}><strong>{g.label}</strong><span>{n(g.value)}</span><small>{g.note}</small></div>)}</div><h4>Top users (24h)</h4>{data.audit.topUsers.map((u) => <div key={u.name}>{u.name}: {n(u.count)}</div>)}</article>
      </section>
    </div>
  );
}
