import Link from 'next/link';
import { getQPartSummary } from '@/lib/qpart/parts/service';

export const dynamic = 'force-dynamic';

export default async function QPartLandingRoute() {
  const summary = await getQPartSummary();

  return (
    <section className="pageRoot">
      <div className="pageHeader">
        <h1>QPart — Spare Parts PIM</h1>
        <p>Isolated spare-part management domain under /qpart with dynamic hierarchy, metadata, translations, and compatibility.</p>
      </div>
      <div className="metricGrid">
        <div className="metric">
          <div className="metricLabel">Parts</div>
          <div className="metricValue">{summary.parts}</div>
        </div>
        <div className="metric">
          <div className="metricLabel">Hierarchy nodes</div>
          <div className="metricValue">{summary.hierarchyNodes}</div>
        </div>
        <div className="metric">
          <div className="metricLabel">Active metadata defs</div>
          <div className="metricValue">{summary.activeMetadataDefinitions}</div>
        </div>
      </div>
      <div className="tiles">
        <Link className="tile" href="/qpart/parts">
          <h3>Parts</h3>
          <p className="subtle">Browse, search, create, and edit spare parts with hierarchy and compatibility setup.</p>
        </Link>
        <Link className="tile" href="/qpart/hierarchy">
          <h3>Hierarchy</h3>
          <p className="subtle">Manage hierarchy levels 1 to 7 and parent-child constraints.</p>
        </Link>
        <Link className="tile" href="/qpart/metadata">
          <h3>Metadata</h3>
          <p className="subtle">Create and maintain dynamic metadata field definitions.</p>
        </Link>
        <Link className="tile" href="/qpart/compatibility">
          <h3>Compatibility reference</h3>
          <p className="subtle">Manage reusable bike-type feature/option pairs and derivation preview.</p>
        </Link>

        <Link className="tile" href="/qpart/admin/sequences">
          <h3>DB sequence maintenance</h3>
          <p className="subtle">Inspect and resync sequence-backed primary keys after manual Neon data edits.</p>
        </Link>
      </div>
    </section>
  );
}
