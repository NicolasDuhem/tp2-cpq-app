// Read-only validation route: do not write to Neon or external systems.
//
// Lightweight listing only — `json_snapshot` / `finalize_response_json` are never
// selected here. Snapshot-scale data is only touched by the run route, per reference.

import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import {
  REFERENCE_LIST_DEFAULT_LIMIT,
  REFERENCE_LIST_MAX_LIMIT,
  listReplayValidationReferences,
  normalizeReferenceListLimit,
} from '@/lib/admin/cpq-replay-validation/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const forbidden = await requirePageRead(PAGE_KEYS.adminCpqReplayValidation);
  if (forbidden) return forbidden;

  const bikeType = (req.nextUrl.searchParams.get('bikeType') ?? '').trim();
  const countryCode = (req.nextUrl.searchParams.get('countryCode') ?? '').trim();
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam === null ? REFERENCE_LIST_DEFAULT_LIMIT : normalizeReferenceListLimit(limitParam);

  if (!bikeType || !countryCode) {
    return NextResponse.json({ error: 'bikeType and countryCode are required' }, { status: 400 });
  }

  try {
    const rows = await listReplayValidationReferences({ bikeType, countryCode, limit });
    return NextResponse.json({ rows, limit, maxLimit: REFERENCE_LIST_MAX_LIMIT });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load configuration references' },
      { status: 400 },
    );
  }
}
