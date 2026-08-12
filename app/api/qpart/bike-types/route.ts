import { NextResponse } from 'next/server';
import { listBikeTypes } from '@/lib/qpart/compatibility/service';

export async function GET() {
  const bikeTypes = await listBikeTypes();
  return NextResponse.json({ bikeTypes });
}
