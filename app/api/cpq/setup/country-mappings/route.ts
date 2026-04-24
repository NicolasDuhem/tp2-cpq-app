import { NextRequest, NextResponse } from 'next/server';
import { createCountryMapping, listCountryMappings } from '@/lib/cpq/setup/service';

export async function GET(req: NextRequest) {
  const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true';
  const rows = await listCountryMappings(activeOnly);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const row = await createCountryMapping(body);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create country mapping' },
      { status: 400 },
    );
  }
}
