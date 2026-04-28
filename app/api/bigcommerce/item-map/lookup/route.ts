import { NextRequest, NextResponse } from 'next/server';
import { lookupBigCommerceItemMap } from '@/lib/bigcommerce/item-map';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { skus?: unknown };
  if (!Array.isArray(body.skus)) {
    return NextResponse.json({ error: 'skus must be an array of strings' }, { status: 400 });
  }

  const skus = body.skus.map((value) => String(value ?? '').trim()).filter(Boolean);
  if (skus.length > 2500) {
    return NextResponse.json({ error: 'skus payload too large (max 2500)' }, { status: 413 });
  }

  const items = await lookupBigCommerceItemMap(skus);
  return NextResponse.json({ items });
}
