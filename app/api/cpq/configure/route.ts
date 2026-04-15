import { NextRequest, NextResponse } from 'next/server';
import { configureConfiguration } from '@/lib/cpq/runtime/client';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';
import { mockConfigureState, mockInitState } from '@/lib/cpq/runtime/mock-data';
import { BikeBuilderContext, ConfigureConfiguratorRequest, NormalizedBikeBuilderState } from '@/types/cpq';
import { createTraceId, errorToLog, logTrace } from '@/lib/cpq/runtime/debug';

const buildContext = (input?: Partial<BikeBuilderContext>) => ({
  accountCode: input?.accountCode ?? '',
  customerId: input?.customerId,
  currency: input?.currency,
  language: input?.language,
  countryCode: input?.countryCode,
});

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-cpq-trace-id') ?? createTraceId();
  const start = Date.now();
  const body = (await req.json()) as ConfigureConfiguratorRequest & { currentState?: NormalizedBikeBuilderState };
  const ruleset = body.ruleset ?? process.env.CPQ_PART_NAME ?? 'BBLV6_G-LineMY26';

  if (!body?.sessionId || !body.featureId || body.optionValue === undefined) {
    return NextResponse.json({ traceId, error: 'sessionId, featureId and optionValue are required' }, { status: 400 });
  }

  const context = buildContext(body.context);
  const cpqRequestBody = {
    sessionID: body.sessionId,
    selections: [{ id: body.featureId, value: body.optionValue }],
  };

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: 'Configure',
    route: '/api/cpq/configure',
    source: 'api',
    request: {
      sessionId: body.sessionId,
      featureId: body.featureId,
      optionId: body.optionId,
      optionValue: body.optionValue,
      context,
    },
  });

  if (process.env.CPQ_USE_MOCK === 'true') {
    const current = body.currentState ?? mockInitState(ruleset);
    const selectedOptionId =
      body.optionId ??
      current.features
        .find((feature) => feature.featureId === body.featureId)
        ?.availableOptions.find((option) => option.value === body.optionValue)?.optionId ??
      body.optionValue;
    const normalized = mockConfigureState(current, body.featureId, selectedOptionId);
    return NextResponse.json({
      traceId,
      sessionId: normalized.sessionId,
      parsed: normalized,
      rawResponse: normalized.raw ?? normalized,
      requestBody: cpqRequestBody,
      downstreamRequestBody: cpqRequestBody,
      downstreamResponseBody: normalized.raw ?? normalized,
      callType: 'Configure',
    });
  }

  try {
    const cpqResponse = await configureConfiguration(body, { context }, {
      traceId,
      route: '/api/cpq/configure',
      action: 'Configure',
    });
    const normalized = mapCpqToNormalizedState(cpqResponse, ruleset);
    const parsedWithSession =
      normalized.sessionId === 'unknown-session'
        ? {
            ...normalized,
            sessionId: body.sessionId,
            debug: {
              ...normalized.debug,
              sessionIdField: `${normalized.debug?.sessionIdField ?? 'unknown'} (fallback:request.sessionId)`,
            },
          }
        : normalized;

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'Configure',
      route: '/api/cpq/configure',
      source: 'api',
      status: 200,
      success: true,
      durationMs: Date.now() - start,
      response: { sessionId: parsedWithSession.sessionId, featureCount: parsedWithSession.features.length },
    });

    return NextResponse.json({
      traceId,
      sessionId: parsedWithSession.sessionId,
      parsed: parsedWithSession,
      rawResponse: cpqResponse,
      requestBody: cpqRequestBody,
      downstreamRequestBody: cpqRequestBody,
      downstreamResponseBody: cpqResponse,
      callType: 'Configure',
    });
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'Configure',
      route: '/api/cpq/configure',
      source: 'api',
      status: 500,
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });
    return NextResponse.json(
      { traceId, error: 'CPQ configure failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
