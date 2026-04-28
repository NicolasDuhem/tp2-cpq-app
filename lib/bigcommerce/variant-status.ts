import { fetchBigCommerceVariantsBySkus, getBigCommerceConfig, validateBigCommerceConfig } from '@/lib/bigcommerce/client';

export type VariantStatusValue = {
  sku: string;
  exists: boolean;
  status: 'OK' | 'NOK' | 'ERR' | 'DISABLED';
  productId?: number;
  variantId?: number;
  error?: string;
};

type CacheEntry = {
  expiresAt: number;
  value: VariantStatusValue;
};

const CACHE_TTL_MS = 30_000;
const variantStatusCache = new Map<string, CacheEntry>();

function normalizeSku(raw: string): string {
  return raw.trim();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
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
  variantStatusCache.set(sku, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export async function resolveVariantStatusBySku(inputSkus: string[]): Promise<Record<string, VariantStatusValue>> {
  const config = getBigCommerceConfig();
  const result: Record<string, VariantStatusValue> = {};

  const normalizedInputSkus = inputSkus.map(normalizeSku);
  for (const sku of normalizedInputSkus) {
    if (!sku) {
      result[sku] = { sku, exists: false, status: 'NOK' };
    }
  }

  if (!config.enabled) {
    for (const sku of normalizedInputSkus) {
      result[sku] = { sku, exists: false, status: 'DISABLED' };
    }
    return result;
  }

  const missing = validateBigCommerceConfig(config);
  if (missing.length > 0) {
    const message = `BigCommerce config missing: ${missing.join(', ')}`;
    console.warn(message);
    for (const sku of normalizedInputSkus) {
      result[sku] = { sku, exists: false, status: 'ERR', error: message };
    }
    return result;
  }

  const uniqueSkus = [...new Set(normalizedInputSkus.filter(Boolean))];
  const pendingSkus: string[] = [];

  for (const sku of uniqueSkus) {
    const cached = getCachedValue(sku);
    if (cached) {
      result[sku] = cached;
      continue;
    }
    pendingSkus.push(sku);
  }

  if (pendingSkus.length > 0) {
    try {
      for (const skuBatch of chunk(pendingSkus, config.batchSize)) {
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
            ? {
                sku,
                exists: true,
                status: 'OK',
                productId: variant.product_id,
                variantId: variant.id,
              }
            : {
                sku,
                exists: false,
                status: 'NOK',
              };
          result[sku] = value;
          setCachedValue(sku, value);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BigCommerce variant lookup failed';
      console.error(`BigCommerce variant lookup failed: ${message}`);
      for (const sku of pendingSkus) {
        const value: VariantStatusValue = {
          sku,
          exists: false,
          status: 'ERR',
          error: message,
        };
        result[sku] = value;
      }
    }
  }

  for (const sku of normalizedInputSkus) {
    if (!sku) {
      result[sku] = { sku, exists: false, status: 'NOK' };
      continue;
    }

    if (!result[sku]) {
      result[sku] = { sku, exists: false, status: 'NOK' };
    }
  }

  return result;
}
