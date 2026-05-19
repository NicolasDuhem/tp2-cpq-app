import { NextResponse } from 'next/server';
import { listPermissionPages } from '@/lib/auth/user-service';
export async function GET() { return NextResponse.json({ rows: await listPermissionPages() }); }
