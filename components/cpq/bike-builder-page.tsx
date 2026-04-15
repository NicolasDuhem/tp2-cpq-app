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

const fallbackRuleset = {
  cpq_ruleset: 'BBLV6_G-LineMY26',
  namespace: 'Default',
  header_id: 'Simulator',
};

const isDebugEnabled = process.env.NEXT_PUBLIC_CPQ_DEBUG === 'true';

const createTraceId = () => crypto.randomUUID();

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

  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
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
      setRequestState({ loading: false });
    } catch (error) {
      setRequestState({ loading: false, error: error instanceof Error ? error.message : 'Configure failed' });
    } finally {
      setActiveFeatureId(null);
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
          header_id: selectedRuleset?.header_id ?? fallbackRuleset.header_id,
          finalized_detail_id: finalizedDetailId,
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
          <button style={styles.button} onClick={() => void startConfiguration()} disabled={requestState.loading}>
            {requestState.loading ? 'Starting…' : 'Start New Session'}
          </button>
          <button style={styles.button} onClick={() => void saveConfiguration()} disabled={saveStatus === 'saving' || !state}>
            {saveStatus === 'saving' ? 'Saving…' : 'Save Configuration'}
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
          {isDebugEnabled && saveTechnicalDetail ? (
            <details>
              <summary>Save technical detail</summary>
              <pre style={styles.debugPre}>{saveTechnicalDetail}</pre>
            </details>
          ) : null}
          <div>Retrieve status: {retrieveMessage}</div>
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
              disabled={requestState.loading || activeFeatureId === feature.featureId}
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
};
