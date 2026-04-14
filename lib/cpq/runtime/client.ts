import { buildStartConfigurationPayload, readCpqConfig, StartConfigurationOverrides } from './config';
import { ConfigureConfiguratorRequest, CpqApiEnvelope, InitConfiguratorRequest } from '@/types/cpq';

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

const getBodySnippet = (text: string): string => text.replace(/\s+/g, ' ').slice(0, 400);

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

const post = async (path: string, body: unknown, logPrefix: string): Promise<CpqRequestResult> => {
  const config = readCpqConfig();
  const endpoint = `${config.baseUrl}/${path.replace(/^\//, '')}`;
  const apiKeyPresent = Boolean(config.apiKey);

  console.log(`${logPrefix} request`, {
    url: endpoint,
    apiKeyPresent,
    apiKeyPreview: apiKeyPresent ? `${config.apiKey.slice(0, 4)}...` : undefined,
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
    console.log(`${logPrefix} response`, {
      status: response.status,
      bodySnippet: getBodySnippet(responseText),
    });

    try {
      const parsed = JSON.parse(responseText) as CpqApiEnvelope;
      return { status: response.status, ok: response.ok, data: parsed, text: responseText };
    } catch {
      return { status: response.status, ok: response.ok, text: responseText };
    }
  } catch (error) {
    console.error(`${logPrefix} fetch failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const startConfigurationRaw = async (overrides?: StartConfigurationOverrides): Promise<CpqRequestResult> => {
  const payload = buildStartConfigurationPayload(overrides);
  return post('StartConfiguration', payload, '[cpq/start]');
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
  _context?: Record<string, unknown>,
): Promise<CpqApiEnvelope> => {
  const result = await startConfigurationRaw({
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
  });

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
  const result = await post('configure', body, '[cpq/configure]');

  if (!result.ok || !result.data) {
    throw new Error(
      `CPQ Configure failed (${result.status}): ${result.data ? JSON.stringify(result.data) : result.text ?? 'No response body'}`,
    );
  }

  return result.data;
};
