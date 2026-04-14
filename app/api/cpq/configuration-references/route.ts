import { NextRequest, NextResponse } from 'next/server';
import { resolveConfigurationReference, saveCanonicalConfigurationReference } from '@/lib/cpq/runtime/configuration-references';
import { copyConfigurationToCanonicalDetail, getCanonicalCopyCapability } from '@/lib/cpq/runtime/copy-configuration';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const capability = getCanonicalCopyCapability();

  if (!capability.available) {
    return NextResponse.json(
      {
        error:
          capability.reason ??
          'Canonical save is unavailable because ProductConfigurator CopyConfiguration is not configured in this environment.',
      },
      { status: 501 },
    );
  }

  try {
    const sourceHeaderId = String(body.source_header_id ?? body.canonical_header_id ?? '').trim();
    const sourceDetailId = String(body.source_detail_id ?? body.canonical_detail_id ?? '').trim();
    const targetHeaderId = String(body.target_header_id ?? sourceHeaderId).trim();
    const targetDetailId = crypto.randomUUID();

    const copyResult = await copyConfigurationToCanonicalDetail({
      sourceHeaderId,
      sourceDetailId,
      targetHeaderId,
      targetDetailId,
      deleteSource: false,
      overwriteTarget: false,
    });

    const row = await saveCanonicalConfigurationReference({
      configuration_reference: body.configuration_reference as string | undefined,
      canonical_header_id: targetHeaderId,
      canonical_detail_id: targetDetailId,
      ruleset: String(body.ruleset ?? ''),
      namespace: String(body.namespace ?? ''),
      product_description: body.product_description as string | null | undefined,
      account_code: body.account_code as string | null | undefined,
      country_code: body.country_code as string | null | undefined,
      source_working_detail_id: body.source_working_detail_id as string | null | undefined,
      source_session_id: body.source_session_id as string | null | undefined,
      json_snapshot: body.json_snapshot,
    });

    return NextResponse.json(
      {
        row,
        canonicalCopy: {
          status: copyResult.status,
          target_header_id: targetHeaderId,
          target_detail_id: targetDetailId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save canonical configuration reference' },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('configuration_reference') ?? '';
  const capability = getCanonicalCopyCapability();

  try {
    const row = await resolveConfigurationReference(reference);
    if (!row) {
      return NextResponse.json({ error: 'Configuration reference not found' }, { status: 404 });
    }

    return NextResponse.json({ row, copyCapability: capability });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve canonical configuration reference' },
      { status: 400 },
    );
  }
}
