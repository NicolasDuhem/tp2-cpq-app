import { NextRequest, NextResponse } from 'next/server';
import { translateMetadataField } from '@/lib/qpart/translations/field-translation-service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    part_id?: unknown;
    metadata_definition_id?: unknown;
    fill_missing_only?: unknown;
  };

  const partId = Number(body.part_id);
  const metadataDefinitionId = Number(body.metadata_definition_id);
  const fillMissingOnly = body.fill_missing_only !== false;

  if (!Number.isFinite(partId)) {
    return NextResponse.json({ error: 'Invalid part_id' }, { status: 400 });
  }
  if (!Number.isFinite(metadataDefinitionId)) {
    return NextResponse.json({ error: 'Invalid metadata_definition_id' }, { status: 400 });
  }

  try {
    const result = await translateMetadataField({
      partId,
      metadataDefinitionId,
      fillMissingOnly,
    });

    return NextResponse.json({ row: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to translate metadata field' },
      { status: 400 },
    );
  }
}
