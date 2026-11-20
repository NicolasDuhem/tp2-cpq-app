import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageAdmin, requirePageRead } from '@/lib/auth/page-access';
import {
  ACCREDITATION_PAGE_PATH,
  createAccreditationLevel,
  listAccreditationLevels,
  updateAccreditationLevel,
} from '@/lib/sales/accreditation-allocation/service';
import { errorResponse, readJsonBody } from '@/lib/sales/accreditation-allocation/route-helpers';

export const runtime = 'nodejs';

const actorOf = (user: { id: string; email: string; displayName: string }) => ({ userId: user.id, email: user.email, displayName: user.displayName });

export async function GET() {
  const forbidden = await requirePageRead(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;
  try {
    return NextResponse.json({ levels: await listAccreditationLevels(true) });
  } catch (error) {
    return errorResponse(error, 'Failed to list accreditation levels', 500);
  }
}

/** Add a level. Admin only. */
export async function POST(req: NextRequest) {
  const { user, forbidden } = await requirePageAdmin(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;
  const body = await readJsonBody(req);
  try {
    const level = await createAccreditationLevel({ label: body.label, code: body.code, actor: actorOf(user) });
    revalidatePath(ACCREDITATION_PAGE_PATH);
    return NextResponse.json({ level });
  } catch (error) {
    return errorResponse(error, 'Failed to create accreditation level');
  }
}

/** Rename / reorder / remove (isActive=false) / restore (isActive=true) a level. Admin only. */
export async function PATCH(req: NextRequest) {
  const { user, forbidden } = await requirePageAdmin(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;
  const body = await readJsonBody(req);
  try {
    const result = await updateAccreditationLevel({
      id: body.id,
      label: body.label,
      displayOrder: body.displayOrder,
      isActive: body.isActive,
      actor: actorOf(user),
    });
    revalidatePath(ACCREDITATION_PAGE_PATH);
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error, 'Failed to update accreditation level');
  }
}
