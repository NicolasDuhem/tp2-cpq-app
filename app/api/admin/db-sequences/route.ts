import { NextRequest, NextResponse } from 'next/server';
import { listPrimaryKeySequences } from '@/lib/db/sequence-service';
import { assertAdminMode } from '@/lib/server/admin-mode';

export async function GET(req: NextRequest) {
  try {
    assertAdminMode(req);
    const rows = await listPrimaryKeySequences();
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load sequence health.';
    const status = message.includes('Admin mode required') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
