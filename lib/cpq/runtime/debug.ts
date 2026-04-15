export type TraceSource = 'client' | 'api' | 'cpq' | 'db';

export type TraceLogRecord = {
  timestamp: string;
  traceId: string;
  action: string;
  route: string;
  source: TraceSource;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  status?: number;
  success?: boolean;
  error?: {
    message: string;
    stack?: string;
  };
};

const REDACT_KEYS = ['authorization', 'token', 'cookie', 'secret', 'password', 'apikey', 'api_key', 'database_url'];

export const isCpqDebugEnabled = () =>
  process.env.CPQ_DEBUG === 'true' || process.env.NEXT_PUBLIC_CPQ_DEBUG === 'true' || process.env.NODE_ENV !== 'production';

export const createTraceId = () => crypto.randomUUID();

const shouldRedact = (key: string) => REDACT_KEYS.some((blocked) => key.toLowerCase().includes(blocked));

const sanitizePrimitive = (value: unknown) => {
  if (typeof value === 'string') {
    if (value.length > 800) return `${value.slice(0, 800)}…`;
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return String(value);
};

export const sanitizeForLog = (value: unknown, depth = 0): unknown => {
  if (value === undefined) return undefined;
  if (depth > 6) return '[TruncatedDepth]';

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeForLog(entry, depth + 1));
  }

  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = shouldRedact(key) ? '[REDACTED]' : sanitizeForLog(child, depth + 1);
    }
    return out;
  }

  return sanitizePrimitive(value);
};

export const logTrace = (record: TraceLogRecord) => {
  if (!isCpqDebugEnabled()) return;
  const payload = {
    ...record,
    request: sanitizeForLog(record.request),
    response: sanitizeForLog(record.response),
    error: record.error,
  };

  const line = `[cpq-trace] ${JSON.stringify(payload)}`;
  if (record.success === false || record.error) {
    console.error(line);
  } else {
    console.log(line);
  }
};

export const errorToLog = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
};
