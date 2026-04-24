import { NextRequest, NextResponse } from 'next/server';
import { deleteCountryMapping, updateCountryMapping } from '@/lib/cpq/setup/service';

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const row = await updateCountryMapping(id, body);
    if (!row) return NextResponse.json({ error: 'Country mapping not found' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update country mapping' },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    await deleteCountryMapping(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete country mapping' },
      { status: 400 },
    );
  }
}
