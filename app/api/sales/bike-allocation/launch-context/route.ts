import { NextRequest, NextResponse } from 'next/server';
import { resolveConfiguratorLaunchContext } from '@/lib/sales/bike-allocation/service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const resolved = await resolveConfiguratorLaunchContext({
      ruleset: String(body.ruleset ?? ''),
      ipnCode: String(body.ipnCode ?? ''),
      countryCode: String(body.countryCode ?? ''),
    });

    return NextResponse.json({ resolved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve configurator launch context' },
      { status: 400 },
    );
  }
}
