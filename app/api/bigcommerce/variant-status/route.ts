import { NextRequest, NextResponse } from 'next/server';
import { resolveVariantStatusBySku } from '@/lib/bigcommerce/variant-status';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { skus?: unknown };
  const skus = Array.isArray(body.skus)
    ? body.skus.map((value) => String(value ?? '').trim())
    : [];

  if (!Array.isArray(body.skus)) {
    return NextResponse.json({ error: 'skus must be an array of strings' }, { status: 400 });
  }

  if (skus.length > 1000) {
    return NextResponse.json({ error: 'skus payload too large (max 1000)' }, { status: 400 });
  }

  const items = await resolveVariantStatusBySku(skus);
  return NextResponse.json({ items });
}
