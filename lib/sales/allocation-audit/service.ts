import { sql } from '@/lib/db/client';

export type AllocationAuditEntityTypeFilter = 'all' | 'bike' | 'qpart';
export type AllocationAuditSortOrder = 'desc' | 'asc';

export type AllocationAuditQueryInput = {
  itemCode: string;
  entityType?: AllocationAuditEntityTypeFilter;
  countryCode?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  sort?: AllocationAuditSortOrder;
};

type AllocationAuditDbRow = {
  id: number;
  created_at: string | Date;
  actor_display_name: string | null;
  actor_email: string | null;
  page_key: string;
  source_process: string;
  entity_type: string;
  item_code: string;
  country_code: string | null;
  action_type: string;
  status_before: boolean | null;
  status_after: boolean | null;
  bigcommerce_status: string | null;
  metadata: Record<string, unknown> | null;
};

const MAX_LIMIT = 500;

const toIsoOrNull = (v?: string) => {
  const value = String(v ?? '').trim();
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function normalizeAllocationAuditQuery(input: AllocationAuditQueryInput) {
  const itemCode = String(input.itemCode ?? '').trim();
  const countryCode = String(input.countryCode ?? '').trim().toUpperCase() || null;
  const entityType = input.entityType === 'bike' || input.entityType === 'qpart' ? input.entityType : null;
  const limitRaw = Number(input.limit ?? 100);
  const offsetRaw = Number(input.offset ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limitRaw))) : 100;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.trunc(offsetRaw)) : 0;
  const sort = input.sort === 'asc' ? 'asc' : 'desc';

  return {
    itemCode,
    countryCode,
    entityType,
    dateFrom: toIsoOrNull(input.dateFrom),
    dateTo: toIsoOrNull(input.dateTo),
    limit,
    offset,
    sort,
  };
}

export async function getAllocationAuditHistory(input: AllocationAuditQueryInput) {
  const n = normalizeAllocationAuditQuery(input);
  if (!n.itemCode) return { rows: [], pagination: { limit: n.limit, offset: n.offset, totalRows: 0 } };

  const rows =
    n.sort === 'asc'
      ? ((await sql`
          select
            id,
            created_at,
            actor_display_name,
            actor_email,
            page_key,
            source_process,
            entity_type,
            item_code,
            country_code,
            action_type,
            status_before,
            status_after,
            bigcommerce_status,
            metadata
          from app_allocation_audit_log
          where lower(item_code) = lower(${n.itemCode})
          order by created_at asc
          limit ${n.limit}
          offset ${n.offset}
        `) as AllocationAuditDbRow[])
      : ((await sql`
          select
            id,
            created_at,
            actor_display_name,
            actor_email,
            page_key,
            source_process,
            entity_type,
            item_code,
            country_code,
            action_type,
            status_before,
            status_after,
            bigcommerce_status,
            metadata
          from app_allocation_audit_log
          where lower(item_code) = lower(${n.itemCode})
          order by created_at desc
          limit ${n.limit}
          offset ${n.offset}
        `) as AllocationAuditDbRow[]);

  const counts = (await sql`
    select count(*)::int as total
    from app_allocation_audit_log
    where lower(item_code) = lower(${n.itemCode})
  `) as Array<{ total: number }>;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      actorDisplayName: r.actor_display_name,
      actorEmail: r.actor_email,
      pageKey: r.page_key,
      sourceProcess: r.source_process,
      entityType: r.entity_type,
      itemCode: r.item_code,
      countryCode: r.country_code,
      actionType: r.action_type,
      statusBefore: r.status_before,
      statusAfter: r.status_after,
      bigcommerceStatus: r.bigcommerce_status,
      metadata: r.metadata ?? {},
    })),
    pagination: { limit: n.limit, offset: n.offset, totalRows: counts[0]?.total ?? 0 },
  };
}
