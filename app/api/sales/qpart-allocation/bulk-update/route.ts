import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncQPartCountryAllocationRows } from '@/lib/qpart/allocation/service';
import { bulkUpdateQPartCountryAllocation } from '@/lib/sales/qpart-allocation/service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetStatus = String(body.targetStatus ?? '').trim();

  if (targetStatus !== 'active' && targetStatus !== 'inactive') {
    return NextResponse.json({ error: 'targetStatus must be active or inactive' }, { status: 400 });
  }

  try {
    const partIds = Array.isArray(body.partIds) ? body.partIds.map((value) => Number(value)) : [];
    await syncQPartCountryAllocationRows({ partIds });

    const result = await bulkUpdateQPartCountryAllocation({
      partIds,
      countryCodes: Array.isArray(body.countryCodes) ? body.countryCodes.map((value) => String(value ?? '')) : [],
      targetStatus,
    });

    revalidatePath('/sales/qpart-allocation');
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run bulk allocation update' },
      { status: 400 },
    );
  }
}
