import { fetchBigCommerceVariantsBySkus, getBigCommerceConfig, validateBigCommerceConfig } from '@/lib/bigcommerce/client';

export type VariantStatusCode =
  | 'BC_CONFIG_DISABLED'
  | 'BC_CONFIG_MISSING'
  | 'BC_API_401'
  | 'BC_API_403'
  | 'BC_API_404'
  | 'BC_API_422'
  | 'BC_API_429'
  | 'BC_API_5XX'
  | 'BC_FETCH_TIMEOUT'
  | 'BC_FETCH_ERROR'
  | 'BC_PAYLOAD_TOO_LARGE'
  | 'BC_INVALID_REQUEST';

export type VariantStatusValue = {
  sku: string;
  exists: boolean;
  status: 'OK' | 'NOK' | 'ERR' | 'DISABLED';
  productId?: number;
  variantId?: number;
  error?: string;
  errorCode?: VariantStatusCode;
};

export type VariantStatusDebugInfo = {
  enabled: boolean;
  reason?: 'enabled_env_missing' | 'enabled_env_not_true' | 'store_hash_missing' | 'token_missing';
  config: {
    hasStoreHash: boolean;
    hasAccessToken: boolean;
    apiBaseUrl: string;
    batchSize: number;
    storeHashPreview: string;
  };
};

export type VariantStatusResponse = {
  items: Record<string, VariantStatusValue>;
  enabled: boolean;
  debug: VariantStatusDebugInfo;
};

type CacheEntry = {
  expiresAt: number;
  value: VariantStatusValue;
};

type BigCommerceLookupError = {
  code: VariantStatusCode;
  message: string;
};

const CACHE_TTL_MS = 30_000;
const variantStatusCache = new Map<string, CacheEntry>();

function normalizeSku(raw: string): string {
  return raw.trim();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function getCachedValue(sku: string): VariantStatusValue | null {
  const cached = variantStatusCache.get(sku);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    variantStatusCache.delete(sku);
    return null;
  }
  return cached.value;
}

function setCachedValue(sku: string, value: VariantStatusValue) {
  variantStatusCache.set(sku, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getStoreHashPreview(storeHash: string): string {
  if (!storeHash) return '';
  if (storeHash.length <= 6) return storeHash;
  return `${storeHash.slice(0, 3)}...${storeHash.slice(-3)}`;
}

function getDisabledReason() {
  const rawEnabled = process.env.BIGCOMMERCE_BC_STATUS_ENABLED;
  const normalizedEnabled = String(rawEnabled ?? '').trim().toLowerCase();
  if (!String(rawEnabled ?? '').trim()) return 'enabled_env_missing' as const;
  if (normalizedEnabled !== 'true') return 'enabled_env_not_true' as const;
  const storeHash = String(process.env.BIGCOMMERCE_STORE_HASH ?? '').trim();
  if (!storeHash) return 'store_hash_missing' as const;
  const accessToken = String(process.env.BIGCOMMERCE_ACCESS_TOKEN ?? '').trim();
  if (!accessToken) return 'token_missing' as const;
  return undefined;
}

function toDebugInfo(): VariantStatusDebugInfo {
  const config = getBigCommerceConfig();
  return {
    enabled: config.enabled,
    reason: getDisabledReason(),
    config: {
      hasStoreHash: Boolean(config.storeHash),
      hasAccessToken: Boolean(config.accessToken),
      apiBaseUrl: config.apiBaseUrl,
      batchSize: config.batchSize,
      storeHashPreview: getStoreHashPreview(config.storeHash),
    },
  };
}

function mapErrorStatusCode(message: string): VariantStatusCode {
  if (message.includes('timed out')) return 'BC_FETCH_TIMEOUT';
  const statusMatch = message.match(/\b(\d{3})\b/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  if (status === 401) return 'BC_API_401';
  if (status === 403) return 'BC_API_403';
  if (status === 404) return 'BC_API_404';
  if (status === 422) return 'BC_API_422';
  if (status === 429) return 'BC_API_429';
  if (status >= 500 && status <= 599) return 'BC_API_5XX';
  return 'BC_FETCH_ERROR';
}

function logLookupError(error: unknown, skuBatch: string[]) {
  const firstSkus = skuBatch.slice(0, 3);
  if (error instanceof Error) {
    console.error('BigCommerce variant lookup failed', {
      errorName: error.name,
      errorMessage: error.message,
      skuCount: skuBatch.length,
      skus: firstSkus,
    });
    return;
  }
  console.error('BigCommerce variant lookup failed', {
    errorName: 'UnknownError',
    errorMessage: String(error),
    skuCount: skuBatch.length,
    skus: firstSkus,
  });
}

export async function resolveVariantStatusBySku(inputSkus: string[]): Promise<VariantStatusResponse> {
  const config = getBigCommerceConfig();
  const debug = toDebugInfo();
  const result: Record<string, VariantStatusValue> = {};
  const normalizedInputSkus = inputSkus.map(normalizeSku);

  for (const sku of normalizedInputSkus) {
    if (!sku) result[sku] = { sku, exists: false, status: 'NOK' };
  }

  if (!config.enabled) {
    for (const sku of normalizedInputSkus) {
      result[sku] = { sku, exists: false, status: 'DISABLED', errorCode: 'BC_CONFIG_DISABLED' };
    }
    return { items: result, enabled: false, debug };
  }

  const missing = validateBigCommerceConfig(config);
  if (missing.length > 0) {
    const message = `BigCommerce config missing: ${missing.join(', ')}`;
    console.warn(message);
    for (const sku of normalizedInputSkus) {
      result[sku] = { sku, exists: false, status: 'ERR', error: message, errorCode: 'BC_CONFIG_MISSING' };
    }
    return { items: result, enabled: false, debug };
  }

  const uniqueSkus = [...new Set(normalizedInputSkus.filter(Boolean))];
  const pendingSkus: string[] = [];

  for (const sku of uniqueSkus) {
    const cached = getCachedValue(sku);
    if (cached) result[sku] = cached;
    else pendingSkus.push(sku);
  }

  for (const skuBatch of chunk(pendingSkus, config.batchSize)) {
    let batchError: BigCommerceLookupError | null = null;
    try {
      const variants = await fetchBigCommerceVariantsBySkus(skuBatch);
      const foundSkuMap = new Map(
        variants
          .map((variant) => {
            const sku = normalizeSku(String(variant.sku ?? ''));
            if (!sku) return null;
            return [sku, variant] as const;
          })
          .filter((entry): entry is readonly [string, { id: number; product_id: number; sku: string | null }] => Boolean(entry)),
      );

      for (const sku of skuBatch) {
        const variant = foundSkuMap.get(sku);
        const value: VariantStatusValue = variant
          ? { sku, exists: true, status: 'OK', productId: variant.product_id, variantId: variant.id }
          : { sku, exists: false, status: 'NOK' };
        result[sku] = value;
        setCachedValue(sku, value);
      }
    } catch (error) {
      logLookupError(error, skuBatch);
      const message = error instanceof Error ? error.message : 'BigCommerce variant lookup failed';
      batchError = {
        code: mapErrorStatusCode(message),
        message,
      };
    }

    if (batchError) {
      for (const sku of skuBatch) {
        result[sku] = {
          sku,
          exists: false,
          status: 'ERR',
          error: batchError.message,
          errorCode: batchError.code,
        };
      }
    }
  }

  for (const sku of normalizedInputSkus) {
    if (!result[sku]) result[sku] = { sku, exists: false, status: 'NOK' };
  }

  return { items: result, enabled: true, debug };
}
