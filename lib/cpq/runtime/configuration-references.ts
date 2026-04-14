import { sql } from '@/lib/db/client';

export type CanonicalConfigurationReference = {
  id: number;
  configuration_reference: string;
  canonical_header_id: string;
  canonical_detail_id: string;
  ruleset: string;
  namespace: string;
  product_description: string | null;
  account_code: string | null;
  country_code: string | null;
  source_working_detail_id: string | null;
  source_session_id: string | null;
  json_snapshot: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SaveCanonicalConfigurationReferenceInput = {
  configuration_reference?: string;
  canonical_header_id: string;
  canonical_detail_id: string;
  ruleset: string;
  namespace: string;
  product_description?: string | null;
  account_code?: string | null;
  country_code?: string | null;
  source_working_detail_id?: string | null;
  source_session_id?: string | null;
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

export async function saveCanonicalConfigurationReference(input: SaveCanonicalConfigurationReferenceInput) {
  const providedReference = trimOrNull(input.configuration_reference);
  const configurationReference = providedReference ?? buildReferenceKey();

  const rows = (await sql`
    insert into cpq_configuration_references (
      configuration_reference,
      canonical_header_id,
      canonical_detail_id,
      ruleset,
      namespace,
      product_description,
      account_code,
      country_code,
      source_working_detail_id,
      source_session_id,
      json_snapshot,
      is_active
    )
    values (
      ${configurationReference},
      ${trimRequired(input.canonical_header_id, 'canonical_header_id')},
      ${trimRequired(input.canonical_detail_id, 'canonical_detail_id')},
      ${trimRequired(input.ruleset, 'ruleset')},
      ${trimRequired(input.namespace, 'namespace')},
      ${trimOrNull(input.product_description)},
      ${trimOrNull(input.account_code)},
      ${trimOrNull(input.country_code)},
      ${trimOrNull(input.source_working_detail_id)},
      ${trimOrNull(input.source_session_id)},
      ${JSON.stringify(input.json_snapshot ?? {})}::jsonb,
      true
    )
    on conflict (configuration_reference)
    do update set
      canonical_header_id = excluded.canonical_header_id,
      canonical_detail_id = excluded.canonical_detail_id,
      ruleset = excluded.ruleset,
      namespace = excluded.namespace,
      product_description = excluded.product_description,
      account_code = excluded.account_code,
      country_code = excluded.country_code,
      source_working_detail_id = excluded.source_working_detail_id,
      source_session_id = excluded.source_session_id,
      json_snapshot = excluded.json_snapshot,
      is_active = true,
      updated_at = now()
    returning *
  `) as CanonicalConfigurationReference[];

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
  `) as CanonicalConfigurationReference[];

  return rows[0] ?? null;
}
