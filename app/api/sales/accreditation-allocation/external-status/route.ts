import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import { getAccreditationExternalStatus } from '@/lib/sales/accreditation-allocation/service';
import { asArray, errorResponse, readJsonBody } from '@/lib/sales/accreditation-allocation/route-helpers';

export const runtime = 'nodejs';

/** Read-only: one batched read of the external table for the given countries. */
export async function POST(req: NextRequest) {
  const forbidden = await requirePageRead(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;

  const body = await readJsonBody(req);
  try {
    const result = await getAccreditationExternalStatus(asArray(body.countryCodes));
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error, 'Failed to read external accreditation status');
  }
}
