'use client';

// Read-only validation page: this UI only calls select-backed read APIs and the
// replay run API. It never triggers sampler saves, configuration-reference saves,
// audit writes, external PostgreSQL pushes or BigCommerce updates.

import { useCallback, useEffect, useMemo, useState } from 'react';

const RUN_MAX_LIMIT = 25;
const RUN_DEFAULT_LIMIT = 10;

type OptionsResponse = {
  bikeTypes?: string[];
  countries?: string[];
  bikeTypeSource?: string;
  countrySource?: string;
  error?: string;
};

type ReferenceRow = {
  id: number;
  configurationReference: string;
  countryCode: string | null;
  bikeType: string | null;
  ruleset: string | null;
  existingItemCode: string | null;
  productDescription: string | null;
  accountCode: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type ReplayStatus = 'match' | 'different' | 'failed' | 'skipped';

type ReplayStep = {
  order: number;
  sourceFeatureLabel: string;
  sourceOptionLabel: string;
  sourceOptionValue: string;
  action: string;
  resolvedFeatureId?: string;
  resolvedFeatureLabel?: string;
  resolvedOptionId?: string;
  resolvedOptionValue?: string;
  featureMatchStrategy?: string;
  optionMatchStrategy?: string;
  durationMs?: number;
};

type ReplayResultRow = {
  referenceId: number;
  configurationReference: string;
  countryCode: string | null;
  bikeType: string | null;
  ruleset: string | null;
  existingItemCode: string | null;
  replayedItemCode: string | null;
  finalizedItemCode: string | null;
  status: ReplayStatus;
  message?: string;
  error?: string;
  durationMs: number;
  selectionSource: string;
  samplerRowId: number | null;
  selectionCount: number;
  configuredCount: number;
  ignoredCount: number;
  unmatchedCount: number;
  replaySessionId: string | null;
  requestedDetailId: string | null;
  replayHeaderId: string | null;
  replayedDetailId: string | null;
  finalizeSucceeded: boolean;
  steps: ReplayStep[];
};

type ReplaySummary = { total: number; match: number; different: number; failed: number; skipped: number };

const STATUS_LABEL: Record<ReplayStatus, string> = {
  match: 'Match',
  different: 'Different',
  failed: 'Failed',
  skipped: 'Skipped',
};

const statusPillStyle = (status: ReplayStatus) => {
  const palette: Record<ReplayStatus, { background: string; color: string }> = {
    match: { background: '#dff7e6', color: '#126e2b' },
    different: { background: '#fff3cd', color: '#8a5b00' },
    failed: { background: '#fde2e2', color: '#9d1d1d' },
    skipped: { background: '#e9edf5', color: '#475569' },
  };
  return { ...palette[status], display: 'inline-flex', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 800 };
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export default function CpqReplayValidationPage({ permissionLevel }: { permissionLevel: string }) {
  const [bikeTypes, setBikeTypes] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [optionSources, setOptionSources] = useState<{ bikeTypeSource: string; countrySource: string } | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [bikeType, setBikeType] = useState('');
  const [countryCode, setCountryCode] = useState('');

  const [references, setReferences] = useState<ReferenceRow[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [results, setResults] = useState<ReplayResultRow[]>([]);
  const [summary, setSummary] = useState<ReplaySummary | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;
  const overSelected = selectedCount > RUN_MAX_LIMIT;

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/admin/cpq-replay-validation/options', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = (await response.json()) as OptionsResponse;
      if (!response.ok) throw new Error(payload.error ?? 'Failed to load options');
      setBikeTypes(payload.bikeTypes ?? []);
      setCountries(payload.countries ?? []);
      setOptionSources({
        bikeTypeSource: payload.bikeTypeSource ?? '',
        countrySource: payload.countrySource ?? '',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load options');
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const loadReferences = async () => {
    if (!bikeType || !countryCode) {
      setErrorMessage('Select a bike type and a country first.');
      return;
    }
    setReferencesLoading(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const query = new URLSearchParams({ bikeType, countryCode });
      const response = await fetch(`/api/admin/cpq-replay-validation/references?${query.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = (await response.json()) as { rows?: ReferenceRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Failed to load configuration references');
      const rows = payload.rows ?? [];
      setReferences(rows);
      setSelectedIds([]);
      setMessage(`${rows.length} saved configuration reference(s) found for ${bikeType} / ${countryCode}.`);
    } catch (error) {
      setReferences([]);
      setSelectedIds([]);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load configuration references');
    } finally {
      setReferencesLoading(false);
    }
  };

  const toggleReference = (id: number) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  };

  const selectAllVisible = () => setSelectedIds(references.map((row) => row.id));
  const clearSelection = () => setSelectedIds([]);

  const runReplay = async () => {
    if (selectedCount === 0) {
      setErrorMessage('Select at least one configuration reference.');
      return;
    }
    if (overSelected) {
      setErrorMessage(`Select at most ${RUN_MAX_LIMIT} references per run.`);
      return;
    }
    setRunning(true);
    setErrorMessage(null);
    setMessage(`Replaying ${selectedCount} configuration reference(s) sequentially…`);
    try {
      const response = await fetch('/api/admin/cpq-replay-validation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ referenceIds: selectedIds, limit: Math.min(selectedCount, RUN_MAX_LIMIT) }),
      });
      const payload = (await response.json()) as {
        results?: ReplayResultRow[];
        summary?: ReplaySummary;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Replay validation run failed');
      setResults(payload.results ?? []);
      setSummary(payload.summary ?? null);
      const runSummary = payload.summary;
      setMessage(
        runSummary
          ? `Run finished: ${runSummary.match} match, ${runSummary.different} different, ${runSummary.failed} failed, ${runSummary.skipped} skipped.`
          : 'Run finished.',
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Replay validation run failed');
    } finally {
      setRunning(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setSummary(null);
    setMessage(null);
  };

  return (
    <main className="page" style={{ display: 'grid', gap: 12 }}>
      <header>
        <h1 style={{ margin: 0 }}>CPQ replay validation</h1>
        <p className="subtle" style={{ marginTop: 6 }}>
          Re-run saved configuration references without writing to Neon, then compare replayed IPN codes with stored IPN
          codes.
        </p>
        <p className="subtle" style={{ marginTop: 2 }}>Access: {permissionLevel}</p>
      </header>

      <div className="note" role="note">
        <strong>Read-only validation:</strong> this page does not save sampler results, update configuration references,
        write audit logs, or push external PostgreSQL.
      </div>

      {errorMessage ? (
        <div className="note" style={{ background: '#fff1f2', borderColor: '#f4c7c7', color: '#9d1d1d' }}>
          {errorMessage}
        </div>
      ) : null}
      {message ? <p className="subtle" style={{ margin: 0 }}>{message}</p> : null}

      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Bike type
            <select value={bikeType} onChange={(event) => setBikeType(event.target.value)} disabled={optionsLoading || running}>
              <option value="">{optionsLoading ? 'Loading…' : 'Select bike type'}</option>
              {bikeTypes.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Country
            <select
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              disabled={optionsLoading || running}
            >
              <option value="">{optionsLoading ? 'Loading…' : 'Select country'}</option>
              {countries.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void loadReferences()} disabled={referencesLoading || running}>
            {referencesLoading ? 'Loading references…' : 'Load references'}
          </button>
          <button type="button" onClick={() => void loadOptions()} disabled={optionsLoading || running}>
            Refresh dropdowns
          </button>
        </div>
        {optionSources ? (
          <p className="subtle" style={{ margin: 0 }}>
            Bike type source: {optionSources.bikeTypeSource}. Country source: {optionSources.countrySource}.
          </p>
        ) : null}
      </section>

      {references.length > 0 ? (
        <section className="card" style={{ display: 'grid', gap: 8 }}>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <strong>References ({references.length})</strong>
            <button type="button" onClick={selectAllVisible} disabled={running}>
              Select all visible
            </button>
            <button type="button" onClick={clearSelection} disabled={running}>
              Clear selection
            </button>
            <span className="subtle">
              Selected: {selectedCount} (max {RUN_MAX_LIMIT} per run, default batch {RUN_DEFAULT_LIMIT})
            </span>
            <button
              className="primary"
              type="button"
              onClick={() => void runReplay()}
              disabled={running || selectedCount === 0 || overSelected}
              title={overSelected ? `Select at most ${RUN_MAX_LIMIT} references per run.` : undefined}
            >
              {running ? `Running replay validation (${selectedCount})…` : `Run replay validation (${selectedCount})`}
            </button>
            <button type="button" onClick={clearResults} disabled={running || results.length === 0}>
              Clear results
            </button>
          </div>
          {overSelected ? (
            <p className="subtle" style={{ margin: 0, color: '#9d1d1d' }}>
              {selectedCount} references selected — reduce the selection to {RUN_MAX_LIMIT} or fewer before running.
            </p>
          ) : null}
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Configuration reference</th>
                  <th>Bike type / ruleset</th>
                  <th>Country</th>
                  <th>Stored IPN / item code</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {references.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIdSet.has(row.id)}
                        onChange={() => toggleReference(row.id)}
                        disabled={running}
                        aria-label={`Select ${row.configurationReference}`}
                      />
                    </td>
                    <td>{row.configurationReference}</td>
                    <td>
                      {row.bikeType ?? '—'}
                      <div className="subtle">{row.ruleset ?? '—'}</div>
                    </td>
                    <td>{row.countryCode ?? '—'}</td>
                    <td>{row.existingItemCode ?? '—'}</td>
                    <td>{row.productDescription ?? '—'}</td>
                    <td>{row.accountCode ?? '—'}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>{formatDateTime(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="card" style={{ display: 'grid', gap: 8 }}>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <strong>Comparison results</strong>
            {summary ? (
              <span className="subtle">
                Total {summary.total} • Match {summary.match} • Different {summary.different} • Failed {summary.failed} •
                Skipped {summary.skipped}
              </span>
            ) : null}
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Configuration reference</th>
                  <th>Bike type / ruleset</th>
                  <th>Country</th>
                  <th>Stored IPN</th>
                  <th>Replayed IPN</th>
                  <th>Finalize IPN</th>
                  <th>Replay detail id</th>
                  <th>Status</th>
                  <th>Message / error</th>
                  <th>Duration</th>
                  <th>Steps</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={`${row.referenceId}-${row.configurationReference}`}>
                    <td>{row.configurationReference}</td>
                    <td>
                      {row.bikeType ?? '—'}
                      <div className="subtle">{row.ruleset ?? '—'}</div>
                    </td>
                    <td>{row.countryCode ?? '—'}</td>
                    <td>{row.existingItemCode ?? '—'}</td>
                    <td>{row.replayedItemCode ?? '—'}</td>
                    <td>{row.finalizedItemCode ?? '—'}</td>
                    <td>
                      {row.replayedDetailId ?? '—'}
                      <div className="subtle">session {row.replaySessionId ?? '—'}</div>
                    </td>
                    <td>
                      <span style={statusPillStyle(row.status)}>{STATUS_LABEL[row.status]}</span>
                    </td>
                    <td>
                      {row.error ?? row.message ?? '—'}
                      <div className="subtle">
                        source {row.selectionSource}
                        {row.samplerRowId ? ` (sampler ${row.samplerRowId})` : ''} • configured {row.configuredCount}/
                        {row.selectionCount} • ignored {row.ignoredCount} • unmatched {row.unmatchedCount}
                      </div>
                    </td>
                    <td>{row.durationMs} ms</td>
                    <td>
                      <details>
                        <summary>View {row.steps.length}</summary>
                        <pre style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.steps, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
