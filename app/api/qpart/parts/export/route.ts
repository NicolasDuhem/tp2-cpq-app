import { NextRequest, NextResponse } from 'next/server';
import { exportPartsCsv } from '@/lib/qpart/parts/csv-service';

export async function GET(req: NextRequest) {
  const partIdRaw = req.nextUrl.searchParams.get('part_id');
  const partId = partIdRaw ? Number(partIdRaw) : undefined;

  if (partIdRaw && !Number.isFinite(partId)) {
    return NextResponse.json({ error: 'Invalid part_id' }, { status: 400 });
  }

  try {
    const exported = await exportPartsCsv(partId);
    return new NextResponse(exported.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exported.fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export CSV';
    const status = message === 'Part not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
