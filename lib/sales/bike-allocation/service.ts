import { sql } from '@/lib/db/client';
import { listAccountContexts } from '@/lib/cpq/setup/service';

export type SalesBikeAllocationFilters = {
  ruleset?: string;
  country_code?: string;
  bike_type?: string;
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
};

export type AllocationStatus = 'active' | 'not_active' | 'not_configured';

export type SalesBikeAllocationRow = {
  ipnCode: string;
  rowRuleset: string;
  bikeType: string;
  featureValues: Record<string, string>;
  countryStatuses: Record<string, AllocationStatus>;
};

export type SalesBikeAllocationPageData = {
  filters: SalesBikeAllocationFilters;
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
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 300;
const FILTER_OPTIONS_TTL_MS = 5 * 60 * 1000;
let filterOptionsCache: { expiresAt: number; value: SalesBikeAllocationFilterOptions } | null = null;

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

async function listFilterOptions(): Promise<SalesBikeAllocationFilterOptions> {
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
      json_result
    from CPQ_sampler_result
    where coalesce(trim(ipn_code), '') <> ''
      and (${ruleset} = '' or ruleset = ${ruleset})
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
}) {
  const ruleset = asTrimmed(input.ruleset);
  const ipnCode = asTrimmed(input.ipnCode);
  const countryCode = asTrimmed(input.countryCode);

  if (!ruleset) throw new Error('ruleset is required');
  if (!ipnCode) throw new Error('ipnCode is required');
  if (!countryCode) throw new Error('countryCode is required');

  const updatedRows = (await sql`
    update CPQ_sampler_result
    set
      active = ${toStatusBoolean(input.targetStatus)},
      updated_at = now()
    where coalesce(trim(ruleset), '') = ${ruleset}
      and coalesce(trim(ipn_code), '') = ${ipnCode}
      and coalesce(trim(country_code), '') = ${countryCode}
    returning id
  `) as Array<{ id: number }>;

  return {
    updatedCount: updatedRows.length,
    targetStatus: input.targetStatus,
  };
}

export async function bulkUpdateAllocationStatus(input: {
  ruleset: string;
  ipnCodes: string[];
  countryCodes: string[];
  targetStatus: 'active' | 'not_active';
}) {
  const ruleset = asTrimmed(input.ruleset);
  const ipnCodes = [...new Set(input.ipnCodes.map(asTrimmed).filter(Boolean))];
  const countryCodes = [...new Set(input.countryCodes.map(asTrimmed).filter(Boolean))];

  if (!ruleset) throw new Error('ruleset is required');
  if (!ipnCodes.length) throw new Error('ipnCodes is required');
  if (!countryCodes.length) throw new Error('countryCodes is required');

  const updatedRows = (await sql`
    with target_ipns as (
      select value::text as ipn_code
      from jsonb_array_elements_text(${JSON.stringify(ipnCodes)}::jsonb)
    ),
    target_countries as (
      select value::text as country_code
      from jsonb_array_elements_text(${JSON.stringify(countryCodes)}::jsonb)
    )
    update CPQ_sampler_result sr
    set
      active = ${toStatusBoolean(input.targetStatus)},
      updated_at = now()
    where coalesce(trim(sr.ruleset), '') = ${ruleset}
      and coalesce(trim(sr.ipn_code), '') in (select ipn_code from target_ipns)
      and coalesce(trim(sr.country_code), '') in (select country_code from target_countries)
    returning id
  `) as Array<{ id: number }>;

  return {
    updatedCount: updatedRows.length,
    ipnCount: ipnCodes.length,
    countryCount: countryCodes.length,
    targetStatus: input.targetStatus,
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

export async function getSalesBikeAllocationPageData(
  filters: SalesBikeAllocationFilters & { page?: number; pageSize?: number },
): Promise<SalesBikeAllocationPageData> {
  const normalizedFilters = {
    ruleset: asTrimmed(filters.ruleset),
    country_code: asTrimmed(filters.country_code),
    bike_type: asTrimmed(filters.bike_type),
  };

  const [filterOptions, sourceRows, rulesetRows] = await Promise.all([
    listFilterOptions(),
    listSamplerRows(normalizedFilters),
    sql`
      select cpq_ruleset, bike_type
      from CPQ_setup_ruleset
      where coalesce(trim(cpq_ruleset), '') <> ''
    `,
  ]);
  const bikeTypeByRuleset = new Map<string, string>();
  for (const row of rulesetRows as Array<{ cpq_ruleset: string | null; bike_type: string | null }>) {
    const ruleset = asTrimmed(row.cpq_ruleset);
    if (!ruleset) continue;
    bikeTypeByRuleset.set(ruleset, asTrimmed(row.bike_type) || 'Unmapped');
  }

  const countryColumns = [...new Set(sourceRows.map((row) => asTrimmed(row.country_code)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  const rowMap = new Map<string, SalesBikeAllocationRow>();
  const availableFeatures = new Set<string>();

  for (const row of sourceRows) {
    const ipn = asTrimmed(row.ipn_code);
    const rowRuleset = asTrimmed(row.ruleset);
    if (!ipn || !rowRuleset) continue;

    if (normalizedFilters.country_code && asTrimmed(row.country_code) !== normalizedFilters.country_code) {
      continue;
    }

    const rowKey = `${rowRuleset}::${ipn}`;
    let matrixRow = rowMap.get(rowKey);
    if (!matrixRow) {
      matrixRow = {
        ipnCode: ipn,
        rowRuleset,
        bikeType: bikeTypeByRuleset.get(rowRuleset) ?? 'Unmapped',
        featureValues: {},
        countryStatuses: {},
      };
      rowMap.set(rowKey, matrixRow);
    }

    const parsedOptions = parseSelectedOptions(row.json_result);
    for (const option of parsedOptions) {
      availableFeatures.add(option.featureLabel);
      if (!matrixRow.featureValues[option.featureLabel]) {
        matrixRow.featureValues[option.featureLabel] = option.resolvedValue;
      }
    }

    const countryCode = asTrimmed(row.country_code);
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
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(filters.pageSize ?? DEFAULT_PAGE_SIZE)));
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(filters.page ?? 1)));
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return {
    filters: normalizedFilters,
    filterOptions,
    availableFeatures: orderedFeatures,
    countryColumns,
    rows: pagedRows,
    pagination: { page, pageSize, totalRows, totalPages },
  };
}
