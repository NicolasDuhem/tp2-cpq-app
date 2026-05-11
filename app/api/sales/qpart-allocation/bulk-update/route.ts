import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { syncQPartCountryAllocationRows } from '@/lib/qpart/allocation/service';
import {
  bulkUpdateQPartCountryAllocation,
  listFilteredQPartAllocationPartIds,
  type SalesQPartAllocationBulkFilterCriteria,
} from '@/lib/sales/qpart-allocation/service';
import { QPART_UPDATE_ALL_COOKIE, verifyQPartUpdateAllToken } from '@/lib/sales/qpart-allocation/update-all-auth';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetStatus = String(body.targetStatus ?? '').trim();
  const updateAll = body.updateAll === true;

  if (targetStatus !== 'active' && targetStatus !== 'inactive') {
    return NextResponse.json({ error: 'targetStatus must be active or inactive' }, { status: 400 });
  }

  if (updateAll && !verifyQPartUpdateAllToken(req.cookies.get(QPART_UPDATE_ALL_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Update all is password protected. Re-enable Update all and try again.' }, { status: 403 });
  }

  try {
    const countryCodes = Array.isArray(body.countryCodes) ? body.countryCodes.map((value) => String(value ?? '')) : [];
    const partIds = updateAll
      ? await listFilteredQPartAllocationPartIds((body.filterCriteria ?? {}) as SalesQPartAllocationBulkFilterCriteria)
      : Array.isArray(body.partIds)
        ? body.partIds.map((value) => Number(value))
        : [];

    if (partIds.length) {
      await syncQPartCountryAllocationRows({ partIds });
    }

    const result = await bulkUpdateQPartCountryAllocation({
      partIds,
      countryCodes,
      targetStatus,
    });

    revalidatePath('/sales/qpart-allocation');
    return NextResponse.json({ result: { ...result, mode: updateAll ? 'all-filtered' : 'current-page' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run bulk allocation update' },
      { status: 400 },
    );
  }
}
