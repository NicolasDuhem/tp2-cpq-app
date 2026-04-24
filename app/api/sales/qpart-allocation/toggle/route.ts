import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncQPartCountryAllocationRows } from '@/lib/qpart/allocation/service';
import { toggleQPartCountryAllocation } from '@/lib/sales/qpart-allocation/service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetStatus = String(body.targetStatus ?? '').trim();

  if (targetStatus !== 'active' && targetStatus !== 'inactive') {
    return NextResponse.json({ error: 'targetStatus must be active or inactive' }, { status: 400 });
  }

  try {
    await syncQPartCountryAllocationRows({ partIds: [Number(body.partId)] });

    const result = await toggleQPartCountryAllocation({
      partId: Number(body.partId),
      countryCode: String(body.countryCode ?? ''),
      targetStatus,
    });

    if (!result.updatedCount) {
      return NextResponse.json({ error: 'No allocation row found for this cell' }, { status: 404 });
    }

    revalidatePath('/sales/qpart-allocation');
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update allocation status' },
      { status: 400 },
    );
  }
}
