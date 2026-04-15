import { sql } from '@/lib/db/client';

export type ConfigurationReferenceRow = {
  id: number;
  configuration_reference: string;
  ruleset: string;
  namespace: string;
  header_id: string;
  finalized_detail_id: string;
  source_header_id: string | null;
  source_detail_id: string | null;
  account_code: string | null;
  customer_id: string | null;
  account_type: string | null;
  company: string | null;
  currency: string | null;
  language: string | null;
  country_code: string | null;
  customer_location: string | null;
  application_instance: string | null;
  application_name: string | null;
  finalized_session_id: string | null;
  final_ipn_code: string | null;
  product_description: string | null;
  finalize_response_json: unknown;
  json_snapshot: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SaveConfigurationReferenceInput = {
  configuration_reference?: string;
  ruleset: string;
  namespace: string;
  header_id: string;
  finalized_detail_id: string;
  source_header_id?: string | null;
  source_detail_id?: string | null;
  account_code?: string | null;
  customer_id?: string | null;
  account_type?: string | null;
  company?: string | null;
  currency?: string | null;
  language?: string | null;
  country_code?: string | null;
  customer_location?: string | null;
  application_instance?: string | null;
  application_name?: string | null;
  finalized_session_id?: string | null;
  final_ipn_code?: string | null;
  product_description?: string | null;
  finalize_response_json?: unknown;
  json_snapshot?: unknown;
};

const trimOrNull = (value: unknown) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const trimRequired = (value: unknown, field: string) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
};

const buildReferenceKey = () => `CFG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

export async function saveConfigurationReference(input: SaveConfigurationReferenceInput) {
  const providedReference = trimOrNull(input.configuration_reference);
  const configurationReference = providedReference ?? buildReferenceKey();

  const rows = (await sql`
    insert into cpq_configuration_references (
      configuration_reference,
      ruleset,
      namespace,
      header_id,
      finalized_detail_id,
      source_header_id,
      source_detail_id,
      account_code,
      customer_id,
      account_type,
      company,
      currency,
      language,
      country_code,
      customer_location,
      application_instance,
      application_name,
      finalized_session_id,
      final_ipn_code,
      product_description,
      finalize_response_json,
      json_snapshot,
      is_active
    )
    values (
      ${configurationReference},
      ${trimRequired(input.ruleset, 'ruleset')},
      ${trimRequired(input.namespace, 'namespace')},
      ${trimRequired(input.header_id, 'header_id')},
      ${trimRequired(input.finalized_detail_id, 'finalized_detail_id')},
      ${trimOrNull(input.source_header_id)},
      ${trimOrNull(input.source_detail_id)},
      ${trimOrNull(input.account_code)},
      ${trimOrNull(input.customer_id)},
      ${trimOrNull(input.account_type)},
      ${trimOrNull(input.company)},
      ${trimOrNull(input.currency)},
      ${trimOrNull(input.language)},
      ${trimOrNull(input.country_code)},
      ${trimOrNull(input.customer_location)},
      ${trimOrNull(input.application_instance)},
      ${trimOrNull(input.application_name)},
      ${trimOrNull(input.finalized_session_id)},
      ${trimOrNull(input.final_ipn_code)},
      ${trimOrNull(input.product_description)},
      ${JSON.stringify(input.finalize_response_json ?? {})}::jsonb,
      ${JSON.stringify(input.json_snapshot ?? {})}::jsonb,
      true
    )
    returning *
  `) as ConfigurationReferenceRow[];

  return rows[0];
}

export async function resolveConfigurationReference(configurationReference: string) {
  const rows = (await sql`
    select *
    from cpq_configuration_references
    where configuration_reference = ${trimRequired(configurationReference, 'configuration_reference')}
      and is_active = true
    order by updated_at desc, id desc
    limit 1
  `) as ConfigurationReferenceRow[];

  return rows[0] ?? null;
}
