import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS, requirePageEdit } from '@/lib/auth/page-access';
import { revalidatePath } from 'next/cache';
import { pushBikeAllocationBcOk } from '@/lib/sales/bike-allocation/service';

export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.bike);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const result = await pushBikeAllocationBcOk({
      ruleset: String(body.ruleset ?? ''),
      ipnCodes: Array.isArray(body.ipnCodes) ? body.ipnCodes.map((value) => String(value ?? '')) : [],
      countryCodes: Array.isArray(body.countryCodes) ? body.countryCodes.map((value) => String(value ?? '')) : [],
    });

    revalidatePath('/sales/bike-allocation');
    return NextResponse.json({ result: { ...result, mode: 'current-page' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push BC OK allocation rows' },
      { status: 400 },
    );
  }
}
