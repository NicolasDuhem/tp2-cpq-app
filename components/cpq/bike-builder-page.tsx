'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminMode } from '@/components/shared/admin-mode-context';
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

type PreviewSelectedOption = {
  featureLabel: string;
  optionLabel: string;
  optionValue: string;
};

type ImageLayer = {
  featureLabel: string;
  optionLabel: string;
  optionValue: string;
  featureLayerOrder: number;
  slot: 1 | 2 | 3 | 4;
  pictureLink: string;
};

type ImageLayerResolution = {
  layers: ImageLayer[];
  matchedSelections: PreviewSelectedOption[];
  unmatchedSelections: PreviewSelectedOption[];
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
  countries: Record<string, boolean>;
  cellsByFeatureKey: Record<string, CombinationCell>;
};

type CombinationDataset = {
  generatedAt: string;
  sessionId: string;
  rows: CombinationRow[];
  columns: CombinationFeatureColumn[];
};
type CombinationFeatureFilterOption = {
  value: string;
  label: string;
  count: number;
};
type CombinationFeatureFilterGroup = {
  stableFeatureKey: string;
  featureLabel: string;
  options: CombinationFeatureFilterOption[];
};

type RowExecutionStatus = 'pending' | 'running' | 'configured' | 'finalized' | 'saved' | 'failed';
type BulkExecutionStage =
  | 'StartConfiguration'
  | 'Feature remap'
  | 'Configure'
  | 'FinalizeConfiguration'
  | 'Save to cpq_configuration_references'
  | 'Save to CPQ_sampler_result';
type RowDiagnosticEvent = {
  timestamp: string;
  stage: BulkExecutionStage;
  direction: 'request' | 'response';
  action: string;
  route: string;
  payload: unknown;
  status?: number;
  traceId?: string;
};
type RowFailureDiagnostics = {
  rowId: string;
  executionKey?: string;
  countryCode?: string | null;
  status: RowExecutionStatus;
  currentStage: BulkExecutionStage | null;
  errorSummary: string | null;
  errorDetails: string | null;
  traceId?: string;
  sessionId?: string | null;
  ignoredFeatures: string[];
  lastRequests: RowDiagnosticEvent[];
  lastResponses: RowDiagnosticEvent[];
};

type BulkProgress = {
  running: boolean;
  totalSelectedRows: number;
  totalCountryAssignments: number;
  totalExecutions: number;
  currentExecutionIndex: number;
  currentRowIndex: number;
  currentRowId: string | null;
  currentCountryCode: string | null;
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

const buildPreviewSelectedOptions = (parsed: NormalizedBikeBuilderState): PreviewSelectedOption[] =>
  parsed.features
    .map((feature) => {
      const selectedOptionId = (feature.selectedOptionId ?? '').trim();
      if (!selectedOptionId) return null;
      const selectedOption =
        feature.availableOptions.find((option) => option.optionId === selectedOptionId) ??
        feature.availableOptions.find((option) => option.selected) ??
        null;
      const optionLabel = (selectedOption?.label ?? selectedOptionId).trim();
      const optionValue = (selectedOption?.value ?? feature.selectedValue ?? feature.currentValue ?? '').trim();
      const featureLabel = feature.featureLabel.trim();
      if (!featureLabel || !optionLabel || !optionValue) return null;

      return {
        featureLabel,
        optionLabel,
        optionValue,
      };
    })
    .filter((entry): entry is PreviewSelectedOption => Boolean(entry));

export default function BikeBuilderPage() {
  const { isAdminMode } = useAdminMode();
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
  const [latestStartSnapshot, setLatestStartSnapshot] = useState<SamplerSourceSnapshot | null>(null);
  const [latestConfigureSnapshot, setLatestConfigureSnapshot] = useState<SamplerSourceSnapshot | null>(null);
  const [latestFinalizeResponse, setLatestFinalizeResponse] = useState<CpqRouteResponse | null>(null);

  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [combinationDataset, setCombinationDataset] = useState<CombinationDataset | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [featureValueFilters, setFeatureValueFilters] = useState<Record<string, string[]>>({});
  const [featureFilterPanelOpen, setFeatureFilterPanelOpen] = useState(true);
  const [showSelectedRowsOnly, setShowSelectedRowsOnly] = useState(false);
  const [bulkCountrySelection, setBulkCountrySelection] = useState<Record<string, boolean>>({});
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [hiddenFeatureColumnKeys, setHiddenFeatureColumnKeys] = useState<Record<string, boolean>>({});
  const [hiddenCountryColumns, setHiddenCountryColumns] = useState<Record<string, boolean>>({});
  const [bulkValidationMessage, setBulkValidationMessage] = useState<string | null>(null);
  const [invalidBulkRowIds, setInvalidBulkRowIds] = useState<string[]>([]);
  const [combinationRowStatuses, setCombinationRowStatuses] = useState<Record<string, RowExecutionStatus>>({});
  const [combinationRowDiagnostics, setCombinationRowDiagnostics] = useState<Record<string, RowFailureDiagnostics>>({});
  const [failedRowModalId, setFailedRowModalId] = useState<string | null>(null);
  const [ignoredFeatureLabels, setIgnoredFeatureLabels] = useState<string[]>([]);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress>({
    running: false,
    totalSelectedRows: 0,
    totalCountryAssignments: 0,
    totalExecutions: 0,
    currentExecutionIndex: 0,
    currentRowIndex: 0,
    currentRowId: null,
    currentCountryCode: null,
    currentSessionId: null,
    currentFeatureKey: null,
    succeeded: 0,
    failed: 0,
    saved: 0,
    message: 'Idle',
  });
  const manualSessionClosedRef = useRef(false);
  const [imageLayerResolution, setImageLayerResolution] = useState<ImageLayerResolution>({
    layers: [],
    matchedSelections: [],
    unmatchedSelections: [],
  });
  const [imageLayerStatus, setImageLayerStatus] = useState<RequestState>({ loading: false });
  const [downloadStatus, setDownloadStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  const selectedRuleset = useMemo(
    () => rulesets.find((entry) => entry.cpq_ruleset === ruleset) ?? null,
    [ruleset, rulesets],
  );

  const selectedAccount = useMemo(
    () => accountContexts.find((entry) => entry.account_code === accountCode) ?? null,
    [accountCode, accountContexts],
  );
  const availableCountryCodes = useMemo(
    () =>
      [...new Set(accountContexts.map((entry) => entry.country_code?.trim().toUpperCase()).filter((entry): entry is string => Boolean(entry)))]
        .sort((a, b) => a.localeCompare(b)),
    [accountContexts],
  );
  const previewSelectedOptions = useMemo(() => (state ? buildPreviewSelectedOptions(state) : []), [state]);

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
      const startSnapshot: SamplerSourceSnapshot = {
        source: 'startconfiguration',
        capturedAt: new Date().toISOString(),
        parsed: responsePayload.parsed,
        rawResponse: responsePayload.rawResponse,
      };
      setLastSamplerSource(startSnapshot);
      setLatestStartSnapshot(startSnapshot);
      setLatestConfigureSnapshot(null);
      setLatestFinalizeResponse(null);
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
    const loadIgnoredFeatures = async () => {
      try {
        const response = await fetch('/api/cpq/setup/picture-management/ignored-features');
        const payload = (await response.json().catch(() => ({ featureLabels: [] }))) as { featureLabels?: string[] };
        setIgnoredFeatureLabels(Array.isArray(payload.featureLabels) ? payload.featureLabels : []);
      } catch {
        setIgnoredFeatureLabels([]);
      }
    };
    void loadIgnoredFeatures();
  }, []);

  useEffect(() => {
    if (!selectedAccount || !ruleset) return;
    void startConfiguration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCode, ruleset]);

  useEffect(() => {
    setCombinationDataset(null);
    setColumnFilters({});
    setFeatureValueFilters({});
    setFeatureFilterPanelOpen(true);
    setShowSelectedRowsOnly(false);
    setBulkCountrySelection({});
    setColumnPickerOpen(false);
    setHiddenFeatureColumnKeys({});
    setHiddenCountryColumns({});
    setBulkValidationMessage(null);
    setInvalidBulkRowIds([]);
    setCombinationRowStatuses({});
    setCombinationRowDiagnostics({});
    setFailedRowModalId(null);
    setBulkProgress({
      running: false,
      totalSelectedRows: 0,
      totalCountryAssignments: 0,
      totalExecutions: 0,
      currentExecutionIndex: 0,
      currentRowIndex: 0,
      currentRowId: null,
      currentCountryCode: null,
      currentSessionId: null,
      currentFeatureKey: null,
      succeeded: 0,
      failed: 0,
      saved: 0,
      message: 'Idle',
    });
  }, [state?.sessionId]);

  useEffect(() => {
    const controller = new AbortController();

    const loadImageLayers = async () => {
      if (!state || previewSelectedOptions.length === 0) {
        setImageLayerResolution({ layers: [], matchedSelections: [], unmatchedSelections: [] });
        setImageLayerStatus({ loading: false });
        return;
      }

      setImageLayerStatus({ loading: true });
      setDownloadStatus({ type: 'idle', message: '' });

      try {
        const response = await fetch('/api/cpq/image-layers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedOptions: previewSelectedOptions }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as ImageLayerResolution & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to resolve image layers');
        }

        setImageLayerResolution({
          layers: Array.isArray(payload.layers) ? payload.layers : [],
          matchedSelections: Array.isArray(payload.matchedSelections) ? payload.matchedSelections : [],
          unmatchedSelections: Array.isArray(payload.unmatchedSelections) ? payload.unmatchedSelections : [],
        });
        setImageLayerStatus({ loading: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        setImageLayerResolution({ layers: [], matchedSelections: [], unmatchedSelections: [] });
        setImageLayerStatus({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to resolve image layers',
        });
      }
    };

    void loadImageLayers();
    return () => controller.abort();
  }, [previewSelectedOptions, state]);

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

    let rows: CombinationRow[] = [{ id: 'row-0', selected: false, countries: {}, cellsByFeatureKey: {} }];

    for (const featureEntry of optionsByFeature) {
      const nextRows: CombinationRow[] = [];

      for (const row of rows) {
        for (const option of featureEntry.options) {
          const optionValue = option.value ?? option.optionId;
          const optionLabel = option.label;
          nextRows.push({
            id: `${row.id}::${featureEntry.stableFeatureKey}:${option.optionId}`,
            selected: false,
            countries: { ...row.countries },
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
    setFeatureValueFilters({});
    setShowSelectedRowsOnly(false);
    setBulkCountrySelection({});
    setBulkValidationMessage(null);
    setInvalidBulkRowIds([]);
  };

  const featureFilterGroups = useMemo<CombinationFeatureFilterGroup[]>(() => {
    if (!combinationDataset) return [];

    return combinationDataset.columns.map((column) => {
      const optionsByValue = new Map<string, CombinationFeatureFilterOption>();

      for (const row of combinationDataset.rows) {
        const cell = row.cellsByFeatureKey[column.stableFeatureKey];
        if (!cell) continue;
        const optionValue = cell.optionValue?.trim() || cell.optionId?.trim() || '(empty)';
        const existing = optionsByValue.get(optionValue);
        if (existing) {
          existing.count += 1;
          continue;
        }
        optionsByValue.set(optionValue, {
          value: optionValue,
          label: cell.optionValue?.trim() || cell.optionLabel?.trim() || cell.optionId,
          count: 1,
        });
      }

      return {
        stableFeatureKey: column.stableFeatureKey,
        featureLabel: column.featureLabel,
        options: [...optionsByValue.values()].sort((a, b) => a.label.localeCompare(b.label)),
      };
    });
  }, [combinationDataset]);

  const activeFeatureFilterSummary = useMemo(
    () =>
      featureFilterGroups
        .map((group) => {
          const selectedValues = featureValueFilters[group.stableFeatureKey] ?? [];
          if (selectedValues.length === 0) return null;
          return `${group.featureLabel}: ${selectedValues.join(', ')}`;
        })
        .filter((entry): entry is string => Boolean(entry)),
    [featureFilterGroups, featureValueFilters],
  );

  const filteredCombinationRows = useMemo(() => {
    if (!combinationDataset) return [];

    return combinationDataset.rows.filter((row) =>
      (!showSelectedRowsOnly || row.selected) &&
      combinationDataset.columns.every((column) => {
        const selectedValuesForFeature = featureValueFilters[column.stableFeatureKey] ?? [];
        if (selectedValuesForFeature.length === 0) return true;
        const cell = row.cellsByFeatureKey[column.stableFeatureKey];
        if (!cell) return false;
        const rowValue = cell.optionValue?.trim() || cell.optionId?.trim() || '(empty)';
        return selectedValuesForFeature.includes(rowValue);
      }) &&
      combinationDataset.columns.every((column) => {
        const filterValue = columnFilters[column.stableFeatureKey]?.trim().toLowerCase();
        if (!filterValue) return true;
        const cell = row.cellsByFeatureKey[column.stableFeatureKey];
        if (!cell) return false;
        const searchableValue = `${cell.optionLabel} ${cell.optionValue} ${cell.optionId}`.toLowerCase();
        return searchableValue.includes(filterValue);
      }),
    );
  }, [columnFilters, combinationDataset, featureValueFilters, showSelectedRowsOnly]);

  const visibleRowIdSet = useMemo(() => new Set(filteredCombinationRows.map((row) => row.id)), [filteredCombinationRows]);
  const visibleSelectedRowsCount = useMemo(() => filteredCombinationRows.filter((row) => row.selected).length, [filteredCombinationRows]);
  const selectedBulkCountryCodes = useMemo(
    () => availableCountryCodes.filter((countryCode) => bulkCountrySelection[countryCode]),
    [availableCountryCodes, bulkCountrySelection],
  );

  const visibleFeatureColumns = useMemo(
    () => (combinationDataset?.columns ?? []).filter((column) => !hiddenFeatureColumnKeys[column.stableFeatureKey]),
    [combinationDataset?.columns, hiddenFeatureColumnKeys],
  );

  const visibleCountryColumns = useMemo(
    () => availableCountryCodes.filter((countryCode) => !hiddenCountryColumns[countryCode]),
    [availableCountryCodes, hiddenCountryColumns],
  );

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
      const configureSnapshot: SamplerSourceSnapshot = {
        source: 'configure',
        capturedAt: new Date().toISOString(),
        parsed: payload.parsed,
        rawResponse: payload.rawResponse,
      };
      setLastSamplerSource(configureSnapshot);
      setLatestConfigureSnapshot(configureSnapshot);
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

  const getLatestSaveSourceState = (): SamplerSourceSnapshot | null => latestConfigureSnapshot ?? latestStartSnapshot;

  const saveSamplerSnapshot = async (
    traceId: string,
    action: string,
    sourceSnapshot: SamplerSourceSnapshot,
    account: AccountContextRecord,
  ) => {
    const capturedPayload = buildCapturedSamplerPayload(sourceSnapshot);
    const samplerResult = await trackedFetch<{ error?: string; row?: { id: number; created_at: string } }>(
      traceId,
      action,
      '/api/cpq/sampler-result',
      {
        ipn_code: capturedPayload.ipn,
        ruleset: sourceSnapshot.parsed.ruleset || ruleset,
        account_code: account.account_code,
        customer_id: account.customer_id,
        currency: account.currency,
        language: account.language,
        country_code: account.country_code,
        namespace: capturedPayload.namespace,
        header_id: capturedPayload.headerId,
        detail_id: capturedPayload.detailId,
        session_id: capturedPayload.sessionId,
        json_result: capturedPayload,
      },
    );

    if (!samplerResult.response.ok || !samplerResult.payload.row) {
      throw new Error(samplerResult.payload.error ?? 'Sampler save failed');
    }

    return { row: samplerResult.payload.row, capturedPayload };
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
      const traceId = createTraceId();
      const { row, capturedPayload } = await saveSamplerSnapshot(traceId, 'SaveCurrentConfigurationToSampler', lastSamplerSource, selectedAccount);

      setSamplerSaveStatus('saved');
      setSamplerSaveMessage(
        `Sampler row ${row.id} saved from ${lastSamplerSource.source} (${capturedPayload.selectedOptions.length} selected options).`,
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
      setLatestFinalizeResponse(finalizeResult.payload);

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

      const saveSource = getLatestSaveSourceState();
      if (!saveSource) {
        setSaveStatus('error');
        setSaveMessage('No Start/Configure response available to build save payload.');
        setSaveTechnicalDetail('Canonical save payload must use latest Configure, otherwise latest StartConfiguration.');
        return;
      }
      const saveSourceState = saveSource.parsed;

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
          source_header_id: saveSourceState.sourceHeaderId ?? selectedRuleset?.header_id ?? fallbackRuleset.header_id,
          source_detail_id: saveSourceState.sourceDetailId ?? null,
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
          final_ipn_code: saveSourceState.ipnCode ?? null,
          product_description: saveSourceState.productDescription ?? null,
          finalize_response_json: finalizeResult.payload.rawResponse,
          json_snapshot: {
            parsed: saveSourceState,
            selectedOptions: buildSamplerSelectedOptions(saveSourceState),
            saveSource: saveSource.source,
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
      const { row: samplerRow } = await saveSamplerSnapshot(traceId, 'AutoSaveSamplerAfterCanonicalSave', saveSource, selectedAccount);
      setSamplerSaveStatus('saved');
      setSamplerSaveDetail(null);
      setSamplerSaveMessage(`Auto-saved sampler row ${samplerRow.id} from ${saveSource.source} after canonical save.`);
      setSaveStatus('saved');
      setSaveMessage(
        `Saved ${saveResult.payload.row.configuration_reference} with finalized detailId ${finalizedDetailId} using ${saveSource.source} snapshot.`,
      );

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
      const retrievedSnapshot: SamplerSourceSnapshot = {
        source: 'startconfiguration',
        capturedAt: new Date().toISOString(),
        parsed: payload.parsed,
        rawResponse: payload.parsed,
      };
      setLastSamplerSource(retrievedSnapshot);
      setLatestStartSnapshot(retrievedSnapshot);
      setLatestConfigureSnapshot(null);
      setLatestFinalizeResponse(null);

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

  const pushRowDiagnosticEvent = (rowId: string, event: RowDiagnosticEvent) => {
    setCombinationRowDiagnostics((current) => {
      const previous = current[rowId] ?? {
        rowId,
        status: 'pending' as RowExecutionStatus,
        currentStage: null,
        errorSummary: null,
        errorDetails: null,
        ignoredFeatures: [],
        lastRequests: [],
        lastResponses: [],
      };
      const nextRequests = event.direction === 'request' ? [...previous.lastRequests, event].slice(-2) : previous.lastRequests;
      const nextResponses = event.direction === 'response' ? [...previous.lastResponses, event].slice(-2) : previous.lastResponses;
      return {
        ...current,
        [rowId]: {
          ...previous,
          currentStage: event.stage,
          lastRequests: nextRequests,
          lastResponses: nextResponses,
          traceId: event.traceId ?? previous.traceId,
        },
      };
    });
  };

  const setRowDiagnosticStatus = (
    rowId: string,
    patch: Partial<Omit<RowFailureDiagnostics, 'rowId' | 'lastRequests' | 'lastResponses' | 'ignoredFeatures'>> & {
      ignoredFeatures?: string[];
    },
  ) => {
    setCombinationRowDiagnostics((current) => {
      const previous = current[rowId] ?? {
        rowId,
        status: 'pending' as RowExecutionStatus,
        currentStage: null,
        errorSummary: null,
        errorDetails: null,
        ignoredFeatures: [],
        lastRequests: [],
        lastResponses: [],
      };
      return {
        ...current,
        [rowId]: {
          ...previous,
          ...patch,
          ignoredFeatures: patch.ignoredFeatures ?? previous.ignoredFeatures,
          executionKey: patch.executionKey ?? previous.executionKey,
          countryCode: patch.countryCode ?? previous.countryCode,
        },
      };
    });
  };

  const trackedBulkFetch = async <T,>(
    rowId: string,
    traceId: string,
    stage: BulkExecutionStage,
    action: string,
    route: string,
    payload: unknown,
    init?: Omit<RequestInit, 'headers' | 'body'>,
  ) => {
    pushRowDiagnosticEvent(rowId, {
      timestamp: new Date().toISOString(),
      stage,
      direction: 'request',
      action,
      route,
      payload,
      traceId,
    });
    const result = await trackedFetch<T>(traceId, action, route, payload, init);
    pushRowDiagnosticEvent(rowId, {
      timestamp: new Date().toISOString(),
      stage,
      direction: 'response',
      action,
      route,
      payload: result.payload,
      status: result.response.status,
      traceId: (result.payload as { traceId?: string })?.traceId ?? traceId,
    });
    return result;
  };

  const resolveAccountContextForCountry = (countryCode: string) => {
    const normalized = countryCode.trim().toUpperCase();
    if (!normalized) return null;
    const byCountry = accountContexts.filter((entry) => entry.country_code.trim().toUpperCase() === normalized);
    if (byCountry.length === 0) return null;
    return byCountry.find((entry) => entry.account_code === selectedAccount?.account_code) ?? byCountry[0];
  };

  const buildCpqContextFromAccount = (account: AccountContextRecord) =>
    ({
      accountCode: account.account_code,
      company: account.account_code,
      accountType: 'Dealer',
      customerId: account.customer_id,
      currency: account.currency,
      language: account.language,
      countryCode: account.country_code,
      customerLocation: account.country_code,
    }) satisfies Partial<BikeBuilderContext>;

  const startFreshSessionForCombinationRowCountry = async (
    rowId: string,
    traceId: string,
    countryContext: AccountContextRecord,
  ) => {

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
      context: buildCpqContextFromAccount(countryContext),
    };

    const { response, payload: responsePayload } = await trackedBulkFetch<CpqRouteResponse>(
      rowId,
      traceId,
      'StartConfiguration',
      'Bulk:StartConfiguration',
      '/api/cpq/init',
      payload,
    );
    if (!response.ok) {
      throw new Error(responsePayload.error ?? 'Bulk StartConfiguration failed');
    }

    return responsePayload.parsed;
  };

  const finalizeAndSaveCombinationRowCountry = async (
    rowId: string,
    traceId: string,
    rowState: NormalizedBikeBuilderState,
    countryContext: AccountContextRecord,
  ) => {
    const finalizePayload: FinalizeConfigurationRequest = { sessionID: rowState.sessionId };
    const finalizeResult = await trackedBulkFetch<CpqRouteResponse>(
      rowId,
      traceId,
      'FinalizeConfiguration',
      'Bulk:FinalizeConfiguration',
      '/api/cpq/finalize',
      finalizePayload,
    );

    if (!finalizeResult.response.ok) {
      throw new Error(finalizeResult.payload.error ?? 'Bulk finalize failed');
    }

    const finalizedState = finalizeResult.payload.parsed;
    const finalizedDetailId = finalizedState.detailId ?? rowState.detailId ?? '';
    if (!finalizedDetailId) {
      throw new Error('Bulk finalize response did not return detailId.');
    }
    const bulkSaveSourceSnapshot: SamplerSourceSnapshot = {
      source: 'configure',
      capturedAt: new Date().toISOString(),
      parsed: rowState,
      rawResponse: rowState,
    };

    const saveResult = await trackedBulkFetch<{ row?: ConfigurationReferenceRow; error?: string; details?: string }>(
      rowId,
      traceId,
      'Save to cpq_configuration_references',
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
        source_header_id: rowState.sourceHeaderId ?? selectedRuleset?.header_id ?? fallbackRuleset.header_id,
        source_detail_id: rowState.sourceDetailId ?? null,
        account_code: countryContext.account_code,
        customer_id: countryContext.customer_id,
        account_type: 'Dealer',
        company: countryContext.account_code,
        currency: countryContext.currency,
        language: countryContext.language,
        country_code: countryContext.country_code,
        customer_location: countryContext.country_code,
        application_instance: process.env.NEXT_PUBLIC_CPQ_INSTANCE ?? null,
        application_name: process.env.NEXT_PUBLIC_CPQ_INSTANCE ?? null,
        finalized_session_id: rowState.sessionId,
        final_ipn_code: rowState.ipnCode ?? null,
        product_description: rowState.productDescription ?? null,
        finalize_response_json: finalizeResult.payload.rawResponse,
        json_snapshot: {
          parsed: rowState,
          selectedOptions: buildSamplerSelectedOptions(rowState),
          saveSource: bulkSaveSourceSnapshot.source,
          finalizeRawResponse: finalizeResult.payload.rawResponse,
          retrievedAt: new Date().toISOString(),
        },
      },
    );

    if (!saveResult.response.ok || !saveResult.payload.row) {
      throw new Error(saveResult.payload.error ?? 'Bulk save reference failed');
    }
    pushRowDiagnosticEvent(rowId, {
      timestamp: new Date().toISOString(),
      stage: 'Save to CPQ_sampler_result',
      direction: 'request',
      action: 'Bulk:AutoSaveSamplerAfterCanonicalSave',
      route: '/api/cpq/sampler-result',
      payload: { sessionId: rowState.sessionId, source: bulkSaveSourceSnapshot.source },
      traceId,
    });
    await saveSamplerSnapshot(traceId, 'Bulk:AutoSaveSamplerAfterCanonicalSave', bulkSaveSourceSnapshot, countryContext);
    pushRowDiagnosticEvent(rowId, {
      timestamp: new Date().toISOString(),
      stage: 'Save to CPQ_sampler_result',
      direction: 'response',
      action: 'Bulk:AutoSaveSamplerAfterCanonicalSave',
      route: '/api/cpq/sampler-result',
      payload: { status: 'ok' },
      status: 200,
      traceId,
    });

    return {
      finalizedState,
      savedRow: saveResult.payload.row,
    };
  };

  const runSelectedCombinationRows = async () => {
    if (!combinationDataset || !selectedAccount) return;
    let latestIgnoredFeatureLabels = ignoredFeatureLabels;
    try {
      const response = await fetch('/api/cpq/setup/picture-management/ignored-features');
      const payload = (await response.json().catch(() => ({ featureLabels: [] }))) as { featureLabels?: string[] };
      latestIgnoredFeatureLabels = Array.isArray(payload.featureLabels) ? payload.featureLabels : [];
      setIgnoredFeatureLabels(latestIgnoredFeatureLabels);
    } catch {
      latestIgnoredFeatureLabels = ignoredFeatureLabels;
    }

    const selectedRows = combinationDataset.rows.filter((row) => row.selected);
    if (selectedRows.length === 0) {
      setBulkProgress((current) => ({ ...current, message: 'No rows are ticked.' }));
      return;
    }
    const invalidRows = selectedRows.filter(
      (row) => !Object.entries(row.countries ?? {}).some(([countryCode, isChecked]) => isChecked && !!resolveAccountContextForCountry(countryCode)),
    );
    if (invalidRows.length > 0) {
      setInvalidBulkRowIds(invalidRows.map((row) => row.id));
      setBulkValidationMessage('Please select at least one valid country for each selected row (missing country).');
      setBulkProgress((current) => ({ ...current, message: 'Validation failed: missing country selection.' }));
      return;
    }
    setInvalidBulkRowIds([]);
    setBulkValidationMessage(null);

    const executionQueue = selectedRows.flatMap((row) =>
      Object.entries(row.countries ?? {})
        .filter(([, isChecked]) => isChecked)
        .map(([countryCode]) => ({ row, countryCode: countryCode.trim().toUpperCase() }))
        .filter((entry) => Boolean(resolveAccountContextForCountry(entry.countryCode))),
    );
    const totalAssignments = executionQueue.length;
    if (totalAssignments === 0) {
      setBulkProgress((current) => ({ ...current, message: 'No country assignment is selected.' }));
      return;
    }

    const nextStatuses = combinationDataset.rows.reduce<Record<string, RowExecutionStatus>>((acc, row) => {
      acc[row.id] = row.selected ? 'pending' : combinationRowStatuses[row.id] ?? 'pending';
      return acc;
    }, {});
    setCombinationRowStatuses(nextStatuses);
    setCombinationRowDiagnostics(
      selectedRows.reduce<Record<string, RowFailureDiagnostics>>((acc, row) => {
        acc[row.id] = {
          rowId: row.id,
          status: 'pending',
          currentStage: null,
          errorSummary: null,
          errorDetails: null,
          sessionId: null,
          traceId: undefined,
          ignoredFeatures: [],
          lastRequests: [],
          lastResponses: [],
        };
        return acc;
      }, {}),
    );
    setBulkProgress({
      running: true,
      totalSelectedRows: selectedRows.length,
      totalCountryAssignments: totalAssignments,
      totalExecutions: totalAssignments,
      currentExecutionIndex: 0,
      currentRowIndex: 0,
      currentRowId: null,
      currentCountryCode: null,
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

    for (const [executionIndex, execution] of executionQueue.entries()) {
      const { row, countryCode } = execution;
      const rowIndex = selectedRows.findIndex((entry) => entry.id === row.id);
      const traceId = createTraceId();
      const executionKey = `${row.id}::${countryCode}::${executionIndex + 1}`;
      const countryContext = resolveAccountContextForCountry(countryCode);
      if (!countryContext) {
        failed += 1;
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'failed' }));
        setRowDiagnosticStatus(row.id, {
          executionKey,
          countryCode,
          status: 'failed',
          errorSummary: `No account context found for country ${countryCode}.`,
          errorDetails: `Setup account context is missing an active row for country ${countryCode}.`,
        });
        continue;
      }
      setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'running' }));
      setRowDiagnosticStatus(row.id, {
        executionKey,
        countryCode,
        status: 'running',
        traceId,
        currentStage: 'StartConfiguration',
        errorSummary: null,
        errorDetails: null,
      });
      setBulkProgress((current) => ({
        ...current,
        currentExecutionIndex: executionIndex + 1,
        currentRowIndex: rowIndex + 1,
        currentRowId: row.id,
        currentCountryCode: countryCode,
        currentSessionId: null,
        currentFeatureKey: null,
        message: `Processing execution ${executionIndex + 1}/${executionQueue.length} (row ${rowIndex + 1}, country ${countryCode})`,
      }));

      try {
        let workingState = await startFreshSessionForCombinationRowCountry(row.id, traceId, countryContext);
        setRowDiagnosticStatus(row.id, { executionKey, countryCode, sessionId: workingState.sessionId });
        setBulkProgress((current) => ({ ...current, currentSessionId: workingState.sessionId }));

        const ignoredFeaturesForRow: string[] = [];
        for (const column of combinationDataset.columns) {
          const rowCell = row.cellsByFeatureKey[column.stableFeatureKey];
          if (!rowCell) continue;

          const isIgnoredFeature = latestIgnoredFeatureLabels.some(
            (featureLabel) => featureLabel.trim().toLowerCase() === column.featureLabel.trim().toLowerCase(),
          );
          if (isIgnoredFeature) {
            ignoredFeaturesForRow.push(column.featureLabel);
            continue;
          }

          setRowDiagnosticStatus(row.id, { currentStage: 'Feature remap' });
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

          setRowDiagnosticStatus(row.id, { currentStage: 'Configure' });
          const { response, payload } = await trackedBulkFetch<CpqRouteResponse>(
            row.id,
            traceId,
            'Configure',
            'Bulk:Configure',
            '/api/cpq/configure',
            {
              sessionId: workingState.sessionId,
              featureId: currentFeature.featureId,
              optionId: targetOption.optionId,
              optionValue: targetOptionValue,
              ruleset,
              context: {
                accountCode: countryContext.account_code,
                customerId: countryContext.customer_id,
                currency: countryContext.currency,
                language: countryContext.language,
                countryCode: countryContext.country_code,
              },
            },
          );

          if (!response.ok) {
            throw new Error(payload.error ?? 'Bulk configure failed');
          }
          workingState = payload.parsed;
          setRowDiagnosticStatus(row.id, { executionKey, countryCode, sessionId: workingState.sessionId });
          setBulkProgress((current) => ({ ...current, currentSessionId: workingState.sessionId }));
        }

        setRowDiagnosticStatus(row.id, { executionKey, countryCode, ignoredFeatures: ignoredFeaturesForRow });
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'configured' }));
        setRowDiagnosticStatus(row.id, { executionKey, countryCode, status: 'configured', currentStage: 'FinalizeConfiguration' });
        const { finalizedState, savedRow } = await finalizeAndSaveCombinationRowCountry(row.id, traceId, workingState, countryContext);
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'finalized' }));
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'saved' }));
        setRowDiagnosticStatus(row.id, { executionKey, countryCode, status: 'saved', currentStage: null, errorSummary: null, errorDetails: null });
        setLastSavedReference(savedRow);
        succeeded += 1;
        saved += 1;
        setBulkProgress((current) => ({
          ...current,
          currentSessionId: finalizedState.sessionId,
          succeeded,
          saved,
          message: `Execution ${executionIndex + 1}/${executionQueue.length} saved (${savedRow.configuration_reference}).`,
        }));
      } catch (error) {
        failed += 1;
        setCombinationRowStatuses((current) => ({ ...current, [row.id]: 'failed' }));
        setRowDiagnosticStatus(row.id, {
          executionKey,
          countryCode,
          status: 'failed',
          errorSummary: error instanceof Error ? error.message : `Execution ${executionIndex + 1} failed.`,
          errorDetails: error instanceof Error ? error.stack ?? error.message : String(error),
        });
        setBulkProgress((current) => ({
          ...current,
          failed,
          message: error instanceof Error ? error.message : `Execution ${executionIndex + 1} failed.`,
        }));
      }
    }

    setBulkProgress((current) => ({
      ...current,
      running: false,
      currentFeatureKey: null,
      currentSessionId: null,
      currentCountryCode: null,
      message: `Bulk run finished: ${succeeded} succeeded, ${failed} failed, ${saved} saved.`,
    }));
  };

  const applyCountriesToVisibleRows = (checked: boolean) => {
    if (selectedBulkCountryCodes.length === 0) return;
    setBulkValidationMessage(null);
    setInvalidBulkRowIds([]);

    setCombinationDataset((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => {
              if (!visibleRowIdSet.has(row.id) || !row.selected) return row;
              const nextCountries = { ...row.countries };
              for (const countryCode of selectedBulkCountryCodes) {
                nextCountries[countryCode] = checked;
              }
              return {
                ...row,
                countries: nextCountries,
              };
            }),
          }
        : current,
    );
  };

  const orderedPreviewLayers = [...imageLayerResolution.layers]
    .sort((left, right) => {
      if (left.featureLayerOrder !== right.featureLayerOrder) return right.featureLayerOrder - left.featureLayerOrder;
      if (left.featureLabel !== right.featureLabel) return left.featureLabel.localeCompare(right.featureLabel);
      if (left.optionLabel !== right.optionLabel) return left.optionLabel.localeCompare(right.optionLabel);
      return left.slot - right.slot;
    })
    .map((layer, index) => ({
      ...layer,
      order: index + 1,
    }));
  const activeFailedRowDiagnostic = failedRowModalId ? combinationRowDiagnostics[failedRowModalId] ?? null : null;

  const handleDownloadCurrentPreview = async () => {
    if (orderedPreviewLayers.length === 0) {
      setDownloadStatus({ type: 'error', message: 'No image layers available for download.' });
      return;
    }

    setDownloadStatus({ type: 'idle', message: '' });

    try {
      const loadedImages = await Promise.all(
        orderedPreviewLayers.map(
          (layer) =>
            new Promise<{ layer: (typeof orderedPreviewLayers)[number]; image: HTMLImageElement }>((resolve, reject) => {
              const image = new Image();
              image.crossOrigin = 'anonymous';
              image.onload = () => resolve({ layer, image });
              image.onerror = () => reject(new Error(`Failed to load layer image: ${layer.pictureLink}`));
              image.src = layer.pictureLink;
            }),
        ),
      );

      const width = Math.max(...loadedImages.map((entry) => entry.image.naturalWidth), 1200);
      const height = Math.max(...loadedImages.map((entry) => entry.image.naturalHeight), 900);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');

      context.clearRect(0, 0, width, height);
      for (const { image } of loadedImages) {
        const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        const x = (width - drawWidth) / 2;
        const y = (height - drawHeight) / 2;
        context.drawImage(image, x, y, drawWidth, drawHeight);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Could not export preview image.'))), 'image/png');
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const safeRuleset = (ruleset || 'ruleset').replace(/[^a-zA-Z0-9-_]/g, '_');
      const identityToken = state?.configurationReference || state?.ipnCode || new Date().toISOString().replace(/[:.]/g, '-');
      anchor.href = objectUrl;
      anchor.download = `cpq-preview-${safeRuleset}-${identityToken}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      setDownloadStatus({ type: 'success', message: 'Preview downloaded as PNG.' });
    } catch (error) {
      setDownloadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Preview download failed.',
      });
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.controls}>
        <div style={styles.controlsHeader}>
          <div>
            <h1 style={styles.sectionTitle}>CPQ Manual Configuration Lifecycle</h1>
            <p style={styles.muted}>StartConfiguration → Configure → FinalizeConfiguration → Save reference → Retrieve by reference.</p>
          </div>
          {isAdminMode ? <span style={styles.adminBadge}>Admin mode</span> : null}
        </div>

        <div style={styles.compactControlStrip}>
          <label style={styles.compactField}>
            <span>Account code</span>
            <select value={accountCode} onChange={(event) => setAccountCode(event.target.value)} style={styles.select}>
              {accountContexts.map((item) => (
                <option key={item.id} value={item.account_code}>
                  {item.account_code} ({item.country_code}, {item.currency})
                </option>
              ))}
            </select>
          </label>

          <label style={styles.compactField}>
            <span>Ruleset</span>
            <select value={ruleset} onChange={(event) => setRuleset(event.target.value)} style={styles.select}>
              {rulesets.map((item) => (
                <option key={item.id} value={item.cpq_ruleset}>
                  {item.cpq_ruleset}
                </option>
              ))}
            </select>
          </label>

          <div style={styles.actionButtonsWrap}>
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

        {isAdminMode ? (
          <div style={styles.statusBlock}>
            <div>Session: {state?.sessionId ?? 'none (session closed or not started)'}</div>
            <div>DetailId: {state?.detailId ?? '-'}</div>
            <div>IPN: {state?.ipnCode ?? '-'}</div>
            <div>Save status: {saveMessage}</div>
            <div>
              Save source tracker: configure={latestConfigureSnapshot ? 'available' : 'none'} / start=
              {latestStartSnapshot ? 'available' : 'none'}
            </div>
            <div>Last finalize response tracked: {latestFinalizeResponse ? 'yes (kept separate from save payload)' : 'no'}</div>
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
              Bulk run: {bulkProgress.message} (rows: {bulkProgress.totalSelectedRows}, assignments: {bulkProgress.totalCountryAssignments},
              executions: {bulkProgress.totalExecutions}, current execution: {bulkProgress.currentExecutionIndex || '-'}, row:{' '}
              {bulkProgress.currentRowIndex || '-'}, country: {bulkProgress.currentCountryCode ?? '-'}, succeeded: {bulkProgress.succeeded}, failed:{' '}
              {bulkProgress.failed}, saved: {bulkProgress.saved})
            </div>
            <div>Bulk current session: {bulkProgress.currentSessionId ?? '-'}</div>
            <div>Bulk current feature: {bulkProgress.currentFeatureKey ?? '-'}</div>
            {requestState.error && <div style={styles.error}>Runtime error: {requestState.error}</div>}
          </div>
        ) : requestState.error ? (
          <div style={styles.error}>Runtime error: {requestState.error}</div>
        ) : null}
      </section>

      <section style={styles.mainWorkspace}>
        <section style={styles.configurator}>
          <h2 style={styles.sectionSubtitle}>Configurator</h2>
          <div style={styles.configuratorScrollArea}>
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
          </div>
        </section>

        <section style={styles.previewCard}>
          <div style={styles.previewHeaderRow}>
            <div>
              <h2 style={styles.previewTitle}>Layered Product Preview</h2>
              <p style={styles.previewSubtitle}>Live composition from current selected options matched against picture management mappings.</p>
            </div>
            <button
              style={styles.button}
              onClick={() => void handleDownloadCurrentPreview()}
              disabled={orderedPreviewLayers.length === 0 || imageLayerStatus.loading}
            >
              Download current preview
            </button>
          </div>

          <div style={styles.previewMetaRow}>
            <span style={styles.previewChip}>Layers: {orderedPreviewLayers.length}</span>
            <span style={styles.previewChip}>Matched mappings: {imageLayerResolution.matchedSelections.length}</span>
            <span style={styles.previewChip}>Unmatched selections: {imageLayerResolution.unmatchedSelections.length}</span>
          </div>

          <div style={styles.previewViewport}>
            {imageLayerStatus.loading ? <div style={styles.previewEmpty}>Loading layered preview…</div> : null}
            {!imageLayerStatus.loading && orderedPreviewLayers.length === 0 ? <div style={styles.previewEmpty}>No image layers available.</div> : null}
            {!imageLayerStatus.loading &&
              orderedPreviewLayers.map((layer) => (
                <img
                  key={`${layer.featureLabel}-${layer.optionLabel}-${layer.optionValue}-${layer.slot}-${layer.order}`}
                  src={layer.pictureLink}
                  alt={`${layer.featureLabel} - ${layer.optionLabel} (${layer.optionValue})`}
                  style={styles.previewLayerImage}
                  loading="lazy"
                />
              ))}
          </div>

          <details style={styles.previewDetails}>
            <summary>Preview matching details</summary>
            <div style={styles.previewDetailsBody}>
              <div>Layer ordering rule: feature layer order (20 drawn first … 1 drawn last on top), then picture link slot 1 → 4.</div>
              <div>
                Matched rows:
                {imageLayerResolution.matchedSelections.length === 0
                  ? ' none'
                  : ` ${imageLayerResolution.matchedSelections.map((entry) => `${entry.featureLabel} / ${entry.optionLabel} / ${entry.optionValue}`).join('; ')}`}
              </div>
            </div>
          </details>

          {downloadStatus.message ? <div style={downloadStatus.type === 'error' ? styles.error : styles.previewDownloadSuccess}>{downloadStatus.message}</div> : null}
          {imageLayerStatus.error ? <div style={styles.error}>Preview error: {imageLayerStatus.error}</div> : null}
        </section>
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

      {isAdminMode && isDebugEnabled ? (
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
      ) : null}

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
              <div>Countries in setup context: {availableCountryCodes.length > 0 ? availableCountryCodes.join(', ') : '-'}</div>
              <div>
                Bulk progress: rows {bulkProgress.totalSelectedRows} · country assignments {bulkProgress.totalCountryAssignments} · executions{' '}
                {bulkProgress.totalExecutions}
              </div>
              {bulkProgress.currentRowId ? (
                <div>
                  Running: execution {bulkProgress.currentExecutionIndex}/{bulkProgress.totalExecutions} · row {bulkProgress.currentRowIndex} ·
                  country {bulkProgress.currentCountryCode ?? '-'} · feature {bulkProgress.currentFeatureKey ?? '-'}
                </div>
              ) : null}
            </div>
            <details
              open={featureFilterPanelOpen}
              onToggle={(event) => setFeatureFilterPanelOpen(event.currentTarget.open)}
              style={styles.featureFilterPanel}
            >
              <summary>Feature filters ({activeFeatureFilterSummary.length} active)</summary>
              <div style={styles.featureFilterPanelBody}>
                <div style={styles.row}>
                  <div style={styles.cellMeta}>Filter logic: OR within the same feature, AND across features.</div>
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => setFeatureValueFilters({})}
                    disabled={activeFeatureFilterSummary.length === 0 || bulkProgress.running}
                  >
                    Clear all feature filters
                  </button>
                </div>
                {activeFeatureFilterSummary.length > 0 ? (
                  <div style={styles.featureFilterSummaryWrap}>
                    {activeFeatureFilterSummary.map((entry) => (
                      <span key={entry} style={styles.featureFilterChip}>
                        {entry}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={styles.cellMeta}>No active feature filters.</div>
                )}
                <div style={styles.featureFilterGrid}>
                  {featureFilterGroups.map((group) => (
                    <div key={`feature-filter-${group.stableFeatureKey}`} style={styles.featureFilterGroup}>
                      <strong>{group.featureLabel}</strong>
                      <div style={styles.featureFilterOptions}>
                        {group.options.map((option) => {
                          const checked = (featureValueFilters[group.stableFeatureKey] ?? []).includes(option.value);
                          return (
                            <label key={`${group.stableFeatureKey}-${option.value}`} style={styles.inlineCheck}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={bulkProgress.running}
                                onChange={(event) =>
                                  setFeatureValueFilters((current) => {
                                    const currentValues = current[group.stableFeatureKey] ?? [];
                                    const nextValues = event.target.checked
                                      ? [...new Set([...currentValues, option.value])]
                                      : currentValues.filter((entry) => entry !== option.value);
                                    if (nextValues.length === 0) {
                                      const next = { ...current };
                                      delete next[group.stableFeatureKey];
                                      return next;
                                    }
                                    return {
                                      ...current,
                                      [group.stableFeatureKey]: nextValues,
                                    };
                                  })
                                }
                              />
                              <span>
                                {option.label} ({option.count})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
            <div style={styles.row}>
              <label style={styles.inlineCheck}>
                <input
                  type="checkbox"
                  checked={showSelectedRowsOnly}
                  onChange={(event) => setShowSelectedRowsOnly(event.target.checked)}
                  disabled={bulkProgress.running}
                />
                Show selected only
              </label>
              <details open={columnPickerOpen} onToggle={(event) => setColumnPickerOpen(event.currentTarget.open)} style={styles.columnPicker}>
                <summary>Columns</summary>
                <div style={styles.columnPickerBody}>
                  <strong style={styles.columnPickerTitle}>Feature columns</strong>
                  {combinationDataset.columns.map((column) => (
                    <label key={`pick-feature-${column.stableFeatureKey}`} style={styles.inlineCheck}>
                      <input
                        type="checkbox"
                        checked={!hiddenFeatureColumnKeys[column.stableFeatureKey]}
                        onChange={(event) =>
                          setHiddenFeatureColumnKeys((current) => ({
                            ...current,
                            [column.stableFeatureKey]: !event.target.checked,
                          }))
                        }
                      />
                      {column.featureLabel}
                    </label>
                  ))}
                  <strong style={styles.columnPickerTitle}>Country columns</strong>
                  {availableCountryCodes.map((countryCode) => (
                    <label key={`pick-country-${countryCode}`} style={styles.inlineCheck}>
                      <input
                        type="checkbox"
                        checked={!hiddenCountryColumns[countryCode]}
                        onChange={(event) =>
                          setHiddenCountryColumns((current) => ({
                            ...current,
                            [countryCode]: !event.target.checked,
                          }))
                        }
                      />
                      {countryCode}
                    </label>
                  ))}
                </div>
              </details>
            </div>
            <div style={styles.row}>
              <button
                style={styles.button}
                onClick={() =>
                  setCombinationDataset((current) =>
                    current
                      ? {
                          ...current,
                          rows: current.rows.map((row) =>
                            visibleRowIdSet.has(row.id) ? { ...row, selected: true } : row,
                          ),
                        }
                      : current,
                  )
                }
                disabled={filteredCombinationRows.length === 0 || bulkProgress.running}
              >
                Select all visible rows
              </button>
              <button
                style={styles.buttonSecondary}
                onClick={() =>
                  setCombinationDataset((current) =>
                    current
                      ? {
                          ...current,
                          rows: current.rows.map((row) => (visibleRowIdSet.has(row.id) ? { ...row, selected: false } : row)),
                        }
                      : current,
                  )
                }
                disabled={filteredCombinationRows.length === 0 || bulkProgress.running}
              >
                Unselect all visible rows
              </button>
              <button
                style={styles.buttonSecondary}
                onClick={() =>
                  setCombinationDataset((current) =>
                    current
                      ? {
                          ...current,
                          rows: current.rows.map((row) => ({ ...row, selected: false, countries: {} })),
                        }
                      : current,
                  )
                }
                disabled={combinationDataset.rows.length === 0 || bulkProgress.running}
              >
                Untick all rows and countries
              </button>
              <button
                style={styles.button}
                onClick={() => void runSelectedCombinationRows()}
                disabled={bulkProgress.running || !combinationDataset.rows.some((row) => row.selected)}
              >
                {bulkProgress.running ? 'Configuring ticked items…' : 'Configure all ticked items'}
              </button>
            </div>
            <div style={styles.bulkCountryPanel}>
              <strong>Visible-row country actions</strong>
              <div style={styles.cellMeta}>
                Applies to visible rows that are selected ({visibleSelectedRowsCount}/{filteredCombinationRows.length} visible rows selected).
              </div>
              <div style={styles.row}>
                {availableCountryCodes.map((countryCode) => (
                  <label key={`bulk-country-${countryCode}`} style={styles.inlineCheck}>
                    <input
                      type="checkbox"
                      checked={Boolean(bulkCountrySelection[countryCode])}
                      disabled={bulkProgress.running}
                      onChange={(event) =>
                        setBulkCountrySelection((current) => ({
                          ...current,
                          [countryCode]: event.target.checked,
                        }))
                      }
                    />
                    {countryCode}
                  </label>
                ))}
              </div>
              <div style={styles.row}>
                <button
                  style={styles.button}
                  onClick={() => applyCountriesToVisibleRows(true)}
                  disabled={bulkProgress.running || visibleSelectedRowsCount === 0 || selectedBulkCountryCodes.length === 0}
                >
                  Tick selected countries on visible rows
                </button>
                <button
                  style={styles.buttonSecondary}
                  onClick={() => applyCountriesToVisibleRows(false)}
                  disabled={bulkProgress.running || visibleSelectedRowsCount === 0 || selectedBulkCountryCodes.length === 0}
                >
                  Untick selected countries on visible rows
                </button>
              </div>
            </div>
            {bulkValidationMessage ? <div style={styles.error}>{bulkValidationMessage}</div> : null}
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Select</th>
                    <th style={styles.tableHeader}>Status</th>
                    {visibleCountryColumns.map((countryCode) => (
                      <th key={`country-${countryCode}`} style={styles.tableHeaderCompact}>{countryCode}</th>
                    ))}
                    {visibleFeatureColumns.map((column) => (
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
                    <tr key={row.id} style={invalidBulkRowIds.includes(row.id) ? styles.invalidRow : undefined}>
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
                      <td style={styles.tableCell}>
                        <div>
                          {combinationRowStatuses[row.id] ?? 'pending'}
                          {combinationRowDiagnostics[row.id]?.countryCode ? ` · ${combinationRowDiagnostics[row.id]?.countryCode}` : ''}
                          {combinationRowDiagnostics[row.id]?.currentStage ? ` · ${combinationRowDiagnostics[row.id]?.currentStage}` : ''}
                        </div>
                        {combinationRowDiagnostics[row.id]?.ignoredFeatures.length ? (
                          <div style={styles.cellMeta}>
                            Ignored: {combinationRowDiagnostics[row.id]?.ignoredFeatures.join(', ')}
                          </div>
                        ) : null}
                        {combinationRowStatuses[row.id] === 'failed' ? (
                          <>
                            <div style={styles.error}>{combinationRowDiagnostics[row.id]?.errorSummary ?? 'Failed'}</div>
                            <button style={styles.inspectButton} onClick={() => setFailedRowModalId(row.id)}>
                              Inspect failure
                            </button>
                          </>
                        ) : null}
                      </td>
                      {visibleCountryColumns.map((countryCode) => (
                        <td key={`${row.id}-country-${countryCode}`} style={styles.tableCellCompact}>
                          <input
                            type="checkbox"
                            checked={Boolean(row.countries?.[countryCode])}
                            disabled={!row.selected || bulkProgress.running}
                            onChange={(event) =>
                              setCombinationDataset((current) =>
                                current
                                  ? {
                                      ...current,
                                      rows: current.rows.map((entry) =>
                                        entry.id === row.id
                                          ? {
                                              ...entry,
                                              countries: {
                                                ...entry.countries,
                                                [countryCode]: event.target.checked,
                                              },
                                            }
                                          : entry,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </td>
                      ))}
                      {visibleFeatureColumns.map((column) => {
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
                      <td colSpan={visibleFeatureColumns.length + visibleCountryColumns.length + 2} style={styles.emptyCell}>
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
      {activeFailedRowDiagnostic ? (
        <div style={styles.modalBackdrop} onClick={() => setFailedRowModalId(null)}>
          <div style={styles.failureModal} onClick={(event) => event.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Bulk row failure details</h3>
            <div>Row: {activeFailedRowDiagnostic.rowId}</div>
            <div>Status: {activeFailedRowDiagnostic.status}</div>
            <div>Execution: {activeFailedRowDiagnostic.executionKey ?? '-'}</div>
            <div>Country: {activeFailedRowDiagnostic.countryCode ?? '-'}</div>
            <div>Stage: {activeFailedRowDiagnostic.currentStage ?? '-'}</div>
            <div>TraceId: {activeFailedRowDiagnostic.traceId ?? '-'}</div>
            <div>SessionId: {activeFailedRowDiagnostic.sessionId ?? '-'}</div>
            <div style={styles.error}>Why: {activeFailedRowDiagnostic.errorSummary ?? '-'}</div>
            {activeFailedRowDiagnostic.errorDetails ? <div style={styles.cellMeta}>Details: {activeFailedRowDiagnostic.errorDetails}</div> : null}
            {activeFailedRowDiagnostic.ignoredFeatures.length ? (
              <div style={styles.cellMeta}>Ignored features for this row: {activeFailedRowDiagnostic.ignoredFeatures.join(', ')}</div>
            ) : null}

            <div>
              <strong>Last 2 requests</strong>
              {activeFailedRowDiagnostic.lastRequests.length === 0 ? (
                <div style={styles.cellMeta}>No requests captured.</div>
              ) : (
                activeFailedRowDiagnostic.lastRequests.map((entry) => (
                  <details key={`${entry.timestamp}-${entry.action}-req`} style={styles.failureDetailBlock}>
                    <summary>{entry.timestamp} · {entry.stage} · {entry.action}</summary>
                    <pre style={styles.debugPre}>{JSON.stringify(entry.payload, null, 2)}</pre>
                  </details>
                ))
              )}
            </div>
            <div>
              <strong>Last 2 responses</strong>
              {activeFailedRowDiagnostic.lastResponses.length === 0 ? (
                <div style={styles.cellMeta}>No responses captured.</div>
              ) : (
                activeFailedRowDiagnostic.lastResponses.map((entry) => (
                  <details key={`${entry.timestamp}-${entry.action}-res`} style={styles.failureDetailBlock}>
                    <summary>{entry.timestamp} · {entry.stage} · status {entry.status ?? '-'}</summary>
                    <pre style={styles.debugPre}>{JSON.stringify(entry.payload, null, 2)}</pre>
                  </details>
                ))
              )}
            </div>
            <div style={styles.row}>
              <button style={styles.button} onClick={() => setFailedRowModalId(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1560,
    margin: '0 auto',
    padding: '0.75rem 1rem 1rem',
    display: 'grid',
    gap: '0.75rem',
    width: '100%',
    minHeight: 0,
    alignContent: 'start',
  },
  controls: {
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    padding: '0.75rem',
    display: 'grid',
    gap: '0.6rem',
    background: '#fff',
  },
  controlsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.35rem',
  },
  sectionSubtitle: {
    margin: 0,
    fontSize: '1.1rem',
  },
  adminBadge: {
    border: '1px solid #0f766e',
    background: '#ecfeff',
    color: '#0f766e',
    borderRadius: 999,
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.2rem 0.6rem',
  },
  compactControlStrip: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 320px) minmax(220px, 320px) minmax(0, 1fr)',
    gap: '0.6rem',
    alignItems: 'end',
  },
  compactField: {
    display: 'grid',
    gap: '0.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#3f3f46',
  },
  actionButtonsWrap: {
    display: 'flex',
    gap: '0.45rem',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  mainWorkspace: {
    display: 'grid',
    gridTemplateColumns: 'minmax(360px, 1fr) minmax(420px, 1.1fr)',
    gap: '0.75rem',
    alignItems: 'stretch',
  },
  configurator: {
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    padding: '0.75rem',
    display: 'grid',
    gap: '0.6rem',
    background: '#fff',
    minHeight: 0,
  },
  configuratorScrollArea: {
    maxHeight: '44vh',
    minHeight: 220,
    overflow: 'auto',
    paddingRight: '0.2rem',
    display: 'grid',
    gap: '0.6rem',
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
    gap: '0.28rem',
    fontSize: '0.85rem',
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
    alignItems: 'center',
  },
  statusBlock: {
    display: 'grid',
    gap: '0.2rem',
    fontSize: '0.92rem',
  },
  select: {
    minHeight: 32,
    borderRadius: 8,
    border: '1px solid #a1a1aa',
    padding: '0.35rem 0.5rem',
    background: '#fff',
  },
  input: {
    flex: '1 1 320px',
    minHeight: 32,
    borderRadius: 8,
    border: '1px solid #a1a1aa',
    padding: '0.35rem 0.5rem',
  },
  button: {
    minHeight: 32,
    borderRadius: 8,
    border: '1px solid #18181b',
    padding: '0.25rem 0.65rem',
    background: '#18181b',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.84rem',
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
    padding: '0.75rem',
    display: 'grid',
    gap: '0.75rem',
    background: '#fff',
  },
  featureFilterPanel: {
    border: '1px solid #d4d4d8',
    borderRadius: 10,
    padding: '0.4rem 0.55rem',
    background: '#f8fafc',
  },
  featureFilterPanelBody: {
    display: 'grid',
    gap: '0.6rem',
    marginTop: '0.45rem',
  },
  featureFilterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
    gap: '0.5rem',
  },
  featureFilterGroup: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '0.5rem',
    background: '#fff',
    display: 'grid',
    gap: '0.4rem',
  },
  featureFilterOptions: {
    display: 'grid',
    gap: '0.3rem',
    maxHeight: 180,
    overflow: 'auto',
  },
  featureFilterSummaryWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.35rem',
  },
  featureFilterChip: {
    border: '1px solid #cbd5e1',
    borderRadius: 999,
    padding: '0.2rem 0.5rem',
    background: '#fff',
    fontSize: '0.78rem',
    color: '#334155',
  },
  combinationMeta: {
    display: 'grid',
    gap: '0.2rem',
    fontSize: '0.9rem',
  },
  bulkCountryPanel: {
    border: '1px solid #d4d4d8',
    borderRadius: 10,
    padding: '0.6rem',
    background: '#f8fafc',
    display: 'grid',
    gap: '0.5rem',
  },
  tableWrap: {
    overflow: 'auto',
    border: '1px solid #d4d4d8',
    borderRadius: 8,
    maxHeight: '48vh',
    width: '100%',
  },
  table: {
    width: 'max-content',
    borderCollapse: 'collapse',
    minWidth: '100%',
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
  tableHeaderCompact: {
    borderBottom: '1px solid #d4d4d8',
    borderRight: '1px solid #e4e4e7',
    padding: '0.5rem',
    verticalAlign: 'top',
    textAlign: 'center',
    background: '#fafafa',
    fontSize: '0.82rem',
    minWidth: 70,
  },
  tableCell: {
    borderBottom: '1px solid #f1f5f9',
    borderRight: '1px solid #f1f5f9',
    padding: '0.45rem 0.5rem',
    verticalAlign: 'top',
    fontSize: '0.85rem',
  },
  tableCellCompact: {
    borderBottom: '1px solid #f1f5f9',
    borderRight: '1px solid #f1f5f9',
    padding: '0.45rem 0.5rem',
    textAlign: 'center',
    verticalAlign: 'middle',
    fontSize: '0.82rem',
  },
  inlineCheck: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  columnPicker: {
    border: '1px solid #d4d4d8',
    borderRadius: 8,
    padding: '0.3rem 0.5rem',
    background: '#fafafa',
  },
  columnPickerBody: {
    display: 'grid',
    gap: '0.35rem',
    marginTop: '0.4rem',
    maxHeight: 240,
    overflow: 'auto',
  },
  columnPickerTitle: {
    fontSize: '0.78rem',
    color: '#3f3f46',
    marginTop: '0.2rem',
  },
  invalidRow: {
    background: '#fef2f2',
    outline: '1px solid #fca5a5',
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
    minHeight: 32,
    borderRadius: 8,
    border: '1px solid #3f3f46',
    padding: '0.25rem 0.65rem',
    background: '#fff',
    color: '#18181b',
    cursor: 'pointer',
  },
  inspectButton: {
    marginTop: '0.35rem',
    minHeight: 28,
    borderRadius: 6,
    border: '1px solid #3f3f46',
    padding: '0.2rem 0.45rem',
    background: '#fff',
    color: '#18181b',
    cursor: 'pointer',
    fontSize: '0.78rem',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    padding: '1rem',
  },
  failureModal: {
    width: 'min(920px, 96vw)',
    maxHeight: '90vh',
    overflow: 'auto',
    borderRadius: 12,
    background: '#fff',
    border: '1px solid #d4d4d8',
    padding: '1rem',
    display: 'grid',
    gap: '0.55rem',
  },
  failureDetailBlock: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '0.4rem 0.5rem',
    marginTop: '0.35rem',
    background: '#fafafa',
  },
  previewCard: {
    border: '1px solid #d4d4d8',
    borderRadius: 12,
    padding: '0.75rem',
    display: 'grid',
    gap: '0.75rem',
    background: '#fff',
  },
  previewHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.75rem',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  previewTitle: {
    margin: 0,
  },
  previewSubtitle: {
    margin: '0.25rem 0 0',
    color: '#52525b',
    fontSize: '0.9rem',
  },
  previewMetaRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  previewChip: {
    display: 'inline-flex',
    border: '1px solid #d4d4d8',
    borderRadius: 999,
    padding: '0.2rem 0.55rem',
    fontSize: '0.82rem',
    color: '#27272a',
    background: '#fafafa',
  },
  previewViewport: {
    position: 'relative',
    height: 'min(33vw, 420px)',
    minHeight: 260,
    maxHeight: 420,
    borderRadius: 14,
    border: '1px solid #d4d4d8',
    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLayerImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'center',
    pointerEvents: 'none',
  },
  previewEmpty: {
    color: '#52525b',
    fontSize: '0.95rem',
  },
  previewDetails: {
    border: '1px solid #e4e4e7',
    borderRadius: 8,
    padding: '0.45rem 0.6rem',
    background: '#fafafa',
    fontSize: '0.82rem',
    color: '#3f3f46',
  },
  previewDetailsBody: {
    marginTop: '0.45rem',
    display: 'grid',
    gap: '0.35rem',
    lineHeight: 1.45,
  },
  previewDownloadSuccess: {
    color: '#166534',
    fontSize: '0.9rem',
  },
};
