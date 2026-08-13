// Read-only validation route helper: do not write to Neon or external systems.
//
// This module re-runs a saved configuration through the CPQ runtime
// (StartConfiguration -> Configure per option -> FinalizeConfiguration) and compares
// the regenerated IPN/item code with the one already stored.
//
// It deliberately imports ONLY read-only helpers:
//   - lib/cpq/runtime/client        (CPQ HTTP calls, no persistence)
//   - lib/cpq/runtime/mappers       (pure response normalization)
//   - lib/cpq/replay/matching       (pure feature/option remap)
//   - lib/admin/cpq-replay-validation/service (select-only Neon reads)
// It must never import saveConfigurationReference, persistSamplerResult, allocation
// audit helpers, external PostgreSQL push helpers or BigCommerce write helpers.

import 'server-only';

import { randomUUID } from 'crypto';

import { configureConfiguration, finalizeConfiguration, startConfiguration } from '@/lib/cpq/runtime/client';
import { mapCpqToNormalizedState } from '@/lib/cpq/runtime/mappers';
import { createTraceId } from '@/lib/cpq/runtime/debug';
import {
  buildReplaySelectionsFromState,
  buildSamplerSelectedOptions,
  normalizeConfigureDecisionKey,
  resolveReplayFeature,
  resolveReplayOption,
  type FeatureMatchStrategy,
  type OptionMatchStrategy,
  type ReplaySelection,
  type SamplerSelectedOption,
} from '@/lib/cpq/replay/matching';
import type { InitConfiguratorRequest, NormalizedBikeBuilderState } from '@/types/cpq';
import {
  buildIgnoreTripleKey,
  loadRecordedSelectionsForReference,
  type IgnoredConfigureRules,
  type ReplayReferenceContextRow,
} from './service';

export const RUN_DEFAULT_LIMIT = 10;
export const RUN_MAX_LIMIT = 25;

export type ReplayComparisonStatus = 'match' | 'different' | 'failed' | 'skipped';

export type ReplaySelectionSource =
  | 'sampler:detail_id'
  | 'sampler:session_id'
  | 'sampler:ipn_ruleset_country'
  | 'cpq-source-copy'
  | 'none';

export type ReplayStepAction =
  | 'configured'
  | 'already-selected'
  | 'ignored-during-configure'
  | 'feature-not-matched'
  | 'option-not-matched';

export type ReplayStep = {
  order: number;
  sourceFeatureLabel: string;
  sourceOptionLabel: string;
  sourceOptionValue: string;
  action: ReplayStepAction;
  resolvedFeatureId?: string;
  resolvedFeatureLabel?: string;
  resolvedOptionId?: string;
  resolvedOptionValue?: string;
  featureMatchStrategy?: FeatureMatchStrategy;
  optionMatchStrategy?: OptionMatchStrategy;
  durationMs?: number;
};

export type ReplayResult = {
  referenceId: number;
  configurationReference: string;
  countryCode: string | null;
  bikeType: string | null;
  ruleset: string | null;
  existingItemCode: string | null;
  replayedItemCode: string | null;
  finalizedItemCode: string | null;
  status: ReplayComparisonStatus;
  message?: string;
  error?: string;
  durationMs: number;
  traceId: string;
  selectionSource: ReplaySelectionSource;
  samplerRowId: number | null;
  selectionCount: number;
  configuredCount: number;
  ignoredCount: number;
  unmatchedCount: number;
  replaySessionId: string | null;
  /** detailId requested for the throwaway replay session (never a stored detail id). */
  requestedDetailId: string | null;
  replayHeaderId: string | null;
  /** detailId reported by CPQ for the replayed configuration (finalize preferred). */
  replayedDetailId: string | null;
  finalizeSucceeded: boolean;
  steps: ReplayStep[];
  writePayload?: ReplayWritePayload;
};

/**
 * Server-computed artifacts needed to write a replay result back over the live rows.
 * Only populated when a caller explicitly asks for it (the read-only run route does not),
 * and it is always produced here on the server — never accepted from the browser.
 */
export type ReplayWritePayload = {
  /** `/cpq` save-source rule: latest Configure snapshot, else latest Start snapshot. */
  snapshotSource: 'configure' | 'start';
  snapshotState: NormalizedBikeBuilderState;
  finalizeRawResponse: unknown;
  selectedOptions: SamplerSelectedOption[];
  sessionId: string;
  headerId: string;
  namespace: string;
  ruleset: string;
  detailId: string | null;
  itemCode: string | null;
  productDescription: string | null;
  configuredPrice: number | null;
};

export type ReplayOptions = {
  /** Capture the snapshot/finalize artifacts required by the controlled overwrite flow. */
  captureWritePayload?: boolean;
};

export type ReplaySummary = {
  total: number;
  match: number;
  different: number;
  failed: number;
  skipped: number;
};

export function normalizeRunLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return RUN_DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), RUN_MAX_LIMIT);
}

const trimmedOrNull = (value: unknown): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const resolveHeaderId = (reference: ReplayReferenceContextRow) =>
  reference.canonicalHeaderId ?? reference.headerId ?? 'Simulator';

const buildReplayContext = (reference: ReplayReferenceContextRow) => ({
  accountCode: reference.accountCode ?? undefined,
  company: reference.company ?? undefined,
  accountType: reference.accountType ?? undefined,
  customerId: reference.customerId ?? undefined,
  currency: reference.currency ?? undefined,
  language: reference.language ?? undefined,
  countryCode: reference.countryCode ?? undefined,
  customerLocation: reference.customerLocation ?? reference.countryCode ?? undefined,
});

/**
 * Recover the recorded option set from the CPQ side when no sampler payload exists:
 * StartConfiguration seeded with the stored source header/detail lineage (the same
 * call `/api/cpq/retrieve-configuration` makes) returns the saved selections, which
 * are then read out of the normalized state. Read-only: no Neon access at all.
 */
async function loadSelectionsFromCpqSourceCopy(
  reference: ReplayReferenceContextRow,
  traceId: string,
): Promise<ReplaySelection[]> {
  const headerId = resolveHeaderId(reference);
  const sourceDetailId = reference.sourceDetailId ?? reference.canonicalDetailId ?? reference.finalizedDetailId;
  if (!sourceDetailId) return [];

  const request: InitConfiguratorRequest = {
    ruleset: reference.ruleset ?? '',
    partName: reference.ruleset ?? '',
    namespace: reference.namespace,
    headerId,
    detailId: reference.canonicalDetailId ?? reference.finalizedDetailId ?? '',
    sourceHeaderId: reference.sourceHeaderId ?? headerId,
    sourceDetailId,
    instance: reference.applicationInstance ?? undefined,
    context: buildReplayContext(reference),
  };

  const response = await startConfiguration(request, undefined, {
    traceId,
    route: '/api/admin/cpq-replay-validation/run',
    action: 'StartConfiguration:SourceCopy',
  });
  const parsed = mapCpqToNormalizedState(response, reference.ruleset ?? '');
  return buildReplaySelectionsFromState(parsed);
}

const extractItemCode = (state: NormalizedBikeBuilderState | null): string | null =>
  state ? trimmedOrNull(state.ipnCode) : null;

/**
 * Replay one saved configuration reference.
 *
 * Sequence mirrors the `/cpq` "Configure all ticked items" execution unit minus every
 * persistence step: fresh StartConfiguration -> feature/option remap -> Configure per
 * option -> FinalizeConfiguration. Nothing is saved anywhere.
 *
 * The replay always requests a brand-new random `detailId`, so the CPQ-side record
 * belonging to the stored configuration is never targeted or overwritten.
 */
export async function replayConfigurationReference(
  reference: ReplayReferenceContextRow,
  ignoreRules: IgnoredConfigureRules,
  options?: ReplayOptions,
): Promise<ReplayResult> {
  const traceId = createTraceId();
  const startedAt = Date.now();
  const ruleset = reference.ruleset ?? '';

  const base: Omit<ReplayResult, 'status' | 'durationMs'> = {
    referenceId: reference.id,
    configurationReference: reference.configurationReference,
    countryCode: reference.countryCode,
    bikeType: reference.bikeType,
    ruleset: reference.ruleset,
    existingItemCode: reference.existingItemCode,
    replayedItemCode: null,
    finalizedItemCode: null,
    traceId,
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
  };

  try {
    if (!ruleset) {
      return {
        ...base,
        status: 'skipped',
        message: 'Saved reference has no ruleset, replay cannot be started.',
        durationMs: Date.now() - startedAt,
      };
    }

    const recorded = await loadRecordedSelectionsForReference(reference);
    let selections = recorded.selections;
    let selectionSource: ReplaySelectionSource =
      recorded.matchedOn === 'detail_id'
        ? 'sampler:detail_id'
        : recorded.matchedOn === 'session_id'
          ? 'sampler:session_id'
          : recorded.matchedOn === 'ipn_ruleset_country'
            ? 'sampler:ipn_ruleset_country'
            : 'none';

    if (selections.length === 0) {
      selections = await loadSelectionsFromCpqSourceCopy(reference, traceId);
      selectionSource = selections.length > 0 ? 'cpq-source-copy' : 'none';
    }

    base.selectionSource = selectionSource;
    base.samplerRowId = recorded.samplerRowId;
    base.selectionCount = selections.length;

    if (selections.length === 0) {
      return {
        ...base,
        status: 'skipped',
        message: 'No recorded option set could be resolved for this reference (no sampler payload, no CPQ source lineage).',
        durationMs: Date.now() - startedAt,
      };
    }

    // Fresh replay session: new random detail id, no source header/detail lineage.
    const headerId = resolveHeaderId(reference);
    const requestedDetailId = randomUUID();
    base.replayHeaderId = headerId;
    base.requestedDetailId = requestedDetailId;

    const initRequest: InitConfiguratorRequest = {
      ruleset,
      partName: ruleset,
      namespace: reference.namespace,
      headerId,
      detailId: requestedDetailId,
      sourceHeaderId: '',
      sourceDetailId: '',
      instance: reference.applicationInstance ?? undefined,
      context: buildReplayContext(reference),
    };

    const initResponse = await startConfiguration(initRequest, undefined, {
      traceId,
      route: '/api/admin/cpq-replay-validation/run',
      action: 'StartConfiguration',
    });
    let workingState = mapCpqToNormalizedState(initResponse, ruleset);
    base.replaySessionId = workingState.sessionId;

    const steps: ReplayStep[] = [];
    let configuredCount = 0;
    let ignoredCount = 0;
    let unmatchedCount = 0;

    for (const [index, selection] of selections.entries()) {
      const stepStartedAt = Date.now();
      const order = index + 1;

      const ignoreKey = buildIgnoreTripleKey(selection.featureLabel, selection.optionLabel, selection.optionValue);
      const ignoredByFeature = ignoreRules.featureLabels.has(normalizeConfigureDecisionKey(selection.featureLabel));
      if (ignoreRules.tripleKeys.has(ignoreKey) || ignoredByFeature) {
        ignoredCount += 1;
        steps.push({
          order,
          sourceFeatureLabel: selection.featureLabel,
          sourceOptionLabel: selection.optionLabel,
          sourceOptionValue: selection.optionValue,
          action: 'ignored-during-configure',
        });
        continue;
      }

      const featureMatch = resolveReplayFeature(selection, workingState);
      if (!featureMatch.feature || !featureMatch.strategy) {
        unmatchedCount += 1;
        steps.push({
          order,
          sourceFeatureLabel: selection.featureLabel,
          sourceOptionLabel: selection.optionLabel,
          sourceOptionValue: selection.optionValue,
          action: 'feature-not-matched',
        });
        continue;
      }

      const optionMatch = resolveReplayOption(featureMatch.feature, selection);
      if (!optionMatch.option || !optionMatch.strategy) {
        unmatchedCount += 1;
        steps.push({
          order,
          sourceFeatureLabel: selection.featureLabel,
          sourceOptionLabel: selection.optionLabel,
          sourceOptionValue: selection.optionValue,
          action: 'option-not-matched',
          resolvedFeatureId: featureMatch.feature.featureId,
          resolvedFeatureLabel: featureMatch.feature.featureLabel,
          featureMatchStrategy: featureMatch.strategy,
        });
        continue;
      }

      const targetOptionValue = optionMatch.option.value ?? optionMatch.option.optionId;
      const alreadySelected =
        featureMatch.feature.selectedOptionId === optionMatch.option.optionId ||
        featureMatch.feature.selectedValue === targetOptionValue;

      const stepBase: ReplayStep = {
        order,
        sourceFeatureLabel: selection.featureLabel,
        sourceOptionLabel: selection.optionLabel,
        sourceOptionValue: selection.optionValue,
        action: alreadySelected ? 'already-selected' : 'configured',
        resolvedFeatureId: featureMatch.feature.featureId,
        resolvedFeatureLabel: featureMatch.feature.featureLabel,
        resolvedOptionId: optionMatch.option.optionId,
        resolvedOptionValue: targetOptionValue,
        featureMatchStrategy: featureMatch.strategy,
        optionMatchStrategy: optionMatch.strategy,
      };

      if (alreadySelected) {
        steps.push({ ...stepBase, durationMs: Date.now() - stepStartedAt });
        continue;
      }

      const configureResponse = await configureConfiguration(
        {
          sessionId: workingState.sessionId,
          featureId: featureMatch.feature.featureId,
          optionId: optionMatch.option.optionId,
          optionValue: targetOptionValue,
          ruleset,
          context: buildReplayContext(reference),
        },
        { context: buildReplayContext(reference) },
        { traceId, route: '/api/admin/cpq-replay-validation/run', action: 'Configure' },
      );

      const configuredState = mapCpqToNormalizedState(configureResponse, ruleset);
      workingState =
        configuredState.sessionId === 'unknown-session'
          ? { ...configuredState, sessionId: workingState.sessionId }
          : configuredState;
      base.replaySessionId = workingState.sessionId;
      configuredCount += 1;
      steps.push({ ...stepBase, durationMs: Date.now() - stepStartedAt });
    }

    base.steps = steps;
    base.configuredCount = configuredCount;
    base.ignoredCount = ignoredCount;
    base.unmatchedCount = unmatchedCount;

    // `final_ipn_code` was stored from the latest Configure/Start snapshot, so the
    // comparable replayed value is taken from the same place; the finalize response
    // IPN is reported separately.
    const configuredItemCode = extractItemCode(workingState);
    base.replayedItemCode = configuredItemCode;
    base.replayedDetailId = trimmedOrNull(workingState.detailId);

    const finalizeResponse = await finalizeConfiguration(workingState.sessionId, {
      traceId,
      route: '/api/admin/cpq-replay-validation/run',
      action: 'FinalizeConfiguration',
    });
    const finalizedState = mapCpqToNormalizedState(finalizeResponse, ruleset);
    base.finalizeSucceeded = true;
    base.finalizedItemCode = extractItemCode(finalizedState);
    base.replayedDetailId = trimmedOrNull(finalizedState.detailId) ?? base.replayedDetailId;
    base.replayedItemCode = configuredItemCode ?? base.finalizedItemCode;

    if (options?.captureWritePayload) {
      // Same save-source rule as `/cpq`: the snapshot is the latest Configure state
      // (fallback Start state); the finalize body is captured as metadata only.
      base.writePayload = {
        snapshotSource: configuredCount > 0 ? 'configure' : 'start',
        snapshotState: workingState,
        finalizeRawResponse: finalizeResponse,
        selectedOptions: buildSamplerSelectedOptions(workingState),
        sessionId: workingState.sessionId,
        headerId,
        namespace: reference.namespace,
        ruleset,
        detailId: base.replayedDetailId,
        itemCode: base.replayedItemCode,
        productDescription: trimmedOrNull(workingState.productDescription),
        configuredPrice: typeof workingState.configuredPrice === 'number' ? workingState.configuredPrice : null,
      };
    }

    const existing = trimmedOrNull(reference.existingItemCode);
    const replayed = base.replayedItemCode;

    if (!existing) {
      return {
        ...base,
        status: 'skipped',
        message: 'Saved reference has no stored IPN/item code to compare against.',
        durationMs: Date.now() - startedAt,
      };
    }
    if (!replayed) {
      return {
        ...base,
        status: 'failed',
        message: 'Replay completed but CPQ returned no IPN/item code.',
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      ...base,
      status: existing === replayed ? 'match' : 'different',
      message:
        existing === replayed
          ? `Replayed ${configuredCount} option(s); item code unchanged.`
          : `Replayed ${configuredCount} option(s); item code differs (stored ${existing}, replayed ${replayed}).`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

export function summarizeReplayResults(results: ReplayResult[]): ReplaySummary {
  return results.reduce<ReplaySummary>(
    (acc, result) => {
      acc.total += 1;
      acc[result.status] += 1;
      return acc;
    },
    { total: 0, match: 0, different: 0, failed: 0, skipped: 0 },
  );
}
