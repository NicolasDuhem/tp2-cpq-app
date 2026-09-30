import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import { listSalesBikeAllocationExportRows } from '@/lib/sales/bike-allocation/service';
import {
  decodeFeatureFilters,
  parseAllocationStatuses,
  parseUrlList,
} from '@/lib/sales/allocation-territory';
import { csvTimestamp, toCsv } from '@/lib/sales/csv';

export const runtime = 'nodejs';

/**
 * CSV export of the current filtered allocation dataset.
 *
 * Read-only, so Read access on `sales.bike_allocation` is enough. Accepts the same
 * query parameters as the page, so the download always matches what the operator is
 * looking at — across every page of the filtered result, not just the displayed one.
 * `not_configured` cells are excluded: they have no allocation row.
 */
export async function GET(req: NextRequest) {
  const forbidden = await requirePageRead(PAGE_KEYS.bike);
  if (forbidden) return forbidden;

  const params = req.nextUrl.searchParams;

  try {
    const { availableFeatures, rows } = await listSalesBikeAllocationExportRows({
      ruleset: (params.get('ruleset') ?? '').trim(),
      bike_type: (params.get('bike_type') ?? '').trim(),
      country_code: (params.get('country_code') ?? '').trim(),
      countryCodes: parseUrlList(params.get('countries')).map((value) => value.toUpperCase()),
      ipnSearch: (params.get('ipn') ?? '').trim(),
      allocationStatuses: parseAllocationStatuses(params.get('status')),
      featureFilters: decodeFeatureFilters(params.get('features')),
    });

    const header = [
      'ipn_code',
      'ruleset',
      'bike_type',
      'country_code',
      'region',
      'sub_region',
      'allocation_status',
      'bc_ready',
      ...availableFeatures,
    ];

    const body = rows.map((row) => [
      row.ipnCode,
      row.ruleset,
      row.bikeType,
      row.countryCode,
      row.region,
      row.subRegion,
      // Exported with the label operators see in the UI, not the internal value.
      row.allocationStatus === 'active' ? 'Active' : 'Inactive',
      row.bcReady ? 'yes' : 'no',
      ...availableFeatures.map((feature) => row.featureValues[feature] ?? ''),
    ]);

    // BOM so Excel picks up UTF-8 instead of mangling non-ASCII values.
    const csv = toCsv(header, body, { withBom: true });
    const filename = `bike-allocation_${csvTimestamp()}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export bike allocation CSV' },
      { status: 400 },
    );
  }
}
