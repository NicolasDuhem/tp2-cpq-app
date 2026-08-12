import { NextRequest, NextResponse } from 'next/server';
import { listReferenceValues } from '@/lib/qpart/compatibility/service';

export async function GET(req: NextRequest) {
  const bikeType = req.nextUrl.searchParams.get('bike_type') ?? '';
  const rows = await listReferenceValues(bikeType);
  return NextResponse.json({ rows });
}
