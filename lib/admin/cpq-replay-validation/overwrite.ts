// Controlled overwrite for the admin CPQ replay validation page.
//
// Safety contract enforced in this module:
//   * The replay is ALWAYS re-run server-side; no client-supplied replay payload is ever
//     written. The browser only chooses which reference ids to apply.
//   * Live rows are only ever UPDATEd. Nothing here inserts a live
//     `cpq_configuration_references` or `CPQ_sampler_result` row — a missing sampler row
//     is skipped, never created.
//   * The archive insert and both live updates run in ONE transaction, and each update
//     carries an `exists (...)` guard against the archive row for this batch, so a live
//     row cannot be updated unless its archive row landed first.
//   * No external PostgreSQL push, no BigCommerce call, no allocation audit write.

import 'server-only';

import { randomUUID } from 'crypto';

import { sql, sqlTransaction } from '@/lib/db/client';
import { reduceConfigurationJsonSnapshot } from '@/lib/cpq/runtime/reduce-json-snapshot';
import type { SamplerSelectedOption } from '@/lib/cpq/replay/matching';
import type { NormalizedBikeBuilderState } from '@/types/cpq';
import { replayConfigurationReference, type ReplayResult, type ReplayWritePayload } from './replay';
import {
  loadIgnoredConfigureRules,
  loadReplayReferenceContexts,
  resolveSamplerRowForReference,
  type ReplayReferenceContextRow,
} from './service';

export const OVERWRITE_MAX_ROWS = 25;

export const SOURCE_PAGE = 'admin.cpq_replay_validation';
export const SOURCE_PROCESS = 'cpq_replay_overwrite';
export const SAMPLER_PAYLOAD_SOURCE = 'admin-cpq-replay-overwrite';

export type OverwriteRowStatus = 'updated' | 'skipped' | 'failed';

export type OverwriteActor = {
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
};

/** Optional client-side expectations, validated against live server rows before writing. */
export type OverwriteRowRequest = {
  configurationReferenceId: number;
  configurationReference?: string | null;
  existingItemCode?: string | null;
  countryCode?: string | null;
  bikeType?: string | null;
  ruleset?: string | null;
};

export type OverwriteRowResult = {
  configurationReferenceId: number;
  configurationReference: string;
  existingItemCode: string | null;
  replayedItemCode: string | null;
  status: OverwriteRowStatus;
  message?: string;
  error?: string;
  archiveId?: number;
  samplerResultId?: number;
  samplerMatchedOn?: string;
  replayStatus?: ReplayResult['status'];
  replayRunId?: string;
  durationMs: number;
};

export type OverwriteSummary = {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
};

const asTrimmedOrNull = (value: unknown): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const sameOrNull = (expected: unknown, actual: string | null): boolean => {
  const expectedText = asTrimmedOrNull(expected);
  if (expectedText === null) return true; // not asserted by the client
  return expectedText === actual;
};

/** Mirrors the `json_snapshot` shape `/cpq` sends to `POST /api/cpq/configuration-references`. */
const buildConfigurationSnapshot = (writePayload: ReplayWritePayload) =>
  reduceConfigurationJsonSnapshot({
    parsed: writePayload.snapshotState,
    selectedOptions: writePayload.selectedOptions,
    saveSource: writePayload.snapshotSource,
    finalizeRawResponse: writePayload.finalizeRawResponse,
    retrievedAt: new Date().toISOString(),
  });

const buildDropdownOrderSnapshot = (state: NormalizedBikeBuilderState) =>
  state.features.map((feature, index) => {
    const selectedOptionId = (feature.selectedOptionId ?? '').trim();
    const selectedOption =
      feature.availableOptions.find((option) => option.optionId === selectedOptionId) ??
      feature.availableOptions.find((option) => option.selected) ??
      null;
    return {
      level: index + 1,
      featureId: feature.featureId.trim(),
      featureLabel: feature.featureLabel.trim(),
      selectedOptionId,
      selectedOptionLabel: (selectedOption?.label ?? selectedOptionId).trim() || '(none)',
      selectedOptionValue: (selectedOption?.value ?? feature.selectedValue ?? feature.currentValue ?? '').trim(),
    };
  });

const buildSamplerSignature = (ruleset: string, selectedOptions: SamplerSelectedOption[]) =>
  `${ruleset}::${selectedOptions
    .map((entry) => `${entry.featureId}:${entry.optionId}:${entry.optionValue}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|')}`;

/** Mirrors `buildCapturedSamplerPayload` on `/cpq`, with an explicit admin-overwrite source tag. */
const buildSamplerJsonResult = (writePayload: ReplayWritePayload) => ({
  sequence: 1,
  timestamp: new Date().toISOString(),
  traversalLevel: 1,
  traversalPath: [],
  traversalPathKey: '',
  parentPathKey: '',
  changedFeatureId: '',
  changedOptionId: '',
  changedOptionValue: '',
  ruleset: writePayload.ruleset,
  namespace: writePayload.namespace,
  headerId: writePayload.headerId,
  detailId: writePayload.detailId,
  sessionId: writePayload.sessionId,
  baseDetailId: writePayload.detailId,
  sourceDetailId: null,
  branchDetailId: writePayload.detailId,
  samplerMode: 'sampler',
  description: writePayload.productDescription,
  ipn: writePayload.itemCode,
  price: writePayload.configuredPrice,
  selectedOptions: writePayload.selectedOptions,
  dropdownOrderSnapshot: buildDropdownOrderSnapshot(writePayload.snapshotState),
  signature: buildSamplerSignature(writePayload.ruleset, writePayload.selectedOptions),
  rawSnippet: {
    Description: writePayload.productDescription,
    IPNCode: writePayload.itemCode,
    Price: writePayload.configuredPrice,
    SessionID: writePayload.sessionId,
  },
  source: SAMPLER_PAYLOAD_SOURCE,
});

type ConfigurationReferenceUpdatePayload = {
  final_ipn_code: string | null;
  product_description: string | null;
  canonical_header_id: string;
  header_id: string;
  canonical_detail_id: string;
  finalized_detail_id: string;
  finalized_session_id: string | null;
  finalize_response_json: unknown;
  json_snapshot: unknown;
};

type SamplerResultUpdatePayload = {
  ipn_code: string | null;
  namespace: string | null;
  header_id: string | null;
  detail_id: string | null;
  session_id: string | null;
  json_result: unknown;
};

/**
 * Archive both live rows and apply both updates atomically.
 *
 * The archive statement reads the live rows with `to_jsonb(...)` INSIDE the transaction, so
 * the archived snapshot is exactly the state being replaced. Both updates require the
 * archive row for this batch to exist, which makes "never overwrite without archive" a
 * database-enforced invariant rather than a matter of statement ordering.
 */
async function archiveAndUpdate(input: {
  reference: ReplayReferenceContextRow;
  samplerResultId: number;
  batchId: string;
  replayRunId: string;
  actor: OverwriteActor;
  referencePayload: ConfigurationReferenceUpdatePayload;
  samplerPayload: SamplerResultUpdatePayload;
  metadata: Record<string, unknown>;
}) {
  const { reference, samplerResultId, batchId, replayRunId, actor, referencePayload, samplerPayload } = input;

  const results = await sqlTransaction([
    sql`
      insert into app_cpq_replay_overwrite_archive (
        actor_user_id,
        actor_email,
        actor_display_name,
        source_page,
        source_process,
        replay_run_id,
        overwrite_batch_id,
        configuration_reference_id,
        configuration_reference,
        sampler_result_id,
        existing_item_code,
        replayed_item_code,
        country_code,
        bike_type,
        ruleset,
        old_configuration_reference_row,
        old_sampler_result_row,
        new_configuration_reference_payload,
        new_sampler_result_payload,
        status,
        metadata
      )
      select
        ${asTrimmedOrNull(actor.userId)}::text,
        ${asTrimmedOrNull(actor.email)}::text,
        ${asTrimmedOrNull(actor.displayName)}::text,
        ${SOURCE_PAGE}::text,
        ${SOURCE_PROCESS}::text,
        ${replayRunId}::text,
        ${batchId}::text,
        c.id,
        c.configuration_reference,
        s.id,
        c.final_ipn_code,
        ${referencePayload.final_ipn_code}::text,
        c.country_code,
        ${reference.bikeType}::text,
        c.ruleset,
        to_jsonb(c),
        to_jsonb(s),
        ${JSON.stringify(referencePayload)}::jsonb,
        ${JSON.stringify(samplerPayload)}::jsonb,
        'archived'::text,
        ${JSON.stringify(input.metadata)}::jsonb
      from cpq_configuration_references c
      join CPQ_sampler_result s on s.id = ${samplerResultId}
      where c.id = ${reference.id}
      returning id
    `,
    sql`
      update cpq_configuration_references
      set
        final_ipn_code = ${referencePayload.final_ipn_code},
        product_description = ${referencePayload.product_description},
        canonical_header_id = ${referencePayload.canonical_header_id},
        header_id = ${referencePayload.header_id},
        canonical_detail_id = ${referencePayload.canonical_detail_id},
        finalized_detail_id = ${referencePayload.finalized_detail_id},
        finalized_session_id = ${referencePayload.finalized_session_id},
        finalize_response_json = ${JSON.stringify(referencePayload.finalize_response_json ?? {})}::jsonb,
        json_snapshot = ${JSON.stringify(referencePayload.json_snapshot ?? {})}::jsonb,
        updated_at = now()
      where id = ${reference.id}
        and exists (
          select 1
          from app_cpq_replay_overwrite_archive a
          where a.overwrite_batch_id = ${batchId}
            and a.configuration_reference_id = ${reference.id}
        )
      returning id
    `,
    sql`
      update CPQ_sampler_result
      set
        ipn_code = ${samplerPayload.ipn_code},
        namespace = ${samplerPayload.namespace},
        header_id = ${samplerPayload.header_id},
        detail_id = ${samplerPayload.detail_id},
        session_id = ${samplerPayload.session_id},
        json_result = ${JSON.stringify(samplerPayload.json_result ?? {})}::jsonb,
        updated_at = now()
      where id = ${samplerResultId}
        and exists (
          select 1
          from app_cpq_replay_overwrite_archive a
          where a.overwrite_batch_id = ${batchId}
            and a.configuration_reference_id = ${reference.id}
        )
      returning id
    `,
  ]);

  const archiveRows = (results[0] ?? []) as Array<{ id: number }>;
  const referenceRows = (results[1] ?? []) as Array<{ id: number }>;
  const samplerRows = (results[2] ?? []) as Array<{ id: number }>;

  return {
    archiveId: archiveRows[0] ? Number(archiveRows[0].id) : null,
    referenceUpdated: referenceRows.length,
    samplerUpdated: samplerRows.length,
  };
}

async function applyOverwriteForReference(input: {
  reference: ReplayReferenceContextRow;
  request: OverwriteRowRequest;
  ignoreRules: Awaited<ReturnType<typeof loadIgnoredConfigureRules>>;
  actor: OverwriteActor;
  batchId: string;
  clientBatchLabel?: string | null;
}): Promise<OverwriteRowResult> {
  const { reference, request, ignoreRules, actor, batchId } = input;
  const startedAt = Date.now();

  const base = {
    configurationReferenceId: reference.id,
    configurationReference: reference.configurationReference,
    existingItemCode: reference.existingItemCode,
    replayedItemCode: null as string | null,
  };

  // Validate the client's view of the row against the live row before doing anything.
  if (
    !sameOrNull(request.configurationReference, reference.configurationReference) ||
    !sameOrNull(request.existingItemCode, reference.existingItemCode) ||
    !sameOrNull(request.countryCode, reference.countryCode) ||
    !sameOrNull(request.ruleset, reference.ruleset) ||
    !sameOrNull(request.bikeType, reference.bikeType)
  ) {
    return {
      ...base,
      status: 'skipped',
      message: 'Live row no longer matches the submitted selection (stale results). Re-run the replay and try again.',
      durationMs: Date.now() - startedAt,
    };
  }

  // Re-run the replay server-side. The browser's replay result is never written.
  const replay = await replayConfigurationReference(reference, ignoreRules, { captureWritePayload: true });
  base.replayedItemCode = replay.replayedItemCode;

  if (replay.status === 'failed' || replay.status === 'skipped') {
    return {
      ...base,
      status: replay.status === 'failed' ? 'failed' : 'skipped',
      replayStatus: replay.status,
      replayRunId: replay.traceId,
      message: replay.message,
      error: replay.error,
      durationMs: Date.now() - startedAt,
    };
  }

  const writePayload = replay.writePayload;
  if (!writePayload || !replay.replayedItemCode || !replay.replayedDetailId) {
    return {
      ...base,
      status: 'failed',
      replayStatus: replay.status,
      replayRunId: replay.traceId,
      message: 'Server-side replay did not produce a complete write payload (missing item code or detail id).',
      durationMs: Date.now() - startedAt,
    };
  }

  const samplerMatch = await resolveSamplerRowForReference(reference);
  if (!samplerMatch) {
    return {
      ...base,
      status: 'skipped',
      replayStatus: replay.status,
      replayRunId: replay.traceId,
      message: 'Existing sampler row not found; no insert performed.',
      durationMs: Date.now() - startedAt,
    };
  }

  const referencePayload: ConfigurationReferenceUpdatePayload = {
    final_ipn_code: replay.replayedItemCode,
    product_description: writePayload.productDescription,
    canonical_header_id: writePayload.headerId,
    header_id: writePayload.headerId,
    canonical_detail_id: replay.replayedDetailId,
    finalized_detail_id: replay.replayedDetailId,
    finalized_session_id: writePayload.sessionId,
    finalize_response_json: writePayload.finalizeRawResponse,
    json_snapshot: buildConfigurationSnapshot(writePayload),
  };

  const samplerPayload: SamplerResultUpdatePayload = {
    ipn_code: replay.replayedItemCode,
    namespace: writePayload.namespace,
    header_id: writePayload.headerId,
    detail_id: replay.replayedDetailId,
    session_id: writePayload.sessionId,
    json_result: buildSamplerJsonResult(writePayload),
  };

  try {
    const outcome = await archiveAndUpdate({
      reference,
      samplerResultId: samplerMatch.id,
      batchId,
      replayRunId: replay.traceId,
      actor,
      referencePayload,
      samplerPayload,
      metadata: {
        replayStatus: replay.status,
        selectionSource: replay.selectionSource,
        selectionCount: replay.selectionCount,
        configuredCount: replay.configuredCount,
        ignoredCount: replay.ignoredCount,
        unmatchedCount: replay.unmatchedCount,
        samplerMatchedOn: samplerMatch.matchedOn,
        replaySessionId: replay.replaySessionId,
        replayRequestedDetailId: replay.requestedDetailId,
        previousItemCode: reference.existingItemCode,
        clientBatchLabel: asTrimmedOrNull(input.clientBatchLabel),
      },
    });

    if (!outcome.archiveId) {
      return {
        ...base,
        status: 'failed',
        replayStatus: replay.status,
        replayRunId: replay.traceId,
        samplerResultId: samplerMatch.id,
        message: 'Archive row was not created, so no live row was updated.',
        durationMs: Date.now() - startedAt,
      };
    }
    if (outcome.referenceUpdated !== 1 || outcome.samplerUpdated !== 1) {
      return {
        ...base,
        status: 'failed',
        replayStatus: replay.status,
        replayRunId: replay.traceId,
        archiveId: outcome.archiveId,
        samplerResultId: samplerMatch.id,
        message: `Unexpected update count (configuration reference ${outcome.referenceUpdated}, sampler ${outcome.samplerUpdated}); the transaction was archived but did not apply cleanly.`,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      ...base,
      status: 'updated',
      replayStatus: replay.status,
      replayRunId: replay.traceId,
      archiveId: outcome.archiveId,
      samplerResultId: samplerMatch.id,
      samplerMatchedOn: samplerMatch.matchedOn,
      message:
        replay.status === 'match'
          ? 'Replayed item code was identical to the stored one; rows refreshed and archived anyway.'
          : `Item code overwritten (${reference.existingItemCode ?? '—'} → ${replay.replayedItemCode}).`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      replayStatus: replay.status,
      replayRunId: replay.traceId,
      samplerResultId: samplerMatch.id,
      error: error instanceof Error ? error.message : String(error),
      message: 'Archive + update transaction failed and was rolled back; no live row was changed.',
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function runReplayOverwriteBatch(input: {
  rows: OverwriteRowRequest[];
  actor: OverwriteActor;
  clientBatchLabel?: string | null;
}): Promise<{ overwriteBatchId: string; results: OverwriteRowResult[]; summary: OverwriteSummary }> {
  // The batch id is always generated server-side: the archive-before-update guard keys on
  // it, so a client-chosen (and possibly reused) value could match an older archive row.
  const overwriteBatchId = randomUUID();
  const requestedIds = input.rows.map((row) => row.configurationReferenceId);

  const [references, ignoreRules] = await Promise.all([
    loadReplayReferenceContexts(requestedIds),
    loadIgnoredConfigureRules(),
  ]);
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));

  const results: OverwriteRowResult[] = [];
  // Sequential by design: each row re-runs a full CPQ replay.
  for (const row of input.rows) {
    const reference = referenceById.get(row.configurationReferenceId);
    if (!reference) {
      results.push({
        configurationReferenceId: row.configurationReferenceId,
        configurationReference: asTrimmedOrNull(row.configurationReference) ?? String(row.configurationReferenceId),
        existingItemCode: asTrimmedOrNull(row.existingItemCode),
        replayedItemCode: null,
        status: 'skipped',
        message: 'Configuration reference not found or not active.',
        durationMs: 0,
      });
      continue;
    }
    results.push(
      await applyOverwriteForReference({
        reference,
        request: row,
        ignoreRules,
        actor: input.actor,
        batchId: overwriteBatchId,
        clientBatchLabel: input.clientBatchLabel,
      }),
    );
  }

  const summary = results.reduce<OverwriteSummary>(
    (acc, result) => {
      acc.total += 1;
      acc[result.status] += 1;
      return acc;
    },
    { total: 0, updated: 0, skipped: 0, failed: 0 },
  );

  return { overwriteBatchId, results, summary };
}
