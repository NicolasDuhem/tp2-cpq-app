'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardPageData } from '@/lib/dashboard/service';
import styles from './dashboard-page.module.css';

type Props = { data: DashboardPageData };

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatPct = (value: number) => `${Math.round(value)}%`;

function healthClass(health: 'strong' | 'mixed' | 'weak' | 'none') {
  if (health === 'strong') return styles.healthStrong;
  if (health === 'mixed') return styles.healthMixed;
  if (health === 'weak') return styles.healthWeak;
  return styles.healthNone;
}

export default function DashboardPage({ data }: Props) {
  const router = useRouter();
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });

  const coverageByCountry = useMemo(() => {
    const map = new Map<string, { active: number; inactive: number }>();
    for (const row of data.coverageRows) {
      const bucket = map.get(row.countryCode) ?? { active: 0, inactive: 0 };
      bucket.active += row.activeCount;
      bucket.inactive += row.inactiveCount;
      map.set(row.countryCode, bucket);
    }
    return map;
  }, [data.coverageRows]);

  const countryBars = useMemo(() => {
    const grouped = [...coverageByCountry.entries()].map(([country, values]) => ({ country, ...values, total: values.active + values.inactive }));
    return grouped.sort((a, b) => b.total - a.total).slice(0, 16);
  }, [coverageByCountry]);

  const maxCountryTotal = Math.max(1, ...countryBars.map((item) => item.total));

  const featureBars = useMemo(() => data.pictureFeatures.slice(0, 12), [data.pictureFeatures]);
  const maxFeatureTotal = Math.max(1, ...featureBars.map((item) => item.total));

  const heatmapCountries = data.countries.slice(0, 18);

  return (
    <div className={`pageRoot ${styles.dashboardPage}`}>
      <header className={styles.header}>
        <div>
          <h1>Dashboard</h1>
          <p>
            Executive operations view across territory coverage, bike-type readiness, and picture-management completion.
          </p>
        </div>
        <div className={styles.generatedAt}>Updated {new Date(data.generatedAt).toLocaleString()}</div>
      </header>

      <section className={styles.kpiGrid}>
        <button className={styles.kpiCard} onClick={() => router.push('/sales/bike-allocation')}>
          <span>Active configurations total</span>
          <strong>{formatNumber(data.kpi.activeConfigurations)}</strong>
        </button>
        <button className={styles.kpiCard} onClick={() => router.push('/sales/bike-allocation')}>
          <span>Inactive configurations total</span>
          <strong>{formatNumber(data.kpi.inactiveConfigurations)}</strong>
        </button>
        <button className={styles.kpiCard} onClick={() => router.push('/sales/bike-allocation')}>
          <span>Territories covered</span>
          <strong>{formatNumber(data.kpi.territoriesCovered)}</strong>
        </button>
        <button className={styles.kpiCard} onClick={() => router.push('/sales/bike-allocation')}>
          <span>Bike types covered</span>
          <strong>{formatNumber(data.kpi.bikeTypesCovered)}</strong>
        </button>
        <button className={styles.kpiCard} onClick={() => router.push('/sales/bike-allocation')}>
          <span>Territories with gaps</span>
          <strong>{formatNumber(data.kpi.territoriesWithGaps)}</strong>
        </button>
        <button className={styles.kpiCard} onClick={() => router.push('/cpq/setup?tab=pictures&onlyMissingPicture=true')}>
          <span>Features missing pictures</span>
          <strong>{formatNumber(data.kpi.featuresMissingPictures)}</strong>
        </button>
        <button className={styles.kpiCard} onClick={() => router.push('/cpq/setup?tab=pictures')}>
          <span>Picture coverage</span>
          <strong>{formatPct(data.kpi.pictureCoveragePct)}</strong>
        </button>
      </section>

      <section className={styles.twoCol}>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Territory coverage map</h2>
            <div className={styles.mapControls}>
              <button onClick={() => setMapZoom((z) => Math.min(2.4, z + 0.2))}>＋</button>
              <button onClick={() => setMapZoom((z) => Math.max(1, z - 0.2))}>－</button>
              <button onClick={() => { setMapZoom(1); setMapPan({ x: 0, y: 0 }); }}>Reset</button>
            </div>
          </div>
          <p className={styles.subtle}>Click a territory marker to open Sales bike allocation filtered to that country.</p>
          <div
            className={styles.mapViewport}
            onMouseMove={(event) => {
              if ((event.buttons & 1) === 0) return;
              setMapPan((prev) => ({
                x: Math.max(-24, Math.min(24, prev.x + event.movementX * 0.2)),
                y: Math.max(-16, Math.min(16, prev.y + event.movementY * 0.2)),
              }));
            }}
          >
            <svg viewBox="0 0 100 55" className={styles.mapSvg}>
              <rect x="1" y="1" width="98" height="53" rx="4" className={styles.mapOcean} />
              <g transform={`translate(${mapPan.x} ${mapPan.y}) scale(${mapZoom})`}>
                {data.territoryPoints.map((point) => {
                  const coverage = Math.max(0.15, point.totalBikeTypes ? point.activeBikeTypes / point.totalBikeTypes : 0);
                  const radius = 1.4 + coverage * 2.8;
                  return (
                    <g key={point.countryCode}>
                      <circle
                        cx={point.x}
                        cy={(point.y * 0.55) + 1.2}
                        r={radius}
                        className={styles.mapPoint}
                        onClick={() => router.push(`/sales/bike-allocation?country_code=${encodeURIComponent(point.countryCode)}`)}
                      >
                        <title>{`${point.countryCode} (${point.countryName}) • Active bike types ${point.activeBikeTypes}/${point.totalBikeTypes}`}</title>
                      </circle>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </article>

        <article className={styles.card}>
          <h2>Active vs inactive share</h2>
          <div className={styles.donutRow}>
            <div
              className={styles.donut}
              style={{
                background: `conic-gradient(#1f7a43 0 ${data.extras.activeSharePct}%, #cf3948 ${data.extras.activeSharePct}% 100%)`,
              }}
            />
            <div className={styles.legendList}>
              <button onClick={() => router.push('/sales/bike-allocation')}>
                <span className={styles.legendDotActive} /> Active {formatPct(data.extras.activeSharePct)}
              </button>
              <button onClick={() => router.push('/sales/bike-allocation')}>
                <span className={styles.legendDotInactive} /> Inactive {formatPct(data.extras.inactiveSharePct)}
              </button>
            </div>
          </div>
          <h3>Ruleset count by bike type</h3>
          <div className={styles.miniBars}>
            {data.extras.rulesetsByBikeType.slice(0, 8).map((item) => (
              <button key={item.bikeType} onClick={() => router.push(`/sales/bike-allocation?bike_type=${encodeURIComponent(item.bikeType)}`)}>
                <span>{item.bikeType}</span>
                <strong>{item.rulesetCount}</strong>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.twoCol}>
        <article className={styles.card}>
          <h2>Configuration coverage by territory</h2>
          <p className={styles.subtle}>Stacked active/inactive totals by country. Click a bar to drill down.</p>
          <div className={styles.barList}>
            {countryBars.map((item) => (
              <button key={item.country} className={styles.barRow} onClick={() => router.push(`/sales/bike-allocation?country_code=${encodeURIComponent(item.country)}`)}>
                <span className={styles.barLabel}>{item.country}</span>
                <span className={styles.stackBar}>
                  <span className={styles.stackActive} style={{ width: `${(item.active / maxCountryTotal) * 100}%` }} />
                  <span className={styles.stackInactive} style={{ width: `${(item.inactive / maxCountryTotal) * 100}%` }} />
                </span>
                <span className={styles.barValue}>{item.total}</span>
              </button>
            ))}
          </div>
        </article>

        <article className={styles.card}>
          <h2>Picture completeness by feature</h2>
          <p className={styles.subtle}>Click missing/configured bars to jump into Picture management for that feature.</p>
          <div className={styles.barList}>
            {featureBars.map((item) => (
              <div key={item.featureLabel} className={styles.barRowStatic}>
                <span className={styles.barLabel}>{item.featureLabel}</span>
                <span className={styles.stackBar}>
                  <button
                    className={styles.featureConfigured}
                    style={{ width: `${(item.configured / maxFeatureTotal) * 100}%` }}
                    onClick={() => router.push(`/cpq/setup?tab=pictures&feature=${encodeURIComponent(item.featureLabel)}`)}
                    aria-label={`${item.featureLabel} configured`}
                  />
                  <button
                    className={styles.featureMissing}
                    style={{ width: `${(item.missing / maxFeatureTotal) * 100}%` }}
                    onClick={() => router.push(`/cpq/setup?tab=pictures&feature=${encodeURIComponent(item.featureLabel)}&onlyMissingPicture=true`)}
                    aria-label={`${item.featureLabel} missing`}
                  />
                </span>
                <span className={styles.barValue}>{item.missing}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.card}>
        <h2>Country × bike type heatmap</h2>
        <p className={styles.subtle}>{data.notes.heatmapLogic}</p>
        <div className={styles.heatmapWrap}>
          <table className={styles.heatmapTable}>
            <thead>
              <tr>
                <th>Country</th>
                {data.bikeTypes.map((bikeType) => (
                  <th key={bikeType}>
                    <button onClick={() => router.push(`/sales/bike-allocation?bike_type=${encodeURIComponent(bikeType)}`)}>{bikeType}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapCountries.map((countryCode) => (
                <tr key={countryCode}>
                  <td>
                    <button onClick={() => router.push(`/sales/bike-allocation?country_code=${encodeURIComponent(countryCode)}`)}>{countryCode}</button>
                  </td>
                  {data.bikeTypes.map((bikeType) => {
                    const cell = data.coverageRows.find((row) => row.countryCode === countryCode && row.bikeType === bikeType);
                    return (
                      <td key={`${countryCode}-${bikeType}`}>
                        <button
                          className={`${styles.heatCell} ${healthClass(cell?.health ?? 'none')}`}
                          onClick={() =>
                            router.push(
                              `/sales/bike-allocation?country_code=${encodeURIComponent(countryCode)}&bike_type=${encodeURIComponent(bikeType)}`,
                            )
                          }
                          title={
                            cell
                              ? `${countryCode} ${bikeType}: active ${cell.activeCount}, inactive ${cell.inactiveCount}`
                              : `${countryCode} ${bikeType}: not configured`
                          }
                        >
                          {cell?.totalCount ?? 0}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.twoCol}>
        <article className={styles.card}>
          <h2>Actionable gaps / priority list</h2>
          <div className={styles.gapList}>
            {data.gaps.map((item) => (
              <button key={`${item.label}-${item.href}`} className={styles.gapItem} onClick={() => router.push(item.href)}>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.hint}</p>
                </div>
                <span>{item.value}</span>
              </button>
            ))}
          </div>
        </article>

        <article className={styles.card}>
          <h2>Top gaps leaderboard</h2>
          <div className={styles.leaderboardGrid}>
            <div>
              <h3>Territories missing bike types</h3>
              {data.leaderboards.territoriesMissingCoverage.slice(0, 5).map((item) => (
                <button key={item.label} className={styles.rankItem} onClick={() => router.push(item.href)}>
                  <span>#{item.rank} {item.label}</span><strong>{item.metricValue}</strong>
                </button>
              ))}
            </div>
            <div>
              <h3>Bike types with weakest coverage</h3>
              {data.leaderboards.bikeTypesWeakCoverage.slice(0, 5).map((item) => (
                <button key={item.label} className={styles.rankItem} onClick={() => router.push(item.href)}>
                  <span>#{item.rank} {item.label}</span><strong>{item.metricValue}</strong>
                </button>
              ))}
            </div>
            <div>
              <h3>Features missing pictures</h3>
              {data.leaderboards.featuresMissingPictures.slice(0, 5).map((item) => (
                <button key={item.label} className={styles.rankItem} onClick={() => router.push(item.href)}>
                  <span>#{item.rank} {item.label}</span><strong>{item.metricValue}</strong>
                </button>
              ))}
            </div>
            <div>
              <h3>Inactive-heavy combinations</h3>
              {data.leaderboards.inactiveHeavyCombos.slice(0, 5).map((item) => (
                <button key={item.label} className={styles.rankItem} onClick={() => router.push(item.href)}>
                  <span>#{item.rank} {item.label}</span><strong>{item.metricValue}%</strong>
                </button>
              ))}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
