import { sql } from '@/lib/db/client';

export type SalesBikeAllocationFilters = {
  ruleset?: string;
  country_code?: string;
};

type SamplerRow = {
  id: number;
  ipn_code: string | null;
  ruleset: string | null;
  country_code: string | null;
  json_result: unknown;
  active: boolean | null;
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

function parseSelectedOptions(jsonResult: unknown): ParsedOption[] {
  const payload = (jsonResult ?? {}) as { selectedOptions?: unknown };
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
      json_result,
      active
    from CPQ_sampler_result
    where coalesce(trim(ipn_code), '') <> ''
      and (${ruleset} = '' or ruleset = ${ruleset})
    order by id desc
  `) as SamplerRow[];
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

  const ipnsInScope = new Set<string>();
  for (const row of sourceRows) {
    const ipn = asTrimmed(row.ipn_code);
    if (!ipn) continue;

    if (!normalizedFilters.country_code || asTrimmed(row.country_code) === normalizedFilters.country_code) {
      ipnsInScope.add(ipn);
    }
  }

  const rowMap = new Map<string, SalesBikeAllocationRow>();
  const availableFeatures = new Set<string>();

  for (const row of sourceRows) {
    const ipn = asTrimmed(row.ipn_code);
    if (!ipn || !ipnsInScope.has(ipn)) continue;

    let matrixRow = rowMap.get(ipn);
    if (!matrixRow) {
      matrixRow = {
        ipnCode: ipn,
        featureValues: {},
        countryStatuses: {},
      };
      rowMap.set(ipn, matrixRow);
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

    matrixRow.countryStatuses[countryCode] = row.active ? 'active' : 'not_active';
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
    .sort((a, b) => a.ipnCode.localeCompare(b.ipnCode));

  return {
    filters: normalizedFilters,
    filterOptions,
    availableFeatures: orderedFeatures,
    countryColumns,
    rows,
  };
}
