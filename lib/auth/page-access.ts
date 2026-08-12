import 'server-only';

import { NextResponse } from 'next/server';
import { canEditPage, canReadPage } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';

import { PAGE_KEYS } from '@/lib/auth/page-keys';


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
