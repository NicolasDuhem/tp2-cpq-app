import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildQpartExternalSamplerPayload, upsertExternalSamplerResult } from '@/lib/external-pg/cpq-sampler-result';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const payload = await buildQpartExternalSamplerPayload({
      partId: Number(body.partId),
      countryCode: String(body.countryCode ?? ''),
    });

    const result = await upsertExternalSamplerResult(payload);
    revalidatePath('/sales/qpart-allocation');

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push QPart row to external PostgreSQL' },
      { status: 400 },
    );
  }
}
