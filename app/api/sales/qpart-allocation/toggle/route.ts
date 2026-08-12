import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageEdit } from '@/lib/auth/page-access';
import { revalidatePath } from 'next/cache';
import { syncQPartCountryAllocationRows } from '@/lib/qpart/allocation/service';
import { toggleQPartCountryAllocation } from '@/lib/sales/qpart-allocation/service';
import { getCurrentUser } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.qpart);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetStatus = String(body.targetStatus ?? '').trim();

  if (targetStatus !== 'active' && targetStatus !== 'inactive') {
    return NextResponse.json({ error: 'targetStatus must be active or inactive' }, { status: 400 });
  }

  try {
    const actor = await getCurrentUser();
    await syncQPartCountryAllocationRows({ partIds: [Number(body.partId)] });

    const result = await toggleQPartCountryAllocation({
      partId: Number(body.partId),
      countryCode: String(body.countryCode ?? ''),
      targetStatus,
      actor: actor ? { userId: actor.id, email: actor.email, displayName: actor.displayName } : null,
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
