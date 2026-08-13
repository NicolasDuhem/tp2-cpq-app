'use client';

// Replay validation page.
//
// Loading dropdowns, listing references and running the replay are all read-only.
// The one writing action is "Apply selected replay results", which requires Admin access and
// archives the previous row content before updating the existing rows. It also performs one
// targeted external PostgreSQL update (variant_eligibilities."DetailId" only). Nothing on this
// page inserts live rows, runs the full external push, or updates BigCommerce.

import { useCallback, useEffect, useMemo, useState } from 'react';

const RUN_MAX_LIMIT = 25;
const RUN_DEFAULT_LIMIT = 10;
const OVERWRITE_MAX_ROWS = 25;
const OVERWRITE_CONFIRM_PHRASE = 'OVERWRITE';

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

type OverwriteStatus = 'updated' | 'skipped' | 'failed';

type ExternalEligibilityStatus = 'updated' | 'skipped' | 'warning' | 'failed';

type ExternalEligibilityDetailUpdate = {
  attempted: boolean;
  updatedRows: number;
  status: ExternalEligibilityStatus;
  message?: string;
  sku?: string | null;
  countryCode?: string | null;
  previousDetailId?: string | null;
  newDetailId?: string | null;
};

type OverwriteResultRow = {
  configurationReferenceId: number;
  configurationReference: string;
  existingItemCode: string | null;
  replayedItemCode: string | null;
  status: OverwriteStatus;
  message?: string;
  error?: string;
  archiveId?: number;
  samplerResultId?: number;
  replayStatus?: ReplayStatus;
  durationMs: number;
  externalEligibilityDetailUpdate?: ExternalEligibilityDetailUpdate;
};

type OverwriteSummary = {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  externalUpdated: number;
  externalSkipped: number;
  externalWarning: number;
  externalFailed: number;
};

const EXTERNAL_STATUS_LABEL: Record<ExternalEligibilityStatus, string> = {
  updated: 'Updated',
  skipped: 'Skipped',
  warning: 'Warning',
  failed: 'Failed',
};

const externalPillClass = (status: ExternalEligibilityStatus) => {
  const tone: Record<ExternalEligibilityStatus, string> = {
    updated: 'pillOk',
    skipped: 'pillNeutral',
    warning: 'pillWarn',
    failed: 'pillDanger',
  };
  return `pill ${tone[status]}`;
};

const OVERWRITE_STATUS_LABEL: Record<OverwriteStatus, string> = {
  updated: 'Updated',
  skipped: 'Skipped',
  failed: 'Failed',
};

const overwritePillClass = (status: OverwriteStatus) => {
  const tone: Record<OverwriteStatus, string> = {
    updated: 'pillOk',
    skipped: 'pillNeutral',
    failed: 'pillDanger',
  };
  return `pill ${tone[status]}`;
};

/** Only a completed comparison can be written back; failed/skipped replays are not eligible. */
const isOverwriteEligible = (row: ReplayResultRow) =>
  (row.status === 'different' || row.status === 'match') && Boolean(row.replayedItemCode);

const STATUS_LABEL: Record<ReplayStatus, string> = {
  match: 'Match',
  different: 'Different',
  failed: 'Failed',
  skipped: 'Skipped',
};

const statusPillClass = (status: ReplayStatus) => {
  const tone: Record<ReplayStatus, string> = {
    match: 'pillOk',
    different: 'pillWarn',
    failed: 'pillDanger',
    skipped: 'pillNeutral',
  };
  return `pill ${tone[status]}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export default function CpqReplayValidationPage({
  permissionLevel,
  canOverwrite,
}: {
  permissionLevel: string;
  canOverwrite: boolean;
}) {
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

  const [selectedResultIds, setSelectedResultIds] = useState<number[]>([]);
  const [overwriteResults, setOverwriteResults] = useState<OverwriteResultRow[]>([]);
  const [overwriteSummary, setOverwriteSummary] = useState<OverwriteSummary | null>(null);
  const [overwriteBatchId, setOverwriteBatchId] = useState<string | null>(null);
  const [overwriteRunning, setOverwriteRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;
  const overSelected = selectedCount > RUN_MAX_LIMIT;

  const selectedResultIdSet = useMemo(() => new Set(selectedResultIds), [selectedResultIds]);
  const eligibleResults = useMemo(() => results.filter(isOverwriteEligible), [results]);
  const selectedOverwriteRows = useMemo(
    () => eligibleResults.filter((row) => selectedResultIdSet.has(row.referenceId)),
    [eligibleResults, selectedResultIdSet],
  );
  const overwriteSelectedCount = selectedOverwriteRows.length;
  const overwriteOverSelected = overwriteSelectedCount > OVERWRITE_MAX_ROWS;
  const overwriteMatchCount = selectedOverwriteRows.filter((row) => row.status === 'match').length;

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
      // A fresh replay invalidates any previous overwrite selection/results.
      setSelectedResultIds([]);
      setOverwriteResults([]);
      setOverwriteSummary(null);
      setOverwriteBatchId(null);
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
    setSelectedResultIds([]);
    setOverwriteResults([]);
    setOverwriteSummary(null);
    setOverwriteBatchId(null);
  };

  const toggleResult = (referenceId: number) => {
    setSelectedResultIds((current) =>
      current.includes(referenceId) ? current.filter((entry) => entry !== referenceId) : [...current, referenceId],
    );
  };

  const selectAllEligibleResults = () => setSelectedResultIds(eligibleResults.map((row) => row.referenceId));

  const openConfirm = () => {
    setConfirmPhrase('');
    setConfirmOpen(true);
  };

  const runOverwrite = async () => {
    setConfirmOpen(false);
    setOverwriteRunning(true);
    setErrorMessage(null);
    setMessage(`Applying ${overwriteSelectedCount} replay result(s) — archiving before each overwrite…`);
    try {
      const response = await fetch('/api/admin/cpq-replay-validation/overwrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rows: selectedOverwriteRows.map((row) => ({
            configurationReferenceId: row.referenceId,
            configurationReference: row.configurationReference,
            existingItemCode: row.existingItemCode,
            countryCode: row.countryCode,
            bikeType: row.bikeType,
            ruleset: row.ruleset,
          })),
        }),
      });
      const payload = (await response.json()) as {
        overwriteBatchId?: string;
        results?: OverwriteResultRow[];
        summary?: OverwriteSummary;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Overwrite failed');
      setOverwriteResults(payload.results ?? []);
      setOverwriteSummary(payload.summary ?? null);
      setOverwriteBatchId(payload.overwriteBatchId ?? null);
      const applied = payload.summary;
      setMessage(
        applied
          ? `Overwrite finished: ${applied.updated} updated, ${applied.skipped} skipped, ${applied.failed} failed.`
          : 'Overwrite finished.',
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Overwrite failed');
    } finally {
      setOverwriteRunning(false);
      setConfirmPhrase('');
    }
  };

  return (
    <main className="opPage">
      <header className="opHeader">
        <div className="opHeaderMain">
          <h1>CPQ replay validation</h1>
          <p>
            Re-run saved configuration references without writing to Neon, then compare replayed IPN codes with stored
            IPN codes.
          </p>
        </div>
        <div className="opHeaderActions">
          <span className="opCount">Access: {permissionLevel}</span>
          <span className={canOverwrite ? 'pill pillWarn' : 'pill pillOutline'}>
            {canOverwrite ? 'Overwrite enabled' : 'Read-only'}
          </span>
        </div>
      </header>

      <div className="opMessage opMessageWarn" role="note">
        <strong>Replay validation is read-only.</strong> Loading references and running the replay never write to Neon.
        <br />
        <strong>Apply selected replay results</strong> is the only writing action: it requires Admin access, archives the
        previous row content before each overwrite, and only updates existing configuration-reference and sampler rows —
        it never inserts new live rows and never updates BigCommerce. It then makes one targeted external PostgreSQL
        update, setting only <code>variant_eligibilities.&quot;DetailId&quot;</code> for the matching bike/country row; it
        never inserts external rows, never touches <code>variants</code>, and never runs the full external push.
      </div>

      {errorMessage ? (
        <div className="opMessage opMessageError" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {message ? <div className="opMessage opMessageInfo">{message}</div> : null}

      <section className="opPanel opPanelStack">
        <div className="opBar">
          <label className="opField" style={{ minWidth: 200 }}>
            Bike type
            <select value={bikeType} onChange={(event) => setBikeType(event.target.value)} disabled={optionsLoading || running || overwriteRunning}>
              <option value="">{optionsLoading ? 'Loading…' : 'Select bike type'}</option>
              {bikeTypes.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="opField" style={{ minWidth: 160 }}>
            Country
            <select
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              disabled={optionsLoading || running || overwriteRunning}
            >
              <option value="">{optionsLoading ? 'Loading…' : 'Select country'}</option>
              {countries.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => void loadReferences()} disabled={referencesLoading || running || overwriteRunning}>
            {referencesLoading ? 'Loading references…' : 'Load references'}
          </button>
          <button type="button" className="btn" onClick={() => void loadOptions()} disabled={optionsLoading || running || overwriteRunning}>
            Refresh dropdowns
          </button>
        </div>
        {optionSources ? (
          <p className="opBarNote" style={{ margin: 0 }}>
            Bike type source: {optionSources.bikeTypeSource}. Country source: {optionSources.countrySource}.
          </p>
        ) : null}
      </section>

      {references.length > 0 ? (
        <section className="opPanel opPanelStack">
          <div className="opBar">
            <strong>References ({references.length})</strong>
            <button type="button" className="btn" onClick={selectAllVisible} disabled={running || overwriteRunning}>
              Select all visible
            </button>
            <button type="button" className="btn" onClick={clearSelection} disabled={running || overwriteRunning}>
              Clear selection
            </button>
            <span className="subtle">
              Selected: {selectedCount} (max {RUN_MAX_LIMIT} per run, default batch {RUN_DEFAULT_LIMIT})
            </span>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={() => void runReplay()}
              disabled={running || overwriteRunning || selectedCount === 0 || overSelected}
              title={overSelected ? `Select at most ${RUN_MAX_LIMIT} references per run.` : undefined}
            >
              {running ? `Running replay validation (${selectedCount})…` : `Run replay validation (${selectedCount})`}
            </button>
            <button type="button" className="btn" onClick={clearResults} disabled={running || overwriteRunning || results.length === 0}>
              Clear results
            </button>
          </div>
          {overSelected ? (
            <p className="opMessage opMessageError" style={{ margin: 0 }}>
              {selectedCount} references selected — reduce the selection to {RUN_MAX_LIMIT} or fewer before running.
            </p>
          ) : null}
          <div className="opTableWrap opTableWrapViewport">
            <table className="opTable">
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
                        disabled={running || overwriteRunning}
                        aria-label={`Select ${row.configurationReference}`}
                      />
                    </td>
                    <td>{row.configurationReference}</td>
                    <td>
                      {row.bikeType ?? '—'}
                      <div className="secondaryText">{row.ruleset ?? '—'}</div>
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
        <section className="opPanel opPanelStack">
          <div className="opBar">
            <strong>Comparison results</strong>
            {summary ? (
              <span className="subtle">
                Total {summary.total} • Match {summary.match} • Different {summary.different} • Failed {summary.failed} •
                Skipped {summary.skipped}
              </span>
            ) : null}
          </div>

          <div className="opBar">
            <button
              type="button"
              onClick={selectAllEligibleResults}
              disabled={!canOverwrite || overwriteRunning || eligibleResults.length === 0}
            >
              Select all eligible ({eligibleResults.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedResultIds([])}
              disabled={!canOverwrite || overwriteRunning || overwriteSelectedCount === 0}
            >
              Clear selection
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={openConfirm}
              disabled={!canOverwrite || overwriteRunning || overwriteSelectedCount === 0 || overwriteOverSelected}
              title={
                !canOverwrite
                  ? 'You need Admin access on this page to overwrite stored records.'
                  : overwriteOverSelected
                    ? `Select at most ${OVERWRITE_MAX_ROWS} rows per overwrite batch.`
                    : undefined
              }
            >
              {overwriteRunning
                ? `Applying replay results (${overwriteSelectedCount})…`
                : `Apply selected replay results (${overwriteSelectedCount})`}
            </button>
            {!canOverwrite ? (
              <span className="subtle">
                Read-only for your access level ({permissionLevel}). Admin access is required to overwrite stored records.
              </span>
            ) : null}
            {overwriteOverSelected ? (
              <span className="pill pillDanger">
                {overwriteSelectedCount} selected — reduce to {OVERWRITE_MAX_ROWS} or fewer.
              </span>
            ) : null}
          </div>

          <div className="opTableWrap opTableWrapViewport">
            <table className="opTable">
              <thead>
                <tr>
                  <th>Apply</th>
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
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedResultIdSet.has(row.referenceId)}
                        onChange={() => toggleResult(row.referenceId)}
                        disabled={!canOverwrite || overwriteRunning || !isOverwriteEligible(row)}
                        aria-label={`Apply replay result for ${row.configurationReference}`}
                        title={
                          !isOverwriteEligible(row)
                            ? 'Only completed comparisons with a replayed item code can be applied.'
                            : undefined
                        }
                      />
                    </td>
                    <td>{row.configurationReference}</td>
                    <td>
                      {row.bikeType ?? '—'}
                      <div className="secondaryText">{row.ruleset ?? '—'}</div>
                    </td>
                    <td>{row.countryCode ?? '—'}</td>
                    <td>{row.existingItemCode ?? '—'}</td>
                    <td>{row.replayedItemCode ?? '—'}</td>
                    <td>{row.finalizedItemCode ?? '—'}</td>
                    <td>
                      {row.replayedDetailId ?? '—'}
                      <div className="secondaryText">session {row.replaySessionId ?? '—'}</div>
                    </td>
                    <td>
                      <span className={statusPillClass(row.status)}>{STATUS_LABEL[row.status]}</span>
                    </td>
                    <td>
                      {row.error ?? row.message ?? '—'}
                      <div className="secondaryText">
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

      {overwriteResults.length > 0 ? (
        <section className="opPanel opPanelStack">
          <div className="opBar">
            <strong>Overwrite results</strong>
            {overwriteSummary ? (
              <span className="subtle">
                Total {overwriteSummary.total} • Updated {overwriteSummary.updated} • Skipped {overwriteSummary.skipped} •
                Failed {overwriteSummary.failed}
                {' | '}External eligibility — updated {overwriteSummary.externalUpdated} • skipped{' '}
                {overwriteSummary.externalSkipped} • warning {overwriteSummary.externalWarning} • failed{' '}
                {overwriteSummary.externalFailed}
              </span>
            ) : null}
            {overwriteBatchId ? <span className="subtle">Archive batch: {overwriteBatchId}</span> : null}
          </div>
          <div className="opTableWrap opTableWrapViewport">
            <table className="opTable">
              <thead>
                <tr>
                  <th>Configuration reference</th>
                  <th>Previous IPN</th>
                  <th>Applied IPN</th>
                  <th>Status</th>
                  <th>Archive id</th>
                  <th>Sampler row</th>
                  <th>External eligibility Detail ID</th>
                  <th>External rows updated</th>
                  <th>External update status</th>
                  <th>Message / error</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {overwriteResults.map((row) => (
                  <tr key={`overwrite-${row.configurationReferenceId}`}>
                    <td>{row.configurationReference}</td>
                    <td>{row.existingItemCode ?? '—'}</td>
                    <td>{row.replayedItemCode ?? '—'}</td>
                    <td>
                      <span className={overwritePillClass(row.status)}>{OVERWRITE_STATUS_LABEL[row.status]}</span>
                    </td>
                    <td>{row.archiveId ?? '—'}</td>
                    <td>{row.samplerResultId ?? '—'}</td>
                    <td>
                      {row.externalEligibilityDetailUpdate?.newDetailId ?? '—'}
                      {row.externalEligibilityDetailUpdate?.previousDetailId ? (
                        <div className="secondaryText">was {row.externalEligibilityDetailUpdate.previousDetailId}</div>
                      ) : null}
                      {row.externalEligibilityDetailUpdate?.sku ? (
                        <div className="secondaryText">
                          {row.externalEligibilityDetailUpdate.sku} / {row.externalEligibilityDetailUpdate.countryCode ?? '—'}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.externalEligibilityDetailUpdate ? row.externalEligibilityDetailUpdate.updatedRows : '—'}</td>
                    <td>
                      {row.externalEligibilityDetailUpdate ? (
                        <span className={externalPillClass(row.externalEligibilityDetailUpdate.status)}>
                          {EXTERNAL_STATUS_LABEL[row.externalEligibilityDetailUpdate.status]}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{row.error ?? row.message ?? '—'}</td>
                    <td>{row.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {confirmOpen ? (
        <div className="modalBackdrop" onClick={() => setConfirmOpen(false)}>
          <div className="modalCard" style={{ width: 'min(640px, 92vw)' }} onClick={(event) => event.stopPropagation()}>
            <h3 className="opModalTitle">Apply selected replay results</h3>
            <p>
              This will overwrite existing Neon CPQ configuration and sampler rows for {overwriteSelectedCount} selected
              reference{overwriteSelectedCount === 1 ? '' : 's'}.
            </p>
            <ul className="opModalBody" style={{ paddingLeft: 18 }}>
              <li>An archive copy will be created before each overwrite.</li>
              <li>The replay is re-run on the server; the results shown above are not written directly.</li>
              <li>
                It will also update <strong>only</strong> the <code>DetailId</code> column of the matching external
                PostgreSQL <code>variant_eligibilities</code> row to the new CPQ Detail ID. No external row is inserted and{' '}
                <code>variants</code> is not touched.
              </li>
              <li>This will not run the full external push.</li>
              <li>This will not update BigCommerce.</li>
              <li>This cannot yet be rolled back from the UI.</li>
            </ul>
            {overwriteMatchCount > 0 ? (
              <div className="opMessage opMessageWarn">
                {overwriteMatchCount} selected row{overwriteMatchCount === 1 ? ' is' : 's are'} already a <strong>Match</strong> —
                applying will refresh the stored rows without changing the item code.
              </div>
            ) : null}
            <label className="opField" style={{ marginTop: 10 }}>
              <span>Type <strong>{OVERWRITE_CONFIRM_PHRASE}</strong> to confirm</span>
              <input
                autoFocus
                value={confirmPhrase}
                onChange={(event) => setConfirmPhrase(event.target.value)}
                placeholder={OVERWRITE_CONFIRM_PHRASE}
              />
            </label>
            <div className="opModalFooter">
              <button type="button" className="btn" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btnPrimary"
                type="button"
                onClick={() => void runOverwrite()}
                disabled={confirmPhrase.trim() !== OVERWRITE_CONFIRM_PHRASE || overwriteRunning}
              >
                Overwrite {overwriteSelectedCount} row{overwriteSelectedCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
