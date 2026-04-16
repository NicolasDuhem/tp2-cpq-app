import { NextRequest, NextResponse } from 'next/server';
import { Stock_bike_img_delete_rule, Stock_bike_img_update_rule } from '@/lib/Stock_bike_img_service';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid rule id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const row = await Stock_bike_img_update_rule(id, body);
    if (!row) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    return NextResponse.json({ row });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Stock_bike_img rule';
    const status = message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid rule id' }, { status: 400 });
  }

  await Stock_bike_img_delete_rule(id);
  return NextResponse.json({ ok: true });
}
