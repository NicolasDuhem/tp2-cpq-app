import { NextRequest, NextResponse } from 'next/server';
import { importPartsCsv } from '@/lib/qpart/parts/csv-service';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const dryRun = String(formData.get('dry_run') ?? 'true').toLowerCase() !== 'false';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const rawCsv = await file.text();
    if (!rawCsv.trim()) {
      return NextResponse.json({ error: 'Uploaded CSV is empty' }, { status: 400 });
    }

    const summary = await importPartsCsv(rawCsv, dryRun);
    const status = summary.errors > 0 ? 400 : 200;
    return NextResponse.json({ summary }, { status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to import CSV' }, { status: 500 });
  }
}
