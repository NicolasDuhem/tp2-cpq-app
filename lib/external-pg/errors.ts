export type ExternalPgErrorCode =
  | 'missing_runtime_dependency'
  | 'missing_env'
  | 'connection_timeout'
  | 'network_unreachable'
  | 'auth_failure'
  | 'ssl_error'
  | 'connection_failure'
  | 'missing_unique_index'
  | 'source_data_mapping'
  | 'external_pg_error';

export class ExternalPgPushError extends Error {
  code: ExternalPgErrorCode;
  status: number;

  constructor(code: ExternalPgErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'ExternalPgPushError';
    this.code = code;
    this.status = status;
  }
}

function fromErrorLike(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: string };
    return { code: errorWithCode.code, message: error.message };
  }
  return { message: 'Unknown external PostgreSQL error' };
}

export function normalizeExternalPgError(error: unknown): ExternalPgPushError {
  if (error instanceof ExternalPgPushError) return error;

  const { code, message } = fromErrorLike(error);

  if (message.includes('Missing dependency "pg"')) {
    return new ExternalPgPushError('missing_runtime_dependency', 'External PostgreSQL runtime dependency is not installed (missing "pg").', 500);
  }

  const missingEnvMatch = message.match(/^Missing required environment variable: ([A-Z0-9_]+)$/);
  if (missingEnvMatch) {
    return new ExternalPgPushError('missing_env', `Missing ${missingEnvMatch[1]}`, 400);
  }

  if (message.includes('EXTERNAL_PG_PORT must be a number') || message.includes('Invalid EXTERNAL_PG_SCHEMA')) {
    return new ExternalPgPushError('missing_env', message, 400);
  }
  if (
    message.includes('EXTERNAL_PG_CONNECT_TIMEOUT_MS must be a positive number') ||
    message.includes('EXTERNAL_PG_QUERY_TIMEOUT_MS must be a positive number') ||
    message.includes('EXTERNAL_PG_STATEMENT_TIMEOUT_MS must be a positive number')
  ) {
    return new ExternalPgPushError('missing_env', message, 400);
  }

  if (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    code === '57014' ||
    message.toLowerCase().includes('timeout expired') ||
    message.toLowerCase().includes('query read timeout') ||
    message.toLowerCase().includes('canceling statement due to statement timeout')
  ) {
    return new ExternalPgPushError('connection_timeout', `External PostgreSQL timeout: ${message}`, 504);
  }

  if (
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    message.toLowerCase().includes('could not translate host name') ||
    message.toLowerCase().includes('no route to host')
  ) {
    return new ExternalPgPushError('network_unreachable', `External PostgreSQL network failure: ${message}`, 502);
  }

  if (
    code === '28P01' ||
    code === '28000' ||
    code === '3D000' ||
    message.toLowerCase().includes('password authentication failed') ||
    (message.toLowerCase().includes('database') && message.toLowerCase().includes('does not exist'))
  ) {
    return new ExternalPgPushError('auth_failure', `External PostgreSQL authentication/database failure: ${message}`, 401);
  }

  if (
    code === '08P01' ||
    message.toLowerCase().includes('ssl') ||
    message.toLowerCase().includes('tls') ||
    message.toLowerCase().includes('self signed certificate') ||
    message.toLowerCase().includes('certificate')
  ) {
    return new ExternalPgPushError('ssl_error', `External PostgreSQL SSL/TLS failure: ${message}`, 502);
  }

  if (code === '42P10' || message.includes('no unique or exclusion constraint matching the ON CONFLICT specification')) {
    return new ExternalPgPushError(
      'missing_unique_index',
      'Target DB is missing required unique index on (namespace, ipn_code, country_code).',
      400,
    );
  }

  if (message.toLowerCase().includes('connect econn')) {
    return new ExternalPgPushError('connection_failure', `Could not connect to external PostgreSQL: ${message}`, 502);
  }

  if (
    message.includes('No bike sampler row found') ||
    message.includes('No QPart country allocation row found') ||
    message.includes('Missing part_number') ||
    message.includes('No active CPQ_setup_account_context') ||
    message.includes('is required for external push') ||
    message === 'partId is required' ||
    message === 'countryCode is required' ||
    message === 'ruleset is required' ||
    message === 'ipnCode is required'
  ) {
    return new ExternalPgPushError('source_data_mapping', message, 400);
  }

  return new ExternalPgPushError('external_pg_error', message || 'Failed to push row to external PostgreSQL', 400);
}

export function toExternalPgApiError(error: unknown): { error: string; errorType: ExternalPgErrorCode; status: number } {
  const normalized = normalizeExternalPgError(error);
  return {
    error: normalized.message,
    errorType: normalized.code,
    status: normalized.status,
  };
}
