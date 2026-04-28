const DEFAULT_API_BASE_URL = 'https://api.bigcommerce.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_SIZE = 50;

export type BigCommerceConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  storeHash: string;
  accessToken: string;
  timeoutMs: number;
  batchSize: number;
};

function asPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getBigCommerceConfig(): BigCommerceConfig {
  const enabled = String(process.env.BIGCOMMERCE_BC_STATUS_ENABLED ?? '').trim().toLowerCase() === 'true';
  const apiBaseUrl = String(process.env.BIGCOMMERCE_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL;
  const storeHash = String(process.env.BIGCOMMERCE_STORE_HASH ?? '').trim();
  const accessToken = String(process.env.BIGCOMMERCE_ACCESS_TOKEN ?? '').trim();
  const timeoutMs = asPositiveInteger(process.env.BIGCOMMERCE_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const batchSize = asPositiveInteger(process.env.BIGCOMMERCE_VARIANT_CHECK_BATCH_SIZE, DEFAULT_BATCH_SIZE);

  return {
    enabled,
    apiBaseUrl,
    storeHash,
    accessToken,
    timeoutMs,
    batchSize,
  };
}

export function validateBigCommerceConfig(config: BigCommerceConfig): string[] {
  if (!config.enabled) return [];

  const missing: string[] = [];
  if (!config.apiBaseUrl) missing.push('BIGCOMMERCE_API_BASE_URL');
  if (!config.storeHash) missing.push('BIGCOMMERCE_STORE_HASH');
  if (!config.accessToken) missing.push('BIGCOMMERCE_ACCESS_TOKEN');
  return missing;
}

export type BigCommerceVariant = {
  id: number;
  product_id: number;
  sku: string | null;
};

export async function fetchBigCommerceVariantsBySkus(skus: string[]): Promise<BigCommerceVariant[]> {
  const config = getBigCommerceConfig();
  const missing = validateBigCommerceConfig(config);
  if (missing.length > 0) {
    throw new Error(`BigCommerce config missing: ${missing.join(', ')}`);
  }

  const querySkus = skus.map((sku) => sku.trim()).filter(Boolean);
  if (!querySkus.length) return [];

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);

  try {
    const params = new URLSearchParams();
    params.set('sku:in', querySkus.join(','));

    const response = await fetch(`${config.apiBaseUrl}/stores/${config.storeHash}/v3/catalog/variants?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-Auth-Token': config.accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const preview = body.slice(0, 300);
      throw new Error(`BigCommerce variants request failed (${response.status}): ${preview || 'No response body'}`);
    }

    const payload = (await response.json()) as { data?: BigCommerceVariant[] };
    return Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`BigCommerce variants request timed out after ${config.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
