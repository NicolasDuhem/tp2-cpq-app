import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { canAdminPage } from '@/lib/auth/permissions';
import { sql } from '@/lib/db/client';
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) { const user = await getCurrentUser(); if (user && !(canAdminPage(user, 'setup.users') || user.isSystemAdmin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); const body = await req.json().catch(() => ({})); await sql`update app_users set is_active=${!!body.isActive}, updated_at=now() where id=${params.id}`; return NextResponse.json({ ok: true }); }
