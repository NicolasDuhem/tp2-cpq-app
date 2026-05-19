import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS, requirePageEdit } from '@/lib/auth/page-access';
import {
  QPART_UPDATE_ALL_COOKIE,
  createQPartUpdateAllToken,
  verifyQPartUpdateAllPassword,
} from '@/lib/sales/qpart-allocation/update-all-auth';

export async function POST(req: NextRequest) {
  const forbidden = await requirePageEdit(PAGE_KEYS.qpart);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (!verifyQPartUpdateAllPassword(body.password)) {
    return NextResponse.json({ ok: false, error: 'Invalid update-all password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(QPART_UPDATE_ALL_COOKIE, createQPartUpdateAllToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}
