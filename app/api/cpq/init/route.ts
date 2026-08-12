import { NextRequest, NextResponse } from 'next/server';
import { startConfiguration } from '@/lib/cpq/runtime/client';
import { buildStartConfigurationPayload } from '@/lib/cpq/runtime/config';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';
import { mockInitState } from '@/lib/cpq/runtime/mock-data';
import { InitConfiguratorRequest } from '@/types/cpq';
import { createTraceId, errorToLog, logTrace } from '@/lib/cpq/runtime/debug';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-cpq-trace-id') ?? createTraceId();
  const start = Date.now();
  const body = (await req.json().catch(() => ({}))) as Partial<InitConfiguratorRequest>;
  const ruleset = body.ruleset ?? process.env.CPQ_PART_NAME ?? 'BBLV6_G-LineMY26';

  const requestPayload: InitConfiguratorRequest = {
    ruleset,
    partName: body.partName ?? ruleset,
    namespace: body.namespace,
    headerId: body.headerId,
    detailId: body.detailId,
    sourceHeaderId: body.sourceHeaderId,
    sourceDetailId: body.sourceDetailId,
    profile: body.profile,
    instance: body.instance,
    context: body.context,
  };

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: 'StartConfiguration',
    route: '/api/cpq/init',
    source: 'api',
    request: requestPayload,
  });

  const cpqStartRequestBody = buildStartConfigurationPayload({
    namespace: requestPayload.namespace,
    partName: requestPayload.partName || requestPayload.ruleset,
    headerId: requestPayload.headerId,
    detailId: requestPayload.detailId,
    sourceHeaderId: requestPayload.sourceHeaderId,
    sourceDetailId: requestPayload.sourceDetailId,
    profile: requestPayload.profile,
    instance: requestPayload.instance,
    accountCode: requestPayload.context?.accountCode,
    company: requestPayload.context?.company,
    accountType: requestPayload.context?.accountType,
    customerId: requestPayload.context?.customerId,
    currency: requestPayload.context?.currency,
    language: requestPayload.context?.language,
    countryCode: requestPayload.context?.countryCode,
    customerLocation: requestPayload.context?.customerLocation,
  });

  if (process.env.CPQ_USE_MOCK === 'true') {
    const parsed = mockInitState(ruleset);
    return NextResponse.json({
      traceId,
      sessionId: parsed.sessionId,
      parsed,
      rawResponse: parsed.raw ?? parsed,
      requestBody: cpqStartRequestBody,
      callType: 'StartConfiguration',
    });
  }

  try {
    const cpqResponse = await startConfiguration(requestPayload, undefined, {
      traceId,
      route: '/api/cpq/init',
      action: 'StartConfiguration',
    });
    const normalized = mapCpqToNormalizedState(cpqResponse, ruleset);

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'StartConfiguration',
      route: '/api/cpq/init',
      source: 'api',
      status: 200,
      success: true,
      durationMs: Date.now() - start,
      response: { sessionId: normalized.sessionId },
    });

    return NextResponse.json({
      traceId,
      sessionId: normalized.sessionId,
      parsed: normalized,
      rawResponse: cpqResponse,
      requestBody: cpqStartRequestBody,
      callType: 'StartConfiguration',
    });
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'StartConfiguration',
      route: '/api/cpq/init',
      source: 'api',
      status: 500,
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });
    return NextResponse.json(
      { traceId, error: 'CPQ init failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
