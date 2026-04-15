import { NextRequest, NextResponse } from 'next/server';
import { resolveConfigurationReference, saveConfigurationReference } from '@/lib/cpq/runtime/configuration-references';
import { createTraceId, errorToLog, logTrace } from '@/lib/cpq/runtime/debug';

export async function POST(req: NextRequest) {
  const traceId = req.headers.get('x-cpq-trace-id') ?? createTraceId();
  const start = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: 'SaveConfigurationReference',
    route: '/api/cpq/configuration-references',
    source: 'api',
    request: body,
  });

  try {
    const row = await saveConfigurationReference(
      {
        configuration_reference: body.configuration_reference as string | undefined,
        canonical_header_id: body.canonical_header_id as string | null | undefined,
        canonical_detail_id: body.canonical_detail_id as string | null | undefined,
        ruleset: String(body.ruleset ?? ''),
        namespace: String(body.namespace ?? ''),
        header_id: body.header_id as string | null | undefined,
        finalized_detail_id: body.finalized_detail_id as string | null | undefined,
        source_working_detail_id: body.source_working_detail_id as string | null | undefined,
        source_session_id: body.source_session_id as string | null | undefined,
        source_header_id: body.source_header_id as string | null | undefined,
        source_detail_id: body.source_detail_id as string | null | undefined,
        account_code: body.account_code as string | null | undefined,
        customer_id: body.customer_id as string | null | undefined,
        account_type: body.account_type as string | null | undefined,
        company: body.company as string | null | undefined,
        currency: body.currency as string | null | undefined,
        language: body.language as string | null | undefined,
        country_code: body.country_code as string | null | undefined,
        customer_location: body.customer_location as string | null | undefined,
        application_instance: body.application_instance as string | null | undefined,
        application_name: body.application_name as string | null | undefined,
        finalized_session_id: body.finalized_session_id as string | null | undefined,
        final_ipn_code: body.final_ipn_code as string | null | undefined,
        product_description: body.product_description as string | null | undefined,
        finalize_response_json: body.finalize_response_json,
        json_snapshot: body.json_snapshot,
      },
      { traceId, route: '/api/cpq/configuration-references', action: 'SaveConfigurationReference' },
    );

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'SaveConfigurationReference',
      route: '/api/cpq/configuration-references',
      source: 'api',
      status: 201,
      success: true,
      durationMs: Date.now() - start,
      response: { configuration_reference: row.configuration_reference, id: row.id },
    });

    return NextResponse.json({ traceId, row }, { status: 201 });
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'SaveConfigurationReference',
      route: '/api/cpq/configuration-references',
      source: 'api',
      status: 400,
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });

    return NextResponse.json(
      {
        traceId,
        error: 'Finalize succeeded but saving reference in database failed',
        errorCategory: 'db_persistence_failed',
        details: error instanceof Error ? error.message : 'Failed to save configuration reference',
      },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const traceId = req.headers.get('x-cpq-trace-id') ?? createTraceId();
  const start = Date.now();
  const reference = req.nextUrl.searchParams.get('configuration_reference') ?? '';

  logTrace({
    timestamp: new Date().toISOString(),
    traceId,
    action: 'ResolveConfigurationReference',
    route: '/api/cpq/configuration-references',
    source: 'api',
    request: { configuration_reference: reference },
  });

  try {
    const row = await resolveConfigurationReference(reference, {
      traceId,
      route: '/api/cpq/configuration-references',
      action: 'ResolveConfigurationReference',
    });
    if (!row) {
      return NextResponse.json({ traceId, error: 'Configuration reference not found' }, { status: 404 });
    }

    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'ResolveConfigurationReference',
      route: '/api/cpq/configuration-references',
      source: 'api',
      status: 200,
      success: true,
      durationMs: Date.now() - start,
      response: { configuration_reference: row.configuration_reference },
    });

    return NextResponse.json({ traceId, row });
  } catch (error) {
    logTrace({
      timestamp: new Date().toISOString(),
      traceId,
      action: 'ResolveConfigurationReference',
      route: '/api/cpq/configuration-references',
      source: 'api',
      status: 400,
      success: false,
      durationMs: Date.now() - start,
      error: errorToLog(error),
    });
    return NextResponse.json(
      { traceId, error: error instanceof Error ? error.message : 'Failed to resolve configuration reference' },
      { status: 400 },
    );
  }
}
