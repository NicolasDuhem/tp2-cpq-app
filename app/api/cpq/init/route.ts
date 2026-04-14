import { NextRequest, NextResponse } from 'next/server';
import { startConfiguration } from '@/lib/cpq/runtime/client';
import { buildStartConfigurationPayload } from '@/lib/cpq/runtime/config';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';
import { mockInitState } from '@/lib/cpq/runtime/mock-data';
import { InitConfiguratorRequest } from '@/types/cpq';

export async function POST(req: NextRequest) {
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

  console.log('[cpq/init] request', requestPayload);
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
      sessionId: parsed.sessionId,
      parsed,
      rawResponse: parsed.raw ?? parsed,
      requestBody: cpqStartRequestBody,
      callType: 'StartConfiguration',
    });
  }

  try {
    const cpqResponse = await startConfiguration(requestPayload);
    const normalized = mapCpqToNormalizedState(cpqResponse, ruleset);

    return NextResponse.json({
      sessionId: normalized.sessionId,
      parsed: normalized,
      rawResponse: cpqResponse,
      requestBody: cpqStartRequestBody,
      callType: 'StartConfiguration',
    });
  } catch (error) {
    console.error('[cpq/init] failed', error);
    return NextResponse.json(
      { error: 'CPQ init failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
