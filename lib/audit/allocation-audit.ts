import { sql } from '@/lib/db/client';
import { normalizeBCStatus, type BCStatus } from '@/lib/bigcommerce/item-map';

export type AllocationAuditActor = {
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
};

export type AllocationAuditRowInput = {
  actor?: AllocationAuditActor | null;
  pageKey: string;
  sourceProcess: string;
  entityType: 'bike' | 'qpart';
  itemCode: string;
  countryCode?: string | null;
  actionType: string;
  statusBefore: boolean | null;
  statusAfter: boolean | null;
  bigcommerceStatus?: BCStatus | null;
  metadata?: Record<string, unknown>;
};

const asTrim = (v: unknown) => String(v ?? '').trim();


export async function insertAllocationAuditRows(rows: AllocationAuditRowInput[]) {
  if (!rows.length) return { insertedCount: 0 };

  const payload = rows.map((row) => ({
    actor_user_id: asTrim(row.actor?.userId) || null,
    actor_email: asTrim(row.actor?.email) || null,
    actor_display_name: asTrim(row.actor?.displayName) || null,
    page_key: asTrim(row.pageKey),
    source_process: asTrim(row.sourceProcess),
    entity_type: row.entityType,
    item_code: asTrim(row.itemCode),
    country_code: asTrim(row.countryCode).toUpperCase() || null,
    bigcommerce_status: row.bigcommerceStatus == null ? null : normalizeBCStatus(row.bigcommerceStatus),
    action_type: asTrim(row.actionType),
    status_before: row.statusBefore,
    status_after: row.statusAfter,
    metadata: JSON.stringify(row.metadata ?? {}),
  }));

  await sql`
    insert into app_allocation_audit_log (
      actor_user_id,
      actor_email,
      actor_display_name,
      page_key,
      source_process,
      entity_type,
      item_code,
      country_code,
      bigcommerce_status,
      action_type,
      status_before,
      status_after,
      metadata
    )
    select
      p.actor_user_id,
      p.actor_email,
      p.actor_display_name,
      p.page_key,
      p.source_process,
      p.entity_type,
      p.item_code,
      p.country_code,
      p.bigcommerce_status,
      p.action_type,
      p.status_before,
      p.status_after,
      p.metadata::jsonb
    from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as p(
      actor_user_id text,
      actor_email text,
      actor_display_name text,
      page_key text,
      source_process text,
      entity_type text,
      item_code text,
      country_code text,
      bigcommerce_status text,
      action_type text,
      status_before boolean,
      status_after boolean,
      metadata text
    )
  `;

  return { insertedCount: rows.length };
}
