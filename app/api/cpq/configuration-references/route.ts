import { NextRequest, NextResponse } from 'next/server';
import { resolveConfigurationReference, saveConfigurationReference } from '@/lib/cpq/runtime/configuration-references';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const row = await saveConfigurationReference({
      configuration_reference: body.configuration_reference as string | undefined,
      ruleset: String(body.ruleset ?? ''),
      namespace: String(body.namespace ?? ''),
      header_id: String(body.header_id ?? ''),
      finalized_detail_id: String(body.finalized_detail_id ?? ''),
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
    });

    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save configuration reference' },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('configuration_reference') ?? '';

  try {
    const row = await resolveConfigurationReference(reference);
    if (!row) {
      return NextResponse.json({ error: 'Configuration reference not found' }, { status: 404 });
    }

    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve configuration reference' },
      { status: 400 },
    );
  }
}
