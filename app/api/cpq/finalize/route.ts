import { NextRequest, NextResponse } from 'next/server';
import { finalizeConfiguration } from '@/lib/cpq/runtime/client';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';
import { createTraceId, errorToLog, logTrace, sanitizeForLog } from '@/lib/cpq/runtime/debug';
import { FinalizeConfigurationRequest } from '@/types/cpq';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-cpq-trace-id') ?? createTraceId();
  const start = Date.now();
  const body = (await req.json().catch(() => ({}))) as Partial<FinalizeConfigurationRequest>;
  const sessionId = String(body.sessionID ?? '').trim();
  const ruleset = String(process.env.CPQ_PART_NAME ?? 'BBLV6_G-LineMY26').trim();
  const finalizePayload: FinalizeConfigurationRequest = { sessionID: sessionId };

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: 'FinalizeConfiguration',
    route: '/api/cpq/finalize',
    source: 'api',
    request: finalizePayload,
  });

  if (!sessionId) {
    return NextResponse.json(
      {
        traceId,
        error: 'Missing session ID before finalize',
        errorCategory: 'missing_session_id',
      },
      { status: 400 },
    );
  }

  try {
    const cpqResponse = await finalizeConfiguration(sessionId, {
      traceId,
      route: '/api/cpq/finalize',
      action: 'FinalizeConfiguration',
    });
    const parsed = mapCpqToNormalizedState(cpqResponse, ruleset);

    if (!parsed.detailId) {
      logTrace({
        timestamp: new Date().toISOString(),
        traceId,
        action: 'FinalizeConfiguration',
        route: '/api/cpq/finalize',
        source: 'api',
        status: 502,
        success: false,
        durationMs: Date.now() - start,
        response: { rawResponse: sanitizeForLog(cpqResponse), parsed },
        error: { message: 'Unexpected CPQ response: finalized detail ID missing' },
      });
      return NextResponse.json(
        {
          traceId,
          error: 'Unexpected CPQ response: finalized detail ID missing',
          errorCategory: 'finalized_detail_missing',
          details: 'Finalize completed but no DetailId/ConfigurationId was found in the response payload.',
        },
        { status: 502 },
      );
    }

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'FinalizeConfiguration',
      route: '/api/cpq/finalize',
      source: 'api',
      status: 200,
      success: true,
      durationMs: Date.now() - start,
      response: {
        sessionId,
        detailId: parsed.detailId,
      },
    });

    return NextResponse.json({
      traceId,
      sessionId,
      parsed,
      rawResponse: cpqResponse,
      callType: 'FinalizeConfiguration',
    });
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'FinalizeConfiguration',
      route: '/api/cpq/finalize',
      source: 'api',
      status: 500,
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });

    return NextResponse.json(
      {
        traceId,
        error: 'Finalize request rejected by CPQ',
        errorCategory: 'cpq_finalize_failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
