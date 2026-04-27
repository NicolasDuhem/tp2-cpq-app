import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { buildBikeExternalSamplerPayload, upsertExternalSamplerResult } from '@/lib/external-pg/cpq-sampler-result';
import { toExternalPgApiError } from '@/lib/external-pg/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let currentStage = 'request_received';
  const stageStartedAt = Date.now();
  const stage = (name: string, details?: Record<string, unknown>) => {
    currentStage = name;
    const elapsedMs = Math.max(0, Date.now() - stageStartedAt);
    if (details) {
      console.info('[bike-allocation-push]', name, { elapsedMs, ...details });
      return;
    }
    console.info('[bike-allocation-push]', name, { elapsedMs });
  };

  stage('request_received');
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    stage('payload_build');
    const payload = await buildBikeExternalSamplerPayload({
      ruleset: String(body.ruleset ?? ''),
      ipnCode: String(body.ipnCode ?? ''),
      countryCode: String(body.countryCode ?? ''),
    }, { onStage: (name, details) => stage(name, details) });
    stage('payload_build', { ok: true });

    stage('client_create');
    const result = await upsertExternalSamplerResult(payload, {
      onStage: (name, details) => {
        if (name === 'client_create') {
          stage('client_create', details);
          return;
        }
        if (name === 'client_connect_start') {
          stage('client_connect_start', details);
          return;
        }
        if (name === 'client_connect_success') {
          stage('client_connect_success', details);
          return;
        }
        if (name === 'upsert_start') {
          stage('upsert_start', details);
          return;
        }
        if (name === 'upsert_success') {
          stage('upsert_success', details);
          return;
        }
        stage(name, details);
      },
    });
    revalidatePath('/sales/bike-allocation');
    stage('response_send', { ok: true, action: result.action, id: result.id });

    return NextResponse.json({ result });
  } catch (error) {
    stage('failed', { stage: currentStage });
    const apiError = toExternalPgApiError(error, { stage: currentStage });
    console.error('[bike-allocation-push] error', {
      stage: currentStage,
      errorType: apiError.errorType,
      errorCode: apiError.errorCode,
      errorDetail: apiError.errorDetail,
      errorHint: apiError.errorHint,
      errorStage: apiError.errorStage,
      message: apiError.error,
    });
    return NextResponse.json(
      {
        error: apiError.error,
        errorType: apiError.errorType,
        errorCode: apiError.errorCode,
        errorDetail: apiError.errorDetail,
        errorHint: apiError.errorHint,
        stage: apiError.errorStage ?? currentStage,
      },
      { status: apiError.status },
    );
  }
}
