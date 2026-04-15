import { NextRequest, NextResponse } from 'next/server';
import { resolveConfigurationReference } from '@/lib/cpq/runtime/configuration-references';
import { startConfiguration } from '@/lib/cpq/runtime/client';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';
import { createTraceId, errorToLog, logTrace } from '@/lib/cpq/runtime/debug';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-cpq-trace-id') ?? createTraceId();
  const start = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const configurationReference = String(body.configuration_reference ?? '').trim();

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: 'RetrieveConfiguration',
    route: '/api/cpq/retrieve-configuration',
    source: 'api',
    request: body,
  });

  try {
    const resolved = await resolveConfigurationReference(configurationReference, {
      traceId,
      route: '/api/cpq/retrieve-configuration',
      action: 'ResolveConfigurationReference',
    });
    if (!resolved) {
      return NextResponse.json({ traceId, error: 'Configuration reference not found' }, { status: 404 });
    }

    const startInput = {
      ruleset: resolved.ruleset,
      partName: resolved.ruleset,
      namespace: resolved.namespace,
      headerId: resolved.header_id,
      detailId: resolved.finalized_detail_id,
      sourceHeaderId: resolved.source_header_id ?? resolved.header_id,
      sourceDetailId: resolved.source_detail_id ?? '',
      instance: resolved.application_instance ?? undefined,
      context: {
        accountCode: resolved.account_code ?? undefined,
        company: resolved.company ?? undefined,
        accountType: resolved.account_type ?? undefined,
        customerId: resolved.customer_id ?? undefined,
        currency: resolved.currency ?? undefined,
        language: resolved.language ?? undefined,
        countryCode: resolved.country_code ?? undefined,
        customerLocation: resolved.customer_location ?? resolved.country_code ?? undefined,
      },
    };

    const cpqResponse = await startConfiguration(startInput, undefined, {
      traceId,
      route: '/api/cpq/retrieve-configuration',
      action: 'StartConfiguration',
    });
    const parsed = mapCpqToNormalizedState(cpqResponse, resolved.ruleset);

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'RetrieveConfiguration',
      route: '/api/cpq/retrieve-configuration',
      source: 'api',
      status: 200,
      success: true,
      durationMs: Date.now() - start,
      response: { sessionId: parsed.sessionId, configurationReference: resolved.configuration_reference },
    });

    return NextResponse.json({
      traceId,
      resolved,
      startConfigurationInput: startInput,
      sessionId: parsed.sessionId,
      parsed,
      rawResponse: cpqResponse,
      callType: 'StartConfiguration',
    });
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'RetrieveConfiguration',
      route: '/api/cpq/retrieve-configuration',
      source: 'api',
      status: 400,
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });
    return NextResponse.json(
      { traceId, error: error instanceof Error ? error.message : 'Failed to retrieve configuration reference' },
      { status: 400 },
    );
  }
}
