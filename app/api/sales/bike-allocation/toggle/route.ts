import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageEdit } from '@/lib/auth/page-access';
import { revalidatePath } from 'next/cache';
import { updateAllocationCellStatus } from '@/lib/sales/bike-allocation/service';
import { getCurrentUser } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.bike);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetStatus = String(body.targetStatus ?? '').trim();

  if (targetStatus !== 'active' && targetStatus !== 'not_active') {
    return NextResponse.json({ error: 'targetStatus must be active or not_active' }, { status: 400 });
  }

  try {
    const actor = await getCurrentUser();
    const result = await updateAllocationCellStatus({
      ruleset: String(body.ruleset ?? ''),
      ipnCode: String(body.ipnCode ?? ''),
      countryCode: String(body.countryCode ?? ''),
      targetStatus,
      actor: actor ? { userId: actor.id, email: actor.email, displayName: actor.displayName } : null,
    });

    if (result.updatedCount === 0) {
      return NextResponse.json({ error: 'No matching sampler rows found for this cell' }, { status: 404 });
    }

    revalidatePath('/sales/bike-allocation');
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update allocation status' },
      { status: 400 },
    );
  }
}
