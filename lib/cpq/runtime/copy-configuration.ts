type CopyConfigurationInput = {
  sourceHeaderId: string;
  sourceDetailId: string;
  targetHeaderId: string;
  targetDetailId: string;
  deleteSource?: boolean;
  overwriteTarget?: boolean;
};

type CopyConfigurationConfig = {
  endpointUrl: string;
  apiKey: string;
  timeoutMs: number;
  requestWrapper: '' | 'inputParameters';
};

export type CanonicalCopyCapability = {
  available: boolean;
  reason?: string;
  endpointUrl?: string;
  requestWrapper?: '' | 'inputParameters';
};

const trimValue = (value: unknown) => String(value ?? '').trim();

const required = (value: unknown, label: string) => {
  const trimmed = trimValue(value);
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
};

const buildConfig = (): CopyConfigurationConfig => {
  const endpointUrl = trimValue(process.env.CPQ_COPY_CONFIGURATION_URL);
  if (!endpointUrl) {
    throw new Error(
      'Missing CPQ canonical copy capability. Set CPQ_COPY_CONFIGURATION_URL to enable ProductConfigurator CopyConfiguration.',
    );
  }

  const apiKey = trimValue(process.env.CPQ_COPY_API_KEY) || trimValue(process.env.CPQ_API_KEY);
  if (!apiKey) {
    throw new Error(
      'Missing CPQ canonical copy credentials. Set CPQ_COPY_API_KEY or CPQ_API_KEY to call ProductConfigurator CopyConfiguration.',
    );
  }

  const wrapperRaw = trimValue(process.env.CPQ_COPY_REQUEST_WRAPPER).toLowerCase();
  const requestWrapper = wrapperRaw === 'inputparameters' ? 'inputParameters' : '';

  return {
    endpointUrl,
    apiKey,
    timeoutMs: Number(process.env.CPQ_COPY_TIMEOUT_MS ?? process.env.CPQ_TIMEOUT_MS ?? 25000),
    requestWrapper,
  };
};

export const getCanonicalCopyCapability = (): CanonicalCopyCapability => {
  try {
    const config = buildConfig();
    return {
      available: true,
      endpointUrl: config.endpointUrl,
      requestWrapper: config.requestWrapper,
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

const buildCopyPayload = (
  input: Required<Pick<CopyConfigurationInput, 'sourceHeaderId' | 'sourceDetailId' | 'targetHeaderId' | 'targetDetailId'>> &
    Pick<CopyConfigurationInput, 'deleteSource' | 'overwriteTarget'>,
  wrapper: '' | 'inputParameters',
) => {
  const payload = {
    sourceHeaderId: input.sourceHeaderId,
    sourceDetailId: input.sourceDetailId,
    targetHeaderId: input.targetHeaderId,
    targetDetailId: input.targetDetailId,
    deleteSource: input.deleteSource ?? false,
    overwriteTarget: input.overwriteTarget ?? false,
  };
  return wrapper ? { [wrapper]: payload } : payload;
};

export const copyConfigurationToCanonicalDetail = async (input: CopyConfigurationInput) => {
  const config = buildConfig();
  const normalizedInput = {
    sourceHeaderId: required(input.sourceHeaderId, 'sourceHeaderId'),
    sourceDetailId: required(input.sourceDetailId, 'sourceDetailId'),
    targetHeaderId: required(input.targetHeaderId, 'targetHeaderId'),
    targetDetailId: required(input.targetDetailId, 'targetDetailId'),
    deleteSource: input.deleteSource ?? false,
    overwriteTarget: input.overwriteTarget ?? false,
  };
  const payload = buildCopyPayload(normalizedInput, config.requestWrapper);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${config.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let parsedBody: unknown = null;
    try {
      parsedBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsedBody = responseText;
    }

    if (!response.ok) {
      throw new Error(
        `CopyConfiguration failed (${response.status} ${response.statusText}): ${
          typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody ?? {})
        }`,
      );
    }

    return {
      ok: true as const,
      status: response.status,
      requestPayload: payload,
      responseBody: parsedBody,
    };
  } finally {
    clearTimeout(timer);
  }
};
