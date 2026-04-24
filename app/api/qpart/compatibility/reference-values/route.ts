import { NextRequest, NextResponse } from 'next/server';
import { createReferenceValue, listReferenceValues } from '@/lib/qpart/compatibility/service';

export async function GET(req: NextRequest) {
  const bikeType = req.nextUrl.searchParams.get('bike_type') ?? '';
  const rows = await listReferenceValues(bikeType);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const row = await createReferenceValue(body);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create reference value' }, { status: 400 });
  }
}
