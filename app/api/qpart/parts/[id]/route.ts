import { NextRequest, NextResponse } from 'next/server';
import { deletePart, getPartDetail, updatePart } from '@/lib/qpart/parts/service';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const row = await getPartDetail(id);
  if (!row) return NextResponse.json({ error: 'Part not found' }, { status: 404 });

  return NextResponse.json({ row });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const row = await updatePart(id, body);
    if (!row) return NextResponse.json({ error: 'Part not found' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update part' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await deletePart(id);
  return NextResponse.json({ ok: true });
}
