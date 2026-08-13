// Read-only validation route: do not write to Neon or external systems.

import { NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import { listReplayValidationOptions } from '@/lib/admin/cpq-replay-validation/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const forbidden = await requirePageRead(PAGE_KEYS.adminCpqReplayValidation);
  if (forbidden) return forbidden;

  try {
    const options = await listReplayValidationOptions();
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load replay validation options' },
      { status: 400 },
    );
  }
}
