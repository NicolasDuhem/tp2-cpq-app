import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import { listAccreditationExportRows } from '@/lib/sales/accreditation-allocation/service';
import { parseCsvParam } from '@/lib/sales/accreditation-allocation/tree';
import { csvTimestamp, toCsv } from '@/lib/sales/csv';

export const runtime = 'nodejs';

/** CSV of every country x level x category cell in scope (own and effective state). */
export async function GET(req: NextRequest) {
  const forbidden = await requirePageRead(PAGE_KEYS.salesAccreditationAllocation);
  if (forbidden) return forbidden;

  const params = req.nextUrl.searchParams;
  try {
    const rows = await listAccreditationExportRows({
      countryCodes: parseCsvParam(params.get('countries')).map((value) => value.toUpperCase()),
      levelIds: parseCsvParam(params.get('levels')).map(Number).filter((value) => Number.isFinite(value) && value > 0),
    });
    const header = [
      'channel_id',
      'country_code',
      'region',
      'sub_region',
      'accreditation_level',
      'accreditation_label',
      'category_id',
      'parent_category_id',
      'depth',
      'category_path',
      'own_active',
      'effective_active',
    ];
    const csv = toCsv(
      header,
      rows.map((row) => [
        row.channelId,
        row.countryCode,
        row.region,
        row.subRegion,
        row.levelCode,
        row.levelLabel,
        row.categoryId,
        row.parentCategoryId,
        row.depth,
        row.categoryPath,
        row.ownActive ? 'true' : 'false',
        row.effectiveActive ? 'true' : 'false',
      ]),
      { withBom: true },
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="accreditation-allocation_${csvTimestamp()}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Export failed' }, { status: 400 });
  }
}
