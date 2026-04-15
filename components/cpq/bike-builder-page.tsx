'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  BikeBuilderContext,
  BikeBuilderFeatureOption,
  FinalizeConfigurationRequest,
  NormalizedBikeBuilderState,
} from '@/types/cpq';

type RequestState = {
  loading: boolean;
  error?: string;
};

type PersistenceStatus = 'idle' | 'saving' | 'saved' | 'error';

type CpqRouteResponse = {
  traceId?: string;
  sessionId: string;
  parsed: NormalizedBikeBuilderState;
  rawResponse: unknown;
  error?: string;
  errorCategory?: string;
  details?: string;
};

type SamplerSourceSnapshot = {
  source: 'startconfiguration' | 'configure';
  capturedAt: string;
  parsed: NormalizedBikeBuilderState;
  rawResponse: unknown;
};

type SamplerSelectedOption = {
  featureLabel: string;
  featureId: string;
  optionLabel: string;
  optionId: string;
  optionValue: string;
};

type RulesetRecord = {
  id: number;
  cpq_ruleset: string;
  namespace: string;
  header_id: string;
};

type AccountContextRecord = {
  id: number;
  account_code: string;
  customer_id: string;
  currency: string;
  language: string;
  country_code: string;
};

type ConfigurationReferenceRow = {
  configuration_reference: string;
  ruleset: string;
  namespace: string;
  header_id: string;
  finalized_detail_id: string;
  account_code: string | null;
  customer_id: string | null;
  currency: string | null;
  language: string | null;
  country_code: string | null;
  final_ipn_code: string | null;
  product_description: string | null;
};

type DebugEntry = {
  id: string;
  timestamp: string;
  traceId: string;
  action: string;
  route: string;
  status?: number;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

type CombinationFeatureColumn = {
  stableFeatureKey: string;
  featureLabel: string;
  currentSessionFeatureId: string;
  stableFeatureIdentity: {
    featureName?: string;
    featureQuestion?: string;
    featureLabel: string;
    featureSequence?: number;
  };
};

type CombinationCell = CombinationFeatureColumn & {
  optionId: string;
  optionValue: string;
  optionLabel: string;
};

type CombinationRow = {
  id: string;
  selected: boolean;
  cellsByFeatureKey: Record<string, CombinationCell>;
};

type CombinationDataset = {
  generatedAt: string;
  sessionId: string;
  rows: CombinationRow[];
  columns: CombinationFeatureColumn[];
};

type RowExecutionStatus = 'pending' | 'running' | 'configured' | 'finalized' | 'saved' | 'failed';

type BulkProgress = {
  running: boolean;
  totalSelected: number;
  currentRowIndex: number;
  currentRowId: string | null;
  currentSessionId: string | null;
  currentFeatureKey: string | null;
  succeeded: number;
  failed: number;
  saved: number;
  message: string;
};

const fallbackRuleset = {
  cpq_ruleset: 'BBLV6_G-LineMY26',
  namespace: 'Default',
  header_id: 'Simulator',
};

const isDebugEnabled = process.env.NEXT_PUBLIC_CPQ_DEBUG === 'true';

const createTraceId = () => crypto.randomUUID();

const buildStableFeatureIdentity = (feature: NormalizedBikeBuilderState['features'][number]) => {
  const firstOptionMetadata = feature.availableOptions.find((option) => option.metadata)?.metadata;
  return {
    featureName: feature.featureName?.trim() || undefined,
    featureQuestion: firstOptionMetadata?.FeatureQuestion?.trim() || undefined,
    featureLabel: feature.featureLabel.trim(),
    featureSequence: feature.featureSequence,
  };
};

const buildStableFeatureKey = (
  identity: ReturnType<typeof buildStableFeatureIdentity>,
  featureIndex: number,
) => {
  const baseKey = identity.featureName || identity.featureQuestion || identity.featureLabel || 'feature';
  return `${baseKey}::${featureIndex + 1}`;
};

export default function BikeBuilderPage() {
  const [accountContexts, setAccountContexts] = useState<AccountContextRecord[]>([]);
  const [rulesets, setRulesets] = useState<RulesetRecord[]>([]);

  const [accountCode, setAccountCode] = useState('');
  const [ruleset, setRuleset] = useState(fallbackRuleset.cpq_ruleset);

  const [state, setState] = useState<NormalizedBikeBuilderState | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ loading: false });

  const [configurationReferenceInput, setConfigurationReferenceInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<PersistenceStatus>('idle');
  const [saveMessage, setSaveMessage] = useState('-');
  const [saveTechnicalDetail, setSaveTechnicalDetail] = useState<string | null>(null);
  const [retrieveStatus, setRetrieveStatus] = useState<PersistenceStatus>('idle');
  const [retrieveMessage, setRetrieveMessage] = useState('-');
  const [lastSavedReference, setLastSavedReference] = useState<ConfigurationReferenceRow | null>(null);
  const [samplerSaveStatus, setSamplerSaveStatus] = useState<PersistenceStatus>('idle');
  const [samplerSaveMessage, setSamplerSaveMessage] = useState('-');
  const [samplerSaveDetail, setSamplerSaveDetail] = useState<string | null>(null);
  const [lastSamplerSource, setLastSamplerSource] = useState<SamplerSourceSnapshot | null>(null);

  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [combinationDataset, setCombinationDataset] = useState<CombinationDataset | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [combinationRowStatuses, setCombinationRowStatuses] = useState<Record<string, RowExecutionStatus>>({});
  const [bulkProgress, setBulkProgress] = useState<BulkProgress>({
    running: false,
    totalSelected: 0,
    currentRowIndex: 0,
    currentRowId: null,
    currentSessionId: null,
    currentFeatureKey: null,
    succeeded: 0,
    failed: 0,
    saved: 0,
    message: 'Idle',
  });
  const manualSessionClosedRef = useRef(false);

  const selectedRuleset = useMemo(
    () => rulesets.find((entry) => entry.cpq_ruleset === ruleset) ?? null,
    [ruleset, rulesets],
  );

  const selectedAccount = useMemo(
    () => accountContexts.find((entry) => entry.account_code === accountCode) ?? null,
    [accountCode, accountContexts],
  );

  const appendDebugEntry = (entry: DebugEntry) => {
    if (!isDebugEnabled) return;
    setDebugEntries((prev) => [...prev.slice(-79), entry]);
  };

  const trackedFetch = async <T,>(
    traceId: string,
    action: string,
    route: string,
    payload: unknown,
    init?: Omit<RequestInit, 'headers' | 'body'>,
  ): Promise<{ response: Response; payload: T }> => {
    const startedAt = Date.now();

    appendDebugEntry({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      traceId,
      action,
      route,
      request: payload,
    });

    const response = await fetch(route, {
      ...init,
      method: init?.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cpq-trace-id': traceId,
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string; details?: string; traceId?: string };

    appendDebugEntry({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      traceId: body.traceId ?? traceId,
      action,
      route,
      status: response.status,
      durationMs: Date.now() - startedAt,
      response: body,
      error: response.ok ? undefined : body.error ?? 'Request failed',
    });

    return { response, payload: body };
  };

  const startConfiguration = async () => {
    if (!selectedAccount) {
      setRequestState({ loading: false, error: 'Select an account code to start configuration.' });
      return;
    }

    const traceId = createTraceId();
    const activeRuleset = selectedRuleset ?? {
      ...fallbackRuleset,
      cpq_ruleset: ruleset,
    };

    setRequestState({ loading: true });
    setSaveStatus('idle');
    setSaveMessage('-');
    setSaveTechnicalDetail(null);
    setSamplerSaveStatus('idle');
    setSamplerSaveMessage('-');
    setSamplerSaveDetail(null);

    try {
      const payload = {
        ruleset: activeRuleset.cpq_ruleset,
        partName: activeRuleset.cpq_ruleset,
        namespace: activeRuleset.namespace,
        headerId: activeRuleset.header_id,
        detailId: crypto.randomUUID(),
        sourceHeaderId: '',
        sourceDetailId: '',
        context: {
          accountCode: selectedAccount.account_code,
          company: selectedAccount.account_code,
          accountType: 'Dealer',
          customerId: selectedAccount.customer_id,
          currency: selectedAccount.currency,
          language: selectedAccount.language,
          countryCode: selectedAccount.country_code,
          customerLocation: selectedAccount.country_code,
        } satisfies Partial<BikeBuilderContext>,
      };
      const { response, payload: responsePayload } = await trackedFetch<CpqRouteResponse>(traceId, 'StartConfiguration', '/api/cpq/init', payload);

      if (!response.ok) {
        throw new Error(responsePayload.error ?? 'StartConfiguration failed');
      }

      setState(responsePayload.parsed);
      setLastSamplerSource({
        source: 'startconfiguration',
        capturedAt: new Date().toISOString(),
        parsed: responsePayload.parsed,
        rawResponse: responsePayload.rawResponse,
      });
      manualSessionClosedRef.current = false;
      setRequestState({ loading: false });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to start configuration',
      });
    }
  };

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

        if (nextAccounts.length > 0) setAccountCode(nextAccounts[0].account_code);
        if (nextRulesets.length > 0) setRuleset(nextRulesets[0].cpq_ruleset);
      } catch {
        setRequestState({ loading: false, error: 'Failed to load account context and rulesets from setup.' });
      }
    };

    void loadSetup();
  }, []);

  useEffect(() => {
    if (!selectedAccount || !ruleset) return;
    void startConfiguration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCode, ruleset]);

  useEffect(() => {
    setCombinationDataset(null);
    setColumnFilters({});
    setCombinationRowStatuses({});
    setBulkProgress({
      running: false,
      totalSelected: 0,
      currentRowIndex: 0,
      currentRowId: null,
      currentSessionId: null,
      currentFeatureKey: null,
      succeeded: 0,
      failed: 0,
      saved: 0,
      message: 'Idle',
    });
  }, [state?.sessionId]);

  const generateCombinations = () => {
    if (!state?.sessionId || !state.features?.length) {
      setCombinationDataset(null);
      return;
    }

    const columns: CombinationFeatureColumn[] = state.features
      .filter((feature) => feature.isVisible !== false)
      .map((feature, featureIndex) => {
        const stableFeatureIdentity = buildStableFeatureIdentity(feature);
        const stableFeatureKey = buildStableFeatureKey(stableFeatureIdentity, featureIndex);

        return {
          stableFeatureKey,
          featureLabel: feature.featureLabel,
          currentSessionFeatureId: feature.featureId,
          stableFeatureIdentity,
        };
      });

    if (columns.length === 0) {
      setCombinationDataset(null);
      return;
    }

    const optionsByFeature = state.features
      .filter((feature) => feature.isVisible !== false)
      .map((feature, featureIndex) => {
        const stableFeatureIdentity = buildStableFeatureIdentity(feature);
        const stableFeatureKey = buildStableFeatureKey(stableFeatureIdentity, featureIndex);

        const availableOptions = feature.availableOptions.filter(
          (option) => option.isVisible !== false && option.isEnabled !== false && option.isSelectable !== false,
        );

        return {
          feature,
          stableFeatureKey,
          stableFeatureIdentity,
          options: availableOptions,
        };
      });

    if (optionsByFeature.some((entry) => entry.options.length === 0)) {
      setCombinationDataset({
        generatedAt: new Date().toISOString(),
        sessionId: state.sessionId,
        rows: [],
        columns,
      });
      setCombinationRowStatuses({});
      return;
    }

    let rows: CombinationRow[] = [{ id: 'row-0', selected: false, cellsByFeatureKey: {} }];

    for (const featureEntry of optionsByFeature) {
      const nextRows: CombinationRow[] = [];

      for (const row of rows) {
        for (const option of featureEntry.options) {
          const optionValue = option.value ?? option.optionId;
          const optionLabel = option.label;
          nextRows.push({
            id: `${row.id}::${featureEntry.stableFeatureKey}:${option.optionId}`,
            selected: false,
            cellsByFeatureKey: {
              ...row.cellsByFeatureKey,
              [featureEntry.stableFeatureKey]: {
                stableFeatureKey: featureEntry.stableFeatureKey,
                featureLabel: featureEntry.feature.featureLabel,
                currentSessionFeatureId: featureEntry.feature.featureId,
                stableFeatureIdentity: featureEntry.stableFeatureIdentity,
                optionId: option.optionId,
                optionValue,
                optionLabel,
              },
            },
          });
        }
      }

      rows = nextRows;
    }

    setCombinationDataset({
      generatedAt: new Date().toISOString(),
      sessionId: state.sessionId,
      rows,
      columns,
    });
    setCombinationRowStatuses(
      rows.reduce<Record<string, RowExecutionStatus>>((acc, row) => {
        acc[row.id] = 'pending';
        return acc;
      }, {}),
    );
    setColumnFilters({});
  };

  const filteredCombinationRows = useMemo(() => {
    if (!combinationDataset) return [];

    return combinationDataset.rows.filter((row) =>
      combinationDataset.columns.every((column) => {
        const filterValue = columnFilters[column.stableFeatureKey]?.trim().toLowerCase();
        if (!filterValue) return true;
        const cell = row.cellsByFeatureKey[column.stableFeatureKey];
        if (!cell) return false;
        const searchableValue = `${cell.optionLabel} ${cell.optionValue} ${cell.optionId}`.toLowerCase();
        return searchableValue.includes(filterValue);
      }),
    );
  }, [columnFilters, combinationDataset]);

  const configureOption = async (featureId: string, option: BikeBuilderFeatureOption) => {
    if (!state?.sessionId || manualSessionClosedRef.current) {
      setRequestState({ loading: false, error: 'No active session. Start a new configuration session.' });
      return;
    }

    const traceId = createTraceId();
    setRequestState({ loading: true });
    setActiveFeatureId(featureId);

    try {
      const { response, payload } = await trackedFetch<CpqRouteResponse>(traceId, 'Configure', '/api/cpq/configure', {
        sessionId: state.sessionId,
        featureId,
        optionId: option.optionId,
        optionValue: option.value ?? option.optionId,
        ruleset,
        context: {
          accountCode: selectedAccount?.account_code,
          customerId: selectedAccount?.customer_id,
          currency: selectedAccount?.currency,
          language: selectedAccount?.language,
          countryCode: selectedAccount?.country_code,
        },
      });

      if (!response.ok) {
        throw new Error(payload.error ?? 'Configure failed');
      }

      setState(payload.parsed);
      setLastSamplerSource({
        source: 'configure',
        capturedAt: new Date().toISOString(),
        parsed: payload.parsed,
        rawResponse: payload.rawResponse,
      });
      setRequestState({ loading: false });
    } catch (error) {
      setRequestState({ loading: false, error: error instanceof Error ? error.message : 'Configure failed' });
    } finally {
      setActiveFeatureId(null);
    }
  };

  const buildSamplerSelectedOptions = (parsed: NormalizedBikeBuilderState): SamplerSelectedOption[] =>
    parsed.features
      .map((feature) => {
        const featureId = feature.featureId.trim();
        const selectedOptionId = (feature.selectedOptionId ?? '').trim();
        if (!featureId || !selectedOptionId) return null;

        const selectedOption =
          feature.availableOptions.find((option) => option.optionId === selectedOptionId) ??
          feature.availableOptions.find((option) => option.selected) ??
          null;

        const optionId = (selectedOption?.optionId ?? selectedOptionId).trim();
        const optionLabel = (selectedOption?.label ?? selectedOptionId ?? '').trim() || selectedOptionId || '(none)';
        const optionValue = (selectedOption?.value ?? feature.selectedValue ?? feature.currentValue ?? '').trim();

        return {
          featureLabel: feature.featureLabel.trim(),
          featureId,
          optionLabel,
          optionId,
          optionValue,
        };
      })
      .filter((entry): entry is SamplerSelectedOption => Boolean(entry))
      .sort((a, b) => a.featureId.localeCompare(b.featureId));

  const buildTraversalPathKey = (steps: SamplerSelectedOption[]) =>
    steps.map((step) => `${step.featureId}:${step.optionId}:${step.optionValue}`).join(' > ');

  const buildSamplerSignature = (samplerRuleset: string, selectedOptions: SamplerSelectedOption[]) => {
    const tokens = selectedOptions
      .map((entry) => `${entry.featureId}:${entry.optionId}:${entry.optionValue}`)
      .sort((a, b) => a.localeCompare(b))
      .join('|');
    return `${samplerRuleset}::${tokens}`;
  };

  const buildCapturedSamplerPayload = (snapshot: SamplerSourceSnapshot) => {
    const parsed = snapshot.parsed;
    const selectedOptions = buildSamplerSelectedOptions(parsed);
    const normalizedRuleset = (parsed.ruleset || ruleset).trim();
    const traversalPath: SamplerSelectedOption[] = [];
    const traversalPathKey = buildTraversalPathKey(traversalPath);
    const rawSnippet = {
      Description: parsed.productDescription ?? null,
      IPNCode: parsed.ipnCode ?? null,
      Price: parsed.configuredPrice ?? null,
      SessionID: parsed.sessionId ?? null,
    };

    return {
      sequence: 1,
      timestamp: new Date().toISOString(),
      traversalLevel: 1,
      traversalPath,
      traversalPathKey,
      parentPathKey: '',
      changedFeatureId: '',
      changedOptionId: '',
      changedOptionValue: '',
      ruleset: normalizedRuleset,
      namespace: parsed.namespace ?? selectedRuleset?.namespace ?? fallbackRuleset.namespace,
      headerId: selectedRuleset?.header_id ?? fallbackRuleset.header_id,
      detailId: parsed.detailId ?? null,
      sessionId: parsed.sessionId,
      baseDetailId: parsed.sourceDetailId ?? parsed.detailId ?? null,
      sourceDetailId: parsed.sourceDetailId ?? null,
      branchDetailId: parsed.detailId ?? null,
      samplerMode: 'sampler',
      description: parsed.productDescription ?? null,
      ipn: parsed.ipnCode ?? null,
      price: parsed.configuredPrice ?? null,
      selectedOptions,
      dropdownOrderSnapshot: parsed.features.map((feature, index) => {
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
          selectedOptionLabel: (selectedOption?.label ?? selectedOptionId ?? '').trim() || '(none)',
          selectedOptionValue: (selectedOption?.value ?? feature.selectedValue ?? feature.currentValue ?? '').trim(),
        };
      }),
      signature: buildSamplerSignature(normalizedRuleset, selectedOptions),
      rawSnippet,
      source: 'manual-save',
    };
  };

  const saveCurrentConfigurationToSampler = async () => {
    if (!selectedAccount) {
      setSamplerSaveStatus('error');
      setSamplerSaveMessage('Select an account before saving to sampler.');
      setSamplerSaveDetail('Account context is required for sampler persistence.');
      return;
    }

    if (!lastSamplerSource) {
      setSamplerSaveStatus('error');
      setSamplerSaveMessage('No Start/Configure response available to capture.');
      setSamplerSaveDetail('Sampler save only uses the latest StartConfiguration/Configure state, never Finalize.');
      return;
    }

    setSamplerSaveStatus('saving');
    setSamplerSaveMessage('Saving active configuration to CPQ_sampler_result...');
    setSamplerSaveDetail(null);

    try {
      const capturedPayload = buildCapturedSamplerPayload(lastSamplerSource);
      const response = await fetch('/api/cpq/sampler-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipn_code: capturedPayload.ipn,
          ruleset: lastSamplerSource.parsed.ruleset || ruleset,
          account_code: selectedAccount.account_code,
          customer_id: selectedAccount.customer_id,
          currency: selectedAccount.currency,
          language: selectedAccount.language,
          country_code: selectedAccount.country_code,
          namespace: capturedPayload.namespace,
          header_id: capturedPayload.headerId,
          detail_id: capturedPayload.detailId,
          session_id: capturedPayload.sessionId,
          json_result: capturedPayload,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        row?: { id: number; created_at: string };
      };

      if (!response.ok || !payload.row) {
        throw new Error(payload.error ?? 'Sampler save failed');
      }

      setSamplerSaveStatus('saved');
      setSamplerSaveMessage(
        `Sampler row ${payload.row.id} saved from ${lastSamplerSource.source} (${capturedPayload.selectedOptions.length} selected options).`,
      );
    } catch (error) {
      setSamplerSaveStatus('error');
      setSamplerSaveMessage('Failed to save current configuration to sampler.');
      setSamplerSaveDetail(error instanceof Error ? error.message : 'Sampler save failed');
    }
  };

  const saveConfiguration = async () => {
    if (!state?.sessionId || !selectedAccount) {
      setSaveStatus('error');
      setSaveMessage('Missing session ID before finalize');
      setSaveTechnicalDetail('No active configuration session was found in UI state.');
      return;
    }

    const traceId = createTraceId();
    setSaveStatus('saving');
    setSaveMessage('Finalizing configuration...');
    setSaveTechnicalDetail(null);

    try {
      const finalizePayload: FinalizeConfigurationRequest = {
        sessionID: state.sessionId,
      };
      const finalizeResult = await trackedFetch<CpqRouteResponse>(
        traceId,
        'FinalizeConfiguration',
        '/api/cpq/finalize',
        finalizePayload,
      );

      if (!finalizeResult.response.ok) {
        setSaveStatus('error');
        setSaveMessage(finalizeResult.payload.error ?? 'Finalize request rejected by CPQ');
        setSaveTechnicalDetail(finalizeResult.payload.details ?? finalizeResult.payload.errorCategory ?? null);
        return;
      }

      const finalizedState = finalizeResult.payload.parsed;
      const finalizedDetailId = finalizedState.detailId ?? state.detailId ?? '';
      if (!finalizedDetailId) {
        setSaveStatus('error');
        setSaveMessage('Unexpected CPQ response: finalized detail ID missing');
        setSaveTechnicalDetail('Finalize response did not contain detailId/configurationId.');
        return;
      }

      const saveResult = await trackedFetch<{ row?: ConfigurationReferenceRow; error?: string; details?: string }>(
        traceId,
        'SaveConfigurationReference',
        '/api/cpq/configuration-references',
        {
          ruleset,
          namespace: selectedRuleset?.namespace ?? fallbackRuleset.namespace,
          canonical_header_id: selectedRuleset?.header_id ?? fallbackRuleset.header_id,
          canonical_detail_id: finalizedDetailId,
          header_id: selectedRuleset?.header_id ?? fallbackRuleset.header_id,
          finalized_detail_id: finalizedDetailId,
          source_working_detail_id: state.detailId,
          source_session_id: state.sessionId,
          source_header_id: finalizedState.sourceHeaderId ?? selectedRuleset?.header_id ?? fallbackRuleset.header_id,
          source_detail_id: finalizedState.sourceDetailId ?? null,
          account_code: selectedAccount.account_code,
          customer_id: selectedAccount.customer_id,
          account_type: 'Dealer',
          company: selectedAccount.account_code,
          currency: selectedAccount.currency,
          language: selectedAccount.language,
          country_code: selectedAccount.country_code,
          customer_location: selectedAccount.country_code,
          application_instance: process.env.NEXT_PUBLIC_CPQ_INSTANCE ?? null,
          application_name: process.env.NEXT_PUBLIC_CPQ_INSTANCE ?? null,
          finalized_session_id: state.sessionId,
          final_ipn_code: finalizedState.ipnCode ?? null,
          product_description: finalizedState.productDescription ?? null,
          finalize_response_json: finalizeResult.payload.rawResponse,
          json_snapshot: {
            parsed: finalizedState,
            finalizeRawResponse: finalizeResult.payload.rawResponse,
            retrievedAt: new Date().toISOString(),
          },
        },
      );

      if (!saveResult.response.ok || !saveResult.payload.row) {
        setSaveStatus('error');
        setSaveMessage(saveResult.payload.error ?? 'Finalize succeeded but saving reference in database failed');
        setSaveTechnicalDetail(saveResult.payload.details ?? null);
        return;
      }

      setLastSavedReference(saveResult.payload.row);
      setConfigurationReferenceInput(saveResult.payload.row.configuration_reference);
      setSaveStatus('saved');
      setSaveMessage(`Saved ${saveResult.payload.row.configuration_reference} with finalized detailId ${finalizedDetailId}.`);

      manualSessionClosedRef.current = true;
      setState(null);
      setRequestState({ loading: false, error: undefined });
    } catch (error) {
      setSaveStatus('error');
      setSaveMessage('Save flow failed unexpectedly');
      setSaveTechnicalDetail(error instanceof Error ? error.message : 'Save failed');
    }
  };

  const retrieveConfiguration = async () => {
    const reference = configurationReferenceInput.trim();
    if (!reference) {
      setRetrieveStatus('error');
      setRetrieveMessage('configuration_reference is required.');
      return;
    }

    const traceId = createTraceId();
    setRetrieveStatus('saving');
    setRetrieveMessage('Retrieving configuration...');

    try {
      const { response, payload } = await trackedFetch<{
        error?: string;
        parsed?: NormalizedBikeBuilderState;
        resolved?: ConfigurationReferenceRow;
      }>(traceId, 'RetrieveConfiguration', '/api/cpq/retrieve-configuration', {
        configuration_reference: reference,
      });

      if (!response.ok || !payload.parsed || !payload.resolved) {
        throw new Error(payload.error ?? 'Retrieve failed');
      }

      setState(payload.parsed);
      manualSessionClosedRef.current = false;
      setRuleset(payload.resolved.ruleset);
      if (payload.resolved.account_code) setAccountCode(payload.resolved.account_code);

      setRetrieveStatus('saved');
      setRetrieveMessage(`Retrieved ${payload.resolved.configuration_reference}. New session ${payload.parsed.sessionId}.`);
      setLastSavedReference(payload.resolved);
    } catch (error) {
      setRetrieveStatus('error');
      setRetrieveMessage(error instanceof Error ? error.message : 'Retrieve failed');
    }
  };

  const resolveCurrentFeatureForRowSelection = (
    rowCell: CombinationCell,
    currentState: NormalizedBikeBuilderState,
    column: CombinationFeatureColumn,
  ) => {
    const visibleFeatures = currentState.features.filter((feature) => feature.isVisible !== false);
    const normalizedTargetLabel = column.stableFeatureIdentity.featureLabel.trim().toLowerCase();
    const normalizedTargetName = column.stableFeatureIdentity.featureName?.toLowerCase();
    const normalizedTargetQuestion = column.stableFeatureIdentity.featureQuestion?.toLowerCase();

    const matchingFeatures = visibleFeatures.filter((feature) => {
      const identity = buildStableFeatureIdentity(feature);
      return (
        (normalizedTargetName && identity.featureName?.toLowerCase() === normalizedTargetName) ||
        (normalizedTargetQuestion && identity.featureQuestion?.toLowerCase() === normalizedTargetQuestion) ||
        identity.featureLabel.trim().toLowerCase() === normalizedTargetLabel
      );
    });

    if (matchingFeatures.length === 1) return matchingFeatures[0];
    if (matchingFeatures.length > 1) {
      return matchingFeatures.find((feature) => feature.featureLabel.trim().toLowerCase() === normalizedTargetLabel) ?? matchingFeatures[0];
    }

    return (
      visibleFeatures.find(
        (feature) =>
          feature.featureLabel.trim().toLowerCase() === rowCell.featureLabel.trim().toLowerCase() ||
          feature.featureId === rowCell.currentSessionFeatureId,
      ) ?? null
    );
  };

  const resolveCurrentOptionWithinFeature = (feature: NormalizedBikeBuilderState['features'][number], rowCell: CombinationCell) => {
    const normalizedRowOptionLabel = rowCell.optionLabel.trim().toLowerCase();
    return (
      feature.availableOptions.find(
        (option) =>
          option.optionId === rowCell.optionId &&
          (option.value ?? option.optionId) === rowCell.optionValue,
      ) ??
      feature.availableOptions.find(
        (option) => option.optionId === rowCell.optionId || (option.value ?? option.optionId) === rowCell.optionValue,
      ) ??
      feature.availableOptions.find((option) => option.label.trim().toLowerCase() === normalizedRowOptionLabel) ??
      null
    );
  };

  const startFreshSessionForCombinationRow = async (traceId: string) => {
    if (!selectedAccount) throw new Error('Select an account code to run bulk configuration.');

    const activeRuleset = selectedRuleset ?? {
      ...fallbackRuleset,
      cpq_ruleset: ruleset,
    };
    const payload = {
      ruleset: activeRuleset.cpq_ruleset,
      partName: activeRuleset.cpq_ruleset,
      namespace: activeRuleset.namespace,
      headerId: activeRuleset.header_id,
      detailId: crypto.randomUUID(),
      sourceHeaderId: '',
      sourceDetailId: '',
      context: {
        accountCode: selectedAccount.account_code,
        company: selectedAccount.account_code,
        accountType: 'Dealer',
        customerId: selectedAccount.customer_id,
        currency: selectedAccount.currency,
        language: selectedAccount.language,
        countryCode: selectedAccount.country_code,
        customerLocation: selectedAccount.country_code,
      } satisfies Partial<BikeBuilderContext>,
    };

    const { response, payload: responsePayload } = await trackedFetch<CpqRouteResponse>(
      traceId,
      'Bulk:StartConfiguration',
      '/api/cpq/init',
      payload,
    );
    if (!response.ok) {
      throw new Error(responsePayload.error ?? 'Bulk StartConfiguration failed');
    }

    return responsePayload.parsed;
  };

  const finalizeAndSaveCombinationRow = async (traceId: string, rowState: NormalizedBikeBuilderState) => {
    if (!selectedAccount) {
      throw new Error('Missing account context for save.');
    }

    const finalizePayload: FinalizeConfigurationRequest = { sessionID: rowState.sessionId };
    const finalizeResult = await trackedFetch<CpqRouteResponse>(traceId, 'Bulk:FinalizeConfiguration', '/api/cpq/finalize', finalizePayload);

    if (!finalizeResult.response.ok) {
      throw new Error(finalizeResult.payload.error ?? 'Bulk finalize failed');
    }

    const finalizedState = finalizeResult.payload.parsed;
    const finalizedDetailId = finalizedState.detailId ?? rowState.detailId ?? '';
    if (!finalizedDetailId) {
      throw new Error('Bulk finalize response did not return detailId.');
    }

    const saveResult = await trackedFetch<{ row?: ConfigurationReferenceRow; error?: string; details?: string }>(
      traceId,
      'Bulk:SaveConfigurationReference',
      '/api/cpq/configuration-references',
      {
        ruleset,
        namespace: selectedRuleset?.namespace ?? fallbackRuleset.namespace,
        canonical_header_id: selectedRuleset?.header_id ?? fallbackRuleset.header_id,
        canonical_detail_id: finalizedDetailId,
        header_id: selectedRuleset?.header_id ?? fallbackRuleset.header_id,
        finalized_detail_id: finalizedDetailId,
        source_working_detail_id: rowState.detailId,
        source_session_id: rowState.sessionId,
        source_header_id: finalizedState.sourceHeaderId ?? selectedRuleset?.header_id ?? fallbackRuleset.header_id,
        source_detail_id: finalizedState.sourceDetailId ?? null,
        account_code: selectedAccount.account_code,
        customer_id: selectedAccount.customer_id,
        account_type: 'Dealer',
        company: selectedAccount.account_code,
        currency: selectedAccount.currency,
        language: selectedAccount.language,
        country_code: selectedAccount.country_code,
        customer_location: selectedAccount.country_code,
        application_instance: process.env.NEXT_PUBLIC_CPQ_INSTANCE ?? null,
        application_name: process.env.NEXT_PUBLIC_CPQ_INSTANCE ?? null,
        finalized_session_id: rowState.sessionId,
        final_ipn_code: finalizedState.ipnCode ?? null,
        product_description: finalizedState.productDescription ?? null,
        finalize_response_json: finalizeResult.payload.rawResponse,
        json_snapshot: {
          parsed: finalizedState,
          finalizeRawResponse: finalizeResult.payload.rawResponse,
          retrievedAt: new Date().toISOString(),
        },
      },
    );

    if (!saveResult.response.ok || !saveResult.payload.row) {
      throw new Error(saveResult.payload.error ?? 'Bulk save reference failed');
    }

    return {
      finalizedState,
      savedRow: saveResult.payload.row,
    };
  };

  const runSelectedCombinationRows = async () => {
    if (!combinationDataset || !selectedAccount) return;
    const selectedRows = combinationDataset.rows.filter((row) => row.selected);
    if (selectedRows.length === 0) {
      setBulkProgress((current) => ({ ...current, message: 'No rows are ticked.' }));
      return;
    }

    const nextStatuses = combinationDataset.rows.reduce<Record<string, RowExecutionStatus>>((acc, row) => {
      acc[row.id] = row.selected ? 'pending' : combinationRowStatuses[row.id] ?? 'pending';
      return acc;
    }, {});
    setCombinationRowStatuses(nextStatuses);
    setBulkProgress({
      running: true,
      totalSelected: selectedRows.length,
      currentRowIndex: 0,
      currentRowId: null,
      currentSessionId: null,
      currentFeatureKey: null,
      succeeded: 0,
      failed: 0,
      saved: 0,
      message: 'Bulk processing started.',
    });

    let succeeded = 0;
    let failed = 0;
    let saved = 0;

    for (const [rowIndex, row] of selectedRows.entries()) {
      const traceId = createTraceId();
      setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'running' }));
      setBulkProgress((current) => ({
        ...current,
        currentRowIndex: rowIndex + 1,
        currentRowId: row.id,
        currentSessionId: null,
        currentFeatureKey: null,
        message: `Processing row ${rowIndex + 1}/${selectedRows.length}`,
      }));

      try {
        let workingState = await startFreshSessionForCombinationRow(traceId);
        setBulkProgress((current) => ({ ...current, currentSessionId: workingState.sessionId }));

        for (const column of combinationDataset.columns) {
          const rowCell = row.cellsByFeatureKey[column.stableFeatureKey];
          if (!rowCell) continue;

          setBulkProgress((current) => ({ ...current, currentFeatureKey: column.stableFeatureKey }));
          const currentFeature = resolveCurrentFeatureForRowSelection(rowCell, workingState, column);
          if (!currentFeature) {
            throw new Error(`Could not map feature "${column.featureLabel}" in new session ${workingState.sessionId}.`);
          }
          const targetOption = resolveCurrentOptionWithinFeature(currentFeature, rowCell);
          if (!targetOption) {
            throw new Error(`Could not resolve option "${rowCell.optionLabel}" inside feature "${currentFeature.featureLabel}".`);
          }

          const targetOptionValue = targetOption.value ?? targetOption.optionId;
          const optionAlreadySelected =
            currentFeature.selectedOptionId === targetOption.optionId || currentFeature.selectedValue === targetOptionValue;
          if (optionAlreadySelected) {
            continue;
          }

          const { response, payload } = await trackedFetch<CpqRouteResponse>(
            traceId,
            'Bulk:Configure',
            '/api/cpq/configure',
            {
              sessionId: workingState.sessionId,
              featureId: currentFeature.featureId,
              optionId: targetOption.optionId,
              optionValue: targetOptionValue,
              ruleset,
              context: {
                accountCode: selectedAccount.account_code,
                customerId: selectedAccount.customer_id,
                currency: selectedAccount.currency,
                language: selectedAccount.language,
                countryCode: selectedAccount.country_code,
              },
            },
          );

          if (!response.ok) {
            throw new Error(payload.error ?? 'Bulk configure failed');
          }
          workingState = payload.parsed;
          setBulkProgress((current) => ({ ...current, currentSessionId: workingState.sessionId }));
        }

        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'configured' }));
        const { finalizedState, savedRow } = await finalizeAndSaveCombinationRow(traceId, workingState);
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'finalized' }));
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'saved' }));
        setLastSavedReference(savedRow);
        succeeded += 1;
        saved += 1;
        setBulkProgress((current) => ({
          ...current,
          currentSessionId: finalizedState.sessionId,
          succeeded,
          saved,
          message: `Row ${rowIndex + 1}/${selectedRows.length} saved (${savedRow.configuration_reference}).`,
        }));
      } catch (error) {
        failed += 1;
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'failed' }));
        setBulkProgress((current) => ({
          ...current,
          failed,
          message: error instanceof Error ? error.message : `Row ${rowIndex + 1} failed.`,
        }));
      }
    }

    setBulkProgress((current) => ({
      ...current,
      running: false,
      currentFeatureKey: null,
      currentSessionId: null,
      message: `Bulk run finished: ${succeeded} succeeded, ${failed} failed, ${saved} saved.`,
    }));
  };

  return (
    <main style={styles.page}>
      <section style={styles.controls}>
        <h1>CPQ Manual Configuration Lifecycle</h1>
        <p style={styles.muted}>StartConfiguration → Configure → FinalizeConfiguration → Save reference → Retrieve by reference.</p>

        <div style={styles.grid}>
          <label style={styles.field}>
            <span>Account code</span>
            <select value={accountCode} onChange={(event) => setAccountCode(event.target.value)} style={styles.select}>
              {accountContexts.map((item) => (
                <option key={item.id} value={item.account_code}>
                  {item.account_code} ({item.country_code}, {item.currency})
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span>Ruleset</span>
            <select value={ruleset} onChange={(event) => setRuleset(event.target.value)} style={styles.select}>
              {rulesets.map((item) => (
                <option key={item.id} value={item.cpq_ruleset}>
                  {item.cpq_ruleset}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={styles.row}>
          <button style={styles.button} onClick={() => void startConfiguration()} disabled={requestState.loading || bulkProgress.running}>
            {requestState.loading ? 'Starting…' : 'Start New Session'}
          </button>
          <button
            style={styles.button}
            onClick={() => void saveConfiguration()}
            disabled={saveStatus === 'saving' || !state || bulkProgress.running}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save Configuration'}
          </button>
          <button
            style={styles.button}
            onClick={() => void saveCurrentConfigurationToSampler()}
            disabled={samplerSaveStatus === 'saving' || !lastSamplerSource || bulkProgress.running}
          >
            {samplerSaveStatus === 'saving' ? 'Saving sampler row…' : 'Save current configuration to sampler'}
          </button>
          <button
            style={styles.button}
            onClick={generateCombinations}
            disabled={requestState.loading || !state?.features?.length || bulkProgress.running}
          >
            Generate configuration combinations
          </button>
        </div>

        <div style={styles.referenceRow}>
          <input
            value={configurationReferenceInput}
            onChange={(event) => setConfigurationReferenceInput(event.target.value)}
            placeholder="CFG-YYYYMMDD-XXXXXXXX"
            style={styles.input}
          />
          <button style={styles.button} onClick={() => void retrieveConfiguration()} disabled={retrieveStatus === 'saving'}>
            {retrieveStatus === 'saving' ? 'Retrieving…' : 'Retrieve Configuration'}
          </button>
        </div>

        <div style={styles.statusBlock}>
          <div>Session: {state?.sessionId ?? 'none (session closed or not started)'}</div>
          <div>DetailId: {state?.detailId ?? '-'}</div>
          <div>IPN: {state?.ipnCode ?? '-'}</div>
          <div>Save status: {saveMessage}</div>
          <div>
            Sampler save status: {samplerSaveMessage}
            {lastSamplerSource ? ` (source: ${lastSamplerSource.source})` : ''}
          </div>
          {samplerSaveDetail ? <div>Sampler detail: {samplerSaveDetail}</div> : null}
          {isDebugEnabled && saveTechnicalDetail ? (
            <details>
              <summary>Save technical detail</summary>
              <pre style={styles.debugPre}>{saveTechnicalDetail}</pre>
            </details>
          ) : null}
          <div>Retrieve status: {retrieveMessage}</div>
          <div>
            Bulk run: {bulkProgress.message} (selected: {bulkProgress.totalSelected}, row: {bulkProgress.currentRowIndex || '-'}, succeeded:{' '}
            {bulkProgress.succeeded}, failed: {bulkProgress.failed}, saved: {bulkProgress.saved})
          </div>
          <div>Bulk current session: {bulkProgress.currentSessionId ?? '-'}</div>
          <div>Bulk current feature: {bulkProgress.currentFeatureKey ?? '-'}</div>
          {requestState.error && <div style={styles.error}>Runtime error: {requestState.error}</div>}
        </div>
      </section>

      <section style={styles.configurator}>
        <h2>Configurator</h2>
        {!state?.features?.length && <p style={styles.muted}>No active configuration. Start a session first.</p>}
        {state?.features?.map((feature) => (
          <label key={feature.featureId} style={styles.field}>
            <span>{feature.featureLabel}</span>
            <select
              value={feature.selectedOptionId ?? ''}
              onChange={(event) => {
                const nextOption = feature.availableOptions.find((entry) => entry.optionId === event.target.value);
                if (nextOption) void configureOption(feature.featureId, nextOption);
              }}
              disabled={requestState.loading || activeFeatureId === feature.featureId || bulkProgress.running}
              style={styles.select}
            >
              {feature.availableOptions.map((option) => (
                <option key={option.optionId} value={option.optionId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>

      {lastSavedReference && (
        <section style={styles.savedCard}>
          <h3>Last saved reference</h3>
          <div>Reference: {lastSavedReference.configuration_reference}</div>
          <div>Ruleset: {lastSavedReference.ruleset}</div>
          <div>Namespace: {lastSavedReference.namespace}</div>
          <div>Finalized detailId: {lastSavedReference.finalized_detail_id}</div>
          <div>Account: {lastSavedReference.account_code ?? '-'}</div>
          <div>Country: {lastSavedReference.country_code ?? '-'}</div>
        </section>
      )}

      {isDebugEnabled && (
        <section style={styles.debugPanel}>
          <details open>
            <summary>CPQ debug timeline ({debugEntries.length})</summary>
            <div style={styles.debugList}>
              {debugEntries.length === 0 ? <div>No tracked calls yet.</div> : null}
              {debugEntries.map((entry) => (
                <details key={entry.id} style={styles.debugItem}>
                  <summary>
                    [{entry.timestamp}] {entry.action} → {entry.route} ({entry.status ?? 'pending'}) [{entry.traceId}]
                  </summary>
                  <pre style={styles.debugPre}>{JSON.stringify(entry, null, 2)}</pre>
                </details>
              ))}
            </div>
          </details>
        </section>
      )}

      <section style={styles.combinationsPanel}>
        <h2>Generated combinations</h2>
        {!combinationDataset ? (
          <p style={styles.muted}>Generate combinations from the active configurator state to see all available option combinations.</p>
        ) : (
          <>
            <div style={styles.combinationMeta}>
              <div>Session: {combinationDataset.sessionId}</div>
              <div>Generated at: {new Date(combinationDataset.generatedAt).toLocaleString()}</div>
              <div>
                Rows: {filteredCombinationRows.length} filtered / {combinationDataset.rows.length} total
              </div>
            </div>
            <div style={styles.row}>
              <button
                style={styles.button}
                onClick={() =>
                  setCombinationDataset((current) =>
                    current
                      ? {
                          ...current,
                          rows: current.rows.map((row) => (filteredCombinationRows.some((entry) => entry.id === row.id) ? { ...row, selected: true } : row)),
                        }
                      : current,
                  )
                }
                disabled={filteredCombinationRows.length === 0 || bulkProgress.running}
              >
                Tick filtered rows
              </button>
              <button
                style={styles.buttonSecondary}
                onClick={() =>
                  setCombinationDataset((current) =>
                    current
                      ? {
                          ...current,
                          rows: current.rows.map((row) => ({ ...row, selected: false })),
                        }
                      : current,
                  )
                }
                disabled={combinationDataset.rows.length === 0 || bulkProgress.running}
              >
                Untick all
              </button>
              <button
                style={styles.button}
                onClick={() => void runSelectedCombinationRows()}
                disabled={bulkProgress.running || !combinationDataset.rows.some((row) => row.selected)}
              >
                {bulkProgress.running ? 'Configuring ticked items…' : 'Configure all ticked items'}
              </button>
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Select</th>
                    <th style={styles.tableHeader}>Status</th>
                    {combinationDataset.columns.map((column) => (
                      <th key={`header-${column.stableFeatureKey}`} style={styles.tableHeader}>
                        <div>{column.featureLabel}</div>
                        <input
                          value={columnFilters[column.stableFeatureKey] ?? ''}
                          onChange={(event) =>
                            setColumnFilters((prev) => ({
                              ...prev,
                              [column.stableFeatureKey]: event.target.value,
                            }))
                          }
                          placeholder="Filter"
                          style={styles.filterInput}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCombinationRows.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.tableCell}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={bulkProgress.running}
                          onChange={(event) =>
                            setCombinationDataset((current) =>
                              current
                                ? {
                                    ...current,
                                    rows: current.rows.map((entry) =>
                                      entry.id === row.id ? { ...entry, selected: event.target.checked } : entry,
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                      </td>
                      <td style={styles.tableCell}>{combinationRowStatuses[row.id] ?? 'pending'}</td>
                      {combinationDataset.columns.map((column) => {
                        const cell = row.cellsByFeatureKey[column.stableFeatureKey];
                        return (
                          <td key={`${row.id}-${column.stableFeatureKey}`} style={styles.tableCell}>
                            <div>{cell?.optionLabel ?? '-'}</div>
                            <div style={styles.cellMeta}>configure value: {cell?.optionValue ?? '-'}</div>
                            <div style={styles.cellMeta}>optionId: {cell?.optionId ?? '-'}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filteredCombinationRows.length === 0 ? (
                    <tr>
                      <td colSpan={combinationDataset.columns.length + 2} style={styles.emptyCell}>
                        No rows match current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '1rem 1.5rem 1.5rem',
    display: 'grid',
    gap: '1rem',
    width: '100%',
    minHeight: 0,
    alignContent: 'start',
  },
  controls: {
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    padding: '1rem',
    display: 'grid',
    gap: '0.75rem',
    background: '#fff',
  },
  configurator: {
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    padding: '1rem',
    display: 'grid',
    gap: '0.75rem',
    background: '#fff',
  },
  savedCard: {
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    padding: '1rem',
    display: 'grid',
    gap: '0.25rem',
    background: '#fff',
  },
  debugPanel: {
    border: '1px solid #94a3b8',
    borderRadius: 12,
    padding: '0.75rem',
    background: '#f8fafc',
  },
  debugList: {
    display: 'grid',
    gap: '0.5rem',
    marginTop: '0.5rem',
    maxHeight: '320px',
    overflow: 'auto',
  },
  debugItem: {
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '0.4rem 0.5rem',
    background: '#fff',
  },
  debugPre: {
    margin: '0.45rem 0 0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '0.78rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
    gap: '0.75rem',
  },
  field: {
    display: 'grid',
    gap: '0.35rem',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  referenceRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  statusBlock: {
    display: 'grid',
    gap: '0.2rem',
    fontSize: '0.92rem',
  },
  select: {
    minHeight: 34,
    borderRadius: 8,
    border: '1px solid #a1a1aa',
    padding: '0.35rem 0.5rem',
    background: '#fff',
  },
  input: {
    flex: '1 1 320px',
    minHeight: 34,
    borderRadius: 8,
    border: '1px solid #a1a1aa',
    padding: '0.35rem 0.5rem',
  },
  button: {
    minHeight: 34,
    borderRadius: 8,
    border: '1px solid #18181b',
    padding: '0.35rem 0.75rem',
    background: '#18181b',
    color: '#fff',
    cursor: 'pointer',
  },
  muted: {
    color: '#52525b',
  },
  error: {
    color: '#b91c1c',
  },
  combinationsPanel: {
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    padding: '1rem',
    display: 'grid',
    gap: '0.75rem',
    background: '#fff',
  },
  combinationMeta: {
    display: 'grid',
    gap: '0.2rem',
    fontSize: '0.9rem',
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #d4d4d8',
    borderRadius: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 720,
  },
  tableHeader: {
    borderBottom: '1px solid #d4d4d8',
    borderRight: '1px solid #e4e4e7',
    padding: '0.5rem',
    verticalAlign: 'top',
    textAlign: 'left',
    background: '#fafafa',
    fontSize: '0.85rem',
    minWidth: 170,
  },
  tableCell: {
    borderBottom: '1px solid #f1f5f9',
    borderRight: '1px solid #f1f5f9',
    padding: '0.45rem 0.5rem',
    verticalAlign: 'top',
    fontSize: '0.85rem',
  },
  cellMeta: {
    color: '#52525b',
    fontSize: '0.78rem',
  },
  emptyCell: {
    padding: '0.8rem',
    color: '#52525b',
    textAlign: 'center',
  },
  filterInput: {
    marginTop: '0.35rem',
    width: '100%',
    minHeight: 30,
    borderRadius: 6,
    border: '1px solid #a1a1aa',
    padding: '0.2rem 0.35rem',
    fontSize: '0.8rem',
  },
  buttonSecondary: {
    minHeight: 34,
    borderRadius: 8,
    border: '1px solid #3f3f46',
    padding: '0.35rem 0.75rem',
    background: '#fff',
    color: '#18181b',
    cursor: 'pointer',
  },
};
