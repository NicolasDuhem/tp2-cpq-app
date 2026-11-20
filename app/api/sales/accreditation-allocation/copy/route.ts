import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageEdit } from '@/lib/auth/page-access';
import { ACCREDITATION_PAGE_PATH, copyAccreditationCountry } from '@/lib/sales/accreditation-allocation/service';
import { asArray, currentAccreditationActor, errorResponse, readJsonBody } from '@/lib/sales/accreditation-allocation/route-helpers';

export const runtime = 'nodejs';

/** Overwrite target countries with the source country's full accreditation matrix. */
export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;

  const body = await readJsonBody(req);
  try {
    const result = await copyAccreditationCountry({
      sourceCountryCode: body.sourceCountryCode,
      targetCountryCodes: asArray(body.targetCountryCodes),
      actor: await currentAccreditationActor(),
    });
    revalidatePath(ACCREDITATION_PAGE_PATH);
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error, 'Failed to copy country accreditation');
  }
}
