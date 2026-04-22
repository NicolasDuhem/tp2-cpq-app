import { sql } from '@/lib/db/client';
import { listAccountContexts } from '@/lib/cpq/setup/service';

export type SalesBikeAllocationFilters = {
  ruleset?: string;
  country_code?: string;
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
  json_result: unknown;
};

type ParsedOption = {
  featureLabel: string;
  resolvedValue: string;
};

export type SalesBikeAllocationFilterOptions = {
  rulesets: string[];
  countryCodes: string[];
};

export type AllocationStatus = 'active' | 'not_active' | 'not_configured';

export type SalesBikeAllocationRow = {
  ipnCode: string;
  rowRuleset: string;
  featureValues: Record<string, string>;
  countryStatuses: Record<string, AllocationStatus>;
};

export type SalesBikeAllocationPageData = {
  filters: SalesBikeAllocationFilters;
  filterOptions: SalesBikeAllocationFilterOptions;
  availableFeatures: string[];
  countryColumns: string[];
  rows: SalesBikeAllocationRow[];
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

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

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'yes', 'y', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'inactive', 'not_active'].includes(normalized)) return false;
  }
  return null;
}

function resolveConfiguredStatus(jsonResult: unknown): AllocationStatus {
  const payload = toRecord(jsonResult);
  const activeCandidate =
    parseBooleanLike(payload.active) ??
    parseBooleanLike(payload.is_active) ??
    parseBooleanLike(payload.enabled) ??
    parseBooleanLike(payload.isEnabled);

  return activeCandidate === false ? 'not_active' : 'active';
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

async function listFilterOptions(): Promise<SalesBikeAllocationFilterOptions> {
  const [rulesetRows, countryRows] = await Promise.all([
    sql`select distinct ruleset from CPQ_sampler_result where coalesce(trim(ruleset), '') <> '' order by ruleset`,
    sql`select distinct country_code from CPQ_sampler_result where coalesce(trim(country_code), '') <> '' order by country_code`,
  ]);

  return {
    rulesets: (rulesetRows as Array<{ ruleset: string }>).map((row) => row.ruleset),
    countryCodes: (countryRows as Array<{ country_code: string }>).map((row) => row.country_code),
  };
}

async function listSamplerRows(filters: SalesBikeAllocationFilters): Promise<SamplerRow[]> {
  const ruleset = asTrimmed(filters.ruleset);

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
      json_result
    from CPQ_sampler_result
    where coalesce(trim(ipn_code), '') <> ''
      and (${ruleset} = '' or ruleset = ${ruleset})
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
      json_result = jsonb_set(coalesce(json_result, '{}'::jsonb), '{active}', to_jsonb(${toStatusBoolean(input.targetStatus)}), true),
      updated_at = now()
    where ruleset = ${ruleset}
      and ipn_code = ${ipnCode}
      and country_code = ${countryCode}
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
    update CPQ_sampler_result
    set
      json_result = jsonb_set(coalesce(json_result, '{}'::jsonb), '{active}', to_jsonb(${toStatusBoolean(input.targetStatus)}), true),
      updated_at = now()
    where ruleset = ${ruleset}
      and ipn_code = any(${ipnCodes}::text[])
      and country_code = any(${countryCodes}::text[])
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
      select id, ruleset, account_code, customer_id, currency, language, country_code, namespace, header_id, detail_id
      from CPQ_sampler_result
      where ipn_code = ${ipnCode}
        and ruleset = ${ruleset}
      order by case when country_code = ${countryCode} then 0 else 1 end, updated_at desc, id desc
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
  }>;

  const accountByCountry = accountRows.find((row) => asTrimmed(row.country_code) === countryCode);
  const sameCountrySampler = samplerCandidates.find((row) => asTrimmed(row.country_code) === countryCode);
  const fallbackSampler = samplerCandidates[0] ?? null;

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
  };
}

export async function getSalesBikeAllocationPageData(
  filters: SalesBikeAllocationFilters,
): Promise<SalesBikeAllocationPageData> {
  const normalizedFilters = {
    ruleset: asTrimmed(filters.ruleset),
    country_code: asTrimmed(filters.country_code),
  };

  const [filterOptions, sourceRows] = await Promise.all([listFilterOptions(), listSamplerRows(normalizedFilters)]);

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
    if (existingStatus === 'active') continue;

    matrixRow.countryStatuses[countryCode] = resolveConfiguredStatus(row.json_result);
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

  return {
    filters: normalizedFilters,
    filterOptions,
    availableFeatures: orderedFeatures,
    countryColumns,
    rows,
  };
}
