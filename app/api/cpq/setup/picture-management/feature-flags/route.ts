import { NextRequest, NextResponse } from 'next/server';
import { setImageFeatureSettings } from '@/lib/cpq/setup/service';

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const featureLabel = String(body.feature_label ?? '').trim();
  const includeIgnore = Object.prototype.hasOwnProperty.call(body, 'ignore_during_configure');
  const includeLayerOrder = Object.prototype.hasOwnProperty.call(body, 'feature_layer_order');
  const ignoreDuringConfigure = includeIgnore
    ? (typeof body.ignore_during_configure === 'boolean'
      ? body.ignore_during_configure
      : String(body.ignore_during_configure ?? '').toLowerCase() === 'true')
    : undefined;
  const featureLayerOrder = includeLayerOrder ? Number(body.feature_layer_order) : undefined;

  try {
    const updates: { ignore_during_configure?: boolean; feature_layer_order?: number } = {};
    if (includeIgnore) updates.ignore_during_configure = ignoreDuringConfigure;
    if (includeLayerOrder) updates.feature_layer_order = featureLayerOrder;
    const rows = await setImageFeatureSettings(featureLabel, updates);
    return NextResponse.json({
      feature_label: featureLabel,
      ignore_during_configure: ignoreDuringConfigure,
      feature_layer_order: featureLayerOrder,
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
