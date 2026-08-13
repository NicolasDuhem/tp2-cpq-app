// Read-only replay matching helpers.
//
// Pure functions only: this module never touches Neon, never calls CPQ, and never
// persists anything. It mirrors the feature/option remap strategy used by the
// `/cpq` "Configure all ticked items" bulk flow (components/cpq/bike-builder-page.tsx)
// so an admin replay reproduces the same option-by-option configure sequence
// without importing any of that flow's save/write behaviour.

import type { BikeBuilderFeature, BikeBuilderFeatureOption, NormalizedBikeBuilderState } from '@/types/cpq';

export type FeatureMatchStrategy =
  | 'exact-label'
  | 'normalized-label'
  | 'suffix-tolerant-label'
  | 'exact-question'
  | 'normalized-question'
  | 'fuzzy';

export type OptionMatchStrategy =
  | 'exact-value'
  | 'normalized-value'
  | 'suffix-tolerant-value'
  | 'exact-label'
  | 'normalized-label'
  | 'stripped-price-label'
  | 'fuzzy';

/** One recorded selection to replay: feature identity + the option that was chosen. */
export type ReplaySelection = {
  featureLabel: string;
  featureId?: string;
  featureQuestion?: string;
  featureSequence?: number;
  optionLabel: string;
  optionValue: string;
  optionId?: string;
};

export type StableFeatureIdentity = {
  featureName?: string;
  featureQuestion?: string;
  featureLabel: string;
  featureSequence?: number;
};

export const normalizeConfigureDecisionKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export const normalizeComparableText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export const normalizeComparableLooseText = (value: string) =>
  normalizeComparableText(value).replace(/[^\p{L}\p{N}\s]/gu, '');

export const stripLocaleSuffix = (value: string) =>
  normalizeComparableLooseText(value).replace(/(?:[_-][a-z]{2,3}(?:[_-][a-z]{2,3})?)$/i, '');

export const stripPriceText = (value: string) => value.replace(/\s*[-–—]\s*\d+(?:[.,]\d+)?\s*$/u, '').trim();

export const computeTokenSimilarity = (left: string, right: string) => {
  const leftTokens = new Set(stripLocaleSuffix(left).split(' ').filter(Boolean));
  const rightTokens = new Set(stripLocaleSuffix(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

export const buildStableFeatureIdentity = (feature: BikeBuilderFeature): StableFeatureIdentity => {
  const firstOptionMetadata = feature.availableOptions.find((option) => option.metadata)?.metadata;
  return {
    featureName: feature.featureName?.trim() || undefined,
    featureQuestion: firstOptionMetadata?.FeatureQuestion?.trim() || undefined,
    featureLabel: feature.featureLabel.trim(),
    featureSequence: feature.featureSequence,
  };
};

export type FeatureMatchResult = {
  feature: BikeBuilderFeature | null;
  strategy: FeatureMatchStrategy | null;
};

export type OptionMatchResult = {
  option: BikeBuilderFeatureOption | null;
  strategy: OptionMatchStrategy | null;
};

type ScoredCandidate<T> = {
  candidate: T;
  flags: Record<string, boolean>;
  fuzzyScore: number;
};

const acceptSingle = <T>(
  candidates: ScoredCandidate<T>[],
  flag: string,
): T | null => {
  const matches = candidates.filter((entry) => entry.flags[flag]);
  return matches.length === 1 ? matches[0].candidate : null;
};

/**
 * Resolve which feature of the live CPQ session corresponds to a recorded selection.
 * Same acceptance ladder as the bulk configure flow: only an unambiguous single
 * match is accepted at each step, then a well-separated fuzzy winner.
 */
export function resolveReplayFeature(
  selection: ReplaySelection,
  currentState: NormalizedBikeBuilderState,
): FeatureMatchResult {
  const visibleFeatures = currentState.features.filter((feature) => feature.isVisible !== false);
  const targetLabel = selection.featureLabel.trim();
  const normalizedTargetLooseLabel = normalizeComparableLooseText(targetLabel);
  const suffixTolerantTargetLabel = stripLocaleSuffix(targetLabel);
  const targetQuestion = selection.featureQuestion?.trim();
  const normalizedTargetQuestion = targetQuestion ? normalizeComparableText(targetQuestion) : undefined;

  const candidates: ScoredCandidate<BikeBuilderFeature>[] = visibleFeatures
    .map((feature) => {
      const identity = buildStableFeatureIdentity(feature);
      return {
        candidate: feature,
        flags: {
          exactLabelMatch: feature.featureLabel.trim() === targetLabel,
          normalizedLabelMatch: normalizeComparableLooseText(feature.featureLabel) === normalizedTargetLooseLabel,
          suffixTolerantLabelMatch: stripLocaleSuffix(feature.featureLabel) === suffixTolerantTargetLabel,
          exactQuestionMatch: Boolean(targetQuestion) && (identity.featureQuestion ?? '').trim() === targetQuestion,
          normalizedQuestionMatch:
            Boolean(normalizedTargetQuestion) &&
            normalizeComparableText(identity.featureQuestion ?? '') === normalizedTargetQuestion,
        },
        fuzzyScore: Math.max(
          computeTokenSimilarity(targetLabel, feature.featureLabel),
          computeTokenSimilarity(targetQuestion ?? '', identity.featureQuestion ?? ''),
        ),
      };
    })
    .sort((a, b) => b.fuzzyScore - a.fuzzyScore);

  const ladder: Array<[string, FeatureMatchStrategy]> = [
    ['exactLabelMatch', 'exact-label'],
    ['normalizedLabelMatch', 'normalized-label'],
    ['suffixTolerantLabelMatch', 'suffix-tolerant-label'],
    ['exactQuestionMatch', 'exact-question'],
    ['normalizedQuestionMatch', 'normalized-question'],
  ];

  for (const [flag, strategy] of ladder) {
    const winner = acceptSingle(candidates, flag);
    if (winner) return { feature: winner, strategy };
  }

  const fuzzyCandidates = candidates.filter((entry) => entry.fuzzyScore >= 0.8);
  const [best, second] = fuzzyCandidates;
  if (best && (!second || best.fuzzyScore - second.fuzzyScore >= 0.15)) {
    return { feature: best.candidate, strategy: 'fuzzy' };
  }

  return { feature: null, strategy: null };
}

/** Resolve which option inside an already-matched feature corresponds to a recorded selection. */
export function resolveReplayOption(feature: BikeBuilderFeature, selection: ReplaySelection): OptionMatchResult {
  const normalizedRowOptionValue = normalizeComparableLooseText(selection.optionValue);
  const normalizedRowOptionLabel = normalizeComparableLooseText(selection.optionLabel);
  const sourceStrippedPriceLabel = stripPriceText(selection.optionLabel);
  const normalizedSourceStrippedPriceLabel = normalizeComparableLooseText(sourceStrippedPriceLabel);
  const suffixTolerantRowOptionValue = stripLocaleSuffix(selection.optionValue);

  const candidates: ScoredCandidate<BikeBuilderFeatureOption>[] = feature.availableOptions
    .map((option) => {
      const optionValue = option.value ?? option.optionId;
      const targetStrippedPriceLabel = stripPriceText(option.label);
      return {
        candidate: option,
        flags: {
          exactValueMatch: optionValue === selection.optionValue,
          normalizedValueMatch: normalizeComparableLooseText(optionValue) === normalizedRowOptionValue,
          suffixTolerantValueMatch: stripLocaleSuffix(optionValue) === suffixTolerantRowOptionValue,
          exactLabelMatch: option.label.trim() === selection.optionLabel.trim(),
          normalizedLabelMatch: normalizeComparableLooseText(option.label) === normalizedRowOptionLabel,
          strippedPriceLabelMatch:
            normalizeComparableLooseText(targetStrippedPriceLabel) === normalizedSourceStrippedPriceLabel,
        },
        fuzzyScore: Math.max(
          computeTokenSimilarity(sourceStrippedPriceLabel, targetStrippedPriceLabel),
          computeTokenSimilarity(selection.optionValue, optionValue),
          computeTokenSimilarity(selection.optionLabel, option.label),
        ),
      };
    })
    .sort((a, b) => b.fuzzyScore - a.fuzzyScore);

  const ladder: Array<[string, OptionMatchStrategy]> = [
    ['exactValueMatch', 'exact-value'],
    ['normalizedValueMatch', 'normalized-value'],
    ['suffixTolerantValueMatch', 'suffix-tolerant-value'],
    ['exactLabelMatch', 'exact-label'],
    ['normalizedLabelMatch', 'normalized-label'],
    ['strippedPriceLabelMatch', 'stripped-price-label'],
  ];

  for (const [flag, strategy] of ladder) {
    const winner = acceptSingle(candidates, flag);
    if (winner) return { option: winner, strategy };
  }

  const fuzzyCandidates = candidates.filter((entry) => entry.fuzzyScore >= 0.85);
  const [best, second] = fuzzyCandidates;
  if (best && (!second || best.fuzzyScore - second.fuzzyScore >= 0.2)) {
    return { option: best.candidate, strategy: 'fuzzy' };
  }

  return { option: null, strategy: null };
}

/**
 * Derive the selection set of a normalized CPQ state (one entry per visible feature
 * that currently has a selected option). Used when the recorded selection set has to
 * be recovered from a CPQ source-copy session instead of a stored sampler payload.
 */
export function buildReplaySelectionsFromState(state: NormalizedBikeBuilderState): ReplaySelection[] {
  return state.features
    .filter((feature) => feature.isVisible !== false)
    .map((feature): ReplaySelection | null => {
      const selectedOptionId = (feature.selectedOptionId ?? '').trim();
      if (!selectedOptionId) return null;
      const selectedOption =
        feature.availableOptions.find((option) => option.optionId === selectedOptionId) ??
        feature.availableOptions.find((option) => option.selected) ??
        null;
      const featureLabel = feature.featureLabel.trim();
      const optionLabel = (selectedOption?.label ?? selectedOptionId).trim();
      const optionValue = (selectedOption?.value ?? feature.selectedValue ?? feature.currentValue ?? '').trim();
      if (!featureLabel || !optionLabel || !optionValue) return null;

      const identity = buildStableFeatureIdentity(feature);
      return {
        featureLabel,
        featureId: feature.featureId.trim() || undefined,
        featureQuestion: identity.featureQuestion,
        featureSequence: identity.featureSequence,
        optionLabel,
        optionValue,
        optionId: selectedOption?.optionId ?? selectedOptionId,
      };
    })
    .filter((entry): entry is ReplaySelection => entry !== null);
}
