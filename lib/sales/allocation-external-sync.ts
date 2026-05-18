import 'server-only';

import { sql } from '@/lib/db/client';
import { buildBikeExternalSamplerPayload, buildQpartExternalSamplerPayload } from '@/lib/external-pg/cpq-sampler-result';
import { syncExternalVariantTablesForPayload, type ExternalVariantTablesSyncResult } from '@/lib/external-pg/variant-tables';

export type AllocationExternalSyncState = 'pushed' | 'pending_bc' | 'error';

export type AllocationExternalSyncResult = {
  state: AllocationExternalSyncState;
  sku: string;
  countryCode: string;
  message: string;
  skipped: boolean;
  variantAction?: 'inserted' | 'updated' | 'skipped';
  eligibilityAction?: 'inserted' | 'updated' | 'skipped';
  error?: string;
};

export type AllocationExternalSyncSummary = {
  attempted: number;
  pushed: number;
  pendingBc: number;
  errors: number;
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

async function lookupBcOk(skuCode: string): Promise<{ ok: boolean; status: string; hasIds: boolean }> {
  const sku = asTrimmed(skuCode);
  if (!sku) return { ok: false, status: 'NOK', hasIds: false };

  const rows = (await sql`
    select bc_product_id, bc_variant_id, bc_status
    from public.bc_item_variant_map
    where sku_code = ${sku}
    order by updated_at desc nulls last, id desc
    limit 1
  `) as Array<{ bc_product_id: number | null; bc_variant_id: number | null; bc_status: string | null }>;

  const row = rows[0];
  const hasIds = row?.bc_product_id != null && row?.bc_variant_id != null;
  const status = asTrimmed(row?.bc_status).toUpperCase() || (hasIds ? 'UNKNOWN' : 'NOK');
  return { ok: hasIds && status === 'OK', status, hasIds };
}

function pendingBcResult(sku: string, countryCode: string, status: string, hasIds: boolean): AllocationExternalSyncResult {
  const missingIds = hasIds ? '' : ' or missing BC product/variant IDs';
  return {
    state: 'pending_bc',
    sku,
    countryCode,
    skipped: true,
    message: `${sku} ${countryCode} saved internally, but external PostgreSQL push is pending because BC status is ${status}${missingIds}.`,
  };
}

function pushedResult(sku: string, countryCode: string, result: ExternalVariantTablesSyncResult): AllocationExternalSyncResult {
  if (result.skipped) {
    return {
      state: 'pending_bc',
      sku,
      countryCode,
      skipped: true,
      message: result.message,
      variantAction: result.variantResult.action,
      eligibilityAction: result.eligibilityResult.action,
    };
  }

  return {
    state: 'pushed',
    sku,
    countryCode,
    skipped: false,
    message: result.message,
    variantAction: result.variantResult.action,
    eligibilityAction: result.eligibilityResult.action,
  };
}

function errorResult(sku: string, countryCode: string, error: unknown): AllocationExternalSyncResult {
  const message = error instanceof Error ? error.message : 'External PostgreSQL push failed.';
  return { state: 'error', sku, countryCode, skipped: false, message, error: message };
}

export function summarizeAllocationExternalSync(results: AllocationExternalSyncResult[]): AllocationExternalSyncSummary {
  return {
    attempted: results.length,
    pushed: results.filter((result) => result.state === 'pushed').length,
    pendingBc: results.filter((result) => result.state === 'pending_bc').length,
    errors: results.filter((result) => result.state === 'error').length,
  };
}

export async function syncBikeAllocationToExternalIfBcOk(input: {
  ruleset: string;
  ipnCode: string;
  countryCode: string;
}): Promise<AllocationExternalSyncResult> {
  const ruleset = asTrimmed(input.ruleset);
  const sku = asTrimmed(input.ipnCode);
  const countryCode = asTrimmed(input.countryCode).toUpperCase();
  const bc = await lookupBcOk(sku);
  if (!bc.ok) return pendingBcResult(sku, countryCode, bc.status, bc.hasIds);

  try {
    const payload = await buildBikeExternalSamplerPayload({ ruleset, ipnCode: sku, countryCode });
    const result = await syncExternalVariantTablesForPayload({
      sku: payload.ipnCode,
      countryCode: payload.countryCode,
      detailId: payload.detailId,
      isActive: payload.active,
    });
    return pushedResult(sku, countryCode, result);
  } catch (error) {
    return errorResult(sku, countryCode, error);
  }
}

export async function syncQPartAllocationToExternalIfBcOk(input: {
  partId: number;
  countryCode: string;
}): Promise<AllocationExternalSyncResult> {
  const partId = Number(input.partId);
  const countryCode = asTrimmed(input.countryCode).toUpperCase();
  const partRows = (await sql`
    select part_number
    from qpart_parts
    where id = ${partId}
    limit 1
  `) as Array<{ part_number: string | null }>;
  const sku = asTrimmed(partRows[0]?.part_number);
  const bc = await lookupBcOk(sku);
  if (!bc.ok) return pendingBcResult(sku, countryCode, bc.status, bc.hasIds);

  try {
    const payload = await buildQpartExternalSamplerPayload({ partId, countryCode });
    const result = await syncExternalVariantTablesForPayload({
      sku: payload.ipnCode,
      countryCode: payload.countryCode,
      detailId: 'Qpart',
      isActive: payload.active,
      forecastCtyCodeOverride: 'Qpart',
      bblRuleSetItemOverride: 'Qpart',
    });
    return pushedResult(sku, countryCode, result);
  } catch (error) {
    return errorResult(sku, countryCode, error);
  }
}
