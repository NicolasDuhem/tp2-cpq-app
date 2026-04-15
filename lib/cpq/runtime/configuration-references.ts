import { sql } from '@/lib/db/client';
import { createTraceId, errorToLog, logTrace } from './debug';

export type ConfigurationReferenceRow = {
  id: number;
  configuration_reference: string;
  canonical_header_id: string;
  canonical_detail_id: string;
  ruleset: string;
  namespace: string;
  header_id: string | null;
  finalized_detail_id: string | null;
  source_working_detail_id: string | null;
  source_session_id: string | null;
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
  canonical_header_id?: string | null;
  canonical_detail_id?: string | null;
  ruleset: string;
  namespace: string;
  header_id?: string | null;
  finalized_detail_id?: string | null;
  source_working_detail_id?: string | null;
  source_session_id?: string | null;
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

type DbTraceOptions = {
  traceId?: string;
  route?: string;
  action?: string;
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

const buildReferenceKey = () =>
  `CFG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const toJsonObject = (value: unknown, fieldName: string) => {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be a JSON object`);
  }
  return value as Record<string, unknown>;
};

export async function saveConfigurationReference(input: SaveConfigurationReferenceInput, options?: DbTraceOptions) {
  const traceId = options?.traceId ?? createTraceId();
  const start = Date.now();
  const providedReference = trimOrNull(input.configuration_reference);
  const configurationReference = providedReference ?? buildReferenceKey();
  const ruleset = trimRequired(input.ruleset, 'ruleset');
  const namespace = trimRequired(input.namespace, 'namespace');
  const canonicalDetailId = trimRequired(input.canonical_detail_id ?? input.finalized_detail_id, 'canonical_detail_id');
  const canonicalHeaderId = trimOrNull(input.canonical_header_id ?? input.header_id) ?? 'Simulator';
  const finalizeResponseJson = toJsonObject(input.finalize_response_json, 'finalize_response_json');
  const jsonSnapshot = toJsonObject(input.json_snapshot, 'json_snapshot');
  const payload = {
    configuration_reference: trimRequired(configurationReference, 'configuration_reference'),
    canonical_header_id: canonicalHeaderId,
    canonical_detail_id: canonicalDetailId,
    ruleset,
    namespace,
    header_id: trimOrNull(input.header_id) ?? canonicalHeaderId,
    finalized_detail_id: trimOrNull(input.finalized_detail_id) ?? canonicalDetailId,
    source_working_detail_id: trimOrNull(input.source_working_detail_id),
    source_session_id: trimOrNull(input.source_session_id),
    source_header_id: trimOrNull(input.source_header_id),
    source_detail_id: trimOrNull(input.source_detail_id),
    account_code: trimOrNull(input.account_code),
    customer_id: trimOrNull(input.customer_id),
    account_type: trimOrNull(input.account_type),
    company: trimOrNull(input.company),
    currency: trimOrNull(input.currency),
    language: trimOrNull(input.language),
    country_code: trimOrNull(input.country_code),
    customer_location: trimOrNull(input.customer_location),
    application_instance: trimOrNull(input.application_instance),
    application_name: trimOrNull(input.application_name),
    finalized_session_id: trimOrNull(input.finalized_session_id),
    final_ipn_code: trimOrNull(input.final_ipn_code),
    product_description: trimOrNull(input.product_description),
    finalize_response_json: finalizeResponseJson,
    json_snapshot: jsonSnapshot,
    is_active: true,
  };

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: options?.action ?? 'saveConfigurationReference',
    route: options?.route ?? '/api/cpq/configuration-references',
    source: 'db',
    request: {
      input,
      db_payload: payload,
    },
  });

  try {
    const rows = (await sql`
      insert into cpq_configuration_references (
        configuration_reference,
        canonical_header_id,
        canonical_detail_id,
        ruleset,
        namespace,
        header_id,
        finalized_detail_id,
        source_working_detail_id,
        source_session_id,
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
        ${payload.configuration_reference},
        ${payload.canonical_header_id},
        ${payload.canonical_detail_id},
        ${payload.ruleset},
        ${payload.namespace},
        ${payload.header_id},
        ${payload.finalized_detail_id},
        ${payload.source_working_detail_id},
        ${payload.source_session_id},
        ${payload.source_header_id},
        ${payload.source_detail_id},
        ${payload.account_code},
        ${payload.customer_id},
        ${payload.account_type},
        ${payload.company},
        ${payload.currency},
        ${payload.language},
        ${payload.country_code},
        ${payload.customer_location},
        ${payload.application_instance},
        ${payload.application_name},
        ${payload.finalized_session_id},
        ${payload.final_ipn_code},
        ${payload.product_description},
        ${JSON.stringify(payload.finalize_response_json)}::jsonb,
        ${JSON.stringify(payload.json_snapshot)}::jsonb,
        ${payload.is_active}
      )
      on conflict (configuration_reference) do update
      set
        canonical_header_id = excluded.canonical_header_id,
        canonical_detail_id = excluded.canonical_detail_id,
        ruleset = excluded.ruleset,
        namespace = excluded.namespace,
        header_id = excluded.header_id,
        finalized_detail_id = excluded.finalized_detail_id,
        source_working_detail_id = excluded.source_working_detail_id,
        source_session_id = excluded.source_session_id,
        source_header_id = excluded.source_header_id,
        source_detail_id = excluded.source_detail_id,
        account_code = excluded.account_code,
        customer_id = excluded.customer_id,
        account_type = excluded.account_type,
        company = excluded.company,
        currency = excluded.currency,
        language = excluded.language,
        country_code = excluded.country_code,
        customer_location = excluded.customer_location,
        application_instance = excluded.application_instance,
        application_name = excluded.application_name,
        finalized_session_id = excluded.finalized_session_id,
        final_ipn_code = excluded.final_ipn_code,
        product_description = excluded.product_description,
        finalize_response_json = excluded.finalize_response_json,
        json_snapshot = excluded.json_snapshot,
        is_active = excluded.is_active,
        updated_at = now()
      returning *
    `) as ConfigurationReferenceRow[];

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: options?.action ?? 'saveConfigurationReference',
      route: options?.route ?? '/api/cpq/configuration-references',
      source: 'db',
      status: 201,
      success: true,
      durationMs: Date.now() - start,
      response: rows[0],
    });

    return rows[0];
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: options?.action ?? 'saveConfigurationReference',
      route: options?.route ?? '/api/cpq/configuration-references',
      source: 'db',
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });
    throw error;
  }
}

export async function resolveConfigurationReference(configurationReference: string, options?: DbTraceOptions) {
  const traceId = options?.traceId ?? createTraceId();
  const start = Date.now();

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: options?.action ?? 'resolveConfigurationReference',
    route: options?.route ?? '/api/cpq/configuration-references',
    source: 'db',
    request: { configurationReference },
  });

  try {
    const rows = (await sql`
      select *
      from cpq_configuration_references
      where configuration_reference = ${trimRequired(configurationReference, 'configuration_reference')}
        and is_active = true
      order by updated_at desc, id desc
      limit 1
    `) as ConfigurationReferenceRow[];

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: options?.action ?? 'resolveConfigurationReference',
      route: options?.route ?? '/api/cpq/configuration-references',
      source: 'db',
      status: 200,
      success: true,
      durationMs: Date.now() - start,
      response: rows[0] ?? { found: false },
    });

    return rows[0] ?? null;
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: options?.action ?? 'resolveConfigurationReference',
      route: options?.route ?? '/api/cpq/configuration-references',
      source: 'db',
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });
    throw error;
  }
}
