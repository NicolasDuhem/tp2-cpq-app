import { NextRequest, NextResponse } from 'next/server';
import { resolveConfigurationReference } from '@/lib/cpq/runtime/configuration-references';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const configurationReference = String(body.configuration_reference ?? '').trim();

  try {
    const resolved = await resolveConfigurationReference(configurationReference);
    if (!resolved) {
      return NextResponse.json({ error: 'Configuration reference not found' }, { status: 404 });
    }

    return NextResponse.json({
      resolved,
      startConfigurationInput: {
        ruleset: resolved.ruleset,
        namespace: resolved.namespace,
        headerId: resolved.canonical_header_id,
        sourceHeaderId: resolved.canonical_header_id,
        sourceDetailId: resolved.canonical_detail_id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve configuration reference' },
      { status: 400 },
    );
  }
}
