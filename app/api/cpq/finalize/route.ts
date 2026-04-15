import { NextRequest, NextResponse } from 'next/server';
import { finalizeConfiguration } from '@/lib/cpq/runtime/client';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionId = String(body.sessionId ?? body.sessionID ?? '').trim();
  const ruleset = String(body.ruleset ?? process.env.CPQ_PART_NAME ?? 'BBLV6_G-LineMY26').trim();

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  try {
    const cpqResponse = await finalizeConfiguration(sessionId);
    const parsed = mapCpqToNormalizedState(cpqResponse, ruleset);

    return NextResponse.json({
      sessionId,
      parsed,
      rawResponse: cpqResponse,
      callType: 'FinalizeConfiguration',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'CPQ finalize failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
