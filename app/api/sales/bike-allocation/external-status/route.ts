import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import { lookupExternalVariantEligibilityStatuses } from '@/lib/external-pg/variant-tables';
import { toExternalPgApiError } from '@/lib/external-pg/errors';
import {
  listSalesBikeAllocationExternalStatusPairs,
  type SalesBikeAllocationFilters,
} from '@/lib/sales/bike-allocation/service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const forbidden = await requirePageRead(PAGE_KEYS.bike);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let currentStage = 'request_received';

  try {
    currentStage = 'build_filtered_pairs';
    // `filters` carries the full normalized filter set (ruleset, bike type,
    // territory selection, IPN search, allocation statuses, feature filters), so
    // the server rebuilds the same filtered dataset the operator is looking at.
    const pairs = await listSalesBikeAllocationExternalStatusPairs((body.filters ?? {}) as SalesBikeAllocationFilters);

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
