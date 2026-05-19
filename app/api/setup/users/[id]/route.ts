import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { canEditPage } from '@/lib/auth/permissions';
import { sql } from '@/lib/db/client';
import { updateUser } from '@/lib/auth/user-service';

async function guard() { const u = await getCurrentUser(); if (!u) return true; return canEditPage(u, 'setup.users') || u.isSystemAdmin; }
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) { if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); const rows = await sql`select id, email, display_name, is_active, is_system_admin, last_login_at, created_at from app_users where id=${params.id}`; const permRows = await sql`select page_key, permission_level from app_user_page_permissions where user_id=${params.id}`; return NextResponse.json({ row: rows[0] ?? null, permissions: permRows }); }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) { if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); try { await updateUser(params.id, await req.json()); return NextResponse.json({ ok: true }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 }); } }
