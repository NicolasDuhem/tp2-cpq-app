import { NextRequest, NextResponse } from 'next/server';
import { createUser, listUsers } from '@/lib/auth/user-service';
import { getCurrentUser } from '@/lib/auth/session';
import { canAdminPage } from '@/lib/auth/permissions';
import { sql } from '@/lib/db/client';

async function canManage() { const count = await sql`select count(*)::int as c from app_users`; if ((count[0] as any).c === 0) return true; const user = await getCurrentUser(); return canAdminPage(user, 'setup.users'); }

export async function GET() { if (!(await canManage())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); return NextResponse.json({ rows: await listUsers() }); }
export async function POST(req: NextRequest) { if (!(await canManage())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); try { const body = await req.json(); const id = await createUser(body); return NextResponse.json({ id }, { status: 201 }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 }); } }
