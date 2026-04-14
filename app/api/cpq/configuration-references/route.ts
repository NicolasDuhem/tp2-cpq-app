import { NextRequest, NextResponse } from 'next/server';
import { resolveConfigurationReference, saveCanonicalConfigurationReference } from '@/lib/cpq/runtime/configuration-references';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const row = await saveCanonicalConfigurationReference({
      configuration_reference: body.configuration_reference as string | undefined,
      canonical_header_id: String(body.canonical_header_id ?? ''),
      canonical_detail_id: String(body.canonical_detail_id ?? ''),
      ruleset: String(body.ruleset ?? ''),
      namespace: String(body.namespace ?? ''),
      product_description: body.product_description as string | null | undefined,
      account_code: body.account_code as string | null | undefined,
      country_code: body.country_code as string | null | undefined,
      source_working_detail_id: body.source_working_detail_id as string | null | undefined,
      source_session_id: body.source_session_id as string | null | undefined,
      json_snapshot: body.json_snapshot,
    });

    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save canonical configuration reference' },
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
      { error: error instanceof Error ? error.message : 'Failed to resolve canonical configuration reference' },
      { status: 400 },
    );
  }
}
