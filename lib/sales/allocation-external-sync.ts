import 'server-only';

import { sql } from '@/lib/db/client';
import { buildBikeExternalSamplerPayload, buildQpartExternalSamplerPayload } from '@/lib/external-pg/cpq-sampler-result';
import {
  syncExternalVariantTablesBatch,
  syncExternalVariantTablesForPayload,
  type ExternalVariantTablesBatchSummary,
  type ExternalVariantTablesSyncResult,
} from '@/lib/external-pg/variant-tables';

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
  totalTargets: number;
  pushed: number;
  pendingBc: number;
  errors: number;
  variantsInserted: number;
  variantsUpdated: number;
  eligibilityInserted: number;
  eligibilityUpdated: number;
  skipped: number;
  timingsMs?: Record<string, number>;
};

export type AllocationExternalBcStatus = {
  ok: boolean;
  status: string;
  hasIds: boolean;
  bcProductId: number | null;
  bcVariantId: number | null;
};

export type BikeAllocationExternalSyncTarget = {
  ruleset: string;
  ipnCode: string;
  countryCode: string;
  detailId: string;
  active: boolean;
};

export type QPartAllocationExternalSyncTarget = {
  partId: number;
  sku: string;
  countryCode: string;
  active: boolean;
};

type StageTimer = {
  timingsMs: Record<string, number>;
  start: (stage: string) => () => void;
};

const FORECAST_CTY_CODE = 'F_BB';
const QPART_EXTERNAL_VALUE = 'Qpart';

const asTrimmed = (value: unknown) => String(value ?? '').trim();

function createStageTimer(prefix: string): StageTimer {
  const timingsMs: Record<string, number> = {};
  return {
    timingsMs,
    start(stage: string) {
      const startedAt = Date.now();
      return () => {
        const durationMs = Math.max(0, Date.now() - startedAt);
        timingsMs[stage] = (timingsMs[stage] ?? 0) + durationMs;
        console.info(`[${prefix}] ${stage} completed in ${durationMs}ms`);
      };
    },
  };
}

async function lookupBcOk(skuCode: string): Promise<AllocationExternalBcStatus> {
  const map = await lookupBcOkMap([skuCode]);
  return map.get(asTrimmed(skuCode)) ?? { ok: false, status: 'NOK', hasIds: false, bcProductId: null, bcVariantId: null };
}

export async function lookupBcOkMap(skuCodes: string[]): Promise<Map<string, AllocationExternalBcStatus>> {
  const skus = [...new Set(skuCodes.map(asTrimmed).filter(Boolean))];
  const result = new Map<string, AllocationExternalBcStatus>();
  if (!skus.length) return result;

  const rows = (await sql`
    with requested as (
      select value::text as sku_code
      from jsonb_array_elements_text(${JSON.stringify(skus)}::jsonb)
    ),
    ranked as (
      select
        coalesce(trim(map.sku_code), '') as sku_code,
        map.bc_product_id,
        map.bc_variant_id,
        map.bc_status,
        row_number() over (
          partition by coalesce(trim(map.sku_code), '')
          order by map.updated_at desc nulls last, map.id desc
        ) as rn
      from public.bc_item_variant_map map
      join requested on coalesce(trim(map.sku_code), '') = requested.sku_code
      where coalesce(trim(map.sku_code), '') <> ''
    )
    select sku_code, bc_product_id, bc_variant_id, bc_status
    from ranked
    where rn = 1
  `) as Array<{ sku_code: string | null; bc_product_id: number | null; bc_variant_id: number | null; bc_status: string | null }>;

  for (const row of rows) {
    const sku = asTrimmed(row.sku_code);
    if (!sku) continue;
    const hasIds = row.bc_product_id != null && row.bc_variant_id != null;
    const status = asTrimmed(row.bc_status).toUpperCase() || (hasIds ? 'UNKNOWN' : 'NOK');
    result.set(sku, {
      ok: hasIds && status === 'OK',
      status,
      hasIds,
      bcProductId: row.bc_product_id,
      bcVariantId: row.bc_variant_id,
    });
  }

  for (const sku of skus) {
    if (!result.has(sku)) {
      result.set(sku, { ok: false, status: 'NOK', hasIds: false, bcProductId: null, bcVariantId: null });
    }
  }

  return result;
}

export async function lookupLatestSamplerRulesetMap(skuCodes: string[]): Promise<Map<string, string | null>> {
  const skus = [...new Set(skuCodes.map(asTrimmed).filter(Boolean))];
  const result = new Map<string, string | null>();
  if (!skus.length) return result;

  const rows = (await sql`
    with requested as (
      select value::text as sku_code
      from jsonb_array_elements_text(${JSON.stringify(skus)}::jsonb)
    ),
    grouped as (
      select
        coalesce(trim(csr.ipn_code), '') as sku_code,
        csr.ruleset,
        max(csr.updated_at) as latest_updated_at,
        max(csr.created_at) as latest_created_at
      from public.cpq_sampler_result csr
      join requested on coalesce(trim(csr.ipn_code), '') = requested.sku_code
      where coalesce(trim(csr.ruleset), '') <> ''
      group by coalesce(trim(csr.ipn_code), ''), csr.ruleset
    ),
    ranked as (
      select
        sku_code,
        ruleset,
        row_number() over (
          partition by sku_code
          order by latest_updated_at desc nulls last, latest_created_at desc nulls last, ruleset asc
        ) as rn
      from grouped
    )
    select sku_code, ruleset
    from ranked
    where rn = 1
  `) as Array<{ sku_code: string | null; ruleset: string | null }>;

  for (const row of rows) {
    const sku = asTrimmed(row.sku_code);
    if (!sku) continue;
    result.set(sku, asTrimmed(row.ruleset) || null);
  }
  for (const sku of skus) {
    if (!result.has(sku)) result.set(sku, null);
  }
  return result;
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

function buildSummary(
  results: AllocationExternalSyncResult[],
  batchSummary?: ExternalVariantTablesBatchSummary,
  timingsMs?: Record<string, number>,
): AllocationExternalSyncSummary {
  return {
    attempted: results.length,
    totalTargets: results.length,
    pushed: results.filter((result) => result.state === 'pushed').length,
    pendingBc: results.filter((result) => result.state === 'pending_bc').length,
    errors: results.filter((result) => result.state === 'error').length,
    variantsInserted: batchSummary?.variantsInserted ?? results.filter((result) => result.variantAction === 'inserted').length,
    variantsUpdated: batchSummary?.variantsUpdated ?? results.filter((result) => result.variantAction === 'updated').length,
    eligibilityInserted: batchSummary?.eligibilityInserted ?? results.filter((result) => result.eligibilityAction === 'inserted').length,
    eligibilityUpdated: batchSummary?.eligibilityUpdated ?? results.filter((result) => result.eligibilityAction === 'updated').length,
    skipped: (batchSummary?.skipped ?? 0) + results.filter((result) => result.skipped).length,
    ...(timingsMs ? { timingsMs } : {}),
  };
}

export function summarizeAllocationExternalSync(results: AllocationExternalSyncResult[]): AllocationExternalSyncSummary {
  return buildSummary(results);
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

export async function syncBikeAllocationsToExternalIfBcOkBatch(
  targets: BikeAllocationExternalSyncTarget[],
): Promise<AllocationExternalSyncSummary> {
  const timer = createStageTimer('bike-allocation-external-bulk-sync');
  const endCollect = timer.start('collect targets');
  const normalizedTargetMap = new Map<string, { ruleset: string; sku: string; countryCode: string; detailId: string; active: boolean }>();
  for (const target of targets) {
    const sku = asTrimmed(target.ipnCode);
    const countryCode = asTrimmed(target.countryCode).toUpperCase();
    if (!sku || !countryCode) continue;
    normalizedTargetMap.set(`${sku}::${countryCode}`, {
      ruleset: asTrimmed(target.ruleset),
      sku,
      countryCode,
      detailId: asTrimmed(target.detailId) || 'Simulator',
      active: target.active === true,
    });
  }
  const normalizedTargets = [...normalizedTargetMap.values()];
  endCollect();

  const endBc = timer.start('load BC map');
  const bcMap = await lookupBcOkMap(normalizedTargets.map((target) => target.sku));
  endBc();

  const endRuleset = timer.start('load ruleset map');
  const rulesetMap = await lookupLatestSamplerRulesetMap(normalizedTargets.map((target) => target.sku));
  endRuleset();

  const results: AllocationExternalSyncResult[] = [];
  const pushable = [];
  for (const target of normalizedTargets) {
    const bc = bcMap.get(target.sku) ?? { ok: false, status: 'NOK', hasIds: false, bcProductId: null, bcVariantId: null };
    if (!bc.ok || bc.bcProductId == null || bc.bcVariantId == null) {
      results.push(pendingBcResult(target.sku, target.countryCode, bc.status, bc.hasIds));
      continue;
    }
    const ruleset = rulesetMap.get(target.sku) || null;
    if (!ruleset) {
      results.push(errorResult(target.sku, target.countryCode, new Error(`No cpq_sampler_result ruleset found for SKU ${target.sku}`)));
      continue;
    }
    pushable.push({ target, bc, ruleset });
  }

  let batchSummary: ExternalVariantTablesBatchSummary | undefined;
  if (pushable.length) {
    try {
      const endExternal = timer.start('external batch sync');
      const batch = await syncExternalVariantTablesBatch(
        pushable.map(({ target, bc, ruleset }) => ({
          sku: target.sku,
          countryCode: target.countryCode,
          detailId: target.detailId,
          isActive: target.active,
          bcProductId: bc.bcProductId as number,
          bcVariantId: bc.bcVariantId as number,
          forecastCtyCode: FORECAST_CTY_CODE,
          bblRuleSetItem: ruleset,
        })),
        {
          onStage(stage, details) {
            console.info('[bike-allocation-external-bulk-sync]', stage, details ?? {});
          },
        },
      );
      endExternal();
      batchSummary = batch.summary;
      batch.results.forEach((result, index) => {
        const target = pushable[index].target;
        if (!result.ok) {
          results.push(errorResult(target.sku, target.countryCode, new Error(result.message)));
          return;
        }
        results.push(pushedResult(target.sku, target.countryCode, result));
      });
    } catch (error) {
      for (const { target } of pushable) {
        results.push(errorResult(target.sku, target.countryCode, error));
      }
    }
  }

  const endComplete = timer.start('complete');
  const summary = buildSummary(results, batchSummary, timer.timingsMs);
  endComplete();
  return summary;
}

export async function syncQPartAllocationsToExternalIfBcOkBatch(
  targets: QPartAllocationExternalSyncTarget[],
): Promise<AllocationExternalSyncSummary> {
  const timer = createStageTimer('qpart-allocation-external-bulk-sync');
  const endCollect = timer.start('collect targets');
  const normalizedTargetMap = new Map<string, { sku: string; countryCode: string; active: boolean }>();
  for (const target of targets) {
    const sku = asTrimmed(target.sku);
    const countryCode = asTrimmed(target.countryCode).toUpperCase();
    if (!sku || !countryCode) continue;
    normalizedTargetMap.set(`${sku}::${countryCode}`, { sku, countryCode, active: target.active === true });
  }
  const normalizedTargets = [...normalizedTargetMap.values()];
  endCollect();

  const endBc = timer.start('load BC map');
  const bcMap = await lookupBcOkMap(normalizedTargets.map((target) => target.sku));
  endBc();

  const results: AllocationExternalSyncResult[] = [];
  const pushable = [];
  for (const target of normalizedTargets) {
    const bc = bcMap.get(target.sku) ?? { ok: false, status: 'NOK', hasIds: false, bcProductId: null, bcVariantId: null };
    if (!bc.ok || bc.bcProductId == null || bc.bcVariantId == null) {
      results.push(pendingBcResult(target.sku, target.countryCode, bc.status, bc.hasIds));
      continue;
    }
    pushable.push({ target, bc });
  }

  let batchSummary: ExternalVariantTablesBatchSummary | undefined;
  if (pushable.length) {
    try {
      const endExternal = timer.start('external batch sync');
      const batch = await syncExternalVariantTablesBatch(
        pushable.map(({ target, bc }) => ({
          sku: target.sku,
          countryCode: target.countryCode,
          detailId: QPART_EXTERNAL_VALUE,
          isActive: target.active,
          bcProductId: bc.bcProductId as number,
          bcVariantId: bc.bcVariantId as number,
          forecastCtyCode: QPART_EXTERNAL_VALUE,
          bblRuleSetItem: QPART_EXTERNAL_VALUE,
        })),
        {
          onStage(stage, details) {
            console.info('[qpart-allocation-external-bulk-sync]', stage, details ?? {});
          },
        },
      );
      endExternal();
      batchSummary = batch.summary;
      batch.results.forEach((result, index) => {
        const target = pushable[index].target;
        if (!result.ok) {
          results.push(errorResult(target.sku, target.countryCode, new Error(result.message)));
          return;
        }
        results.push(pushedResult(target.sku, target.countryCode, result));
      });
    } catch (error) {
      for (const { target } of pushable) {
        results.push(errorResult(target.sku, target.countryCode, error));
      }
    }
  }

  const endComplete = timer.start('complete');
  const summary = buildSummary(results, batchSummary, timer.timingsMs);
  endComplete();
  return summary;
}
