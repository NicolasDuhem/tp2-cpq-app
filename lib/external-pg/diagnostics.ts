import 'server-only';
import { lookup } from 'node:dns/promises';
import { Client } from 'pg';
import { getExternalPgConfig } from '@/lib/external-pg/client';
import { normalizeExternalPgError } from '@/lib/external-pg/errors';

export type ExternalPgDiagnosticStageName =
  | 'env_validation'
  | 'dns_resolution'
  | 'tcp_connect'
  | 'ssl_handshake'
  | 'authentication'
  | 'simple_query'
  | 'table_exists'
  | 'upsert_prerequisite';

export type ExternalPgDiagnosticStageResult = {
  stage: ExternalPgDiagnosticStageName;
  ok: boolean;
  duration_ms: number;
  message: string;
};

export type ExternalPgDiagnosticResult = {
  success: boolean;
  stage_results: ExternalPgDiagnosticStageResult[];
  config_summary: {
    host: string;
    port: number;
    database: string;
    schema: string;
    ssl_enabled: boolean;
    ssl_reject_unauthorized: boolean;
    connect_timeout_ms: number;
    query_timeout_ms: number;
    statement_timeout_ms: number;
  };
  final_failure_stage: ExternalPgDiagnosticStageName | null;
  final_failure_type: string | null;
};

function measureStart() {
  return Date.now();
}

function durationFrom(start: number) {
  return Math.max(0, Date.now() - start);
}

function classifyConnectFailureStage(message: string): ExternalPgDiagnosticStageName {
  const lowered = message.toLowerCase();
  if (lowered.includes('ssl') || lowered.includes('tls') || lowered.includes('certificate')) return 'ssl_handshake';
  if (lowered.includes('password authentication failed') || lowered.includes('does not exist')) return 'authentication';
  return 'tcp_connect';
}

export async function runExternalPgDiagnostics(): Promise<ExternalPgDiagnosticResult> {
  const stageResults: ExternalPgDiagnosticStageResult[] = [];

  const fail = (
    stage: ExternalPgDiagnosticStageName,
    message: string,
    durationMs: number,
    failureType: string,
    configSummary: ExternalPgDiagnosticResult['config_summary'],
  ): ExternalPgDiagnosticResult => {
    stageResults.push({ stage, ok: false, duration_ms: durationMs, message });
    return {
      success: false,
      stage_results: stageResults,
      config_summary: configSummary,
      final_failure_stage: stage,
      final_failure_type: failureType,
    };
  };

  const envStart = measureStart();
  let config;
  try {
    config = getExternalPgConfig();
    stageResults.push({
      stage: 'env_validation',
      ok: true,
      duration_ms: durationFrom(envStart),
      message: 'External PostgreSQL env vars parsed successfully.',
    });
  } catch (error) {
    const normalized = normalizeExternalPgError(error);
    return {
      success: false,
      stage_results: [
        {
          stage: 'env_validation',
          ok: false,
          duration_ms: durationFrom(envStart),
          message: normalized.message,
        },
      ],
      config_summary: {
        host: String(process.env.EXTERNAL_PG_HOST ?? ''),
        port: Number(process.env.EXTERNAL_PG_PORT ?? 5432),
        database: String(process.env.EXTERNAL_PG_DATABASE ?? ''),
        schema: String(process.env.EXTERNAL_PG_SCHEMA ?? 'public') || 'public',
        ssl_enabled: String(process.env.EXTERNAL_PG_SSL ?? 'true').trim().toLowerCase() !== 'false',
        ssl_reject_unauthorized: String(process.env.EXTERNAL_PG_SSL_REJECT_UNAUTHORIZED ?? 'false').trim().toLowerCase() === 'true',
        connect_timeout_ms: Number(process.env.EXTERNAL_PG_CONNECT_TIMEOUT_MS ?? 8000),
        query_timeout_ms: Number(process.env.EXTERNAL_PG_QUERY_TIMEOUT_MS ?? 12000),
        statement_timeout_ms: Number(process.env.EXTERNAL_PG_STATEMENT_TIMEOUT_MS ?? 12000),
      },
      final_failure_stage: 'env_validation',
      final_failure_type: normalized.code,
    };
  }

  const diagnosticConnectTimeoutMs = Math.min(config.connectionTimeoutMs, 5000);
  const diagnosticQueryTimeoutMs = Math.min(config.queryTimeoutMs, 5000);
  const diagnosticStatementTimeoutMs = Math.min(config.statementTimeoutMs, 5000);

  const configSummary: ExternalPgDiagnosticResult['config_summary'] = {
    host: config.host,
    port: config.port,
    database: config.database,
    schema: config.schema,
    ssl_enabled: config.ssl,
    ssl_reject_unauthorized: config.sslRejectUnauthorized,
    connect_timeout_ms: diagnosticConnectTimeoutMs,
    query_timeout_ms: diagnosticQueryTimeoutMs,
    statement_timeout_ms: diagnosticStatementTimeoutMs,
  };

  const dnsStart = measureStart();
  try {
    const resolved = await lookup(config.host);
    stageResults.push({
      stage: 'dns_resolution',
      ok: true,
      duration_ms: durationFrom(dnsStart),
      message: `Host resolved (family=${resolved.family}).`,
    });
  } catch (error) {
    const normalized = normalizeExternalPgError(error);
    return fail('dns_resolution', normalized.message, durationFrom(dnsStart), normalized.code, configSummary);
  }

  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: diagnosticConnectTimeoutMs,
    query_timeout: diagnosticQueryTimeoutMs,
    statement_timeout: diagnosticStatementTimeoutMs,
    ssl: config.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized } : false,
  });

  const connectStart = measureStart();
  try {
    await client.connect();
    stageResults.push({
      stage: 'tcp_connect',
      ok: true,
      duration_ms: durationFrom(connectStart),
      message: 'Connection established to external PostgreSQL host.',
    });
  } catch (error) {
    const normalized = normalizeExternalPgError(error);
    const failedStage = classifyConnectFailureStage(normalized.message);
    return fail(failedStage, normalized.message, durationFrom(connectStart), normalized.code, configSummary);
  }

  stageResults.push({
    stage: 'ssl_handshake',
    ok: true,
    duration_ms: 0,
    message: config.ssl ? 'SSL/TLS negotiated successfully during connection.' : 'SSL is disabled by configuration.',
  });

  stageResults.push({
    stage: 'authentication',
    ok: true,
    duration_ms: 0,
    message: 'Authentication succeeded during PostgreSQL startup.',
  });

  const queryStart = measureStart();
  try {
    await client.query('select 1 as ok');
    stageResults.push({
      stage: 'simple_query',
      ok: true,
      duration_ms: durationFrom(queryStart),
      message: 'Simple query succeeded.',
    });
  } catch (error) {
    const normalized = normalizeExternalPgError(error);
    await client.end().catch(() => undefined);
    return fail('simple_query', normalized.message, durationFrom(queryStart), normalized.code, configSummary);
  }

  const tableStart = measureStart();
  try {
    const tableResult = await client.query(
      `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = $1
          and table_name = 'cpq_sampler_result'
      ) as table_exists
      `,
      [config.schema],
    );
    const exists = Boolean(tableResult.rows?.[0]?.table_exists);
    stageResults.push({
      stage: 'table_exists',
      ok: exists,
      duration_ms: durationFrom(tableStart),
      message: exists
        ? `${config.schema}.cpq_sampler_result exists.`
        : `${config.schema}.cpq_sampler_result does not exist.`,
    });
  } catch (error) {
    const normalized = normalizeExternalPgError(error);
    await client.end().catch(() => undefined);
    return fail('table_exists', normalized.message, durationFrom(tableStart), normalized.code, configSummary);
  }

  const upsertStart = measureStart();
  try {
    const indexCheck = await client.query(
      `
      select exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where c.contype in ('u', 'p')
          and n.nspname = $1
          and t.relname = 'cpq_sampler_result'
          and array(
            select a.attname::text
            from unnest(c.conkey) with ordinality as ck(attnum, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = ck.attnum
            order by ck.ord
          ) = array['namespace', 'ipn_code', 'country_code']::text[]
      ) as has_required_unique
      `,
      [config.schema],
    );
    const hasRequiredUnique = Boolean(indexCheck.rows?.[0]?.has_required_unique);
    stageResults.push({
      stage: 'upsert_prerequisite',
      ok: hasRequiredUnique,
      duration_ms: durationFrom(upsertStart),
      message: hasRequiredUnique
        ? 'Unique constraint for ON CONFLICT (namespace, ipn_code, country_code) exists.'
        : 'Missing unique/primary constraint for ON CONFLICT (namespace, ipn_code, country_code).',
    });
  } catch (error) {
    const normalized = normalizeExternalPgError(error);
    await client.end().catch(() => undefined);
    return fail('upsert_prerequisite', normalized.message, durationFrom(upsertStart), normalized.code, configSummary);
  }

  await client.end().catch(() => undefined);

  const firstFailure = stageResults.find((stage) => !stage.ok);
  return {
    success: !firstFailure,
    stage_results: stageResults,
    config_summary: configSummary,
    final_failure_stage: firstFailure?.stage ?? null,
    final_failure_type: firstFailure ? 'precondition_failed' : null,
  };
}
