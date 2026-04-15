import { NextRequest, NextResponse } from 'next/server';
import { resolveConfigurationReference } from '@/lib/cpq/runtime/configuration-references';
import { startConfiguration } from '@/lib/cpq/runtime/client';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const configurationReference = String(body.configuration_reference ?? '').trim();

  try {
    const resolved = await resolveConfigurationReference(configurationReference);
    if (!resolved) {
      return NextResponse.json({ error: 'Configuration reference not found' }, { status: 404 });
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

    const cpqResponse = await startConfiguration(startInput);
    const parsed = mapCpqToNormalizedState(cpqResponse, resolved.ruleset);

    return NextResponse.json({
      resolved,
      startConfigurationInput: startInput,
      sessionId: parsed.sessionId,
      parsed,
      rawResponse: cpqResponse,
      callType: 'StartConfiguration',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve configuration reference' },
      { status: 400 },
    );
  }
}
