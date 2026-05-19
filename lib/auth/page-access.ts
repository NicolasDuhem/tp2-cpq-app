import { NextResponse } from 'next/server';
import { canEditPage, canReadPage } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';

export const PAGE_KEYS = {
  bike: 'sales.bike_allocation',
  qpart: 'sales.qpart_allocation',
  cpqConfigure: 'cpq.configure',
  cpqSetup: 'cpq.setup',
  cpqSetupAccounts: 'cpq.setup.accounts',
  cpqSetupRulesets: 'cpq.setup.rulesets',
  cpqSetupPictures: 'cpq.setup.pictures',
  setupUsers: 'setup.users',
} as const;

export async function requirePageRead(pageKey: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Forbidden', message: 'You must be logged in to view this page.' }, { status: 403 });
  if (!canReadPage(user, pageKey)) return NextResponse.json({ error: 'Forbidden', message: 'You do not have permission to view this page.' }, { status: 403 });
  return null;
}

export async function requirePageEdit(pageKey: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Forbidden', message: 'You must be logged in to perform this action.' }, { status: 403 });
  if (!canEditPage(user, pageKey)) return NextResponse.json({ error: 'Forbidden', message: 'You need Edit access for this action.' }, { status: 403 });
  return null;
}
