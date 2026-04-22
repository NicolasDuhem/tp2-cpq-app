import { NextRequest, NextResponse } from 'next/server';
import { updateAllocationCellStatus } from '@/lib/sales/bike-allocation/service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetStatus = String(body.targetStatus ?? '').trim();

  if (targetStatus !== 'active' && targetStatus !== 'not_active') {
    return NextResponse.json({ error: 'targetStatus must be active or not_active' }, { status: 400 });
  }

  try {
    const result = await updateAllocationCellStatus({
      ruleset: String(body.ruleset ?? ''),
      ipnCode: String(body.ipnCode ?? ''),
      countryCode: String(body.countryCode ?? ''),
      targetStatus,
    });

    if (result.updatedCount === 0) {
      return NextResponse.json({ error: 'No matching sampler rows found for this cell' }, { status: 404 });
    }

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update allocation status' },
      { status: 400 },
    );
  }
}
