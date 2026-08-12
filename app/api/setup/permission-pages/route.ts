import { NextResponse } from 'next/server';
import { listPermissionPages } from '@/lib/auth/user-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ pages: await listPermissionPages() });
}
