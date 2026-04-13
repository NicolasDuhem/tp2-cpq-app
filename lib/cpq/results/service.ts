import { sql } from '@/lib/db/client';
import { resolveImageLayersForSelectedOptions } from '@/lib/cpq/setup/service';
import { CpqImageSelectionLookup, CpqResolvedImageLayer } from '@/types/setup';

type SamplerRow = {
  id: number;
  created_at: string;
  ipn_code: string;
  ruleset: string;
  account_code: string;
  country_code: string | null;
  json_result: unknown;
};

export type CpqResultsFilters = {
  ruleset?: string;
  account_code?: string;
  country_code?: string;
};

export type CpqResultsFilterOptions = {
  rulesets: string[];
  accountCodes: string[];
  countryCodes: string[];
};

export type CpqResultsTileViewModel = {
  ipn_code: string;
  ruleset: string;
  account_code: string;
  country_code: string | null;
  created_at: string;
  lineLabel: string;
  specSummary: string;
  colourDetail: string;
  selectedOptions: CpqImageSelectionLookup[];
  imageLayers: CpqResolvedImageLayer[];
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

function parseSelectedOptions(jsonResult: unknown): CpqImageSelectionLookup[] {
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
    .filter((item) => item.featureLabel && item.optionLabel && item.optionValue);
}

function findOptionLabel(selectedOptions: CpqImageSelectionLookup[], featureLabel: string): string {
  const target = featureLabel.toLowerCase();
  return selectedOptions.find((item) => item.featureLabel.toLowerCase() === target)?.optionLabel ?? '';
}

function deriveTileText(selectedOptions: CpqImageSelectionLookup[]) {
  const lineLabel = findOptionLabel(selectedOptions, 'Line');

  const specParts = [
    findOptionLabel(selectedOptions, 'Handlebar Type'),
    findOptionLabel(selectedOptions, 'Speeds'),
    findOptionLabel(selectedOptions, 'Add Rack'),
  ].filter(Boolean);

  const colourParts = [
    findOptionLabel(selectedOptions, 'Main Frame Colour'),
    findOptionLabel(selectedOptions, 'Rear Frame Colour'),
  ].filter(Boolean);

  return {
    lineLabel,
    specSummary: specParts.join(' - '),
    colourDetail: colourParts.join(' / '),
  };
}

async function listFilterOptions(): Promise<CpqResultsFilterOptions> {
  const [rulesets, accountCodes, countryCodes] = await Promise.all([
    sql`select distinct ruleset from CPQ_sampler_result where coalesce(trim(ruleset), '') <> '' order by ruleset`,
    sql`select distinct account_code from CPQ_sampler_result where coalesce(trim(account_code), '') <> '' order by account_code`,
    sql`select distinct country_code from CPQ_sampler_result where coalesce(trim(country_code), '') <> '' order by country_code`,
  ]);

  return {
    rulesets: (rulesets as Array<{ ruleset: string }>).map((row) => row.ruleset),
    accountCodes: (accountCodes as Array<{ account_code: string }>).map((row) => row.account_code),
    countryCodes: (countryCodes as Array<{ country_code: string }>).map((row) => row.country_code),
  };
}

async function listLatestRowsPerIpn(filters: CpqResultsFilters): Promise<SamplerRow[]> {
  const ruleset = asTrimmed(filters.ruleset);
  const accountCode = asTrimmed(filters.account_code);
  const countryCode = asTrimmed(filters.country_code);

  return (await sql`
    with ranked as (
      select
        id,
        created_at,
        ipn_code,
        ruleset,
        account_code,
        country_code,
        json_result,
        row_number() over (partition by ipn_code order by created_at desc, id desc) as rn
      from CPQ_sampler_result
      where coalesce(trim(ipn_code), '') <> ''
        and (${ruleset} = '' or ruleset = ${ruleset})
        and (${accountCode} = '' or account_code = ${accountCode})
        and (${countryCode} = '' or country_code = ${countryCode})
    )
    select id, created_at, ipn_code, ruleset, account_code, country_code, json_result
    from ranked
    where rn = 1
    order by created_at desc, ipn_code asc
  `) as SamplerRow[];
}

export async function getCpqResultsPageData(filters: CpqResultsFilters) {
  const [filterOptions, rows] = await Promise.all([listFilterOptions(), listLatestRowsPerIpn(filters)]);

  const tiles = await Promise.all(rows.map(async (row) => {
    const selectedOptions = parseSelectedOptions(row.json_result);
    const imageResolution = await resolveImageLayersForSelectedOptions(selectedOptions);
    const text = deriveTileText(selectedOptions);

    return {
      ipn_code: row.ipn_code,
      ruleset: row.ruleset,
      account_code: row.account_code,
      country_code: row.country_code,
      created_at: row.created_at,
      lineLabel: text.lineLabel,
      specSummary: text.specSummary,
      colourDetail: text.colourDetail,
      selectedOptions,
      imageLayers: imageResolution.layers,
    } satisfies CpqResultsTileViewModel;
  }));

  return { filterOptions, tiles };
}
