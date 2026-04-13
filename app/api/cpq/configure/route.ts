import { NextRequest, NextResponse } from 'next/server';
import { configureConfiguration } from '@/lib/cpq/runtime/client';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';
import { mockConfigureState, mockInitState } from '@/lib/cpq/runtime/mock-data';
import { BikeBuilderContext, ConfigureConfiguratorRequest, NormalizedBikeBuilderState } from '@/types/cpq';
const buildContext = (input?: Partial<BikeBuilderContext>) => ({
  accountCode: input?.accountCode ?? '',
  customerId: input?.customerId,
  currency: input?.currency,
  language: input?.language,
  countryCode: input?.countryCode,
});

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ConfigureConfiguratorRequest & { currentState?: NormalizedBikeBuilderState };
  const ruleset = body.ruleset ?? process.env.CPQ_PART_NAME ?? 'BBLV6_G-LineMY26';
  const baseUrl = (
    process.env.CPQ_BASE_URL ?? 'https://configurator.eu1.inforcloudsuite.com/api/v4/ProductConfiguratorUI.svc/json'
  ).replace(/\/$/, '');
  const finalConfigureUrl = `${baseUrl}/configure`;

  if (!body?.sessionId || !body.featureId || body.optionValue === undefined) {
    return NextResponse.json(
      { error: 'sessionId, featureId and optionValue are required' },
      { status: 400 },
    );
  }

  const context = buildContext(body.context);
  console.log('[cpq/configure] request', {
    sessionId: body.sessionId,
    featureId: body.featureId,
    optionId: body.optionId,
    optionValue: body.optionValue,
    finalConfigureUrl,
    context,
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
      sessionId: normalized.sessionId,
      parsed: normalized,
      rawResponse: normalized.raw ?? normalized,
      requestBody: {
        finalConfigureUrl,
        sessionID: body.sessionId,
        selections: [{ id: body.featureId, value: body.optionValue }],
      },
      callType: 'Configure',
    });
  }

  try {
    const cpqResponse = await configureConfiguration(body, { context });
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
    console.log('[cpq/configure] response', {
      sessionId: parsedWithSession.sessionId,
      features: parsedWithSession.features.length,
      ipnCode: parsedWithSession.ipnCode,
      ipnSource: parsedWithSession.debug?.ipnCodeSource,
    });

    return NextResponse.json({
      sessionId: parsedWithSession.sessionId,
      parsed: parsedWithSession,
      rawResponse: cpqResponse,
      requestBody: {
        finalConfigureUrl,
        sessionID: body.sessionId,
        selections: [{ id: body.featureId, value: body.optionValue }],
      },
      callType: 'Configure',
    });
  } catch (error) {
    console.error('[cpq/configure] failed', error);
    return NextResponse.json(
      { error: 'CPQ configure failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
