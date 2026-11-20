import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageEdit } from '@/lib/auth/page-access';
import { pushAccreditationCountries } from '@/lib/sales/accreditation-allocation/service';
import { asArray, errorResponse, readJsonBody } from '@/lib/sales/accreditation-allocation/route-helpers';

export const runtime = 'nodejs';

/** Re-push the given countries to external PostgreSQL without changing Neon. */
export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;

  const body = await readJsonBody(req);
  try {
    const result = await pushAccreditationCountries(asArray(body.countryCodes));
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error, 'Failed to push accreditation to external PostgreSQL');
  }
}
