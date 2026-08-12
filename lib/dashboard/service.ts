import { sql } from '@/lib/db/client';

export type DashboardFilters = {
  region: string;
  subRegion: string;
  country: string;
  bikeType: string;
  hierarchyLevel1: string;
  bcStatus: 'all' | 'ok' | 'nok';
  activeStatus: 'all' | 'active' | 'inactive';
};

export type AllocationBucket = {
  region: string;
  subRegion: string;
  country: string;
  groupLabel: string;
  bcOkCount: number;
  bcNokCount: number;
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
};

export type AuditSummary = {
  last24hTotal: number;
  bikeUpdates: number;
  qpartUpdates: number;
  activeChanges: number;
  inactiveChanges: number;
  externalPushEvents: number;
  topUsers: Array<{ name: string; count: number }>;
  recentRows: Array<{ createdAt: string; user: string; entityType: string; actionType: string; countryCode: string | null; itemCode: string }>;
};

export type DashboardPageData = {
  generatedAt: string;
  filters: DashboardFilters;
  filterOptions: {
    regions: string[];
    subRegions: string[];
    countries: string[];
    bikeTypes: string[];
    hierarchyLevel1: string[];
  };
  bikeSummary: { bcOkCount: number; bcNokCount: number; activeCount: number; inactiveCount: number; totalCount: number };
  bikeRows: AllocationBucket[];
  qpartSummary: { bcOkCount: number; bcNokCount: number; activeCount: number; inactiveCount: number; totalCount: number };
  qpartRows: AllocationBucket[];
  audit: AuditSummary;
  operationalGaps: Array<{ label: string; severity: 'medium' | 'high'; value: number; note: string }>;
};

const t = (value: unknown) => String(value ?? '').trim();

function parseFilters(input: URLSearchParams): DashboardFilters {
  const bc = t(input.get('bc_status')).toLowerCase();
  const active = t(input.get('active_status')).toLowerCase();
  return {
    region: t(input.get('region')),
    subRegion: t(input.get('sub_region')),
    country: t(input.get('country')).toUpperCase(),
    bikeType: t(input.get('bike_type')),
    hierarchyLevel1: t(input.get('h1')),
    bcStatus: bc === 'ok' || bc === 'nok' ? bc : 'all',
    activeStatus: active === 'active' || active === 'inactive' ? active : 'all',
  };
}

export async function getDashboardPageData(searchParams?: Record<string, string | string[] | undefined>): Promise<DashboardPageData> {
  const params = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([k, v]) => {
    if (typeof v === 'string') params.set(k, v);
  });
  const filters = parseFilters(params);

  const [optionsRows, bikeRowsRaw, qpartRowsRaw, auditRowsRaw] = await Promise.all([
    sql`select distinct upper(trim(country_code)) as country, trim(region) as region, trim(sub_region) as sub_region from cpq_country_mappings where is_active = true`,
    sql`
      with sampler as (
        select
          upper(trim(sr.country_code)) as country,
          coalesce(nullif(trim(cm.region), ''), 'Unknown') as region,
          coalesce(nullif(trim(cm.sub_region), ''), 'Unknown') as sub_region,
          coalesce(nullif(trim(rs.bike_type), ''), 'Unmapped') as bike_type,
          coalesce(map.bc_status, 'UNKNOWN') as bc_status,
          coalesce(sr.active, false) as active
        from CPQ_sampler_result sr
        left join cpq_country_mappings cm on upper(trim(cm.country_code)) = upper(trim(sr.country_code)) and cm.is_active = true
        left join CPQ_setup_ruleset rs on trim(rs.cpq_ruleset) = trim(sr.ruleset)
        left join lateral (
          select bc_status
          from bc_item_variant_map m
          where coalesce(trim(m.sku_code), '') = coalesce(trim(sr.ipn_code), '')
          order by updated_at desc nulls last, id desc
          limit 1
        ) map on true
        where coalesce(trim(sr.country_code), '') <> '' and coalesce(trim(sr.ruleset), '') <> ''
      )
      select region, sub_region, country, bike_type as group_label,
        sum(case when upper(bc_status) = 'OK' then 1 else 0 end)::int as bc_ok_count,
        sum(case when upper(bc_status) = 'OK' then 0 else 1 end)::int as bc_nok_count,
        sum(case when active = true then 1 else 0 end)::int as active_count,
        sum(case when active = false then 1 else 0 end)::int as inactive_count,
        count(*)::int as total_count
      from sampler
      where (${filters.region} = '' or region = ${filters.region})
        and (${filters.subRegion} = '' or sub_region = ${filters.subRegion})
        and (${filters.country} = '' or country = ${filters.country})
        and (${filters.bikeType} = '' or bike_type = ${filters.bikeType})
        and (${filters.bcStatus} = 'all' or (${filters.bcStatus} = 'ok' and upper(bc_status) = 'OK') or (${filters.bcStatus} = 'nok' and upper(bc_status) <> 'OK'))
        and (${filters.activeStatus} = 'all' or (${filters.activeStatus} = 'active' and active = true) or (${filters.activeStatus} = 'inactive' and active = false))
      group by region, sub_region, country, bike_type
      order by region, sub_region, country, bike_type
    `,
    sql`
      with q as (
        select
          upper(trim(a.country_code)) as country,
          coalesce(nullif(trim(cm.region), ''), 'Unknown') as region,
          coalesce(nullif(trim(cm.sub_region), ''), 'Unknown') as sub_region,
          coalesce(nullif(trim(h1.label_en), ''), 'Unmapped') as h1,
          coalesce(map.bc_status, 'UNKNOWN') as bc_status,
          coalesce(a.active, false) as active
        from qpart_country_allocation a
        join qpart_parts p on p.id = a.part_id
        left join qpart_hierarchy_nodes h0 on h0.id = p.hierarchy_node_id
        left join qpart_hierarchy_nodes h1 on h1.id = case when h0.level = 1 then h0.id else h0.parent_id end
        left join cpq_country_mappings cm on upper(trim(cm.country_code)) = upper(trim(a.country_code)) and cm.is_active = true
        left join lateral (
          select bc_status
          from bc_item_variant_map m
          where coalesce(trim(m.sku_code), '') = coalesce(trim(p.part_number), '')
          order by updated_at desc nulls last, id desc
          limit 1
        ) map on true
      )
      select region, sub_region, country, h1 as group_label,
        sum(case when upper(bc_status) = 'OK' then 1 else 0 end)::int as bc_ok_count,
        sum(case when upper(bc_status) = 'OK' then 0 else 1 end)::int as bc_nok_count,
        sum(case when active = true then 1 else 0 end)::int as active_count,
        sum(case when active = false then 1 else 0 end)::int as inactive_count,
        count(*)::int as total_count
      from q
      where (${filters.region} = '' or region = ${filters.region})
        and (${filters.subRegion} = '' or sub_region = ${filters.subRegion})
        and (${filters.country} = '' or country = ${filters.country})
        and (${filters.hierarchyLevel1} = '' or h1 = ${filters.hierarchyLevel1})
        and (${filters.bcStatus} = 'all' or (${filters.bcStatus} = 'ok' and upper(bc_status) = 'OK') or (${filters.bcStatus} = 'nok' and upper(bc_status) <> 'OK'))
        and (${filters.activeStatus} = 'all' or (${filters.activeStatus} = 'active' and active = true) or (${filters.activeStatus} = 'inactive' and active = false))
      group by region, sub_region, country, h1
      order by region, sub_region, country, h1
    `,
    sql`
      select created_at, coalesce(nullif(trim(actor_display_name), ''), nullif(trim(actor_email), ''), 'System') as actor_name,
        entity_type, action_type, country_code, item_code, source_process
      from app_allocation_audit_log
      where created_at >= now() - interval '24 hours'
      order by created_at desc
      limit 200
    `,
  ]);

  const opts = optionsRows as Array<{ country: string | null; region: string | null; sub_region: string | null }>;
  const bikeRows = (bikeRowsRaw as Array<any>).map((r) => ({ region: t(r.region), subRegion: t(r.sub_region), country: t(r.country), groupLabel: t(r.group_label), bcOkCount: Number(r.bc_ok_count ?? 0), bcNokCount: Number(r.bc_nok_count ?? 0), activeCount: Number(r.active_count ?? 0), inactiveCount: Number(r.inactive_count ?? 0), totalCount: Number(r.total_count ?? 0) }));
  const qpartRows = (qpartRowsRaw as Array<any>).map((r) => ({ region: t(r.region), subRegion: t(r.sub_region), country: t(r.country), groupLabel: t(r.group_label), bcOkCount: Number(r.bc_ok_count ?? 0), bcNokCount: Number(r.bc_nok_count ?? 0), activeCount: Number(r.active_count ?? 0), inactiveCount: Number(r.inactive_count ?? 0), totalCount: Number(r.total_count ?? 0) }));
  const auditRows = auditRowsRaw as Array<any>;

  const sum = (rows: AllocationBucket[]) => rows.reduce((a, r) => ({ bcOkCount: a.bcOkCount + r.bcOkCount, bcNokCount: a.bcNokCount + r.bcNokCount, activeCount: a.activeCount + r.activeCount, inactiveCount: a.inactiveCount + r.inactiveCount, totalCount: a.totalCount + r.totalCount }), { bcOkCount: 0, bcNokCount: 0, activeCount: 0, inactiveCount: 0, totalCount: 0 });

  const topUsers = new Map<string, number>();
  auditRows.forEach((r) => topUsers.set(t(r.actor_name), (topUsers.get(t(r.actor_name)) ?? 0) + 1));

  return {
    generatedAt: new Date().toISOString(),
    filters,
    filterOptions: {
      regions: [...new Set(opts.map((r) => t(r.region)).filter(Boolean))].sort(),
      subRegions: [...new Set(opts.map((r) => t(r.sub_region)).filter(Boolean))].sort(),
      countries: [...new Set(opts.map((r) => t(r.country).toUpperCase()).filter(Boolean))].sort(),
      bikeTypes: [...new Set(bikeRows.map((r) => r.groupLabel).filter(Boolean))].sort(),
      hierarchyLevel1: [...new Set(qpartRows.map((r) => r.groupLabel).filter(Boolean))].sort(),
    },
    bikeSummary: sum(bikeRows),
    bikeRows,
    qpartSummary: sum(qpartRows),
    qpartRows,
    audit: {
      last24hTotal: auditRows.length,
      bikeUpdates: auditRows.filter((r) => t(r.entity_type) === 'bike').length,
      qpartUpdates: auditRows.filter((r) => t(r.entity_type) === 'qpart').length,
      activeChanges: auditRows.filter((r) => t(r.action_type) === 'activated').length,
      inactiveChanges: auditRows.filter((r) => t(r.action_type) === 'deactivated').length,
      externalPushEvents: auditRows.filter((r) => t(r.source_process).toLowerCase().includes('push') || t(r.action_type).toLowerCase().includes('push')).length,
      topUsers: [...topUsers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
      recentRows: auditRows.slice(0, 20).map((r) => ({ createdAt: new Date(r.created_at).toISOString(), user: t(r.actor_name), entityType: t(r.entity_type), actionType: t(r.action_type), countryCode: r.country_code ? t(r.country_code) : null, itemCode: t(r.item_code) })),
    },
    operationalGaps: [
      { label: 'Bike Active + BC NOK', severity: 'high', value: bikeRows.reduce((n, r) => n + Math.min(r.activeCount, r.bcNokCount), 0), note: 'Active bike rows that may fail BC-gated external sync.' },
      { label: 'QPart Active + BC NOK', severity: 'high', value: qpartRows.reduce((n, r) => n + Math.min(r.activeCount, r.bcNokCount), 0), note: 'Active qparts with NOK/unknown BC status.' },
      { label: 'Bike Inactive footprint', severity: 'medium', value: sum(bikeRows).inactiveCount, note: 'Rows currently inactive in CPQ sampler allocation.' },
      { label: 'QPart Inactive footprint', severity: 'medium', value: sum(qpartRows).inactiveCount, note: 'Rows currently inactive in qpart country allocation.' },
    ],
  };
}
