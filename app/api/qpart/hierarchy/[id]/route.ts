import { NextRequest, NextResponse } from 'next/server';
import { deleteHierarchyNode, updateHierarchyNode } from '@/lib/qpart/hierarchy/service';

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const row = await updateHierarchyNode(id, body);
    if (!row) return NextResponse.json({ error: 'Hierarchy node not found' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update hierarchy node' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await deleteHierarchyNode(id);
  return NextResponse.json({ ok: true });
}
