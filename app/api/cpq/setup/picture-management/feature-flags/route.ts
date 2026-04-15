import { NextRequest, NextResponse } from 'next/server';
import { setImageFeatureIgnoreDuringConfigure } from '@/lib/cpq/setup/service';

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const featureLabel = String(body.feature_label ?? '').trim();
  const ignoreDuringConfigure =
    typeof body.ignore_during_configure === 'boolean'
      ? body.ignore_during_configure
      : String(body.ignore_during_configure ?? '').toLowerCase() === 'true';

  try {
    const rows = await setImageFeatureIgnoreDuringConfigure(featureLabel, body.ignore_during_configure);
    return NextResponse.json({
      feature_label: featureLabel,
      ignore_during_configure: ignoreDuringConfigure,
      updatedRows: rows.length,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update feature ignore flag' },
      { status: 400 },
    );
  }
}
