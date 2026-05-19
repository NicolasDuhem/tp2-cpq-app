import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS, requirePageEdit } from '@/lib/auth/page-access';
import { revalidatePath } from 'next/cache';
import { syncQPartCountryAllocationRows } from '@/lib/qpart/allocation/service';
import {
  listFilteredQPartAllocationPartIds,
  pushQPartAllocationBcOk,
  type SalesQPartAllocationBulkFilterCriteria,
} from '@/lib/sales/qpart-allocation/service';
import { QPART_UPDATE_ALL_COOKIE, verifyQPartUpdateAllToken } from '@/lib/sales/qpart-allocation/update-all-auth';

export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.qpart);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updateAll = body.updateAll === true;

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

    const result = await pushQPartAllocationBcOk({ partIds, countryCodes });

    revalidatePath('/sales/qpart-allocation');
    return NextResponse.json({ result: { ...result, mode: updateAll ? 'all-filtered' : 'current-page' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push BC OK allocation rows' },
      { status: 400 },
    );
  }
}
