import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageEdit } from '@/lib/auth/page-access';
import { ACCREDITATION_PAGE_PATH, setAccreditationEligibility } from '@/lib/sales/accreditation-allocation/service';
import { asArray, currentAccreditationActor, errorResponse, readJsonBody } from '@/lib/sales/accreditation-allocation/route-helpers';

export const runtime = 'nodejs';

/** Bulk Active/Inactive: selected countries x selected levels x visible categories. */
export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;

  const body = await readJsonBody(req);
  const targetStatus = String(body.targetStatus ?? '').trim();
  if (targetStatus !== 'active' && targetStatus !== 'not_active') {
    return NextResponse.json({ error: 'targetStatus must be active or not_active' }, { status: 400 });
  }

  try {
    const result = await setAccreditationEligibility({
      countryCodes: asArray(body.countryCodes),
      levelIds: asArray(body.levelIds),
      categoryIds: asArray(body.categoryIds),
      targetStatus,
      actor: await currentAccreditationActor(),
      actionType: 'bulk_update',
    });
    revalidatePath(ACCREDITATION_PAGE_PATH);
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error, 'Failed to run bulk accreditation update');
  }
}
