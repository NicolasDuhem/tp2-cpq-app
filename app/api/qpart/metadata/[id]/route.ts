import { NextRequest, NextResponse } from 'next/server';
import { deleteMetadataDefinition, updateMetadataDefinition } from '@/lib/qpart/metadata/service';

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const row = await updateMetadataDefinition(id, body);
    if (!row) return NextResponse.json({ error: 'Metadata definition not found' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update metadata definition' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await deleteMetadataDefinition(id);
  return NextResponse.json({ ok: true });
}
