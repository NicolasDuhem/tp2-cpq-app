import 'server-only';
import { sql } from '@/lib/db/client';
import { withExternalPgClient } from '@/lib/external-pg/client';
import { normalizeExternalPgError } from '@/lib/external-pg/errors';

type ExternalSamplerPayload = {
  ipnCode: string;
  ruleset: string;
  accountCode: string;
  customerId: string;
  currency: string | null;
  language: string | null;
  countryCode: string;
  namespace: string;
  headerId: string;
  detailId: string;
  sessionId: string;
  active: boolean;
  jsonResult: Record<string, unknown>;
  processedForImageSync: boolean;
  processedForImageSyncAt: string | null;
  createdAt: string | null;
};

export type ExternalSamplerUpsertResult = {
  action: 'inserted' | 'updated';
  id: number;
  businessKey: {
    namespace: string;
    ipnCode: string;
    countryCode: string;
  };
};

export type ExternalSamplerWriteDiagnosticResult = {
  rolledBack: true;
  tableName: string;
  durationMs: number;
};

type ExternalPushStage =
  | 'begin_start'
  | 'begin_success'
  | 'upsert_start'
  | 'upsert_success'
  | 'rollback_start'
  | 'rollback_success'
  | 'loading_source_data'
  | 'source_data_loaded';

type ExternalPushOptions = {
  onStage?: (stage: ExternalPushStage | import('@/lib/external-pg/client').ExternalPgStage, details?: Record<string, unknown>) => void;
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

function normalizeBoolean(value: unknown) {
  return value === true || value === 'true' || value === 't' || value === 1 || value === '1';
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString();
}

function ensurePayload(payload: ExternalSamplerPayload) {
  if (!asTrimmed(payload.ipnCode)) throw new Error('ipn_code is required for external push');
  if (!asTrimmed(payload.ruleset)) throw new Error('ruleset is required for external push');
  if (!asTrimmed(payload.accountCode)) throw new Error('account_code is required for external push');
  if (!asTrimmed(payload.customerId)) throw new Error('customer_id is required for external push');
  if (!asTrimmed(payload.countryCode)) throw new Error('country_code is required for external push');
  if (!asTrimmed(payload.namespace)) throw new Error('namespace is required for external push');
  if (!asTrimmed(payload.headerId)) throw new Error('header_id is required for external push');
  if (!asTrimmed(payload.detailId)) throw new Error('detail_id is required for external push');
  if (!asTrimmed(payload.sessionId)) throw new Error('session_id is required for external push');
}

export async function upsertExternalSamplerResult(
  payload: ExternalSamplerPayload,
  options: ExternalPushOptions = {},
): Promise<ExternalSamplerUpsertResult> {
  ensurePayload(payload);

  return withExternalPgClient(async (client, schema) => {
    const tableName = `${schema}.cpq_sampler_result`;
    options.onStage?.('upsert_start', { tableName });

    let result;
    try {
      result = await client.query(
        `
      insert into ${tableName} (
        ipn_code,
        ruleset,
        account_code,
        customer_id,
        currency,
        language,
        country_code,
        namespace,
        header_id,
        detail_id,
        session_id,
        active,
        json_result,
        processed_for_image_sync,
        processed_for_image_sync_at,
        created_at,
        updated_at
      ) values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13::jsonb,
        $14,
        $15::timestamptz,
        coalesce($16::timestamptz, now()),
        now()
      )
      on conflict (namespace, ipn_code, country_code)
      do update set
        ruleset = excluded.ruleset,
        account_code = excluded.account_code,
        customer_id = excluded.customer_id,
        currency = excluded.currency,
        language = excluded.language,
        active = excluded.active,
        json_result = excluded.json_result,
        processed_for_image_sync = excluded.processed_for_image_sync,
        processed_for_image_sync_at = excluded.processed_for_image_sync_at,
        updated_at = now()
      returning id, (xmax = 0) as inserted;
    `,
        [
          payload.ipnCode,
          payload.ruleset,
          payload.accountCode,
          payload.customerId,
          payload.currency,
          payload.language,
          payload.countryCode,
          payload.namespace,
          payload.headerId,
          payload.detailId,
          payload.sessionId,
          payload.active,
          JSON.stringify(payload.jsonResult ?? {}),
          payload.processedForImageSync,
          payload.processedForImageSyncAt,
          payload.createdAt,
        ],
      );
    } catch (error) {
      throw normalizeExternalPgError(error, { stage: 'upsert_execute' });
    }

    const row = result.rows[0] as { id: number; inserted: boolean } | undefined;
    if (!row) {
      throw new Error('No result returned by external upsert');
    }

    options.onStage?.('upsert_success', {
      id: Number(row.id),
      action: row.inserted ? 'inserted' : 'updated',
      businessKey: {
        namespace: payload.namespace,
        ipnCode: payload.ipnCode,
        countryCode: payload.countryCode,
      },
    });

    return {
      action: row.inserted ? 'inserted' : 'updated',
      id: Number(row.id),
      businessKey: {
        namespace: payload.namespace,
        ipnCode: payload.ipnCode,
        countryCode: payload.countryCode,
      },
    };
  }, options);
}

export async function runExternalSamplerWriteDiagnostic(
  payload: ExternalSamplerPayload,
  options: ExternalPushOptions = {},
): Promise<ExternalSamplerWriteDiagnosticResult> {
  ensurePayload(payload);
  const startedAt = Date.now();

  return withExternalPgClient(async (client, schema) => {
    const tableName = `${schema}.cpq_sampler_result`;
    options.onStage?.('begin_start', { tableName, mode: 'write_diagnostic_rollback' });
    try {
      await client.query('begin');
      options.onStage?.('begin_success', { tableName, mode: 'write_diagnostic_rollback' });
      options.onStage?.('upsert_start', { tableName, mode: 'write_diagnostic_rollback' });
      await client.query(
        `
      insert into ${tableName} (
        ipn_code,
        ruleset,
        account_code,
        customer_id,
        currency,
        language,
        country_code,
        namespace,
        header_id,
        detail_id,
        session_id,
        active,
        json_result,
        processed_for_image_sync,
        processed_for_image_sync_at,
        created_at,
        updated_at
      ) values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13::jsonb,
        $14,
        $15::timestamptz,
        coalesce($16::timestamptz, now()),
        now()
      )
      on conflict (namespace, ipn_code, country_code)
      do update set
        ruleset = excluded.ruleset,
        account_code = excluded.account_code,
        customer_id = excluded.customer_id,
        currency = excluded.currency,
        language = excluded.language,
        active = excluded.active,
        json_result = excluded.json_result,
        processed_for_image_sync = excluded.processed_for_image_sync,
        processed_for_image_sync_at = excluded.processed_for_image_sync_at,
        updated_at = now()
    `,
        [
          payload.ipnCode,
          payload.ruleset,
          payload.accountCode,
          payload.customerId,
          payload.currency,
          payload.language,
          payload.countryCode,
          payload.namespace,
          payload.headerId,
          payload.detailId,
          payload.sessionId,
          payload.active,
          JSON.stringify(payload.jsonResult ?? {}),
          payload.processedForImageSync,
          payload.processedForImageSyncAt,
          payload.createdAt,
        ],
      );
      options.onStage?.('upsert_success', { mode: 'write_diagnostic_rollback' });
      options.onStage?.('rollback_start', { mode: 'write_diagnostic_rollback' });
      await client.query('rollback');
      options.onStage?.('rollback_success', { mode: 'write_diagnostic_rollback' });
      return {
        rolledBack: true,
        tableName,
        durationMs: Math.max(0, Date.now() - startedAt),
      };
    } catch (error) {
      options.onStage?.('rollback_start', { mode: 'write_diagnostic_rollback', from: 'catch' });
      await client.query('rollback').catch(() => undefined);
      options.onStage?.('rollback_success', { mode: 'write_diagnostic_rollback', from: 'catch' });
      throw normalizeExternalPgError(error, { stage: 'upsert_execute' });
    }
  }, options);
}

export async function buildBikeExternalSamplerPayload(input: {
  ruleset: string;
  ipnCode: string;
  countryCode: string;
}, options: ExternalPushOptions = {}): Promise<ExternalSamplerPayload> {
  const ruleset = asTrimmed(input.ruleset);
  const ipnCode = asTrimmed(input.ipnCode);
  const countryCode = asTrimmed(input.countryCode).toUpperCase();

  if (!ruleset) throw new Error('ruleset is required');
  if (!ipnCode) throw new Error('ipnCode is required');
  if (!countryCode) throw new Error('countryCode is required');

  options.onStage?.('loading_source_data', { source: 'bike', ruleset, ipnCode, countryCode });
  const rows = (await sql`
    select
      ipn_code,
      ruleset,
      account_code,
      customer_id,
      currency,
      language,
      country_code,
      namespace,
      header_id,
      detail_id,
      session_id,
      active,
      json_result,
      processed_for_image_sync,
      processed_for_image_sync_at,
      created_at
    from CPQ_sampler_result
    where coalesce(trim(ruleset), '') = ${ruleset}
      and coalesce(trim(ipn_code), '') = ${ipnCode}
      and coalesce(trim(country_code), '') = ${countryCode}
    order by updated_at desc, created_at desc, id desc
    limit 1
  `) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) {
    throw new Error(`No bike sampler row found for ${ruleset} / ${ipnCode} / ${countryCode}`);
  }
  options.onStage?.('source_data_loaded', { source: 'bike' });

  return {
    ipnCode,
    ruleset: asTrimmed(row.ruleset) || ruleset,
    accountCode: asTrimmed(row.account_code),
    customerId: asTrimmed(row.customer_id) || asTrimmed(row.account_code),
    currency: asTrimmed(row.currency) || null,
    language: asTrimmed(row.language) || null,
    countryCode,
    namespace: asTrimmed(row.namespace) || 'Default',
    headerId: asTrimmed(row.header_id) || 'Simulator',
    detailId: asTrimmed(row.detail_id) || 'Simulator',
    sessionId: asTrimmed(row.session_id) || 'Simulator',
    active: normalizeBoolean(row.active),
    jsonResult: (row.json_result && typeof row.json_result === 'object' ? (row.json_result as Record<string, unknown>) : {}) ?? {},
    processedForImageSync: normalizeBoolean(row.processed_for_image_sync),
    processedForImageSyncAt: toIsoDate(row.processed_for_image_sync_at),
    createdAt: toIsoDate(row.created_at),
  };
}

export async function buildQpartExternalSamplerPayload(input: {
  partId: number;
  countryCode: string;
}, options: ExternalPushOptions = {}): Promise<ExternalSamplerPayload> {
  const partId = Number(input.partId);
  const countryCode = asTrimmed(input.countryCode).toUpperCase();

  if (!Number.isFinite(partId)) throw new Error('partId is required');
  if (!countryCode) throw new Error('countryCode is required');

  options.onStage?.('loading_source_data', { source: 'qpart', partId, countryCode });
  const rows = (await sql`
    select
      p.part_number,
      allocation.country_code,
      allocation.active,
      allocation.created_at,
      account.account_code,
      account.language
    from qpart_country_allocation allocation
    join qpart_parts p on p.id = allocation.part_id
    left join lateral (
      select ac.account_code, ac.language
      from CPQ_setup_account_context ac
      where coalesce(trim(ac.country_code::text), '') = ${countryCode}
        and ac.is_active = true
      order by ac.updated_at desc, ac.id desc
      limit 1
    ) account on true
    where allocation.part_id = ${partId}
      and allocation.country_code = ${countryCode}
    limit 1
  `) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) {
    throw new Error(`No QPart country allocation row found for part ${partId} / ${countryCode}`);
  }
  options.onStage?.('source_data_loaded', { source: 'qpart' });

  const partNumber = asTrimmed(row.part_number);
  const accountCode = asTrimmed(row.account_code);

  if (!partNumber) {
    throw new Error(`Missing part_number for part ${partId}`);
  }
  if (!accountCode) {
    throw new Error(`No active CPQ_setup_account_context account_code found for country ${countryCode}`);
  }

  return {
    ipnCode: partNumber,
    ruleset: 'Qpart',
    accountCode,
    customerId: accountCode,
    currency: null,
    language: asTrimmed(row.language) || null,
    countryCode,
    namespace: 'qpart',
    headerId: 'qpart',
    detailId: 'qpart',
    sessionId: 'qpart',
    active: normalizeBoolean(row.active),
    jsonResult: {},
    processedForImageSync: false,
    processedForImageSyncAt: null,
    createdAt: toIsoDate(row.created_at),
  };
}
