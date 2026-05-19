import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/user-service';
import { createSession, getCurrentUser } from '@/lib/auth/session';

export async function POST(req: NextRequest) { const body = await req.json().catch(() => ({})); const user = await authenticateUser(body.email ?? '', body.password ?? ''); if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 }); await createSession(user.id); return NextResponse.json({ user: await getCurrentUser() }); }
