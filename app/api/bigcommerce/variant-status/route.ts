import { NextRequest, NextResponse } from 'next/server';
import { resolveVariantStatusBySku } from '@/lib/bigcommerce/variant-status';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { skus?: unknown; debug?: unknown };
  const skus = Array.isArray(body.skus)
    ? body.skus.map((value) => String(value ?? '').trim())
    : [];
  const debug = body.debug === true;

  if (!Array.isArray(body.skus)) {
    return NextResponse.json({ error: 'skus must be an array of strings', errorCode: 'BC_INVALID_REQUEST' }, { status: 400 });
  }

  if (skus.length > 2500) {
    return NextResponse.json({ error: 'skus payload too large (max 2500)', errorCode: 'BC_PAYLOAD_TOO_LARGE' }, { status: 413 });
  }

  const dedupedSkus = [...new Set(skus)];
  const response = await resolveVariantStatusBySku(dedupedSkus);
  return NextResponse.json({
    enabled: response.enabled,
    ...(debug ? { config: response.debug.config, reason: response.debug.reason } : {}),
    items: response.items,
  });
}
