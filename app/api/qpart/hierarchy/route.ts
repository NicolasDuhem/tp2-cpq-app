import { NextRequest, NextResponse } from 'next/server';
import { createHierarchyNode, listHierarchyNodes } from '@/lib/qpart/hierarchy/service';

export async function GET(req: NextRequest) {
  const level = Number(req.nextUrl.searchParams.get('level'));
  const rows = await listHierarchyNodes(Number.isFinite(level) ? level : undefined);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const row = await createHierarchyNode(body);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create hierarchy node' }, { status: 400 });
  }
}
