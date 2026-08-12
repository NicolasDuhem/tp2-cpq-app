import 'server-only';
import { Client } from 'pg';
import { normalizeExternalPgError } from '@/lib/external-pg/errors';

const DEFAULT_PORT = 5432;
const DEFAULT_CONNECT_TIMEOUT_MS = 8000;
const DEFAULT_QUERY_TIMEOUT_MS = 12000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 12000;

export type ExternalPgConnectionConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  schema: string;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
  statementTimeoutMs: number;
};

function requireEnv(name: string): string {
  const value = String(process.env[name] ?? '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function asBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on', 'require', 'required'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function assertIdentifier(input: string, label: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input)) {
    throw new Error(`Invalid ${label}: ${input}`);
  }
}

function parseTimeoutMs(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? fallback).trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return Math.trunc(parsed);
}

export function getExternalPgConfig(): ExternalPgConnectionConfig {
  const host = requireEnv('EXTERNAL_PG_HOST');
  const portRaw = String(process.env.EXTERNAL_PG_PORT ?? DEFAULT_PORT).trim();
  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    throw new Error('EXTERNAL_PG_PORT must be a number');
  }

  const database = requireEnv('EXTERNAL_PG_DATABASE');
  const user = requireEnv('EXTERNAL_PG_USER');
  const password = requireEnv('EXTERNAL_PG_PASSWORD');
  const ssl = asBoolean(process.env.EXTERNAL_PG_SSL, true);
  const sslRejectUnauthorized = asBoolean(process.env.EXTERNAL_PG_SSL_REJECT_UNAUTHORIZED, false);
  const schema = String(process.env.EXTERNAL_PG_SCHEMA ?? 'public').trim() || 'public';
  const connectionTimeoutMs = parseTimeoutMs('EXTERNAL_PG_CONNECT_TIMEOUT_MS', DEFAULT_CONNECT_TIMEOUT_MS);
  const queryTimeoutMs = parseTimeoutMs('EXTERNAL_PG_QUERY_TIMEOUT_MS', DEFAULT_QUERY_TIMEOUT_MS);
  const statementTimeoutMs = parseTimeoutMs('EXTERNAL_PG_STATEMENT_TIMEOUT_MS', DEFAULT_STATEMENT_TIMEOUT_MS);

  assertIdentifier(schema, 'EXTERNAL_PG_SCHEMA');

  return {
    host,
    port,
    database,
    user,
    password,
    ssl,
    sslRejectUnauthorized,
    schema,
    connectionTimeoutMs,
    queryTimeoutMs,
    statementTimeoutMs,
  };
}

type Queryable = {
  query: (queryText: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

export type ExternalPgStage =
  | 'env_validation_ok'
  | 'client_create'
  | 'client_connect_start'
  | 'client_connect_success'
  | 'client_close_start'
  | 'client_close_success';

type WithExternalPgClientOptions = {
  onStage?: (stage: ExternalPgStage, details?: Record<string, unknown>) => void;
};

export async function withExternalPgClient<T>(
  runner: (client: Queryable, schema: string) => Promise<T>,
  options: WithExternalPgClientOptions = {},
): Promise<T> {
  const config = getExternalPgConfig();
  options.onStage?.('env_validation_ok', {
    host: config.host,
    port: config.port,
    database: config.database,
    schema: config.schema,
    ssl: config.ssl,
    sslRejectUnauthorized: config.sslRejectUnauthorized,
    connectionTimeoutMs: config.connectionTimeoutMs,
    queryTimeoutMs: config.queryTimeoutMs,
    statementTimeoutMs: config.statementTimeoutMs,
  });
  options.onStage?.('client_create');
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    ssl: config.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized } : false,
  });

  try {
    options.onStage?.('client_connect_start');
    await client.connect();
    options.onStage?.('client_connect_success');
  } catch (error) {
    throw normalizeExternalPgError(error, { stage: 'connect' });
  }

  try {
    return await runner(client, config.schema);
  } finally {
    options.onStage?.('client_close_start');
    await client.end().catch(() => undefined);
    options.onStage?.('client_close_success');
  }
}
