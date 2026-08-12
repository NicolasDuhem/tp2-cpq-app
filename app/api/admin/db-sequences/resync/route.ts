import { NextRequest, NextResponse } from 'next/server';
import { resyncAllPrimaryKeySequences, resyncPrimaryKeySequence } from '@/lib/db/sequence-service';
import { assertAdminMode } from '@/lib/server/admin-mode';

export async function POST(req: NextRequest) {
  try {
    assertAdminMode(req);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const targetTable = String(body.table ?? '').trim();
    const resyncAll = body.all === true;

    if (!resyncAll && !targetTable) {
      return NextResponse.json({ error: 'Provide table (e.g. public.qpart_parts) or set all=true.' }, { status: 400 });
    }

    if (resyncAll) {
      const rows = await resyncAllPrimaryKeySequences();
      return NextResponse.json({ rows, scope: 'all' });
    }

    const row = await resyncPrimaryKeySequence(targetTable);
    return NextResponse.json({ row, scope: 'single' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resync sequence.';
    const status = message.includes('Admin mode required') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
