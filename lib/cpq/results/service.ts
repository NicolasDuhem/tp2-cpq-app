import { sql } from '@/lib/db/client';

type SamplerMatrixSourceRow = {
  id: number;
  created_at: string;
  ipn_code: string | null;
  ruleset: string;
  country_code: string | null;
  detail_id: string | null;
  json_result: unknown;
  bike_type: string | null;
};

export type CpqResultsFilters = {
  ruleset?: string;
  bike_type?: string;
  sku_code?: string;
};

export type CpqResultsFilterOptions = {
  rulesets: string[];
  bikeTypes: string[];
  countryCodes: string[];
};

export type CpqMatrixRowViewModel = {
  rowKey: string;
  sku_code: string;
  ruleset: string;
  bike_type: string;
  featureValues: Record<string, string>;
  countryDetailIds: Record<string, string | null>;
};

export type CpqResultsMatrixPageData = {
  rows: CpqMatrixRowViewModel[];
  featureColumns: string[];
  countryColumns: string[];
  filterOptions: CpqResultsFilterOptions;
  rowIdentityDescription: string;
};

type ParsedOption = {
  featureLabel: string;
  optionLabel: string;
  optionValue: string;
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

function parseSelectedOptions(jsonResult: unknown): ParsedOption[] {
  const payload = (jsonResult ?? {}) as { selectedOptions?: unknown };
  if (!Array.isArray(payload.selectedOptions)) return [];

  return payload.selectedOptions
    .map((raw) => {
      const record = (raw ?? {}) as Record<string, unknown>;
      const featureLabel = asTrimmed(record.featureLabel ?? record.feature_label);
      const optionLabel = asTrimmed(record.optionLabel ?? record.option_label);
      const optionValue = asTrimmed(record.optionValue ?? record.option_value);
      return { featureLabel, optionLabel, optionValue };
    })
    .filter((item) => item.featureLabel && (item.optionLabel || item.optionValue));
}

function toFeatureValue(option: ParsedOption): string {
  if (option.optionLabel && option.optionValue && option.optionLabel !== option.optionValue) {
    return `${option.optionLabel} (${option.optionValue})`;
  }
  return option.optionLabel || option.optionValue;
}

function buildFeatureSignature(options: ParsedOption[]): string {
  return options
    .map((option) => `${option.featureLabel}\u0000${option.optionValue || option.optionLabel}`)
    .sort((a, b) => a.localeCompare(b))
    .join('||');
}

function buildRowKey(source: { skuCode: string; ruleset: string; featureSignature: string }) {
  return [source.skuCode, source.ruleset, source.featureSignature].join('::');
}

async function listFilterOptions(): Promise<CpqResultsFilterOptions> {
  const [rulesets, bikeTypes, samplerCountries, accountCountries] = await Promise.all([
    sql`select distinct ruleset from CPQ_sampler_result where coalesce(trim(ruleset), '') <> '' order by ruleset`,
    sql`
      select distinct bike_type
      from CPQ_setup_ruleset
      where coalesce(trim(bike_type), '') <> ''
      order by bike_type
    `,
    sql`select distinct country_code from CPQ_sampler_result where coalesce(trim(country_code), '') <> '' order by country_code`,
    sql`
      select distinct country_code
      from CPQ_setup_account_context
      where coalesce(trim(country_code), '') <> ''
      order by country_code
    `,
  ]);

  const countryCodes = new Set<string>();
  for (const row of samplerCountries as Array<{ country_code: string }>) countryCodes.add(row.country_code);
  for (const row of accountCountries as Array<{ country_code: string }>) countryCodes.add(row.country_code);

  return {
    rulesets: (rulesets as Array<{ ruleset: string }>).map((row) => row.ruleset),
    bikeTypes: (bikeTypes as Array<{ bike_type: string }>).map((row) => row.bike_type),
    countryCodes: [...countryCodes].sort((a, b) => a.localeCompare(b)),
  };
}

async function listSamplerRows(filters: CpqResultsFilters): Promise<SamplerMatrixSourceRow[]> {
  const ruleset = asTrimmed(filters.ruleset);
  const bikeType = asTrimmed(filters.bike_type);
  const skuCode = asTrimmed(filters.sku_code);

  return (await sql`
    select
      sr.id,
      sr.created_at,
      sr.ipn_code,
      sr.ruleset,
      sr.country_code,
      sr.detail_id,
      sr.json_result,
      rs.bike_type
    from CPQ_sampler_result sr
    left join CPQ_setup_ruleset rs on rs.cpq_ruleset = sr.ruleset
    where coalesce(trim(sr.ipn_code), '') <> ''
      and (${ruleset} = '' or sr.ruleset = ${ruleset})
      and (${bikeType} = '' or coalesce(rs.bike_type, '') = ${bikeType})
      and (${skuCode} = '' or sr.ipn_code ilike ${`%${skuCode}%`})
    order by sr.created_at desc, sr.id desc
  `) as SamplerMatrixSourceRow[];
}

export async function getCpqResultsPageData(filters: CpqResultsFilters): Promise<CpqResultsMatrixPageData> {
  const [filterOptions, sourceRows] = await Promise.all([listFilterOptions(), listSamplerRows(filters)]);

  const featureColumns = new Set<string>();
  const matrixCountries = new Set<string>(filterOptions.countryCodes);
  const matrix = new Map<string, CpqMatrixRowViewModel>();

  for (const sourceRow of sourceRows) {
    const skuCode = asTrimmed(sourceRow.ipn_code);
    if (!skuCode) continue;

    const selectedOptions = parseSelectedOptions(sourceRow.json_result);
    const featureValues = Object.fromEntries(selectedOptions.map((option) => [option.featureLabel, toFeatureValue(option)]));
    const featureSignature = buildFeatureSignature(selectedOptions);
    const rowKey = buildRowKey({ skuCode, ruleset: sourceRow.ruleset, featureSignature });

    let matrixRow = matrix.get(rowKey);
    if (!matrixRow) {
      matrixRow = {
        rowKey,
        sku_code: skuCode,
        ruleset: sourceRow.ruleset,
        bike_type: asTrimmed(sourceRow.bike_type) || '-',
        featureValues,
        countryDetailIds: {},
      };
      matrix.set(rowKey, matrixRow);
    }

    for (const [featureLabel, value] of Object.entries(featureValues)) {
      featureColumns.add(featureLabel);
      if (!matrixRow.featureValues[featureLabel]) matrixRow.featureValues[featureLabel] = value;
    }

    const countryCode = asTrimmed(sourceRow.country_code);
    if (countryCode) {
      matrixCountries.add(countryCode);
      if (matrixRow.countryDetailIds[countryCode] === undefined) {
        matrixRow.countryDetailIds[countryCode] = asTrimmed(sourceRow.detail_id) || null;
      }
    }
  }

  const orderedFeatureColumns = [...featureColumns].sort((a, b) => a.localeCompare(b));
  const orderedCountryColumns = [...matrixCountries].sort((a, b) => a.localeCompare(b));

  const rows = [...matrix.values()]
    .map((row) => ({
      ...row,
      countryDetailIds: Object.fromEntries(orderedCountryColumns.map((countryCode) => [countryCode, row.countryDetailIds[countryCode] ?? null])),
      featureValues: Object.fromEntries(orderedFeatureColumns.map((featureLabel) => [featureLabel, row.featureValues[featureLabel] ?? ''])),
    }))
    .sort((a, b) => {
      const skuSort = a.sku_code.localeCompare(b.sku_code);
      if (skuSort !== 0) return skuSort;
      const rulesetSort = a.ruleset.localeCompare(b.ruleset);
      if (rulesetSort !== 0) return rulesetSort;
      return a.rowKey.localeCompare(b.rowKey);
    });

  return {
    rows,
    featureColumns: orderedFeatureColumns,
    countryColumns: orderedCountryColumns,
    filterOptions,
    rowIdentityDescription:
      'Rows are grouped by sku_code (from CPQ_sampler_result.ipn_code) + ruleset + full selected feature signature to keep one row per stable bike configuration before pivoting countries.',
  };
}
