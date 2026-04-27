import 'server-only';
import { normalizeExternalPgError } from '@/lib/external-pg/errors';

const DEFAULT_PORT = 5432;

export type ExternalPgConnectionConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  schema: string;
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
  const schema = String(process.env.EXTERNAL_PG_SCHEMA ?? 'public').trim() || 'public';

  assertIdentifier(schema, 'EXTERNAL_PG_SCHEMA');

  return {
    host,
    port,
    database,
    user,
    password,
    ssl,
    schema,
  };
}

type Queryable = {
  query: (queryText: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

function loadPgClientClass(): new (config: Record<string, unknown>) => Queryable {
  try {
    const dynamicRequire = Function('return require')() as (id: string) => { Client: new (config: Record<string, unknown>) => Queryable };
    const pg = dynamicRequire('pg');
    if (!pg?.Client) throw new Error('pg Client export not found');
    return pg.Client;
  } catch {
    throw new Error('Missing dependency "pg". Install it in this app before using external PostgreSQL push features.');
  }
}

export async function withExternalPgClient<T>(runner: (client: Queryable, schema: string) => Promise<T>): Promise<T> {
  const config = getExternalPgConfig();
  const Client = loadPgClientClass();
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.query('select 1');
    return await runner(client, config.schema);
  } catch (error) {
    throw normalizeExternalPgError(error);
  } finally {
    await client.end();
  }
}
