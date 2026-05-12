import { NextRequest, NextResponse } from 'next/server';
import { lookupExternalVariantEligibilityStatuses } from '@/lib/external-pg/variant-tables';
import { toExternalPgApiError } from '@/lib/external-pg/errors';
import {
  listSalesQPartAllocationExternalStatusPairs,
  type SalesQPartAllocationBulkFilterCriteria,
} from '@/lib/sales/qpart-allocation/service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let currentStage = 'request_received';

  try {
    currentStage = 'build_filtered_pairs';
    const pairs = await listSalesQPartAllocationExternalStatusPairs(
      (body.filterCriteria ?? {}) as SalesQPartAllocationBulkFilterCriteria,
    );

    currentStage = 'external_variant_eligibilities_lookup';
    const statuses = await lookupExternalVariantEligibilityStatuses(pairs, {
      onStage: (stage) => {
        currentStage = `external_${stage}`;
      },
    });

    return NextResponse.json({
      result: {
        pairCount: pairs.length,
        items: Object.fromEntries(
          statuses.map((status) => [
            `${status.sku}::${status.countryCode}`,
            status,
          ]),
        ),
      },
    });
  } catch (error) {
    const apiError = toExternalPgApiError(error, { stage: currentStage });
    return NextResponse.json(
      {
        error: apiError.error,
        errorType: apiError.errorType,
        errorCode: apiError.errorCode,
        errorDetail: apiError.errorDetail,
        errorHint: apiError.errorHint,
        stage: apiError.errorStage ?? currentStage,
      },
      { status: apiError.status },
    );
  }
}
