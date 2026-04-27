import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildBikeExternalSamplerPayload, upsertExternalSamplerResult } from '@/lib/external-pg/cpq-sampler-result';
import { toExternalPgApiError } from '@/lib/external-pg/errors';

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
    const apiError = toExternalPgApiError(error);
    return NextResponse.json({ error: apiError.error, errorType: apiError.errorType }, { status: apiError.status });
  }
}
