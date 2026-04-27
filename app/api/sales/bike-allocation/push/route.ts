import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildBikeExternalSamplerPayload, upsertExternalSamplerResult } from '@/lib/external-pg/cpq-sampler-result';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const payload = await buildBikeExternalSamplerPayload({
      ruleset: String(body.ruleset ?? ''),
      ipnCode: String(body.ipnCode ?? ''),
      countryCode: String(body.countryCode ?? ''),
    });

    const result = await upsertExternalSamplerResult(payload);
    revalidatePath('/sales/bike-allocation');

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push bike row to external PostgreSQL' },
      { status: 400 },
    );
  }
}
