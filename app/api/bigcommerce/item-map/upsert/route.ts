import { NextRequest, NextResponse } from 'next/server';
import { upsertBigCommerceItemMap, type BCItemType } from '@/lib/bigcommerce/item-map';

function parseItemType(value: unknown): BCItemType | null {
  const itemType = String(value ?? '').trim().toUpperCase();
  if (itemType === 'BIKE' || itemType === 'QPART' || itemType === 'PNA' || itemType === 'UNKNOWN') return itemType;
  return null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    itemType?: unknown;
    sourcePage?: unknown;
    items?: unknown;
  };

  const itemType = parseItemType(body.itemType);
  if (!itemType) return NextResponse.json({ error: 'itemType is required' }, { status: 400 });
  if (!body.items || typeof body.items !== 'object' || Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items must be an object map keyed by SKU' }, { status: 400 });
  }

  const upserted = await upsertBigCommerceItemMap({
    itemType,
    sourcePage: String(body.sourcePage ?? '').trim(),
    items: body.items as Record<string, Record<string, unknown>>,
  });

  return NextResponse.json({ ok: true, upserted });
}
