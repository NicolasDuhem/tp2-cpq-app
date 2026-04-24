import { NextRequest, NextResponse } from 'next/server';
import { deriveCompatibilityCandidates } from '@/lib/qpart/compatibility/service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { bike_types?: string[]; sample_limit?: number };
  const bikeTypes = Array.isArray(body.bike_types) ? body.bike_types : [];
  const sampleLimit = Number(body.sample_limit ?? 300);
  const rows = await deriveCompatibilityCandidates(bikeTypes, Number.isFinite(sampleLimit) ? sampleLimit : 300);
  return NextResponse.json({ rows });
}
