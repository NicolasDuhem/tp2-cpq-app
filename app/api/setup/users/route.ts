import { NextRequest, NextResponse } from 'next/server';
import { createUser, listUsers } from '@/lib/auth/user-service';
import { getCurrentUser } from '@/lib/auth/session';
import { canEditPage } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

async function canManage() {
  const user = await getCurrentUser();
  if (!user) return true;
  return canEditPage(user, 'setup.users') || user.isSystemAdmin;
}

export async function GET() {
  if (!(await canManage())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: NextRequest) {
  if (!(await canManage())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await req.json();
    const id = await createUser(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 });
  }
}
