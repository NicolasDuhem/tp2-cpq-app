import { NextRequest, NextResponse } from 'next/server';
import {
  buildBikeExternalSamplerPayload,
  buildQpartExternalSamplerPayload,
  runExternalSamplerWriteDiagnostic,
} from '@/lib/external-pg/cpq-sampler-result';
import { toExternalPgApiError } from '@/lib/external-pg/errors';

export const runtime = 'nodejs';

type PayloadMode = 'deterministic' | 'bike' | 'qpart';

function asPayloadMode(value: unknown): PayloadMode {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'bike') return 'bike';
  if (normalized === 'qpart') return 'qpart';
  return 'deterministic';
}

export async function POST(req: NextRequest) {
  let currentStage = 'request_received';
  const startedAt = Date.now();
  const stage = (name: string, details?: Record<string, unknown>) => {
    currentStage = name;
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    if (details) {
      console.info('[external-postgres-write-test]', name, { elapsedMs, ...details });
      return;
    }
    console.info('[external-postgres-write-test]', name, { elapsedMs });
  };

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = asPayloadMode(body.mode);

  try {
    stage('payload_build', { mode });
    const payload = mode === 'bike'
      ? await buildBikeExternalSamplerPayload({
        ruleset: String(body.ruleset ?? ''),
        ipnCode: String(body.ipnCode ?? ''),
        countryCode: String(body.countryCode ?? ''),
      })
      : mode === 'qpart'
        ? await buildQpartExternalSamplerPayload({
          partId: Number(body.partId),
          countryCode: String(body.countryCode ?? ''),
        })
        : {
          ipnCode: '__write_test__',
          ruleset: '__write_test__',
          accountCode: '__write_test__',
          customerId: '__write_test__',
          currency: null,
          language: null,
          countryCode: 'ZZ',
          namespace: '__diagnostic__',
          headerId: '__diagnostic__',
          detailId: '__diagnostic__',
          sessionId: '__diagnostic__',
          active: false,
          jsonResult: { diagnostic: true, source: 'rollback_write_test' },
          processedForImageSync: false,
          processedForImageSyncAt: null,
          createdAt: new Date().toISOString(),
        };

    stage('client_create');
    const diagnostic = await runExternalSamplerWriteDiagnostic(payload, {
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
        if (name === 'begin_start') {
          stage('begin_start', details);
          return;
        }
        if (name === 'begin_success') {
          stage('begin_success', details);
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
        if (name === 'rollback_start') {
          stage('rollback_start', details);
          return;
        }
        if (name === 'rollback_success') {
          stage('rollback_success', details);
          return;
        }
        stage(name, details);
      },
    });

    stage('response_send', { mode, rolledBack: diagnostic.rolledBack, tableName: diagnostic.tableName });
    return NextResponse.json({
      ok: true,
      mode,
      stage: 'response_send',
      diagnostic,
      message: 'Write diagnostic succeeded and transaction was rolled back.',
    });
  } catch (error) {
    stage('failed', { stage: currentStage });
    const apiError = toExternalPgApiError(error, { stage: currentStage });
    return NextResponse.json(
      {
        ok: false,
        stage: apiError.errorStage ?? currentStage,
        error: apiError.error,
        errorType: apiError.errorType,
        errorCode: apiError.errorCode,
        errorDetail: apiError.errorDetail,
        errorHint: apiError.errorHint,
      },
      { status: apiError.status },
    );
  }
}
