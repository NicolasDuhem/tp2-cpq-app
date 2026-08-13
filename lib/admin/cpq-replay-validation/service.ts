// Read-only validation service: do not write to Neon or external systems.
//
// Every statement in this module is a `select`. There is deliberately no insert/
// update/delete/upsert here, and nothing in this file may call sampler, configuration
// reference, audit, external PostgreSQL or BigCommerce write helpers.

import 'server-only';

import { sql } from '@/lib/db/client';
import type { ReplaySelection } from '@/lib/cpq/replay/matching';
import { normalizeConfigureDecisionKey } from '@/lib/cpq/replay/matching';

export const REFERENCE_LIST_DEFAULT_LIMIT = 100;
export const REFERENCE_LIST_MAX_LIMIT = 500;

export type ReplayValidationOptions = {
  bikeTypes: string[];
  countries: string[];
  bikeTypeSource: string;
  countrySource: string;
};

export type ReplayValidationReferenceRow = {
  id: number;
  configurationReference: string;
  countryCode: string | null;
  bikeType: string | null;
  ruleset: string | null;
  existingItemCode: string | null;
  productDescription: string | null;
  accountCode: string | null;
  createdAt: string;
  updatedAt: string | null;
};

/** Full context needed to rebuild a StartConfiguration payload for a replay run. */
export type ReplayReferenceContextRow = ReplayValidationReferenceRow & {
  namespace: string;
  canonicalHeaderId: string | null;
  headerId: string | null;
  canonicalDetailId: string | null;
  finalizedDetailId: string | null;
  sourceHeaderId: string | null;
  sourceDetailId: string | null;
  finalizedSessionId: string | null;
  customerId: string | null;
  accountType: string | null;
  company: string | null;
  currency: string | null;
  language: string | null;
  customerLocation: string | null;
  applicationInstance: string | null;
};

const asTrimmed = (value: unknown): string => String(value ?? '').trim();
const asNullableText = (value: unknown): string | null => asTrimmed(value) || null;

const asIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return asTrimmed(value);
};

const asNullableIsoString = (value: unknown): string | null => asIsoString(value) || null;

const toRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * `cpq_configuration_references` has no bike-type column. Bike type is resolved by
 * joining `ruleset` to `CPQ_setup_ruleset.bike_type` (the same mapping the sales
 * allocation matrix uses). References whose ruleset has no `bike_type` mapping fall
 * back to the ruleset name itself so no saved reference becomes unreachable.
 */
const BIKE_TYPE_EXPRESSION = "coalesce(nullif(trim(r.bike_type), ''), trim(c.ruleset))";

export async function listReplayValidationOptions(): Promise<ReplayValidationOptions> {
  const [bikeTypeRows, countryRows] = await Promise.all([
    sql`
      select distinct coalesce(nullif(trim(r.bike_type), ''), trim(c.ruleset)) as bike_type
      from cpq_configuration_references c
      left join CPQ_setup_ruleset r on trim(r.cpq_ruleset) = trim(c.ruleset)
      where c.is_active = true
        and coalesce(trim(c.ruleset), '') <> ''
      order by bike_type
    `,
    sql`
      select distinct trim(country_code) as country_code
      from cpq_configuration_references
      where is_active = true
        and coalesce(trim(country_code), '') <> ''
      order by country_code
    `,
  ]);

  return {
    bikeTypes: (bikeTypeRows as Array<{ bike_type: string | null }>)
      .map((row) => asTrimmed(row.bike_type))
      .filter(Boolean),
    countries: (countryRows as Array<{ country_code: string | null }>)
      .map((row) => asTrimmed(row.country_code))
      .filter(Boolean),
    bikeTypeSource: 'CPQ_setup_ruleset.bike_type joined on cpq_configuration_references.ruleset (falls back to ruleset)',
    countrySource: 'cpq_configuration_references.country_code',
  };
}

export function normalizeReferenceListLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return REFERENCE_LIST_DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), REFERENCE_LIST_MAX_LIMIT);
}

const mapReferenceRow = (row: Record<string, unknown>): ReplayValidationReferenceRow => ({
  id: Number(row.id),
  configurationReference: asTrimmed(row.configuration_reference),
  countryCode: asNullableText(row.country_code),
  bikeType: asNullableText(row.bike_type),
  ruleset: asNullableText(row.ruleset),
  existingItemCode: asNullableText(row.final_ipn_code),
  productDescription: asNullableText(row.product_description),
  accountCode: asNullableText(row.account_code),
  createdAt: asIsoString(row.created_at),
  updatedAt: asNullableIsoString(row.updated_at),
});

/**
 * Lightweight listing for the references table. `json_snapshot` and
 * `finalize_response_json` are intentionally never selected here.
 */
export async function listReplayValidationReferences(input: {
  bikeType: string;
  countryCode: string;
  limit?: number;
}): Promise<ReplayValidationReferenceRow[]> {
  const bikeType = asTrimmed(input.bikeType);
  const countryCode = asTrimmed(input.countryCode);
  if (!bikeType) throw new Error('bikeType is required');
  if (!countryCode) throw new Error('countryCode is required');
  const limit = normalizeReferenceListLimit(input.limit);

  const rows = await sql`
    select
      c.id,
      c.configuration_reference,
      c.country_code,
      c.ruleset,
      coalesce(nullif(trim(r.bike_type), ''), trim(c.ruleset)) as bike_type,
      c.final_ipn_code,
      c.product_description,
      c.account_code,
      c.created_at,
      c.updated_at
    from cpq_configuration_references c
    left join CPQ_setup_ruleset r on trim(r.cpq_ruleset) = trim(c.ruleset)
    where c.is_active = true
      and coalesce(nullif(trim(r.bike_type), ''), trim(c.ruleset)) = ${bikeType}
      and coalesce(trim(c.country_code), '') = ${countryCode}
    order by c.updated_at desc nulls last, c.id desc
    limit ${limit}
  `;

  return (rows as Array<Record<string, unknown>>).map(mapReferenceRow);
}

/** Loads the replay context for the selected reference IDs. Still no snapshot columns. */
export async function loadReplayReferenceContexts(referenceIds: number[]): Promise<ReplayReferenceContextRow[]> {
  if (referenceIds.length === 0) return [];

  const rows = await sql`
    select
      c.id,
      c.configuration_reference,
      c.country_code,
      c.ruleset,
      coalesce(nullif(trim(r.bike_type), ''), trim(c.ruleset)) as bike_type,
      c.final_ipn_code,
      c.product_description,
      c.account_code,
      c.created_at,
      c.updated_at,
      c.namespace,
      c.canonical_header_id,
      c.header_id,
      c.canonical_detail_id,
      c.finalized_detail_id,
      c.source_header_id,
      c.source_detail_id,
      c.finalized_session_id,
      c.customer_id,
      c.account_type,
      c.company,
      c.currency,
      c.language,
      c.customer_location,
      c.application_instance
    from cpq_configuration_references c
    left join CPQ_setup_ruleset r on trim(r.cpq_ruleset) = trim(c.ruleset)
    where c.is_active = true
      and c.id = any(${referenceIds}::bigint[])
    order by c.id
  `;

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    ...mapReferenceRow(row),
    namespace: asTrimmed(row.namespace) || 'Default',
    canonicalHeaderId: asNullableText(row.canonical_header_id),
    headerId: asNullableText(row.header_id),
    canonicalDetailId: asNullableText(row.canonical_detail_id),
    finalizedDetailId: asNullableText(row.finalized_detail_id),
    sourceHeaderId: asNullableText(row.source_header_id),
    sourceDetailId: asNullableText(row.source_detail_id),
    finalizedSessionId: asNullableText(row.finalized_session_id),
    customerId: asNullableText(row.customer_id),
    accountType: asNullableText(row.account_type),
    company: asNullableText(row.company),
    currency: asNullableText(row.currency),
    language: asNullableText(row.language),
    customerLocation: asNullableText(row.customer_location),
    applicationInstance: asNullableText(row.application_instance),
  }));
}

export type IgnoredConfigureRules = {
  featureLabels: Set<string>;
  tripleKeys: Set<string>;
};

export const buildIgnoreTripleKey = (featureLabel: unknown, optionLabel: unknown, optionValue: unknown) =>
  [
    normalizeConfigureDecisionKey(featureLabel),
    normalizeConfigureDecisionKey(optionLabel),
    normalizeConfigureDecisionKey(optionValue),
  ].join('||');

/**
 * Same ignore source and semantics as the `/cpq` bulk configure loop:
 * only `cpq_image_management.ignore_during_configure = true` skips a selection.
 */
export async function loadIgnoredConfigureRules(): Promise<IgnoredConfigureRules> {
  const rows = (await sql`
    select feature_label, option_label, option_value
    from cpq_image_management
    where ignore_during_configure = true
  `) as Array<{ feature_label: string | null; option_label: string | null; option_value: string | null }>;

  const featureLabels = new Set<string>();
  const tripleKeys = new Set<string>();
  for (const row of rows) {
    const featureLabel = normalizeConfigureDecisionKey(row.feature_label);
    if (featureLabel) featureLabels.add(featureLabel);
    tripleKeys.add(buildIgnoreTripleKey(row.feature_label, row.option_label, row.option_value));
  }
  return { featureLabels, tripleKeys };
}

const parseSelectionsFromSamplerPayload = (jsonResult: unknown): ReplaySelection[] => {
  const payload = toRecord(jsonResult);
  const selectedOptions = Array.isArray(payload.selectedOptions) ? payload.selectedOptions : [];
  const dropdownSnapshot = Array.isArray(payload.dropdownOrderSnapshot) ? payload.dropdownOrderSnapshot : [];

  const fromSelected = selectedOptions
    .map((raw): ReplaySelection | null => {
      const record = toRecord(raw);
      const featureLabel = asTrimmed(record.featureLabel ?? record.feature_label);
      const optionLabel = asTrimmed(record.optionLabel ?? record.option_label);
      const optionValue = asTrimmed(record.optionValue ?? record.option_value) || optionLabel;
      if (!featureLabel || !optionLabel || !optionValue) return null;
      return {
        featureLabel,
        featureId: asTrimmed(record.featureId ?? record.feature_id) || undefined,
        optionLabel,
        optionValue,
        optionId: asTrimmed(record.optionId ?? record.option_id) || undefined,
      };
    })
    .filter((entry): entry is ReplaySelection => entry !== null);
  if (fromSelected.length > 0) return fromSelected;

  return dropdownSnapshot
    .map((raw): ReplaySelection | null => {
      const record = toRecord(raw);
      const featureLabel = asTrimmed(record.featureLabel ?? record.feature_label);
      const optionLabel = asTrimmed(record.selectedOptionLabel ?? record.optionLabel ?? record.option_label);
      const optionValue = asTrimmed(record.selectedOptionValue ?? record.optionValue ?? record.option_value) || optionLabel;
      if (!featureLabel || !optionLabel || !optionValue) return null;
      return {
        featureLabel,
        featureId: asTrimmed(record.featureId ?? record.feature_id) || undefined,
        optionLabel,
        optionValue,
        optionId: asTrimmed(record.selectedOptionId ?? record.optionId) || undefined,
      };
    })
    .filter((entry): entry is ReplaySelection => entry !== null);
};

export type RecordedSelectionLookup = {
  selections: ReplaySelection[];
  samplerRowId: number | null;
  matchedOn: 'detail_id' | 'session_id' | 'ipn_ruleset_country' | null;
};

/**
 * Recover the recorded option set for a saved configuration reference.
 *
 * `cpq_configuration_references.json_snapshot` is written through
 * `reduceConfigurationJsonSnapshot()`, which keeps only ForecastAs/Description/
 * DetailId/TradePrice/MSRP captions — the selected-option list does not survive it.
 * The surviving recorded copy is `CPQ_sampler_result.json_result`, which is read
 * here (select only) and matched by detail id, then session id, then
 * ipn/ruleset/country.
 */
export async function loadRecordedSelectionsForReference(
  reference: ReplayReferenceContextRow,
): Promise<RecordedSelectionLookup> {
  const detailIds = [reference.canonicalDetailId, reference.finalizedDetailId].filter(
    (value): value is string => Boolean(value),
  );
  const sessionId = reference.finalizedSessionId;
  const ipnCode = reference.existingItemCode;
  const ruleset = reference.ruleset ?? '';
  const countryCode = reference.countryCode ?? '';

  if (detailIds.length > 0) {
    const rows = (await sql`
      select id, json_result
      from CPQ_sampler_result
      where coalesce(trim(detail_id), '') = any(${detailIds}::text[])
      order by updated_at desc nulls last, id desc
      limit 1
    `) as Array<{ id: number; json_result: unknown }>;
    const row = rows[0];
    if (row) {
      const selections = parseSelectionsFromSamplerPayload(row.json_result);
      if (selections.length > 0) return { selections, samplerRowId: Number(row.id), matchedOn: 'detail_id' };
    }
  }

  if (sessionId) {
    const rows = (await sql`
      select id, json_result
      from CPQ_sampler_result
      where coalesce(trim(session_id), '') = ${sessionId}
      order by updated_at desc nulls last, id desc
      limit 1
    `) as Array<{ id: number; json_result: unknown }>;
    const row = rows[0];
    if (row) {
      const selections = parseSelectionsFromSamplerPayload(row.json_result);
      if (selections.length > 0) return { selections, samplerRowId: Number(row.id), matchedOn: 'session_id' };
    }
  }

  if (ipnCode && ruleset) {
    const rows = (await sql`
      select id, json_result
      from CPQ_sampler_result
      where coalesce(trim(ipn_code), '') = ${ipnCode}
        and coalesce(trim(ruleset), '') = ${ruleset}
      order by case when coalesce(trim(country_code), '') = ${countryCode} then 0 else 1 end,
               updated_at desc nulls last,
               id desc
      limit 1
    `) as Array<{ id: number; json_result: unknown }>;
    const row = rows[0];
    if (row) {
      const selections = parseSelectionsFromSamplerPayload(row.json_result);
      if (selections.length > 0) {
        return { selections, samplerRowId: Number(row.id), matchedOn: 'ipn_ruleset_country' };
      }
    }
  }

  return { selections: [], samplerRowId: null, matchedOn: null };
}
