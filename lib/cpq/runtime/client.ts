import { buildStartConfigurationPayload, readCpqConfig, StartConfigurationOverrides } from './config';
import { ConfigureConfiguratorRequest, CpqApiEnvelope, InitConfiguratorRequest } from '@/types/cpq';
import { createTraceId, errorToLog, logTrace, sanitizeForLog } from './debug';

type CpqRequestResult = {
  status: number;
  ok: boolean;
  data?: CpqApiEnvelope;
  text?: string;
};

export type CpqRequestDebug = {
  url: string;
  method: 'POST';
  headers: {
    Authorization: string;
    'Content-Type': string;
    Accept: string;
  };
  body: unknown;
  bodyText: string;
};

export type CpqResponseDebug = {
  status: number;
  ok: boolean;
  statusText: string;
  headers: Record<string, string>;
  parsedJson?: CpqApiEnvelope;
  rawText: string;
};

export type CpqConfigDebug = {
  apiKeyPresent: boolean;
  apiKeyPreview: string | null;
  baseUrl: string;
  instance: string;
  profile: string;
  namespace: string;
  partName: string;
  company: string;
  currency: string;
  customerLocation: string;
  headerId: string;
  detailId: string;
};

export type CpqSmokeDebugResult = {
  requestDebug: CpqRequestDebug;
  responseDebug: CpqResponseDebug;
  configDebug: CpqConfigDebug;
};

type CpqClientRequestOptions = {
  traceId?: string;
  route?: string;
  action?: string;
};

const maskApiKey = (apiKey: string): string => {
  if (!apiKey) return 'ApiKey ****';
  const suffix = apiKey.slice(-4);
  return `ApiKey ****${suffix}`;
};

const buildConfigDebug = (overrides?: StartConfigurationOverrides): CpqConfigDebug => {
  const config = readCpqConfig();

  return {
    apiKeyPresent: Boolean(config.apiKey),
    apiKeyPreview: config.apiKey ? `****${config.apiKey.slice(-4)}` : null,
    baseUrl: config.baseUrl,
    instance: config.defaults.instance,
    profile: config.defaults.profile,
    namespace: overrides?.namespace ?? config.defaults.namespace,
    partName: overrides?.partName ?? config.defaults.partName,
    company: config.defaults.company,
    currency: config.defaults.currency,
    customerLocation: config.defaults.customerLocation,
    headerId: overrides?.headerId ?? config.defaults.headerId,
    detailId: overrides?.detailId ?? config.defaults.detailId,
  };
};

const post = async (path: string, body: unknown, logPrefix: string, options?: CpqClientRequestOptions): Promise<CpqRequestResult> => {
  const config = readCpqConfig();
  const endpoint = `${config.baseUrl}/${path.replace(/^\//, '')}`;
  const apiKeyPresent = Boolean(config.apiKey);
  const traceId = options?.traceId ?? createTraceId();
  const action = options?.action ?? path;
  const route = options?.route ?? `cpq:${path}`;

  const start = Date.now();
  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action,
    route,
    source: 'cpq',
    request: {
      url: endpoint,
      method: 'POST',
      headers: {
        Authorization: apiKeyPresent ? '[REDACTED]' : 'missing',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseText = await response.text();

    let parsed: CpqApiEnvelope | undefined;
    try {
      parsed = JSON.parse(responseText) as CpqApiEnvelope;
    } catch {
      parsed = undefined;
    }

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action,
      route,
      source: 'cpq',
      status: response.status,
      success: response.ok,
      durationMs: Date.now() - start,
      response: {
        ok: response.ok,
        statusText: response.statusText,
        data: parsed ?? sanitizeForLog(responseText),
      },
    });

    return { status: response.status, ok: response.ok, data: parsed, text: responseText };
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action,
      route,
      source: 'cpq',
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });
    console.error(`${logPrefix} fetch failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const startConfigurationRaw = async (
  overrides?: StartConfigurationOverrides,
  options?: CpqClientRequestOptions,
): Promise<CpqRequestResult> => {
  const payload = buildStartConfigurationPayload(overrides);
  return post('StartConfiguration', payload, '[cpq/start]', {
    ...options,
    action: options?.action ?? 'StartConfiguration',
  });
};

export const startConfigurationSmokeDebug = async (overrides?: StartConfigurationOverrides): Promise<CpqSmokeDebugResult> => {
  const config = readCpqConfig();
  const endpoint = `${config.baseUrl}/StartConfiguration`;

  const payload = buildStartConfigurationPayload(overrides);
  const requestBodyText = JSON.stringify(payload);
  const requestHeaders = {
    Authorization: `ApiKey ${config.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  } as const;

  const requestDebug: CpqRequestDebug = {
    url: endpoint,
    method: 'POST',
    headers: {
      Authorization: maskApiKey(config.apiKey),
      'Content-Type': requestHeaders['Content-Type'],
      Accept: requestHeaders.Accept,
    },
    body: payload,
    bodyText: requestBodyText,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBodyText,
      signal: controller.signal,
    });

    const responseText = await response.text();
    let parsedJson: CpqApiEnvelope | undefined;
    try {
      parsedJson = JSON.parse(responseText) as CpqApiEnvelope;
    } catch {
      parsedJson = undefined;
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      requestDebug,
      responseDebug: {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        headers: responseHeaders,
        parsedJson,
        rawText: responseText,
      },
      configDebug: buildConfigDebug(overrides),
    };
  } finally {
    clearTimeout(timer);
  }
};

export const startConfiguration = async (
  request: InitConfiguratorRequest,
  context?: Record<string, unknown>,
  options?: CpqClientRequestOptions,
): Promise<CpqApiEnvelope> => {
  const result = await startConfigurationRaw(
    {
      namespace: request.namespace,
      partName: request.partName || request.ruleset,
      headerId: request.headerId,
      detailId: request.detailId,
      sourceHeaderId: request.sourceHeaderId,
      sourceDetailId: request.sourceDetailId,
      profile: request.profile,
      instance: request.instance,
      accountCode: request.context?.accountCode,
      company: request.context?.company,
      accountType: request.context?.accountType,
      customerId: request.context?.customerId,
      currency: request.context?.currency,
      language: request.context?.language,
      countryCode: request.context?.countryCode,
      customerLocation: request.context?.customerLocation,
    },
    {
      traceId: options?.traceId,
      route: options?.route,
      action: 'StartConfiguration',
    },
  );

  void context;
  if (!result.ok) {
    throw new Error(
      `CPQ StartConfiguration failed (${result.status}): ${
        result.data ? JSON.stringify(result.data) : result.text ?? 'No response body'
      }`,
    );
  }

  if (!result.data) {
    throw new Error(`CPQ StartConfiguration returned non-JSON (${result.status}): ${result.text ?? ''}`);
  }

  return result.data;
};

export const configureConfiguration = async (
  request: ConfigureConfiguratorRequest,
  context: Record<string, unknown>,
  options?: CpqClientRequestOptions,
): Promise<CpqApiEnvelope> => {
  const body = {
    sessionID: request.sessionId,
    selections: [
      {
        id: request.featureId,
        value: request.optionValue,
      },
    ],
  };

  void context;
  const result = await post('configure', body, '[cpq/configure]', {
    traceId: options?.traceId,
    route: options?.route,
    action: 'Configure',
  });

  if (!result.ok || !result.data) {
    throw new Error(
      `CPQ Configure failed (${result.status}): ${result.data ? JSON.stringify(result.data) : result.text ?? 'No response body'}`,
    );
  }

  return result.data;
};

export const finalizeConfiguration = async (sessionId: string, options?: CpqClientRequestOptions): Promise<CpqApiEnvelope> => {
  const trimmedSessionId = String(sessionId ?? '').trim();
  if (!trimmedSessionId) {
    throw new Error('sessionId is required');
  }

  const body = {
    sessionID: trimmedSessionId,
  };

  const result = await post('FinalizeConfiguration', body, '[cpq/finalize]', {
    traceId: options?.traceId,
    route: options?.route,
    action: 'FinalizeConfiguration',
  });

  const trimmedText = (result.text ?? '').trim();
  const parsed = result.data;
  const hasExplicitError =
    Boolean(parsed) &&
    typeof parsed === 'object' &&
    (Reflect.has(parsed, 'error') ||
      Reflect.has(parsed, 'errors') ||
      Reflect.has(parsed, 'exception') ||
      (Reflect.has(parsed, 'success') && parsed.success === false));
  const finalizeSuccess = result.status === 200 && !hasExplicitError;

  logTrace({
    timestamp: new Date().toISOString(),
    traceId: options?.traceId ?? createTraceId(),
    action: options?.action ?? 'FinalizeConfiguration',
    route: options?.route ?? 'cpq:FinalizeConfiguration',
    source: 'cpq',
    status: result.status,
    success: finalizeSuccess,
    response: {
      rawResponseText: sanitizeForLog(result.text ?? ''),
      parsedJson: parsed ? sanitizeForLog(parsed) : null,
      finalizeSuccess,
      emptyBody: trimmedText.length === 0,
    },
  });

  if (!finalizeSuccess) {
    throw new Error(
      `CPQ FinalizeConfiguration failed (${result.status}): ${parsed ? JSON.stringify(parsed) : result.text ?? 'No response body'}`,
    );
  }

  return parsed ?? {};
};
