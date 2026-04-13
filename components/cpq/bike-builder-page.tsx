'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { BikeBuilderFeatureOption, NormalizedBikeBuilderState } from '@/types/cpq';

type RequestState = {
  loading: boolean;
  error?: string;
};

type SelectedOptionLookup = {
  featureLabel: string;
  optionLabel: string;
  optionValue: string;
};

type ResolvedImageLayer = SelectedOptionLookup & {
  slot: 1 | 2 | 3 | 4;
  pictureLink: string;
};

type ImageLayerResolution = {
  layers: ResolvedImageLayer[];
  matchedSelections: SelectedOptionLookup[];
  unmatchedSelections: SelectedOptionLookup[];
};

type CallType = 'StartConfiguration' | 'Configure';
type TraversalMode = 'sampler' | 'ui-hierarchical';
type TraversalStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

type CpqRouteResponse = {
  sessionId: string;
  parsed: NormalizedBikeBuilderState;
  rawResponse: unknown;
  requestBody?: unknown;
  callType?: CallType;
  error?: string;
  details?: string;
};

type RulesetTarget = {
  label: string;
  ruleset: string;
  namespace: string;
  partName: string;
  headerId: string;
};

type AccountContextRecord = {
  id: number;
  account_code: string;
  customer_id: string;
  currency: string;
  language: string;
  country_code: string;
};

type RulesetRecord = {
  id: number;
  cpq_ruleset: string;
  namespace: string;
  header_id: string;
  description?: string | null;
};

type CapturedOption = {
  featureLabel: string;
  featureId: string;
  optionLabel: string;
  optionId: string;
  optionValue?: string;
};

type CapturedConfiguration = {
  sequence: number;
  timestamp: string;
  traversalLevel: number;
  traversalPath: TraversalStep[];
  traversalPathKey: string;
  parentPathKey: string;
  changedFeatureId: string;
  changedOptionId: string;
  changedOptionValue?: string;
  ruleset: string;
  namespace: string;
  headerId: string;
  detailId: string;
  sessionId: string;
  baseDetailId: string;
  sourceDetailId: string;
  branchDetailId: string;
  samplerMode: TraversalMode;
  description?: string;
  ipn?: string;
  price?: number;
  selectedOptions: CapturedOption[];
  dropdownOrderSnapshot: {
    level: number;
    featureId: string;
    featureLabel: string;
    selectedOptionId?: string;
    selectedOptionLabel?: string;
    selectedOptionValue?: string;
  }[];
  signature: string;
  rawSnippet?: unknown;
};

type SamplerSeedContext = {
  baseDetailId: string;
  baseSessionId: string;
  ruleset: string;
  namespace: string;
  headerId: string;
  accountCode: string;
  customerId?: string;
  currency?: string;
  language?: string;
  countryCode?: string;
};

type PersistenceStatus = 'idle' | 'saving' | 'saved' | 'error';

type TraversalStep = {
  featureLabel: string;
  featureId: string;
  optionLabel: string;
  optionId: string;
  optionValue?: string;
};

const fallbackTarget: RulesetTarget = {
  label: 'Fallback',
  ruleset: 'BROMPTON_BIKE_BUILDER',
  namespace: 'Default',
  partName: 'BROMPTON_BIKE_BUILDER',
  headerId: 'Simulator',
};

export default function BikeBuilderPage() {
  const [target, setTarget] = useState<RulesetTarget>(fallbackTarget);
  const [accountContexts, setAccountContexts] = useState<AccountContextRecord[]>([]);
  const [rulesets, setRulesets] = useState<RulesetRecord[]>([]);
  const [accountCode, setAccountCode] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('');
  const [language, setLanguage] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [detailId, setDetailId] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<NormalizedBikeBuilderState | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ loading: false });
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [lastCallType, setLastCallType] = useState<CallType>('StartConfiguration');
  const [lastChangedFeatureId, setLastChangedFeatureId] = useState<string>('');
  const [lastChangedOptionId, setLastChangedOptionId] = useState<string>('');
  const [lastChangedOptionValue, setLastChangedOptionValue] = useState<string>('');
  const [lastSelectedBefore, setLastSelectedBefore] = useState<string>('');
  const [lastSelectedAfter, setLastSelectedAfter] = useState<string>('');
  const [lastSelectedMatchSource, setLastSelectedMatchSource] = useState<string>('');
  const [lastRawRequest, setLastRawRequest] = useState<unknown>(null);
  const [lastRawResponse, setLastRawResponse] = useState<unknown>(null);
  const [lastConfigureUrl, setLastConfigureUrl] = useState<string>('');
  const [lastConfigureSelectionCount, setLastConfigureSelectionCount] = useState<number>(0);
  const [lastSessionIdSent, setLastSessionIdSent] = useState<string>('');
  const [lastPreviousFeatureCurrentValue, setLastPreviousFeatureCurrentValue] = useState<string>('');
  const [lastRequestedOptionValue, setLastRequestedOptionValue] = useState<string>('');
  const [lastReturnedFeatureCurrentValue, setLastReturnedFeatureCurrentValue] = useState<string>('');
  const [imageLayers, setImageLayers] = useState<ResolvedImageLayer[]>([]);
  const [imageLayersLoading, setImageLayersLoading] = useState(false);
  const [imageLayersError, setImageLayersError] = useState<string>('');
  const [imageLayerDebug, setImageLayerDebug] = useState<Omit<ImageLayerResolution, 'layers'>>({
    matchedSelections: [],
    unmatchedSelections: [],
  });

  const [traversalStatus, setTraversalStatus] = useState<TraversalStatus>('idle');
  const [activeMode, setActiveMode] = useState<TraversalMode | null>(null);
  const [currentFeatureLabel, setCurrentFeatureLabel] = useState('-');
  const [currentOptionLabel, setCurrentOptionLabel] = useState('-');
  const [currentTraversalLevel, setCurrentTraversalLevel] = useState(0);
  const [currentTraversalPathLabel, setCurrentTraversalPathLabel] = useState('-');
  const [currentSamplerMode, setCurrentSamplerMode] = useState('-');
  const [currentTraversalBaseDetailId, setCurrentTraversalBaseDetailId] = useState('-');
  const [currentTraversalSourceDetailId, setCurrentTraversalSourceDetailId] = useState('-');
  const [currentTraversalDetailId, setCurrentTraversalDetailId] = useState('-');
  const [currentTraversalSessionId, setCurrentTraversalSessionId] = useState('-');
  const [currentTraversalCallType, setCurrentTraversalCallType] = useState<CallType | '-'>('-');
  const [results, setResults] = useState<CapturedConfiguration[]>([]);
  const [delayMs, setDelayMs] = useState(5000);
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxResults, setMaxResults] = useState(150);
  const [maxConfigureCalls, setMaxConfigureCalls] = useState(1000);
  const [maxRuntimeMinutes, setMaxRuntimeMinutes] = useState(15);
  const [configureCallCount, setConfigureCallCount] = useState(0);
  const [debugIncludeHidden, setDebugIncludeHidden] = useState(false);
  const [includeSelectedOption, setIncludeSelectedOption] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [expandedResultKeys, setExpandedResultKeys] = useState<Record<string, boolean>>({});
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [savedToDatabaseCount, setSavedToDatabaseCount] = useState(0);
  const [saveErrorCount, setSaveErrorCount] = useState(0);
  const [lastSaveStatus, setLastSaveStatus] = useState<PersistenceStatus>('idle');
  const [lastSaveMessage, setLastSaveMessage] = useState('-');
  const [manualSaveStatus, setManualSaveStatus] = useState<PersistenceStatus>('idle');
  const [manualSaveMessage, setManualSaveMessage] = useState('-');
  const [manualSaveTimestamp, setManualSaveTimestamp] = useState<string | null>(null);

  useEffect(() => {
    const loadSetup = async () => {
      try {
        const [accountRes, rulesetRes] = await Promise.all([
          fetch('/api/cpq/setup/account-context?activeOnly=true'),
          fetch('/api/cpq/setup/rulesets?activeOnly=true'),
        ]);
        const accountPayload = (await accountRes.json().catch(() => ({ rows: [] }))) as { rows?: AccountContextRecord[] };
        const rulesetPayload = (await rulesetRes.json().catch(() => ({ rows: [] }))) as { rows?: RulesetRecord[] };

        const nextAccounts = accountPayload.rows ?? [];
        const nextRulesets = rulesetPayload.rows ?? [];
        setAccountContexts(nextAccounts);
        setRulesets(nextRulesets);

        const firstAccount = nextAccounts[0];
        if (firstAccount) {
          setAccountCode(firstAccount.account_code);
          setCustomerId(firstAccount.customer_id);
          setCurrency(firstAccount.currency);
          setLanguage(firstAccount.language);
          setCountryCode(firstAccount.country_code);
        }

        const firstRuleset = nextRulesets[0];
        if (firstRuleset) {
          setTarget({
            label: firstRuleset.cpq_ruleset,
            ruleset: firstRuleset.cpq_ruleset,
            partName: firstRuleset.cpq_ruleset,
            namespace: firstRuleset.namespace,
            headerId: firstRuleset.header_id,
          });
        }
      } catch {
        setRequestState({ loading: false, error: 'Failed to load CPQ setup data. Check /cpq/setup entries.' });
      }
    };

    void loadSetup();
  }, []);

  const traversalControlRef = useRef({ stop: false, pause: false });
  const runStartRef = useRef<number | null>(null);
  const configureCountRef = useRef(0);

  const visibleFeatures = state?.features ?? [];
  const hasFeatures = visibleFeatures.length > 0;
  const selectedOptionsForImageLookup = useMemo<SelectedOptionLookup[]>(() => {
    if (!state) return [];
    return state.features
      .filter((feature) => feature.selectedOptionId)
      .map((feature) => {
        const selected = feature.availableOptions.find((option) => option.optionId === feature.selectedOptionId);
        return {
          featureLabel: String(feature.featureLabel ?? '').trim(),
          optionLabel: String(selected?.label ?? feature.selectedOptionId ?? '').trim(),
          optionValue: String(selected?.value ?? feature.selectedValue ?? '').trim(),
        };
      })
      .filter((selection) => selection.featureLabel && selection.optionLabel && selection.optionValue);
  }, [state]);
  const selectedOptionsForImageLookupSignature = useMemo(
    () => selectedOptionsForImageLookup.map((item) => `${item.featureLabel}|${item.optionLabel}|${item.optionValue}`).join('||'),
    [selectedOptionsForImageLookup],
  );

  const summaryPrice = useMemo(() => {
    if (state?.configuredPrice === undefined) return '-';
    return state.configuredPrice.toLocaleString(undefined, { style: 'currency', currency: 'GBP' });
  }, [state?.configuredPrice]);

  useEffect(() => {
    if (!state?.sessionId) {
      setImageLayers([]);
      setImageLayersError('');
      setImageLayersLoading(false);
      setImageLayerDebug({ matchedSelections: [], unmatchedSelections: [] });
      return;
    }

    const controller = new AbortController();
    const resolveImageLayers = async () => {
      setImageLayersLoading(true);
      setImageLayersError('');
      try {
        const res = await fetch('/api/cpq/image-layers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedOptions: selectedOptionsForImageLookup }),
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => ({}))) as Partial<ImageLayerResolution> & { error?: string };
        if (!res.ok) {
          throw new Error(payload.error ?? 'Failed to resolve image layers');
        }
        setImageLayers(Array.isArray(payload.layers) ? payload.layers : []);
        setImageLayerDebug({
          matchedSelections: Array.isArray(payload.matchedSelections) ? payload.matchedSelections : [],
          unmatchedSelections: Array.isArray(payload.unmatchedSelections) ? payload.unmatchedSelections : [],
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setImageLayers([]);
        setImageLayerDebug({ matchedSelections: [], unmatchedSelections: [] });
        setImageLayersError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!controller.signal.aborted) setImageLayersLoading(false);
      }
    };

    void resolveImageLayers();
    return () => controller.abort();
  }, [state?.sessionId, selectedOptionsForImageLookup, selectedOptionsForImageLookupSignature]);

  const updateElapsed = () => {
    if (!runStartRef.current) return;
    setElapsedMs(Date.now() - runStartRef.current);
  };

  const hasExceededRunLimits = () => {
    updateElapsed();
    if (results.length >= maxResults) return true;
    if (configureCountRef.current >= maxConfigureCalls) return true;
    if (runStartRef.current && Date.now() - runStartRef.current >= maxRuntimeMinutes * 60 * 1000) return true;
    return false;
  };

  const getTraversableFeatures = (nextState: NormalizedBikeBuilderState, includeHidden: boolean) => {
    const base = includeHidden ? [...(nextState.features ?? []), ...(nextState.hiddenOrSystemFeatures ?? [])] : [...(nextState.features ?? [])];
    return base
      .filter((feature) => includeHidden || (feature.isVisible !== false && feature.isEnabled !== false))
      .map((feature) => ({
        ...feature,
        availableOptions: feature.availableOptions.filter((option) => includeHidden || isOptionTraversable(option)),
      }));
  };

  const getSelectedOptions = (nextState: NormalizedBikeBuilderState) => {
    const source = getTraversableFeatures(nextState, debugIncludeHidden);
    return source
      .filter((feature) => feature.selectedOptionId)
      .map((feature) => {
        const selected = feature.availableOptions.find((opt) => opt.optionId === feature.selectedOptionId);
        return {
          featureLabel: feature.featureLabel,
          featureId: feature.featureId,
          optionLabel: selected?.label ?? feature.selectedOptionId ?? '(none)',
          optionId: feature.selectedOptionId ?? '(none)',
          optionValue: selected?.value ?? feature.selectedValue,
        } satisfies CapturedOption;
      })
      .sort((a, b) => a.featureId.localeCompare(b.featureId));
  };

  const signatureForState = (nextState: NormalizedBikeBuilderState) => {
    const selected = getSelectedOptions(nextState)
      .map((item) => `${item.featureId}:${item.optionId}:${item.optionValue ?? ''}`)
      .sort();
    return `${target.ruleset}::${selected.join('|')}`;
  };

  const pathToKey = (path: TraversalStep[]) => path.map((step) => `${step.featureId}:${step.optionId}:${step.optionValue ?? ''}`).join(' > ');

  const snapshotDropdownOrder = (nextState: NormalizedBikeBuilderState) =>
    getTraversableFeatures(nextState, debugIncludeHidden).map((feature, index) => {
      const selected = feature.availableOptions.find((option) => option.optionId === feature.selectedOptionId);
      return {
        level: index + 1,
        featureId: feature.featureId,
        featureLabel: feature.featureLabel,
        selectedOptionId: feature.selectedOptionId,
        selectedOptionLabel: selected?.label,
        selectedOptionValue: selected?.value ?? feature.selectedValue,
      };
    });

  const buildCapturedConfiguration = ({
    nextState,
    activeDetailId,
    baseDetailId,
    sourceDetailId,
    rawSnippet,
    traversalLevel,
    traversalPath,
    parentPathKey,
    changedFeatureId,
    changedOptionId,
    changedOptionValue,
    source,
  }: {
    nextState: NormalizedBikeBuilderState;
    activeDetailId: string;
    baseDetailId: string;
    sourceDetailId: string;
    rawSnippet?: unknown;
    traversalLevel: number;
    traversalPath: TraversalStep[];
    parentPathKey: string;
    changedFeatureId: string;
    changedOptionId: string;
    changedOptionValue?: string;
    source?: string;
  }): CapturedConfiguration & { source?: string } => {
    const signature = signatureForState(nextState);
    return {
      sequence: results.length + 1,
      timestamp: new Date().toISOString(),
      traversalLevel,
      traversalPath,
      traversalPathKey: pathToKey(traversalPath),
      parentPathKey,
      changedFeatureId,
      changedOptionId,
      changedOptionValue,
      ruleset: target.ruleset,
      namespace: target.namespace,
      headerId: target.headerId,
      detailId: activeDetailId,
      sessionId: nextState.sessionId,
      baseDetailId,
      sourceDetailId,
      branchDetailId: activeDetailId,
      samplerMode: activeMode ?? 'sampler',
      description: nextState.productDescription,
      ipn: nextState.ipnCode,
      price: nextState.configuredPrice,
      selectedOptions: getSelectedOptions(nextState),
      dropdownOrderSnapshot: snapshotDropdownOrder(nextState),
      signature,
      rawSnippet,
      source,
    };
  };

  const saveSnapshot = ({
    nextState,
    activeDetailId,
    baseDetailId,
    sourceDetailId,
    rawSnippet,
    traversalLevel,
    traversalPath,
    parentPathKey,
    changedFeatureId,
    changedOptionId,
    changedOptionValue,
  }: {
    nextState: NormalizedBikeBuilderState;
    activeDetailId: string;
    baseDetailId: string;
    sourceDetailId: string;
    rawSnippet?: unknown;
    traversalLevel: number;
    traversalPath: TraversalStep[];
    parentPathKey: string;
    changedFeatureId: string;
    changedOptionId: string;
    changedOptionValue?: string;
  }) => {
    const captured = buildCapturedConfiguration({
      nextState,
      activeDetailId,
      baseDetailId,
      sourceDetailId,
      rawSnippet,
      traversalLevel,
      traversalPath,
      parentPathKey,
      changedFeatureId,
      changedOptionId,
      changedOptionValue,
    });

    setResults((prev) => [...prev, { ...captured, sequence: prev.length + 1 }]);

    if (!persistenceEnabled) return;

    void persistCapturedResult(captured);
  };

  const persistCapturedResult = async (captured: CapturedConfiguration) => {
    setLastSaveStatus('saving');
    try {
      const res = await fetch('/api/cpq/sampler-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipn_code: captured.ipn ?? null,
          ruleset: captured.ruleset,
          account_code: accountCode,
          customer_id: customerId || null,
          currency: currency || null,
          language: language || null,
          country_code: countryCode || null,
          namespace: captured.namespace,
          header_id: captured.headerId,
          detail_id: captured.detailId,
          session_id: captured.sessionId,
          json_result: captured,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Unknown persistence error' }))) as { error?: string };
        throw new Error(payload.error ?? 'Unknown persistence error');
      }

      setSavedToDatabaseCount((prev) => prev + 1);
      setLastSaveStatus('saved');
      setLastSaveMessage(`saved result #${captured.sequence}`);
    } catch (error) {
      setSaveErrorCount((prev) => prev + 1);
      setLastSaveStatus('error');
      setLastSaveMessage(error instanceof Error ? error.message : String(error));
      console.error('[cpq/sampler] persist failed', { captured, error });
    }
  };

  const saveCurrentConfiguration = async () => {
    if (!state) {
      setManualSaveStatus('error');
      setManualSaveMessage('Load or build a configuration before saving.');
      return;
    }

    setManualSaveStatus('saving');
    setManualSaveMessage('Saving current configuration…');

    const sourceDetailId = detailId || crypto.randomUUID();
    const manualCaptured = buildCapturedConfiguration({
      nextState: state,
      activeDetailId: detailId,
      baseDetailId: sourceDetailId,
      sourceDetailId,
      rawSnippet: extractRawSnippet(lastRawResponse),
      traversalLevel: 0,
      traversalPath: [],
      parentPathKey: 'manual-root',
      changedFeatureId: 'manual-save',
      changedOptionId: 'manual-save',
      changedOptionValue: 'manual',
      source: 'manual-save',
    });

    try {
      const res = await fetch('/api/cpq/sampler-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipn_code: manualCaptured.ipn ?? null,
          ruleset: manualCaptured.ruleset,
          account_code: accountCode,
          customer_id: customerId || null,
          currency: currency || null,
          language: language || null,
          country_code: countryCode || null,
          namespace: manualCaptured.namespace,
          header_id: manualCaptured.headerId,
          detail_id: manualCaptured.detailId,
          session_id: manualCaptured.sessionId,
          json_result: manualCaptured,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Unknown persistence error' }))) as { error?: string };
        throw new Error(payload.error ?? 'Unknown persistence error');
      }

      const timestamp = new Date().toISOString();
      setManualSaveStatus('saved');
      setManualSaveTimestamp(timestamp);
      setManualSaveMessage(`Saved at ${new Date(timestamp).toLocaleString()}`);
    } catch (error) {
      setManualSaveStatus('error');
      setManualSaveMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const sleepWithControl = async (ms: number) => {
    const chunk = 250;
    let remaining = ms;

    while (remaining > 0) {
      if (traversalControlRef.current.stop) return false;
      if (traversalControlRef.current.pause) {
        setTraversalStatus('paused');
        while (traversalControlRef.current.pause && !traversalControlRef.current.stop) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          updateElapsed();
        }
        if (traversalControlRef.current.stop) return false;
        setTraversalStatus('running');
      }

      const waitFor = Math.min(chunk, remaining);
      await new Promise((resolve) => setTimeout(resolve, waitFor));
      remaining -= waitFor;
      updateElapsed();
    }

    return !traversalControlRef.current.stop;
  };

  const startFreshConfiguration = async (
    nextTarget = target,
    freshDetailId = crypto.randomUUID(),
    options?: { clearState?: boolean; sourceDetailId?: string; sourceHeaderId?: string },
  ): Promise<CpqRouteResponse> => {
    setRequestState({ loading: true });
    setActiveFeatureId(null);
    if (options?.clearState !== false) {
      setState(null);
    }
    setDetailId(freshDetailId);

    const requestBody = {
      ruleset: nextTarget.ruleset,
      namespace: nextTarget.namespace,
      partName: nextTarget.partName,
      headerId: nextTarget.headerId,
      detailId: freshDetailId,
      sourceHeaderId: options?.sourceHeaderId,
      sourceDetailId: options?.sourceDetailId,
      context: { accountCode, customerId, currency, language, countryCode },
    };

    const res = await fetch('/api/cpq/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const payload = (await res.json()) as CpqRouteResponse;
    if (!res.ok) {
      const message = payload.details ?? payload.error ?? 'Failed to initialize configuration';
      setRequestState({ loading: false, error: message });
      throw new Error(message);
    }

    setState(payload.parsed);
    setLastCallType('StartConfiguration');
    setCurrentTraversalCallType('StartConfiguration');
    setLastChangedFeatureId('');
    setLastChangedOptionId('');
    setLastChangedOptionValue('');
    setLastSelectedBefore('');
    setLastSelectedAfter('');
    setLastSelectedMatchSource('');
    setLastRawRequest(payload.requestBody ?? requestBody);
    setLastRawResponse(payload.rawResponse);
    setLastConfigureUrl('');
    setLastConfigureSelectionCount(0);
    setLastSessionIdSent('');
    setLastPreviousFeatureCurrentValue('');
    setLastRequestedOptionValue('');
    setLastReturnedFeatureCurrentValue('');
    setRequestState({ loading: false });
    return payload;
  };

  const onRulesetChange = async (nextRulesetId: string) => {
    const picked = rulesets.find((item) => String(item.id) === nextRulesetId);
    if (!picked) return;
    const nextTarget = {
      label: picked.cpq_ruleset,
      ruleset: picked.cpq_ruleset,
      partName: picked.cpq_ruleset,
      namespace: picked.namespace,
      headerId: picked.header_id,
    };
    setTarget(nextTarget);
    try {
      await startFreshConfiguration(nextTarget, crypto.randomUUID());
    } catch {
      // handled above
    }
  };

  const onAccountCodeChange = (nextAccountCode: string) => {
    const picked = accountContexts.find((item) => item.account_code === nextAccountCode);
    setAccountCode(nextAccountCode);
    if (!picked) return;
    setCustomerId(picked.customer_id);
    setCurrency(picked.currency);
    setLanguage(picked.language);
    setCountryCode(picked.country_code);
  };

  const configureSelection = async ({
    sourceState,
    featureId,
    optionId,
    optionValue,
  }: {
    sourceState: NormalizedBikeBuilderState;
    featureId: string;
    optionId: string;
    optionValue?: string;
  }): Promise<CpqRouteResponse> => {
    setRequestState({ loading: true });
    setActiveFeatureId(featureId);
    const sourceFeature = sourceState.features.find((feature) => feature.featureId === featureId);
    const selectedBefore = sourceFeature?.availableOptions.find((option) => option.optionId === sourceFeature.selectedOptionId);

    const requestBody = {
      sessionId: sourceState.sessionId,
      ruleset: target.ruleset,
      featureId,
      optionId,
      optionValue,
      context: { accountCode, customerId, currency, language, countryCode },
    };

    const res = await fetch('/api/cpq/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const payload = (await res.json()) as CpqRouteResponse;
    if (!res.ok) {
      const message = payload.details ?? payload.error ?? 'Failed to configure selection';
      setRequestState({ loading: false, error: message });
      setActiveFeatureId(null);
      throw new Error(message);
    }

    configureCountRef.current += 1;
    setConfigureCallCount(configureCountRef.current);
    setState(payload.parsed);
    setLastCallType('Configure');
    setCurrentTraversalCallType('Configure');
    setLastChangedFeatureId(featureId);
    setLastChangedOptionId(optionId);
    setLastChangedOptionValue(optionValue ?? '');
    setLastSelectedBefore(selectedBefore?.label ?? sourceFeature?.selectedOptionId ?? '');
    const updatedFeature = payload.parsed.features.find((feature) => feature.featureId === featureId);
    const selectedAfter = updatedFeature?.availableOptions.find((option) => option.optionId === updatedFeature.selectedOptionId);
    setLastSelectedAfter(selectedAfter?.label ?? updatedFeature?.selectedOptionId ?? '');
    setLastSelectedMatchSource(updatedFeature?.selectedMatchSource ?? '');
    setLastRawRequest(payload.requestBody ?? requestBody);
    setLastRawResponse(payload.rawResponse);
    const debugRequest = payload.requestBody as { finalConfigureUrl?: string; sessionID?: string; selections?: unknown[] } | undefined;
    setLastConfigureUrl(debugRequest?.finalConfigureUrl ?? '');
    setLastSessionIdSent(debugRequest?.sessionID ?? '');
    setLastConfigureSelectionCount(Array.isArray(debugRequest?.selections) ? debugRequest.selections.length : 0);
    setLastPreviousFeatureCurrentValue(sourceFeature?.currentValue ?? '');
    setLastRequestedOptionValue(optionValue ?? '');
    setLastReturnedFeatureCurrentValue(updatedFeature?.currentValue ?? '');
    setRequestState({ loading: false });
    setActiveFeatureId(null);

    return payload;
  };

  const applyUiOptionChange = async ({
    featureId,
    optionId,
    optionValue,
    sourceStateOverride,
  }: {
    featureId: string;
    optionId: string;
    optionValue?: string;
    sourceStateOverride?: NormalizedBikeBuilderState;
  }) => {
    const sourceState = sourceStateOverride ?? state;
    if (!sourceState?.sessionId) {
      throw new Error('No active session to configure.');
    }
    return configureSelection({ sourceState, featureId, optionId, optionValue });
  };

  const changeOption = async (featureId: string, optionId: string, optionValue?: string) => {
    try {
      await applyUiOptionChange({ featureId, optionId, optionValue });
    } catch {
      // UI error state already set.
    }
  };

  const runSampler = async (seedState: NormalizedBikeBuilderState) => {
    const seed: SamplerSeedContext = {
      baseDetailId: detailId,
      baseSessionId: seedState.sessionId,
      ruleset: target.ruleset,
      namespace: target.namespace,
      headerId: target.headerId,
      accountCode,
      customerId,
      currency,
      language,
      countryCode,
    };

    setCurrentSamplerMode('sampler-per-branch-start');
    setCurrentTraversalBaseDetailId(seed.baseDetailId);

    const features = getTraversableFeatures(seedState, debugIncludeHidden);
    for (const feature of features) {
      if (traversalControlRef.current.stop || hasExceededRunLimits()) return;
      setCurrentFeatureLabel(feature.featureLabel);

      const options = feature.availableOptions.filter(isOptionTraversable);
      for (const option of options) {
        if (traversalControlRef.current.stop || hasExceededRunLimits()) return;
        setCurrentOptionLabel(option.label);

        if (configureCountRef.current > 0) {
          const keepGoing = await sleepWithControl(delayMs);
          if (!keepGoing) return;
        }

        const branchDetailId = crypto.randomUUID();
        const sourceDetailId = seed.baseDetailId;
        setCurrentTraversalSourceDetailId(sourceDetailId);
        setCurrentTraversalDetailId(branchDetailId);
        setCurrentTraversalCallType('StartConfiguration');
        const branchStart = await startFreshConfiguration(target, branchDetailId, {
          clearState: false,
          sourceHeaderId: seed.headerId,
          sourceDetailId,
        });
        setCurrentTraversalSessionId(branchStart.parsed.sessionId ?? '-');
        setCurrentTraversalCallType('Configure');

        const payload = await configureSelection({
          sourceState: branchStart.parsed,
          featureId: feature.featureId,
          optionId: option.optionId,
          optionValue: option.value,
        });
        setCurrentTraversalSessionId(payload.parsed.sessionId ?? '-');
        saveSnapshot({
          nextState: payload.parsed,
          activeDetailId: branchDetailId,
          baseDetailId: seed.baseDetailId,
          sourceDetailId,
          rawSnippet: extractRawSnippet(payload.rawResponse),
          traversalLevel: 1,
          traversalPath: [{ featureId: feature.featureId, featureLabel: feature.featureLabel, optionId: option.optionId, optionLabel: option.label, optionValue: option.value }],
          parentPathKey: '',
          changedFeatureId: feature.featureId,
          changedOptionId: option.optionId,
          changedOptionValue: option.value,
        });
      }
    }
  };

  const replayPathFromFreshStart = async (path: TraversalStep[]) => {
    const freshDetailId = crypto.randomUUID();
    const initPayload = await startFreshConfiguration(target, freshDetailId, { clearState: false });
    let currentState = initPayload.parsed;

    for (const step of path) {
      if (traversalControlRef.current.stop || hasExceededRunLimits()) {
        return { state: currentState, detail: freshDetailId };
      }

      if (configureCountRef.current > 0) {
        const keepGoing = await sleepWithControl(delayMs);
        if (!keepGoing) return { state: currentState, detail: freshDetailId };
      }

      const payload = await configureSelection({
        sourceState: currentState,
        featureId: step.featureId,
        optionId: step.optionId,
        optionValue: step.optionValue,
      });

      currentState = payload.parsed;
    }

    return { state: currentState, detail: freshDetailId };
  };

  const getTraversalOptionsForFeature = (feature: NormalizedBikeBuilderState['features'][number]) =>
    feature.availableOptions.filter((option) => {
      if (!debugIncludeHidden && !isOptionTraversable(option)) return false;
      if (!includeSelectedOption && feature.selectedOptionId === option.optionId) return false;
      return true;
    });

  const runUiHierarchicalTraversal = async () => {
    const enumerate = async (pathPrefix: TraversalStep[], levelIndex: number): Promise<void> => {
      if (traversalControlRef.current.stop || hasExceededRunLimits()) return;
      if (levelIndex >= maxDepth) return;

      const restoredBranch = await replayPathFromFreshStart(pathPrefix);
      if (traversalControlRef.current.stop || hasExceededRunLimits()) return;

      const features = getTraversableFeatures(restoredBranch.state, debugIncludeHidden);
      const feature = features[levelIndex];
      if (!feature) return;

      setCurrentTraversalLevel(levelIndex + 1);
      setCurrentFeatureLabel(feature.featureLabel);
      setCurrentTraversalDetailId(restoredBranch.detail);
      setCurrentTraversalSessionId(restoredBranch.state.sessionId ?? '-');

      const options = getTraversalOptionsForFeature(feature);
      for (const option of options) {
        if (traversalControlRef.current.stop || hasExceededRunLimits()) return;

        const branch = await replayPathFromFreshStart(pathPrefix);
        if (traversalControlRef.current.stop || hasExceededRunLimits()) return;

        const branchFeatures = getTraversableFeatures(branch.state, debugIncludeHidden);
        const branchFeature = branchFeatures[levelIndex];
        if (!branchFeature) continue;

        const branchOption = branchFeature.availableOptions.find((candidate) => candidate.optionId === option.optionId);
        if (!branchOption) continue;
        if (!includeSelectedOption && branchFeature.selectedOptionId === branchOption.optionId) continue;

        setCurrentTraversalDetailId(branch.detail);
        setCurrentTraversalSessionId(branch.state.sessionId ?? '-');
        setCurrentOptionLabel(branchOption.label);
        const nextPath = [
          ...pathPrefix,
          {
            featureId: branchFeature.featureId,
            featureLabel: branchFeature.featureLabel,
            optionId: branchOption.optionId,
            optionLabel: branchOption.label,
            optionValue: branchOption.value,
          },
        ];
        setCurrentTraversalPathLabel(pathToKey(nextPath) || '-');

        if (configureCountRef.current > 0 || pathPrefix.length > 0) {
          const keepGoing = await sleepWithControl(delayMs);
          if (!keepGoing) return;
        }

        const payload = await applyUiOptionChange({
          sourceStateOverride: branch.state,
          featureId: branchFeature.featureId,
          optionId: branchOption.optionId,
          optionValue: branchOption.value,
        });

        saveSnapshot({
          nextState: payload.parsed,
          activeDetailId: branch.detail,
          baseDetailId: detailId,
          sourceDetailId: branch.detail,
          rawSnippet: extractRawSnippet(payload.rawResponse),
          traversalLevel: levelIndex + 1,
          traversalPath: nextPath,
          parentPathKey: pathToKey(pathPrefix),
          changedFeatureId: branchFeature.featureId,
          changedOptionId: branchOption.optionId,
          changedOptionValue: branchOption.value,
        });

        await enumerate(nextPath, levelIndex + 1);
      }
    };

    await enumerate([], 0);
  };

  const startTraversal = async (mode: TraversalMode) => {
    if (!state) {
      setRequestState({ loading: false, error: 'Load a configuration before traversal.' });
      return;
    }

    traversalControlRef.current.stop = false;
    traversalControlRef.current.pause = false;
    runStartRef.current = Date.now();
    configureCountRef.current = 0;
    setConfigureCallCount(0);
    setElapsedMs(0);
    setCurrentFeatureLabel('-');
    setCurrentOptionLabel('-');
    setCurrentSamplerMode('-');
    setCurrentTraversalBaseDetailId('-');
    setCurrentTraversalSourceDetailId('-');
    setCurrentTraversalDetailId('-');
    setCurrentTraversalSessionId('-');
    setCurrentTraversalCallType('-');
    setTraversalStatus('running');
    setActiveMode(mode);
    setRequestState({ loading: false });
    setSavedToDatabaseCount(0);
    setSaveErrorCount(0);
    setLastSaveStatus('idle');
    setLastSaveMessage('-');

    try {
      if (mode === 'sampler') await runSampler(state);
      if (mode === 'ui-hierarchical') await runUiHierarchicalTraversal();

      if (traversalControlRef.current.stop) {
        setTraversalStatus('stopped');
      } else if (hasExceededRunLimits()) {
        setTraversalStatus('completed');
      } else {
        setTraversalStatus('completed');
      }
    } catch (error) {
      setTraversalStatus('stopped');
      setRequestState({ loading: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      updateElapsed();
      setActiveMode(null);
      setCurrentFeatureLabel('-');
      setCurrentOptionLabel('-');
      setCurrentTraversalLevel(0);
      setCurrentTraversalPathLabel('-');
      setCurrentSamplerMode('-');
      setCurrentTraversalBaseDetailId('-');
      setCurrentTraversalSourceDetailId('-');
      setCurrentTraversalDetailId('-');
      setCurrentTraversalSessionId('-');
      setCurrentTraversalCallType('-');
    }
  };

  const pauseTraversal = () => {
    traversalControlRef.current.pause = true;
    setTraversalStatus('paused');
  };

  const resumeTraversal = () => {
    traversalControlRef.current.pause = false;
    setTraversalStatus('running');
  };

  const stopTraversal = () => {
    traversalControlRef.current.stop = true;
    traversalControlRef.current.pause = false;
    setTraversalStatus('stopped');
  };

  const clearResults = () => {
    setResults([]);
    setExpandedResultKeys({});
  };

  const exportResults = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cpq-traversal-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.heading}>Bike Builder CPQ Playground</h1>

        <section style={styles.topBar}>
          <div style={styles.topGrid}>
            <label style={styles.label}>
              Account code
              <select value={accountCode} onChange={(e) => onAccountCodeChange(e.target.value)} style={styles.select}>
                {!accountContexts.length && <option value="">No active accounts</option>}
                {accountContexts.map((item) => (
                  <option key={item.id} value={item.account_code}>
                    {item.account_code}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.label}>
              Ruleset
              <select
                value={String(rulesets.find((item) => item.cpq_ruleset === target.ruleset)?.id ?? '')}
                onChange={(e) => void onRulesetChange(e.target.value)}
                style={styles.select}
              >
                {!rulesets.length && <option value="">No active rulesets</option>}
                {rulesets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.cpq_ruleset}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.label}>
              Namespace
              <input value={target.namespace} onChange={(e) => setTarget({ ...target, namespace: e.target.value })} style={styles.input} />
            </label>
            <label style={styles.label}>
              Header ID
              <input value={target.headerId} onChange={(e) => setTarget({ ...target, headerId: e.target.value })} style={styles.input} />
            </label>
          </div>
          <div style={styles.topActions}>
            <button style={styles.button} onClick={() => void startFreshConfiguration()} disabled={requestState.loading}>
              {requestState.loading ? 'Loading…' : 'Load / Restart'}
            </button>
            <button style={styles.secondaryButton} onClick={() => void startFreshConfiguration(target, crypto.randomUUID())} disabled={requestState.loading}>
              Restart with fresh detailId
            </button>
            <button style={styles.secondaryButton} onClick={() => setDebugOpen((v) => !v)}>
              {debugOpen ? 'Hide debug' : 'Show debug'}
            </button>
            <span style={styles.badge}>{state?.sessionId ? `session ${state.sessionId}` : 'no session'}</span>
          </div>
        </section>

        <section style={styles.controlPanel}>
          <div style={styles.controlActions}>
            <button style={styles.button} onClick={() => void startTraversal('sampler')} disabled={!state || traversalStatus === 'running'}>
              Start sampler
            </button>
            <button style={styles.button} onClick={() => void startTraversal('ui-hierarchical')} disabled={!state || traversalStatus === 'running'}>
              Start UI hierarchical traversal
            </button>
            <button style={styles.secondaryButton} onClick={pauseTraversal} disabled={traversalStatus !== 'running'}>
              Pause
            </button>
            <button style={styles.secondaryButton} onClick={resumeTraversal} disabled={traversalStatus !== 'paused'}>
              Resume
            </button>
            <button style={styles.secondaryButton} onClick={stopTraversal} disabled={traversalStatus !== 'running' && traversalStatus !== 'paused'}>
              Stop
            </button>
            <button style={styles.secondaryButton} onClick={exportResults} disabled={!results.length}>
              Export results JSON
            </button>
            <button style={styles.secondaryButton} onClick={clearResults}>
              Clear results
            </button>
          </div>
          <div style={styles.controlGrid}>
            <label style={styles.label}>
              Delay (ms)
              <input type="number" min={0} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value) || 0)} style={styles.input} />
            </label>
            <label style={styles.label}>
              Max depth
              <input type="number" min={1} value={maxDepth} onChange={(e) => setMaxDepth(Math.max(1, Number(e.target.value) || 1))} style={styles.input} />
            </label>
            <label style={styles.label}>
              Max results
              <input type="number" min={1} value={maxResults} onChange={(e) => setMaxResults(Math.max(1, Number(e.target.value) || 1))} style={styles.input} />
            </label>
            <label style={styles.label}>
              Max Configure calls
              <input
                type="number"
                min={1}
                value={maxConfigureCalls}
                onChange={(e) => setMaxConfigureCalls(Math.max(1, Number(e.target.value) || 1))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Max runtime (minutes)
              <input
                type="number"
                min={1}
                value={maxRuntimeMinutes}
                onChange={(e) => setMaxRuntimeMinutes(Math.max(1, Number(e.target.value) || 1))}
                style={styles.input}
              />
            </label>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={debugIncludeHidden} onChange={(e) => setDebugIncludeHidden(e.target.checked)} />
              Include hidden/system features (debug)
            </label>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={includeSelectedOption} onChange={(e) => setIncludeSelectedOption(e.target.checked)} />
              Include currently selected option
            </label>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={persistenceEnabled} onChange={(e) => setPersistenceEnabled(e.target.checked)} />
              Persist sampler results to DB
            </label>
          </div>
          <div style={styles.statusRow}>
            <span style={styles.badge}>status: {traversalStatus}</span>
            <span style={styles.badge}>mode: {activeMode ?? '-'}</span>
            <span style={styles.badge}>sampler mode: {currentSamplerMode}</span>
            <span style={styles.badge}>level: {currentTraversalLevel || '-'}</span>
            <span style={styles.badge}>feature: {currentFeatureLabel}</span>
            <span style={styles.badge}>option: {currentOptionLabel}</span>
            <span style={styles.badge}>path: {currentTraversalPathLabel}</span>
            <span style={styles.badge}>baseDetailId: {currentTraversalBaseDetailId}</span>
            <span style={styles.badge}>sourceDetailId: {currentTraversalSourceDetailId}</span>
            <span style={styles.badge}>results: {results.length}</span>
            <span style={styles.badge}>configure calls: {configureCallCount}</span>
            <span style={styles.badge}>elapsed: {(elapsedMs / 1000).toFixed(1)}s</span>
            <span style={styles.badge}>detailId: {currentTraversalDetailId}</span>
            <span style={styles.badge}>sessionId: {currentTraversalSessionId}</span>
            <span style={styles.badge}>callType: {currentTraversalCallType}</span>
            <span style={styles.badge}>DB saves: {savedToDatabaseCount}</span>
            <span style={styles.badge}>DB save errors: {saveErrorCount}</span>
            <span style={styles.badge}>last DB status: {lastSaveStatus}</span>
            <span style={styles.badge}>last DB message: {lastSaveMessage}</span>
          </div>
        </section>

        {requestState.error && <p style={styles.error}>Error: {requestState.error}</p>}

        <section style={styles.layout}>
          <div style={styles.leftColumn}>
            <h2 style={styles.sectionTitle}>Configurator</h2>
            {!hasFeatures && <p style={styles.muted}>Load a ruleset to begin.</p>}
            {visibleFeatures.map((feature) => (
              <div key={feature.featureId} style={styles.featureCard}>
                <div style={styles.featureHeader}>{feature.featureLabel}</div>
                <select
                  value={feature.selectedOptionId}
                  style={styles.select}
                  onChange={(e) => {
                    const selected = feature.availableOptions.find((option) => option.optionId === e.target.value);
                    void changeOption(feature.featureId, e.target.value, selected?.value);
                  }}
                  disabled={requestState.loading && activeFeatureId === feature.featureId}
                >
                  {feature.availableOptions.map((option) => (
                    <option key={option.optionId} value={option.optionId} disabled={option.isSelectable === false}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {activeFeatureId === feature.featureId && requestState.loading && <span style={styles.tinyMuted}>Updating…</span>}
              </div>
            ))}
          </div>

          <aside style={styles.rightColumn}>
            <h2 style={styles.sectionTitle}>Bike preview</h2>
            <div style={styles.previewCard}>
              <div style={styles.previewBox}>
                {imageLayers.map((layer, index) => (
                  <img
                    key={`${layer.featureLabel}-${layer.optionLabel}-${layer.optionValue}-${layer.slot}-${index}`}
                    src={layer.pictureLink}
                    alt={`${layer.featureLabel} / ${layer.optionLabel} / ${layer.optionValue} layer ${layer.slot}`}
                    style={styles.previewLayer}
                  />
                ))}
                {!imageLayersLoading && !imageLayers.length && (
                  <div style={styles.previewPlaceholder}>No image layers available</div>
                )}
              </div>
              <div style={styles.tinyMuted}>
                {imageLayersLoading ? 'Resolving image layers…' : `Layers: ${imageLayers.length}`}
              </div>
              {imageLayersError ? <div style={styles.error}>Image preview error: {imageLayersError}</div> : null}
              {debugOpen && (
                <div style={styles.imageDebugCard}>
                  <div>
                    <strong>Matched options:</strong> {imageLayerDebug.matchedSelections.length}
                  </div>
                  <div>
                    <strong>No-image options:</strong> {imageLayerDebug.unmatchedSelections.length}
                  </div>
                </div>
              )}
            </div>

            <h2 style={styles.sectionTitle}>Summary</h2>
            <div style={styles.summaryCard}>
              <div>
                <strong>Description:</strong> {state?.productDescription ?? '-'}
              </div>
              <div>
                <strong>IPN Code:</strong> {state?.ipnCode ?? '-'}
              </div>
              <div>
                <strong>Price:</strong> {summaryPrice}
              </div>
              <div>
                <strong>Ruleset:</strong> {target.ruleset}
              </div>
              <div>
                <strong>Account Code:</strong> {accountCode || '-'}
              </div>
              <div>
                <strong>Customer ID:</strong> {customerId || '-'}
              </div>
              <div>
                <strong>Currency:</strong> {currency || '-'}
              </div>
              <div>
                <strong>Language:</strong> {language || '-'}
              </div>
              <div>
                <strong>Country code:</strong> {countryCode || '-'}
              </div>
              <div>
                <strong>Namespace:</strong> {target.namespace}
              </div>
              <div>
                <strong>Header ID:</strong> {target.headerId}
              </div>
              <div>
                <strong>Detail ID:</strong> {detailId}
              </div>
              <div>
                <strong>Session ID:</strong> {state?.sessionId ?? '-'}
              </div>
            </div>
            <div style={styles.summaryCard}>
              <button style={styles.button} onClick={() => void saveCurrentConfiguration()} disabled={manualSaveStatus === 'saving' || !state}>
                {manualSaveStatus === 'saving' ? 'Saving…' : 'Save Configuration'}
              </button>
              <div style={manualSaveStatus === 'error' ? styles.error : styles.tinyMuted}>
                {manualSaveStatus === 'idle' ? 'Manual save is ready.' : manualSaveMessage}
              </div>
              {manualSaveTimestamp && <div style={styles.tinyMuted}>Last saved: {new Date(manualSaveTimestamp).toLocaleString()}</div>}
            </div>

            <h2 style={styles.sectionTitle}>Captured results</h2>
            <div style={styles.resultsList}>
              {!results.length && <p style={styles.muted}>No captured configurations yet.</p>}
              {results.map((result) => {
                const key = result.signature + result.sequence;
                const isExpanded = Boolean(expandedResultKeys[key]);

                return (
                  <div key={key} style={styles.resultCard}>
                    <div style={styles.resultHeader}>
                      <strong>#{result.sequence}</strong>
                      <span style={styles.tinyMuted}>{new Date(result.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={styles.resultMeta}>Detail: {result.detailId}</div>
                    <div style={styles.resultMeta}>Base detail: {result.baseDetailId}</div>
                    <div style={styles.resultMeta}>Source detail: {result.sourceDetailId}</div>
                    <div style={styles.resultMeta}>Session: {result.sessionId}</div>
                    <div style={styles.resultMeta}>IPN Code: {result.ipn ?? '-'}</div>
                    <div style={styles.resultMeta}>Price: {typeof result.price === 'number' ? result.price : '-'}</div>
                    <button
                      style={styles.inlineButton}
                      onClick={() => setExpandedResultKeys((prev) => ({ ...prev, [key]: !isExpanded }))}
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                    {isExpanded && (
                      <pre style={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
                    )}
                  </div>
                );
              })}
            </div>

            {debugOpen && (
              <div style={styles.debugCard}>
                <h3 style={styles.debugTitle}>Ruleset debug</h3>
                <ul style={styles.debugList}>
                  <li>lastCallType: {lastCallType}</li>
                  <li>sampler mode: {currentSamplerMode}</li>
                  <li>baseDetailId: {currentTraversalBaseDetailId}</li>
                  <li>sourceDetailId: {currentTraversalSourceDetailId}</li>
                  <li>branch detailId: {currentTraversalDetailId}</li>
                  <li>current sessionId: {currentTraversalSessionId}</li>
                  <li>current callType: {currentTraversalCallType}</li>
                  <li>lastChangedFeatureId: {lastChangedFeatureId || '-'}</li>
                  <li>lastChangedOptionId: {lastChangedOptionId || '-'}</li>
                  <li>lastChangedOptionValue: {lastChangedOptionValue || '-'}</li>
                  <li>final Configure URL: {lastConfigureUrl || '-'}</li>
                  <li>sessionID sent: {lastSessionIdSent || '-'}</li>
                  <li>changed feature id: {lastChangedFeatureId || '-'}</li>
                  <li>changed option id (local UI stable id): {lastChangedOptionId || '-'}</li>
                  <li>changed option value sent to CPQ: {lastChangedOptionValue || '-'}</li>
                  <li>number of selections sent: {lastConfigureSelectionCount}</li>
                  <li>account code: {accountCode || '-'}</li>
                  <li>customer id: {customerId || '-'}</li>
                  <li>currency: {currency || '-'}</li>
                  <li>language: {language || '-'}</li>
                  <li>country_code: {countryCode || '-'}</li>
                  <li>selected option before change: {lastSelectedBefore || '-'}</li>
                  <li>selected option after Configure: {lastSelectedAfter || '-'}</li>
                  <li>matched selected option source: {lastSelectedMatchSource || '-'}</li>
                  <li>previous feature current value: {lastPreviousFeatureCurrentValue || '-'}</li>
                  <li>requested new option value: {lastRequestedOptionValue || '-'}</li>
                  <li>returned feature current value after Configure: {lastReturnedFeatureCurrentValue || '-'}</li>
                  <li>
                    requested/returned mismatch:{' '}
                    {lastRequestedOptionValue && lastReturnedFeatureCurrentValue && lastRequestedOptionValue !== lastReturnedFeatureCurrentValue
                      ? '⚠️ yes'
                      : 'no'}
                  </li>
                  <li>extracted IPN Code: {state?.ipnCode ?? '-'}</li>
                  <li>IPN source: {state?.debug?.ipnCodeSource ?? '-'}</li>
                  <li>sessionId source: {state?.debug?.sessionIdField ?? '-'}</li>
                  <li>raw feature count: {state?.debug?.rawFeatureCount ?? 0}</li>
                  <li>deduped feature count: {state?.debug?.dedupedFeatureCount ?? 0}</li>
                  <li>visible feature count: {state?.debug?.visibleFeatureCount ?? 0}</li>
                  <li>hidden/system feature count: {state?.debug?.hiddenFeatureCount ?? 0}</li>
                </ul>
                <details>
                  <summary>StartConfiguration / Configure request debug</summary>
                  <pre style={styles.pre}>{JSON.stringify(lastRawRequest, null, 2)}</pre>
                </details>
                <details>
                  <summary>StartConfiguration / Configure response debug</summary>
                  <pre style={styles.pre}>{JSON.stringify(lastRawResponse, null, 2)}</pre>
                </details>
                <details>
                  <summary>Configure IPN snippet</summary>
                  <pre style={styles.pre}>{JSON.stringify(state?.debug?.ipnCodeSnippet ?? null, null, 2)}</pre>
                </details>
                <details>
                  <summary>Parsed feature diagnostics</summary>
                  <pre style={styles.pre}>{JSON.stringify(state?.features ?? [], null, 2)}</pre>
                </details>
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

function isOptionTraversable(option: BikeBuilderFeatureOption) {
  return option.isSelectable !== false && option.isVisible !== false && option.isEnabled !== false;
}

function extractRawSnippet(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== 'object') return rawResponse;
  const input = rawResponse as Record<string, unknown>;
  return {
    Description: input.Description,
    IPNCode: input.IPNCode,
    Price: input.Price,
    SessionID: input.SessionID,
  };
}

const styles: Record<string, CSSProperties> = {
  page: { fontFamily: 'Inter, Arial, sans-serif', background: '#f6f7fb', minHeight: 0, padding: 16, overflowY: 'auto', overflowX: 'hidden' },
  container: { maxWidth: 1360, margin: '0 auto', display: 'grid', gap: 12, minWidth: 0 },
  heading: { margin: '6px 0 8px', fontSize: 24 },
  topBar: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' },
  topGrid: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' },
  label: { display: 'grid', gap: 4, fontSize: 12, color: '#374151', fontWeight: 600 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 },
  topActions: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' },
  button: { padding: '8px 12px', borderRadius: 8, border: '1px solid #1f2937', background: '#111827', color: '#fff', cursor: 'pointer' },
  secondaryButton: { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' },
  inlineButton: { padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 12 },
  badge: { fontSize: 12, padding: '5px 8px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' },
  controlPanel: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 10 },
  controlActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  controlGrid: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' },
  checkboxLabel: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    fontSize: 12,
    color: '#374151',
    fontWeight: 600,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 10px',
  },
  statusRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  layout: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', minWidth: 0 },
  leftColumn: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8, minWidth: 0 },
  rightColumn: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 },
  sectionTitle: { margin: '0 0 4px', fontSize: 16 },
  previewCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 10, display: 'grid', gap: 8 },
  previewBox: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: '1 / 1',
    border: '1px dashed #d1d5db',
    borderRadius: 8,
    background: '#f9fafb',
    position: 'relative',
    overflow: 'hidden',
    justifySelf: 'center',
  },
  previewLayer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
  },
  previewPlaceholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    padding: 12,
  },
  imageDebugCard: {
    border: '1px solid #ebedf0',
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    display: 'grid',
    gap: 4,
  },
  featureCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 8, display: 'grid', gap: 6, background: '#fcfcfd' },
  featureHeader: { fontSize: 13, fontWeight: 600, color: '#111827' },
  select: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' },
  summaryCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 10, display: 'grid', gap: 6, fontSize: 13 },
  resultsList: { border: '1px solid #ebedf0', borderRadius: 10, padding: 8, display: 'grid', gap: 8, maxHeight: 520, overflow: 'auto' },
  resultCard: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, display: 'grid', gap: 4, background: '#fff' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12 },
  resultMeta: { fontSize: 12, color: '#374151' },
  debugCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 10, display: 'grid', gap: 8, fontSize: 12 },
  debugTitle: { margin: 0, fontSize: 14 },
  debugList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 4 },
  pre: { maxHeight: 220, overflow: 'auto', background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' },
  tinyMuted: { fontSize: 11, color: '#6b7280' },
  muted: { color: '#6b7280', fontSize: 13 },
  error: { color: '#b91c1c', fontSize: 13, margin: 0 },
};
