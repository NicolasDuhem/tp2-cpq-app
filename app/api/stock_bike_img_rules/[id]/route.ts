import { NextRequest, NextResponse } from 'next/server';
import { Stock_bike_img_delete_rule, Stock_bike_img_update_rule } from '@/lib/Stock_bike_img_service';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const traceId = crypto.randomUUID();
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json(
      { traceId, error: 'Invalid rule id', stage: 'stock_bike_img_rules.[id].PUT.validate', details: { id: params.id } },
      { status: 400 },
    );
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
    return NextResponse.json(
      {
        traceId,
        error: message,
        stage: 'stock_bike_img_rules.[id].PUT.update',
        details: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
      },
      { status },
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const traceId = crypto.randomUUID();
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json(
      { traceId, error: 'Invalid rule id', stage: 'stock_bike_img_rules.[id].DELETE.validate', details: { id: params.id } },
      { status: 400 },
    );
  }

  try {
    await Stock_bike_img_delete_rule(id);
    return NextResponse.json({ ok: true, traceId });
  } catch (error) {
    return NextResponse.json(
      {
        traceId,
        error: 'Failed to delete Stock_bike_img rule',
        stage: 'stock_bike_img_rules.[id].DELETE.delete',
        details: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
      },
      { status: 500 },
    );
  }
}
