import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageEdit } from '@/lib/auth/page-access';
import { ACCREDITATION_PAGE_PATH, syncAccreditationCategoriesFromBigCommerce } from '@/lib/sales/accreditation-allocation/service';
import { currentAccreditationActor, errorResponse } from '@/lib/sales/accreditation-allocation/route-helpers';

export const runtime = 'nodejs';

/** Refresh the local copy of the Brompton B2B channel category tree from BigCommerce. */
export async function POST() {
  const forbidden = await requirePageEdit(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;

  try {
    const result = await syncAccreditationCategoriesFromBigCommerce(await currentAccreditationActor());
    revalidatePath(ACCREDITATION_PAGE_PATH);
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error, 'Failed to sync categories from BigCommerce');
  }
}
