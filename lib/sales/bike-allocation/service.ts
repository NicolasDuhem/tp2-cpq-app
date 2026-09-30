import { sql } from '@/lib/db/client';
import { listAccountContexts, listCountryMappings } from '@/lib/cpq/setup/service';
import {
  buildAllocationExportRecords,
  buildCountryTerritoryIndex,
  buildPaginationItems,
  buildTerritoryRegions,
  decodeFeatureFilters,
  encodeFeatureFilters,
  rowMatchesAllocationStatuses,
  type AllocationExportRecord,
  type AllocationStatusValue,
  type TerritoryRegion,
} from '@/lib/sales/allocation-territory';
import {
  syncBikeAllocationToExternalIfBcOk,
  syncBikeAllocationsToExternalIfBcOkBatch,
} from '@/lib/sales/allocation-external-sync';
import { insertAllocationAuditRows, type AllocationAuditActor } from '@/lib/audit/allocation-audit';
import { normalizeBCStatus } from '@/lib/bigcommerce/item-map';

export type SalesBikeAllocationFilters = {
  ruleset?: string;
  /**
   * Legacy single-country deep-link parameter (e.g. dashboard links to
   * `/sales/bike-allocation?country_code=GB`). It is normalized into
   * `countryCodes` so there is exactly one territory model at runtime.
   */
  country_code?: string;
  bike_type?: string;
  /** Territory selection: the single source of truth for country scope. */
  countryCodes?: string[];
  /** `ipn_code` contains-search, applied server-side before pagination. */
  ipnSearch?: string;
  /** Allocation-status selection, applied server-side before pagination. */
  allocationStatuses?: AllocationStatusValue[];
  /** `{ featureLabel: containsText }`, applied server-side before pagination. */
  featureFilters?: Record<string, string>;
};

/** Filters after normalization; list fields are always present. */
export type NormalizedSalesBikeAllocationFilters = {
  ruleset: string;
  country_code: string;
  bike_type: string;
  countryCodes: string[];
  ipnSearch: string;
  allocationStatuses: AllocationStatusValue[];
  featureFilters: Record<string, string>;
};

type SamplerRow = {
  id: number;
  ipn_code: string | null;
  ruleset: string | null;
  country_code: string | null;
  account_code: string | null;
  customer_id: string | null;
  currency: string | null;
  language: string | null;
  namespace: string | null;
  header_id: string | null;
  detail_id: string | null;
  active: boolean | string | number | null;
  json_result: unknown;
  has_bc_ids: boolean | null;
  bc_status: string | null;
};

type ParsedOption = {
  featureLabel: string;
  resolvedValue: string;
};

type ReplaySelectedOption = {
  featureLabel: string;
  optionLabel: string;
  optionValue: string;
};

export type SalesBikeAllocationFilterOptions = {
  rulesets: string[];
  countryCodes: string[];
  bikeTypes: string[];
  /** Region -> Sub-region -> Country, derived from `cpq_country_mappings`. */
  territoryRegions: TerritoryRegion[];
};

export type AllocationStatus = 'active' | 'not_active' | 'not_configured';

export type SalesBikeAllocationRow = {
  ipnCode: string;
  rowRuleset: string;
  bikeType: string;
  featureValues: Record<string, string>;
  countryStatuses: Record<string, AllocationStatus>;
  hasBcIds: boolean;
};

/**
 * Retained for the external-status route payload. Territory/status/search
 * filtering now lives on `SalesBikeAllocationFilters`, so this type only keeps
 * the shape the client posts alongside it.
 */
export type SalesBikeAllocationExternalStatusFilterCriteria = {
  ipnFilter?: string;
  featureFilters?: Record<string, string>;
  countryCodes?: string[];
  allocationStatuses?: AllocationStatusValue[];
};

export type SalesBikeAllocationSkuCountryPair = {
  sku: string;
  countryCode: string;
};

export type SalesBikeAllocationPageData = {
  filters: NormalizedSalesBikeAllocationFilters;
  filterOptions: SalesBikeAllocationFilterOptions;
  availableFeatures: string[];
  countryColumns: string[];
  rows: SalesBikeAllocationRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
};
type SalesBikeAllocationFilterOptionsBase = Omit<SalesBikeAllocationFilterOptions, 'territoryRegions'>;

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 300;
const FILTER_OPTIONS_TTL_MS = 5 * 60 * 1000;
let filterOptionsCache: { expiresAt: number; value: SalesBikeAllocationFilterOptionsBase } | null = null;
let countryMappingsCache: { expiresAt: number; value: Array<{ region: string | null; sub_region: string | null; country_code: string | null }> } | null = null;

/**
 * Normalize raw page/API filter input. `country_code` (legacy deep link) is
 * folded into `countryCodes` so the rest of the service has exactly one
 * territory model to reason about.
 */
export function normalizeSalesBikeAllocationFilters(
  filters: SalesBikeAllocationFilters = {},
): NormalizedSalesBikeAllocationFilters {
  const legacyCountry = asTrimmed(filters.country_code).toUpperCase();
  const explicitCountries = (filters.countryCodes ?? [])
    .map((value) => asTrimmed(value).toUpperCase())
    .filter(Boolean);
  const countryCodes = [...new Set(explicitCountries.length ? explicitCountries : legacyCountry ? [legacyCountry] : [])].sort(
    (a, b) => a.localeCompare(b),
  );

  const featureFilters: Record<string, string> = {};
  for (const [label, value] of Object.entries(filters.featureFilters ?? {})) {
    const normalizedLabel = asTrimmed(label);
    const normalizedValue = asTrimmed(value);
    if (normalizedLabel && normalizedValue) featureFilters[normalizedLabel] = normalizedValue;
  }

  const allowedStatuses: AllocationStatusValue[] = ['active', 'not_active', 'not_configured'];
  const allocationStatuses = [
    ...new Set(
      (filters.allocationStatuses ?? [])
        .map((value) => asTrimmed(value).toLowerCase())
        .filter((value): value is AllocationStatusValue => (allowedStatuses as string[]).includes(value)),
    ),
  ];

  return {
    ruleset: asTrimmed(filters.ruleset),
    country_code: legacyCountry,
    bike_type: asTrimmed(filters.bike_type),
    countryCodes,
    ipnSearch: asTrimmed(filters.ipnSearch),
    allocationStatuses,
    featureFilters,
  };
}

async function listCachedCountryMappings() {
  if (countryMappingsCache && countryMappingsCache.expiresAt > Date.now()) return countryMappingsCache.value;
  const rows = await listCountryMappings(true);
  const value = rows.map((row) => ({
    region: row.region ?? null,
    sub_region: row.sub_region ?? null,
    country_code: row.country_code ?? null,
  }));
  countryMappingsCache = { value, expiresAt: Date.now() + FILTER_OPTIONS_TTL_MS };
  return value;
}

const asTrimmed = (value: unknown) => String(value ?? '').trim();
const asBoolean = (value: unknown) => value === true || value === 'true' || value === 't' || value === 1 || value === '1';

function toRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      return {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parseSelectedOptions(jsonResult: unknown): ParsedOption[] {
  const payload = toRecord(jsonResult);
  if (!Array.isArray(payload.selectedOptions)) return [];

  return payload.selectedOptions
    .map((raw) => {
      const record = (raw ?? {}) as Record<string, unknown>;
      const featureLabel = asTrimmed(record.featureLabel ?? record.feature_label);
      const optionValue = asTrimmed(record.optionValue ?? record.option_value);
      const optionLabel = asTrimmed(record.optionLabel ?? record.option_label);
      const resolvedValue = optionValue || optionLabel;
      return { featureLabel, resolvedValue };
    })
    .filter((item) => item.featureLabel && item.resolvedValue);
}

function parseReplaySelectedOptions(jsonResult: unknown): ReplaySelectedOption[] {
  const payload = toRecord(jsonResult);
  const selectedOptions = Array.isArray(payload.selectedOptions) ? payload.selectedOptions : [];
  const dropdownSnapshot = Array.isArray(payload.dropdownOrderSnapshot) ? payload.dropdownOrderSnapshot : [];

  const parsedFromSelected = selectedOptions
    .map((raw) => {
      const record = (raw ?? {}) as Record<string, unknown>;
      const featureLabel = asTrimmed(record.featureLabel ?? record.feature_label);
      const optionLabel = asTrimmed(record.optionLabel ?? record.option_label);
      const optionValue = asTrimmed(record.optionValue ?? record.option_value ?? optionLabel);
      if (!featureLabel || !optionLabel || !optionValue) return null;
      return { featureLabel, optionLabel, optionValue };
    })
    .filter((entry): entry is ReplaySelectedOption => Boolean(entry));
  if (parsedFromSelected.length > 0) return parsedFromSelected;

  return dropdownSnapshot
    .map((raw) => {
      const record = (raw ?? {}) as Record<string, unknown>;
      const featureLabel = asTrimmed(record.featureLabel ?? record.feature_label);
      const optionLabel = asTrimmed(record.selectedOptionLabel ?? record.optionLabel ?? record.option_label);
      const optionValue = asTrimmed(record.selectedOptionValue ?? record.optionValue ?? record.option_value ?? optionLabel);
      if (!featureLabel || !optionLabel || !optionValue) return null;
      return { featureLabel, optionLabel, optionValue };
    })
    .filter((entry): entry is ReplaySelectedOption => Boolean(entry));
}

async function listFilterOptions(): Promise<SalesBikeAllocationFilterOptionsBase> {
  if (filterOptionsCache && filterOptionsCache.expiresAt > Date.now()) return filterOptionsCache.value;
  const [rulesetRows, countryRows, bikeTypeRows] = await Promise.all([
    sql`select distinct ruleset from CPQ_sampler_result where coalesce(trim(ruleset), '') <> '' order by ruleset`,
    sql`select distinct country_code from CPQ_sampler_result where coalesce(trim(country_code), '') <> '' order by country_code`,
    sql`
      select distinct bike_type
      from CPQ_setup_ruleset
      where coalesce(trim(bike_type), '') <> ''
      order by bike_type
    `,
  ]);

  const value = {
    rulesets: (rulesetRows as Array<{ ruleset: string }>).map((row) => row.ruleset),
    countryCodes: (countryRows as Array<{ country_code: string }>).map((row) => row.country_code),
    bikeTypes: (bikeTypeRows as Array<{ bike_type: string }>).map((row) => row.bike_type),
  };
  filterOptionsCache = { value, expiresAt: Date.now() + FILTER_OPTIONS_TTL_MS };
  return value;
}

async function listSamplerRows(filters: SalesBikeAllocationFilters): Promise<SamplerRow[]> {
  const ruleset = asTrimmed(filters.ruleset);
  const bikeType = asTrimmed(filters.bike_type);
  const ipnSearch = asTrimmed(filters.ipnSearch);

  const mappedRulesetRows = bikeType
    ? ((await sql`
        select cpq_ruleset
        from CPQ_setup_ruleset
        where coalesce(trim(bike_type), '') = ${bikeType}
          and coalesce(trim(cpq_ruleset), '') <> ''
      `) as Array<{ cpq_ruleset: string }>)
    : [];
  const mappedRulesets = mappedRulesetRows.map((row) => asTrimmed(row.cpq_ruleset)).filter(Boolean);
  const mappedRulesetsJson = JSON.stringify(mappedRulesets);

  return (await sql`
    select
      id,
      ipn_code,
      ruleset,
      country_code,
      account_code,
      customer_id,
      currency,
      language,
      namespace,
      header_id,
      detail_id,
      active,
      json_result,
      (map.bc_product_id is not null and map.bc_variant_id is not null) as has_bc_ids,
      map.bc_status
    from CPQ_sampler_result
    left join lateral (
      select bc_product_id, bc_variant_id, bc_status
      from public.bc_item_variant_map map
      where coalesce(trim(map.sku_code), '') = coalesce(trim(CPQ_sampler_result.ipn_code), '')
      order by updated_at desc nulls last, id desc
      limit 1
    ) map on true
    where coalesce(trim(ipn_code), '') <> ''
      and (${ruleset} = '' or ruleset = ${ruleset})
      and (${ipnSearch} = '' or position(lower(${ipnSearch}) in lower(coalesce(ipn_code, ''))) > 0)
      and (
        ${bikeType} = ''
        or ruleset in (
          select value::text
          from jsonb_array_elements_text(${mappedRulesetsJson}::jsonb)
        )
      )
    order by id desc
  `) as SamplerRow[];
}

function toStatusBoolean(targetStatus: 'active' | 'not_active'): boolean {
  return targetStatus === 'active';
}

export async function updateAllocationCellStatus(input: {
  ruleset: string;
  ipnCode: string;
  countryCode: string;
  targetStatus: 'active' | 'not_active';
  actor?: AllocationAuditActor | null;
}) {
  const ruleset = asTrimmed(input.ruleset);
  const ipnCode = asTrimmed(input.ipnCode);
  const countryCode = asTrimmed(input.countryCode);

  if (!ruleset) throw new Error('ruleset is required');
  if (!ipnCode) throw new Error('ipnCode is required');
  if (!countryCode) throw new Error('countryCode is required');

  const targetActive = toStatusBoolean(input.targetStatus);
  const bcStatusRows = (await sql`
    select bc_status
    from public.bc_item_variant_map
    where coalesce(trim(sku_code), '') = ${ipnCode}
    order by updated_at desc nulls last, id desc
    limit 1
  `) as Array<{ bc_status: string | null }>;
  const bigcommerceStatus = bcStatusRows[0]?.bc_status == null ? null : normalizeBCStatus(bcStatusRows[0]?.bc_status);
  const priorRows = (await sql`select active from CPQ_sampler_result where coalesce(trim(ruleset), '') = ${ruleset} and coalesce(trim(ipn_code), '') = ${ipnCode} and coalesce(trim(country_code), '') = ${countryCode}`) as Array<{active:boolean|null}>;
  const statusBefore = priorRows[0]?.active ?? null;
  const updatedRows = (await sql`update CPQ_sampler_result set active = ${targetActive}, updated_at = now() where coalesce(trim(ruleset), '') = ${ruleset} and coalesce(trim(ipn_code), '') = ${ipnCode} and coalesce(trim(country_code), '') = ${countryCode} and coalesce(active,false) <> ${targetActive} returning id`) as Array<{ id: number }>;
  if (updatedRows.length) await insertAllocationAuditRows([{ actor: input.actor, pageKey: 'sales.bike_allocation', sourceProcess: 'bike_allocation_single_toggle', entityType: 'bike', itemCode: ipnCode, countryCode, actionType: targetActive ? 'activated' : 'deactivated', statusBefore, statusAfter: targetActive, bigcommerceStatus }]);

  const externalSync = updatedRows.length
    ? await syncBikeAllocationToExternalIfBcOk({ ruleset, ipnCode, countryCode })
    : null;

  return {
    updatedCount: updatedRows.length,
    targetStatus: input.targetStatus,
    externalSync,
  };
}

export async function bulkUpdateAllocationStatus(input: {
  ruleset: string;
  ipnCodes: string[];
  countryCodes: string[];
  targetStatus: 'active' | 'not_active';
  actor?: AllocationAuditActor | null;
  scope?: 'current_page' | 'all_filtered_pages';
}) {
  const ruleset = asTrimmed(input.ruleset);
  const ipnCodes = [...new Set(input.ipnCodes.map(asTrimmed).filter(Boolean))];
  const countryCodes = [...new Set(input.countryCodes.map(asTrimmed).filter(Boolean))];

  if (!ruleset) throw new Error('ruleset is required');
  if (!ipnCodes.length) throw new Error('ipnCodes is required');
  if (!countryCodes.length) throw new Error('countryCodes is required');

  const targetActive = toStatusBoolean(input.targetStatus);
  const changedRows = (await sql`
    with target_ipns as (
      select value::text as ipn_code
      from jsonb_array_elements_text(${JSON.stringify(ipnCodes)}::jsonb)
    ),
    target_countries as (
      select value::text as country_code
      from jsonb_array_elements_text(${JSON.stringify(countryCodes)}::jsonb)
    )
    update CPQ_sampler_result sr set active = ${targetActive}, updated_at = now()
    where coalesce(trim(sr.ruleset), '') = ${ruleset}
      and coalesce(trim(sr.ipn_code), '') in (select ipn_code from target_ipns)
      and coalesce(trim(sr.country_code), '') in (select country_code from target_countries)
      and coalesce(sr.active,false) <> ${targetActive}
    returning coalesce(trim(sr.ruleset), '') as ruleset, coalesce(trim(sr.ipn_code), '') as ipn_code, coalesce(trim(sr.country_code), '') as country_code, (not ${targetActive}) as status_before
  `) as Array<{ ruleset: string; ipn_code: string; country_code: string; status_before: boolean }>;
  const bcStatusBySku = new Map<string, ReturnType<typeof normalizeBCStatus> | null>();
  if (changedRows.length) {
    const skuRows = [...new Set(changedRows.map((row) => row.ipn_code))];
    const bcRows = (await sql`
      with target_skus as (
        select value::text as sku_code
        from jsonb_array_elements_text(${JSON.stringify(skuRows)}::jsonb)
      ),
      ranked as (
        select
          coalesce(trim(map.sku_code), '') as sku_code,
          map.bc_status,
          row_number() over (
            partition by coalesce(trim(map.sku_code), '')
            order by map.updated_at desc nulls last, map.id desc
          ) as rn
        from public.bc_item_variant_map map
        join target_skus on coalesce(trim(map.sku_code), '') = target_skus.sku_code
      )
      select sku_code, bc_status
      from ranked
      where rn = 1
    `) as Array<{ sku_code: string; bc_status: string | null }>;
    for (const row of bcRows) bcStatusBySku.set(row.sku_code, row.bc_status == null ? null : normalizeBCStatus(row.bc_status));
  }
  if (changedRows.length) await insertAllocationAuditRows(changedRows.map((row) => ({ actor: input.actor, pageKey: 'sales.bike_allocation', sourceProcess: 'bike_allocation_bulk_toggle', entityType: 'bike', itemCode: row.ipn_code, countryCode: row.country_code, bigcommerceStatus: bcStatusBySku.get(row.ipn_code) ?? null, actionType: targetActive ? 'bulk_activated' : 'bulk_deactivated', statusBefore: row.status_before, statusAfter: targetActive, metadata: { bulk: true, operation: targetActive ? 'bulk_activate' : 'bulk_deactivate', affectedCount: changedRows.length, scope: input.scope ?? 'current_page' } })));

  const uniqueTargets = [
    ...new Map(
      changedRows.map((row) => [
        `${row.ruleset}::${row.ipn_code}::${row.country_code}`,
        { ruleset: row.ruleset, ipnCode: row.ipn_code, countryCode: row.country_code },
      ]),
    ).values(),
  ];

  const latestRows = (await sql`
    with updated_targets as (
      select *
      from jsonb_to_recordset(${JSON.stringify(uniqueTargets)}::jsonb) as input("ruleset" text, "ipnCode" text, "countryCode" text)
    ),
    ranked as (
      select
        coalesce(trim(sr.ruleset), '') as ruleset,
        coalesce(trim(sr.ipn_code), '') as ipn_code,
        coalesce(trim(sr.country_code), '') as country_code,
        coalesce(trim(sr.detail_id), '') as detail_id,
        sr.active,
        row_number() over (
          partition by coalesce(trim(sr.ruleset), ''), coalesce(trim(sr.ipn_code), ''), coalesce(trim(sr.country_code), '')
          order by sr.updated_at desc nulls last, sr.created_at desc nulls last, sr.id desc
        ) as rn
      from CPQ_sampler_result sr
      join updated_targets target
        on coalesce(trim(sr.ruleset), '') = target."ruleset"
       and coalesce(trim(sr.ipn_code), '') = target."ipnCode"
       and coalesce(trim(sr.country_code), '') = target."countryCode"
    )
    select ruleset, ipn_code, country_code, detail_id, active
    from ranked
    where rn = 1
  `) as Array<{ ruleset: string; ipn_code: string; country_code: string; detail_id: string | null; active: boolean | string | number | null }>;

  const externalSync = await syncBikeAllocationsToExternalIfBcOkBatch(latestRows.map((row) => ({
    ruleset: row.ruleset,
    ipnCode: row.ipn_code,
    countryCode: row.country_code,
    detailId: asTrimmed(row.detail_id) || 'Simulator',
    active: row.active === true || row.active === 'true' || row.active === 't' || row.active === 1 || row.active === '1',
  })));

  return {
    updatedCount: changedRows.length,
    ipnCount: ipnCodes.length,
    countryCount: countryCodes.length,
    targetStatus: input.targetStatus,
    externalSync,
  };
}

export async function pushBikeAllocationBcOk(input: {
  ruleset: string;
  ipnCodes: string[];
  countryCodes: string[];
}) {
  const ruleset = asTrimmed(input.ruleset);
  const ipnCodes = [...new Set(input.ipnCodes.map(asTrimmed).filter(Boolean))];
  const countryCodes = [...new Set(input.countryCodes.map(asTrimmed).filter(Boolean))];

  if (!ruleset) throw new Error('ruleset is required');
  if (!ipnCodes.length) throw new Error('ipnCodes is required');
  if (!countryCodes.length) throw new Error('countryCodes is required');

  const rows = (await sql`
    with target_ipns as (
      select value::text as ipn_code
      from jsonb_array_elements_text(${JSON.stringify(ipnCodes)}::jsonb)
    ),
    target_countries as (
      select value::text as country_code
      from jsonb_array_elements_text(${JSON.stringify(countryCodes)}::jsonb)
    ),
    ranked as (
      select
        coalesce(trim(sr.ruleset), '') as ruleset,
        coalesce(trim(sr.ipn_code), '') as ipn_code,
        coalesce(trim(sr.country_code), '') as country_code,
        coalesce(trim(sr.detail_id), '') as detail_id,
        sr.active,
        row_number() over (
          partition by coalesce(trim(sr.ruleset), ''), coalesce(trim(sr.ipn_code), ''), coalesce(trim(sr.country_code), '')
          order by sr.updated_at desc nulls last, sr.created_at desc nulls last, sr.id desc
        ) as rn
      from CPQ_sampler_result sr
      where coalesce(trim(sr.ruleset), '') = ${ruleset}
        and coalesce(trim(sr.ipn_code), '') in (select ipn_code from target_ipns)
        and coalesce(trim(sr.country_code), '') in (select country_code from target_countries)
        and coalesce(trim(sr.ipn_code), '') <> ''
        and coalesce(trim(sr.country_code), '') <> ''
    )
    select ruleset, ipn_code, country_code, detail_id, active
    from ranked
    where rn = 1
  `) as Array<{ ruleset: string; ipn_code: string; country_code: string; detail_id: string | null; active: boolean | string | number | null }>;

  const externalSync = await syncBikeAllocationsToExternalIfBcOkBatch(rows.map((row) => ({
    ruleset: row.ruleset,
    ipnCode: row.ipn_code,
    countryCode: row.country_code,
    detailId: asTrimmed(row.detail_id) || 'Simulator',
    active: row.active === true || row.active === 'true' || row.active === 't' || row.active === 1 || row.active === '1',
  })));

  return {
    ipnCount: ipnCodes.length,
    countryCount: countryCodes.length,
    targetCount: rows.length,
    externalSync,
  };
}

export async function resolveConfiguratorLaunchContext(input: { ruleset: string; ipnCode: string; countryCode: string }) {
  const ruleset = asTrimmed(input.ruleset);
  const ipnCode = asTrimmed(input.ipnCode);
  const countryCode = asTrimmed(input.countryCode);

  if (!ruleset) throw new Error('ruleset is required');
  if (!ipnCode) throw new Error('ipnCode is required');
  if (!countryCode) throw new Error('countryCode is required');

  const [accountRows, samplerRows] = await Promise.all([
    listAccountContexts(true),
    sql`
      select id, ruleset, account_code, customer_id, currency, language, country_code, namespace, header_id, detail_id, json_result
      from CPQ_sampler_result
      where coalesce(trim(ipn_code), '') = ${ipnCode}
        and coalesce(trim(ruleset), '') = ${ruleset}
      order by case when coalesce(trim(country_code), '') = ${countryCode} then 0 else 1 end, updated_at desc, id desc
      limit 25
    `,
  ]);

  const samplerCandidates = samplerRows as Array<{
    id: number;
    ruleset: string;
    account_code: string | null;
    customer_id: string | null;
    currency: string | null;
    language: string | null;
    country_code: string | null;
    namespace: string | null;
    header_id: string | null;
    detail_id: string | null;
    json_result: unknown;
  }>;

  const accountByCountry = accountRows.find((row) => asTrimmed(row.country_code) === countryCode);
  const sameCountrySampler = samplerCandidates.find((row) => asTrimmed(row.country_code) === countryCode);
  const fallbackSampler = samplerCandidates[0] ?? null;
  const replaySourceSampler = sameCountrySampler ?? fallbackSampler;

  const resolvedAccountCode =
    asTrimmed(accountByCountry?.account_code) ||
    asTrimmed(sameCountrySampler?.account_code) ||
    asTrimmed(fallbackSampler?.account_code);

  return {
    ipnCode,
    countryCode,
    ruleset,
    accountCode: resolvedAccountCode || null,
    contextSource:
      accountByCountry
        ? 'account-context-country-match'
        : sameCountrySampler
          ? 'sampler-same-country'
          : fallbackSampler
            ? 'sampler-fallback'
            : 'ruleset-only',
    replay: replaySourceSampler
      ? {
          sourceSamplerId: replaySourceSampler.id,
          sourceCountryCode: asTrimmed(replaySourceSampler.country_code) || null,
          selectedOptions: parseReplaySelectedOptions(replaySourceSampler.json_result),
        }
      : {
          sourceSamplerId: null,
          sourceCountryCode: null,
          selectedOptions: [],
        },
  };
}

async function buildSalesBikeAllocationRows(normalizedFilters: NormalizedSalesBikeAllocationFilters): Promise<{
  filterOptions: SalesBikeAllocationFilterOptions;
  availableFeatures: string[];
  countryColumns: string[];
  rows: SalesBikeAllocationRow[];
}> {
  const [filterOptionsBase, rawSourceRows, rulesetRows, countryMappings] = await Promise.all([
    listFilterOptions(),
    listSamplerRows(normalizedFilters),
    sql`
      select cpq_ruleset, bike_type
      from CPQ_setup_ruleset
      where coalesce(trim(cpq_ruleset), '') <> ''
    `,
    listCachedCountryMappings(),
  ]);
  const sourceRows = rawSourceRows as SamplerRow[];
  const bikeTypeByRuleset = new Map<string, string>();
  for (const row of rulesetRows as Array<{ cpq_ruleset: string | null; bike_type: string | null }>) {
    const ruleset = asTrimmed(row.cpq_ruleset);
    if (!ruleset) continue;
    bikeTypeByRuleset.set(ruleset, asTrimmed(row.bike_type) || 'Unmapped');
  }

  const countryColumns = [...new Set(sourceRows.map((row) => asTrimmed(row.country_code).toUpperCase()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  const rowMap = new Map<string, SalesBikeAllocationRow>();
  const availableFeatures = new Set<string>();

  for (const row of sourceRows) {
    const ipn = asTrimmed(row.ipn_code);
    const rowRuleset = asTrimmed(row.ruleset);
    if (!ipn || !rowRuleset) continue;

    const rowKey = `${rowRuleset}::${ipn}`;
    let matrixRow = rowMap.get(rowKey);
    if (!matrixRow) {
      matrixRow = {
        ipnCode: ipn,
        rowRuleset,
        bikeType: bikeTypeByRuleset.get(rowRuleset) ?? 'Unmapped',
        featureValues: {},
        countryStatuses: {},
        hasBcIds: row.has_bc_ids === true,
      };
      rowMap.set(rowKey, matrixRow);
    }

    const parsedOptions = parseSelectedOptions(row.json_result);
    for (const option of parsedOptions) {
      availableFeatures.add(option.featureLabel);
      matrixRow.hasBcIds = matrixRow.hasBcIds || row.has_bc_ids === true;

      if (!matrixRow.featureValues[option.featureLabel]) {
        matrixRow.featureValues[option.featureLabel] = option.resolvedValue;
      }
    }

    const countryCode = asTrimmed(row.country_code).toUpperCase();
    if (!countryCode) continue;

    const existingStatus = matrixRow.countryStatuses[countryCode];
    if (asBoolean(row.active)) {
      matrixRow.countryStatuses[countryCode] = 'active';
      continue;
    }
    if (!existingStatus) {
      matrixRow.countryStatuses[countryCode] = 'not_active';
    }
  }

  const orderedFeatures = [...availableFeatures].sort((a, b) => a.localeCompare(b));

  const rows = [...rowMap.values()]
    .map((row) => ({
      ...row,
      featureValues: Object.fromEntries(orderedFeatures.map((feature) => [feature, row.featureValues[feature] ?? ''])),
      countryStatuses: Object.fromEntries(
        countryColumns.map((country) => [country, row.countryStatuses[country] ?? 'not_configured']),
      ) as Record<string, AllocationStatus>,
    }))
    .sort((a, b) => (a.ipnCode === b.ipnCode ? a.rowRuleset.localeCompare(b.rowRuleset) : a.ipnCode.localeCompare(b.ipnCode)));

  const filterOptions: SalesBikeAllocationFilterOptions = {
    ...filterOptionsBase,
    territoryRegions: buildTerritoryRegions(countryMappings, countryColumns),
  };

  return { filterOptions, availableFeatures: orderedFeatures, countryColumns, rows };
}

/**
 * Apply every dataset-shaping filter that is not already handled in SQL.
 *
 * This runs before pagination so `totalRows`/`totalPages` always describe the
 * filtered dataset, and so page 2 means page 2 of the filtered dataset.
 *
 * Status semantics: a row is kept when ANY country in scope has ANY selected
 * status. Country scope is the territory selection when one exists, otherwise
 * every country column.
 */
export function filterSalesBikeAllocationRows(
  rows: SalesBikeAllocationRow[],
  countryColumns: string[],
  filters: Pick<NormalizedSalesBikeAllocationFilters, 'ipnSearch' | 'featureFilters' | 'countryCodes' | 'allocationStatuses'>,
): SalesBikeAllocationRow[] {
  const ipnSearch = asTrimmed(filters.ipnSearch).toLowerCase();
  const featureEntries = Object.entries(filters.featureFilters ?? {})
    .map(([label, value]) => [label, asTrimmed(value).toLowerCase()] as const)
    .filter(([, value]) => Boolean(value));
  const scopedCountries = (filters.countryCodes ?? []).filter((countryCode) => countryColumns.includes(countryCode));

  return rows.filter((row) => {
    if (ipnSearch && !row.ipnCode.toLowerCase().includes(ipnSearch)) return false;

    for (const [feature, search] of featureEntries) {
      if (!String(row.featureValues[feature] ?? '').toLowerCase().includes(search)) return false;
    }

    return rowMatchesAllocationStatuses(
      row.countryStatuses,
      scopedCountries,
      countryColumns,
      filters.allocationStatuses ?? [],
    );
  });
}

export async function listSalesBikeAllocationExternalStatusPairs(
  filters: SalesBikeAllocationFilters,
): Promise<SalesBikeAllocationSkuCountryPair[]> {
  const normalizedFilters = normalizeSalesBikeAllocationFilters(filters);
  const { rows, countryColumns } = await buildSalesBikeAllocationRows(normalizedFilters);
  const filteredRows = filterSalesBikeAllocationRows(rows, countryColumns, normalizedFilters);

  // Territory selection is the country scope; with no selection, every column.
  const scopedCountries = normalizedFilters.countryCodes.filter((countryCode) => countryColumns.includes(countryCode));
  const targetCountries = scopedCountries.length ? scopedCountries : countryColumns;
  const statuses = normalizedFilters.allocationStatuses;
  const pairs = new Map<string, SalesBikeAllocationSkuCountryPair>();

  for (const row of filteredRows) {
    if (!row.hasBcIds) continue;
    for (const countryCode of targetCountries) {
      const status = row.countryStatuses[countryCode] ?? 'not_configured';
      // No external eligibility row can exist without a sampler row.
      if (status === 'not_configured') continue;
      if (statuses.length && !statuses.includes(status)) continue;
      pairs.set(`${row.ipnCode}::${countryCode}`, { sku: row.ipnCode, countryCode });
    }
  }

  return [...pairs.values()];
}

export async function getSalesBikeAllocationPageData(
  filters: SalesBikeAllocationFilters & { page?: number; pageSize?: number },
): Promise<SalesBikeAllocationPageData> {
  const normalizedFilters = normalizeSalesBikeAllocationFilters(filters);

  const { filterOptions, availableFeatures, countryColumns, rows } = await buildSalesBikeAllocationRows(normalizedFilters);
  const filteredRows = filterSalesBikeAllocationRows(rows, countryColumns, normalizedFilters);

  const requestedPageSize = Number(filters.pageSize);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.isFinite(requestedPageSize) && requestedPageSize > 0 ? Math.floor(requestedPageSize) : DEFAULT_PAGE_SIZE),
  );
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const requestedPage = Number(filters.page);
  // Clamp: a filter change that shrinks the dataset must not leave the operator
  // stranded on a page that no longer exists.
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    filters: normalizedFilters,
    filterOptions,
    availableFeatures,
    countryColumns,
    rows: pagedRows,
    pagination: { page, pageSize, totalRows, totalPages },
  };
}

/**
 * Flatten the current filtered dataset (every page, not just the displayed one)
 * into one record per bike + country, for CSV export.
 *
 * `not_configured` pairs are excluded by design: they have no allocation row, so
 * there is nothing for sales ops to report on.
 */
export async function listSalesBikeAllocationExportRows(filters: SalesBikeAllocationFilters): Promise<{
  availableFeatures: string[];
  rows: AllocationExportRecord[];
}> {
  const normalizedFilters = normalizeSalesBikeAllocationFilters(filters);
  const { availableFeatures, countryColumns, rows, filterOptions } = await buildSalesBikeAllocationRows(normalizedFilters);
  const filteredRows = filterSalesBikeAllocationRows(rows, countryColumns, normalizedFilters);

  return {
    availableFeatures,
    rows: buildAllocationExportRecords({
      rows: filteredRows,
      countryColumns,
      selectedCountries: normalizedFilters.countryCodes,
      selectedStatuses: normalizedFilters.allocationStatuses,
      territoryIndex: buildCountryTerritoryIndex(filterOptions.territoryRegions),
    }),
  };
}

export { buildPaginationItems, decodeFeatureFilters, encodeFeatureFilters };
