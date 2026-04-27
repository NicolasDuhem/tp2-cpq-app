import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildBikeExternalSamplerPayload, upsertExternalSamplerResult } from '@/lib/external-pg/cpq-sampler-result';
import { toExternalPgApiError } from '@/lib/external-pg/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let currentStage = 'request_received';
  const stage = (name: string, details?: Record<string, unknown>) => {
    currentStage = name;
    if (details) {
      console.info('[bike-allocation-push]', name, details);
      return;
    }
    console.info('[bike-allocation-push]', name);
  };

  stage('request_received');
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    stage('building_payload');
    const payload = await buildBikeExternalSamplerPayload({
      ruleset: String(body.ruleset ?? ''),
      ipnCode: String(body.ipnCode ?? ''),
      countryCode: String(body.countryCode ?? ''),
    }, { onStage: (name, details) => stage(name, details) });

    stage('building_external_pg_client');
    const result = await upsertExternalSamplerResult(payload, { onStage: (name, details) => stage(name, details) });
    revalidatePath('/sales/bike-allocation');
    stage('response_sent', { ok: true, action: result.action, id: result.id });

    return NextResponse.json({ result });
  } catch (error) {
    stage('failed', { stage: currentStage });
    const apiError = toExternalPgApiError(error);
    console.error('[bike-allocation-push] error', {
      stage: currentStage,
      errorType: apiError.errorType,
      message: apiError.error,
    });
    return NextResponse.json(
      { error: apiError.error, errorType: apiError.errorType, stage: currentStage },
      { status: apiError.status },
    );
  }
}
