// Read-only validation route: do not write to Neon or external systems.
//
// This route re-runs saved configurations through CPQ and compares item codes.
// It must never call sampler saves, configuration-reference saves, allocation audit
// writes, external PostgreSQL pushes or BigCommerce updates. References are processed
// sequentially and the batch size is capped to protect CPQ and the request budget.

import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import { loadIgnoredConfigureRules, loadReplayReferenceContexts } from '@/lib/admin/cpq-replay-validation/service';
import {
  RUN_DEFAULT_LIMIT,
  RUN_MAX_LIMIT,
  normalizeRunLimit,
  replayConfigurationReference,
  summarizeReplayResults,
  type ReplayResult,
} from '@/lib/admin/cpq-replay-validation/replay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const parseReferenceIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && Number.isInteger(entry) && entry > 0);
  return [...new Set(ids)];
};

export async function POST(req: NextRequest) {
  const forbidden = await requirePageRead(PAGE_KEYS.adminCpqReplayValidation);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedIds = parseReferenceIds(body.referenceIds);
  const limit = body.limit === undefined ? RUN_DEFAULT_LIMIT : normalizeRunLimit(body.limit);

  if (requestedIds.length === 0) {
    return NextResponse.json({ error: 'referenceIds must contain at least one reference id' }, { status: 400 });
  }
  if (requestedIds.length > RUN_MAX_LIMIT) {
    return NextResponse.json(
      { error: `Too many references selected. Maximum per run is ${RUN_MAX_LIMIT}.` },
      { status: 400 },
    );
  }

  try {
    const batchIds = requestedIds.slice(0, limit);
    const [references, ignoreRules] = await Promise.all([
      loadReplayReferenceContexts(batchIds),
      loadIgnoredConfigureRules(),
    ]);

    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    const results: ReplayResult[] = [];

    // Sequential by design: no parallel flood against the CPQ API.
    for (const referenceId of batchIds) {
      const reference = referenceById.get(referenceId);
      if (!reference) {
        results.push({
          referenceId,
          configurationReference: String(referenceId),
          countryCode: null,
          bikeType: null,
          ruleset: null,
          existingItemCode: null,
          replayedItemCode: null,
          finalizedItemCode: null,
          status: 'skipped',
          message: 'Reference id not found or not active.',
          durationMs: 0,
          traceId: '',
          selectionSource: 'none',
          samplerRowId: null,
          selectionCount: 0,
          configuredCount: 0,
          ignoredCount: 0,
          unmatchedCount: 0,
          replaySessionId: null,
          requestedDetailId: null,
          replayHeaderId: null,
          replayedDetailId: null,
          finalizeSucceeded: false,
          steps: [],
        });
        continue;
      }
      results.push(await replayConfigurationReference(reference, ignoreRules));
    }

    return NextResponse.json({
      results,
      summary: summarizeReplayResults(results),
      requestedCount: requestedIds.length,
      processedCount: results.length,
      limit,
      maxLimit: RUN_MAX_LIMIT,
      readOnly: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Replay validation run failed' },
      { status: 400 },
    );
  }
}
