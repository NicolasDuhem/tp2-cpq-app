import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS, requirePageEdit } from '@/lib/auth/page-access';
import { revalidatePath } from 'next/cache';
import { syncQPartAllocationToExternalIfBcOk } from '@/lib/sales/allocation-external-sync';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.qpart);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const sync = await syncQPartAllocationToExternalIfBcOk({
      partId: Number(body.partId),
      countryCode: String(body.countryCode ?? ''),
    });

    if (sync.state === 'error') {
      return NextResponse.json({ error: sync.error ?? sync.message, stage: 'allocation_external_sync' }, { status: 500 });
    }

    revalidatePath('/sales/qpart-allocation');
    return NextResponse.json({
      result: {
        skipped: sync.skipped,
        message: sync.message,
        state: sync.state,
        variantResult: { action: sync.variantAction ?? 'skipped' },
        eligibilityResult: { action: sync.eligibilityAction ?? 'skipped' },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push allocation to external PostgreSQL', stage: 'allocation_external_sync' },
      { status: 500 },
    );
  }
}
