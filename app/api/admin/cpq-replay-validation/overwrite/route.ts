// Controlled overwrite route for /admin/cpq-replay-validation.
//
// Unlike the other routes on this page, this one writes — but only ever as an UPDATE of
// existing rows, and only after the previous row content has been archived in the same
// transaction. It requires Admin access on `admin.cpq_replay_validation`.
//
// After the Neon transaction commits it performs one targeted external PostgreSQL update:
// `variant_eligibilities."DetailId"` only, for the matching bike/country row. It must not run the
// full external push, must not write `public.variants`, must not insert external rows, must not
// call BigCommerce, must not write the allocation audit log, and must not insert live
// configuration-reference or sampler rows.

import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageAdmin } from '@/lib/auth/page-access';
import {
  OVERWRITE_MAX_ROWS,
  runReplayOverwriteBatch,
  type OverwriteRowRequest,
} from '@/lib/admin/cpq-replay-validation/overwrite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const asOptionalText = (value: unknown): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const parseRows = (value: unknown): { rows: OverwriteRowRequest[]; invalid: number } => {
  if (!Array.isArray(value)) return { rows: [], invalid: 0 };
  const rows: OverwriteRowRequest[] = [];
  let invalid = 0;
  const seen = new Set<number>();

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      invalid += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = Number(record.configurationReferenceId);
    const configurationReference = asOptionalText(record.configurationReference);
    if (!Number.isInteger(id) || id <= 0 || !configurationReference) {
      invalid += 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      configurationReferenceId: id,
      configurationReference,
      existingItemCode: asOptionalText(record.existingItemCode),
      countryCode: asOptionalText(record.countryCode),
      bikeType: asOptionalText(record.bikeType),
      ruleset: asOptionalText(record.ruleset),
    });
  }

  return { rows, invalid };
};

export async function POST(req: NextRequest) {
  const { user, forbidden } = await requirePageAdmin(PAGE_KEYS.adminCpqReplayValidation);
  if (forbidden) return forbidden;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { rows, invalid } = parseRows(body.rows);

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          invalid > 0
            ? 'No valid rows to overwrite: every row needs configurationReferenceId and configurationReference.'
            : 'rows must contain at least one row to overwrite.',
      },
      { status: 400 },
    );
  }
  if (rows.length > OVERWRITE_MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows selected. Maximum per overwrite batch is ${OVERWRITE_MAX_ROWS}.` },
      { status: 400 },
    );
  }

  try {
    // The replay is re-run server-side inside this call; no client replay payload is written.
    const { overwriteBatchId, results, summary } = await runReplayOverwriteBatch({
      rows,
      actor: { userId: user.id, email: user.email, displayName: user.displayName },
      clientBatchLabel: asOptionalText(body.overwriteBatchId),
    });

    return NextResponse.json({
      overwriteBatchId,
      summary,
      results,
      invalidRowCount: invalid,
      maxRows: OVERWRITE_MAX_ROWS,
      archivedBeforeUpdate: true,
      // The only external write is the targeted variant_eligibilities."DetailId" update,
      // reported per row under externalEligibilityDetailUpdate.
      externalVariantsUpdated: false,
      externalRowsInserted: false,
      bigcommerceUpdated: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Replay overwrite batch failed' },
      { status: 400 },
    );
  }
}
