import { NextRequest, NextResponse } from 'next/server';
import { persistSamplerResult } from '@/lib/cpq/runtime/persistence';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const row = await persistSamplerResult({
      ipn_code: body.ipn_code as string | null | undefined,
      ruleset: String(body.ruleset ?? ''),
      account_code: String(body.account_code ?? ''),
      customer_id: body.customer_id as string | null | undefined,
      currency: body.currency as string | null | undefined,
      language: body.language as string | null | undefined,
      country_code: body.country_code as string | null | undefined,
      namespace: body.namespace as string | null | undefined,
      header_id: body.header_id as string | null | undefined,
      detail_id: body.detail_id as string | null | undefined,
      session_id: body.session_id as string | null | undefined,
      json_result: body.json_result,
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to persist sampler result' },
      { status: 400 },
    );
  }
}
