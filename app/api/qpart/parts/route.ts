import { NextRequest, NextResponse } from 'next/server';
import { createPart, listParts } from '@/lib/qpart/parts/service';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search') ?? '';
  const hierarchyNodeIdRaw = req.nextUrl.searchParams.get('hierarchy_node_id');
  const hierarchyNodeId = hierarchyNodeIdRaw ? Number(hierarchyNodeIdRaw) : null;

  const page = Number(req.nextUrl.searchParams.get('page') ?? 1);
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? 200);

  const result = await listParts({
    search,
    hierarchy_node_id: Number.isFinite(hierarchyNodeId) ? hierarchyNodeId : null,
    page,
    pageSize,
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const row = await createPart(body);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create part' }, { status: 400 });
  }
}
