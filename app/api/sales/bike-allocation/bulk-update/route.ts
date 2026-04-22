import { NextRequest, NextResponse } from 'next/server';
import { bulkUpdateAllocationStatus } from '@/lib/sales/bike-allocation/service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetStatus = String(body.targetStatus ?? '').trim();

  if (targetStatus !== 'active' && targetStatus !== 'not_active') {
    return NextResponse.json({ error: 'targetStatus must be active or not_active' }, { status: 400 });
  }

  try {
    const result = await bulkUpdateAllocationStatus({
      ruleset: String(body.ruleset ?? ''),
      ipnCodes: Array.isArray(body.ipnCodes) ? body.ipnCodes.map((value) => String(value ?? '')) : [],
      countryCodes: Array.isArray(body.countryCodes) ? body.countryCodes.map((value) => String(value ?? '')) : [],
      targetStatus,
    });

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run bulk allocation update' },
      { status: 400 },
    );
  }
}
