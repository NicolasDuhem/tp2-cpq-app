import { NextResponse } from 'next/server';
import { syncImageManagementFromSampler } from '@/lib/cpq/setup/service';

export async function POST() {

  try {
    const summary = await syncImageManagementFromSampler();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to sync from sampler results',
        details: detail,
      },
      { status: 500 },
    );
  }
}
