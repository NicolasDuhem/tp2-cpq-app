'use client';

import { useEffect, useMemo, useState } from 'react';

type AccountContext = {
  id: number;
  account_code: string;
  customer_id: string;
  currency: string;
  language: string;
  country_code: string;
  is_active: boolean;
};

type Ruleset = {
  id: number;
  cpq_ruleset: string;
  description: string | null;
  bike_type: string | null;
  namespace: string;
  header_id: string;
  sort_order: number;
  is_active: boolean;
};

type ImageManagementRow = {
  id: number;
  feature_label: string;
  option_label: string;
  option_value: string;
  ignore_during_configure: boolean;
  picture_link_1: string | null;
  picture_link_2: string | null;
  picture_link_3: string | null;
  picture_link_4: string | null;
  is_active: boolean;
};

type SyncSummary = {
  sourceRowsScanned: number;
  selectedOptionsScanned: number;
  distinctCombinationsFound: number;
  inserted: number;
  skippedExisting: number;
  samplerRowsMarkedProcessed: number;
  unprocessedRowsRemaining: number;
  syncErrors: string[];
  total: number;
};

type TabKey = 'accounts' | 'rulesets' | 'pictures';

type PictureDraft = {
  id: number;
  feature_label: string;
  option_label: string;
  option_value: string;
  ignore_during_configure: boolean;
  picture_link_1: string;
  picture_link_2: string;
  picture_link_3: string;
  picture_link_4: string;
  is_active: boolean;
};

const emptyAccount: Omit<AccountContext, 'id'> = {
  account_code: '',
  customer_id: '',
  currency: 'GBP',
  language: 'en-GB',
  country_code: 'GB',
  is_active: true,
};

const emptyRuleset: Omit<Ruleset, 'id'> = {
  cpq_ruleset: '',
  description: '',
  bike_type: '',
  namespace: 'Default',
  header_id: 'Simulator',
  sort_order: 0,
  is_active: true,
};

const countPictureLinks = (row: Pick<ImageManagementRow, 'picture_link_1' | 'picture_link_2' | 'picture_link_3' | 'picture_link_4'>) => {
  return [row.picture_link_1, row.picture_link_2, row.picture_link_3, row.picture_link_4].filter((value) => (value ?? '').trim().length > 0).length;
};

export default function CpqSetupPage() {
  const [tab, setTab] = useState<TabKey>('accounts');
  const [accounts, setAccounts] = useState<AccountContext[]>([]);
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [imageRows, setImageRows] = useState<ImageManagementRow[]>([]);
  const [accountDraft, setAccountDraft] = useState(emptyAccount);
  const [rulesetDraft, setRulesetDraft] = useState(emptyRuleset);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingRulesetId, setEditingRulesetId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [pictureSearch, setPictureSearch] = useState('');
  const [onlyMissingPicture, setOnlyMissingPicture] = useState(false);
  const [savingImageId, setSavingImageId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [selectedFeature, setSelectedFeature] = useState('');
  const [pictureDraft, setPictureDraft] = useState<PictureDraft | null>(null);

  const canSubmitAccount = useMemo(
    () =>
      !!accountDraft.account_code.trim() &&
      !!accountDraft.customer_id.trim() &&
      !!accountDraft.currency.trim() &&
      !!accountDraft.language.trim() &&
      /^[A-Za-z]{2}$/.test(accountDraft.country_code.trim()),
    [accountDraft],
  );

  const canSubmitRuleset = useMemo(
    () => !!rulesetDraft.cpq_ruleset.trim() && !!rulesetDraft.namespace.trim() && !!rulesetDraft.header_id.trim(),
    [rulesetDraft],
  );

  const load = async () => {
    const [accountRes, rulesetRes] = await Promise.all([
      fetch('/api/cpq/setup/account-context'),
      fetch('/api/cpq/setup/rulesets'),
    ]);

    const accountPayload = await accountRes.json().catch(() => ({ rows: [] }));
    const rulesetPayload = await rulesetRes.json().catch(() => ({ rows: [] }));

    setAccounts(accountPayload.rows || []);
    setRulesets(rulesetPayload.rows || []);
  };

  const loadPictures = async () => {
    const params = new URLSearchParams();
    if (onlyMissingPicture) params.set('onlyMissingPicture', 'true');

    const res = await fetch(`/api/cpq/setup/picture-management?${params.toString()}`);
    const payload = await res.json().catch(() => ({ rows: [] }));
    setImageRows(payload.rows || []);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void loadPictures();
  }, [onlyMissingPicture]);

  const visiblePictureRows = useMemo(() => {
    const query = pictureSearch.trim().toLowerCase();
    if (!query) return imageRows;

    return imageRows.filter((row) => {
      const searchableText = `${row.feature_label} ${row.option_label} ${row.option_value}`.toLowerCase();
      return searchableText.includes(query);
    });
  }, [imageRows, pictureSearch]);

  const featureTabs = useMemo(() => {
    const labels = visiblePictureRows.map((row) => row.feature_label).filter((label) => label.trim().length > 0);
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
  }, [visiblePictureRows]);

  useEffect(() => {
    if (featureTabs.length === 0) {
      setSelectedFeature('');
      return;
    }

    if (!selectedFeature || !featureTabs.includes(selectedFeature)) {
      setSelectedFeature(featureTabs[0]);
    }
  }, [featureTabs, selectedFeature]);

  const featureRows = useMemo(
    () => visiblePictureRows.filter((row) => row.feature_label === selectedFeature),
    [visiblePictureRows, selectedFeature],
  );
  const featureIgnoreDuringConfigure = useMemo(
    () => featureRows.some((row) => row.ignore_during_configure),
    [featureRows],
  );

  const featureSummary = useMemo(() => {
    const total = featureRows.length;
    const withPictures = featureRows.filter((row) => countPictureLinks(row) > 0).length;
    const missing = total - withPictures;
    const fullyComplete = featureRows.filter((row) => countPictureLinks(row) === 4).length;
    const completion = total ? (withPictures / total) * 100 : 0;

    return { total, missing, withPictures, fullyComplete, completion };
  }, [featureRows]);

  const resetAccountDraft = () => {
    setEditingAccountId(null);
    setAccountDraft(emptyAccount);
  };

  const resetRulesetDraft = () => {
    setEditingRulesetId(null);
    setRulesetDraft(emptyRuleset);
  };

  const saveAccount = async () => {
    if (!canSubmitAccount) {
      setStatus('Account code, customer ID, currency, language, and 2-letter country code are required.');
      return;
    }

    const isEdit = Number.isFinite(editingAccountId);
    const url = isEdit ? `/api/cpq/setup/account-context/${editingAccountId}` : '/api/cpq/setup/account-context';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accountDraft),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(payload.error || 'Failed to save account context');
      return;
    }

    setStatus(isEdit ? 'Account context updated.' : 'Account context created.');
    resetAccountDraft();
    await load();
  };

  const deleteAccount = async (id: number) => {
    if (!window.confirm('Delete this account context?')) return;

    const res = await fetch(`/api/cpq/setup/account-context/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setStatus('Failed to delete account context');
      return;
    }

    if (editingAccountId === id) resetAccountDraft();
    setStatus('Account context deleted.');
    await load();
  };

  const saveRuleset = async () => {
    if (!canSubmitRuleset) {
      setStatus('Ruleset, namespace, and header ID are required.');
      return;
    }

    const isEdit = Number.isFinite(editingRulesetId);
    const url = isEdit ? `/api/cpq/setup/rulesets/${editingRulesetId}` : '/api/cpq/setup/rulesets';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rulesetDraft),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(payload.error || 'Failed to save ruleset');
      return;
    }

    setStatus(isEdit ? 'Ruleset updated.' : 'Ruleset created.');
    resetRulesetDraft();
    await load();
  };

  const deleteRuleset = async (id: number) => {
    if (!window.confirm('Delete this ruleset?')) return;

    const res = await fetch(`/api/cpq/setup/rulesets/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setStatus('Failed to delete ruleset');
      return;
    }

    if (editingRulesetId === id) resetRulesetDraft();
    setStatus('Ruleset deleted.');
    await load();
  };

  const savePictureRow = async (
    id: number,
    patch: Partial<
      Pick<ImageManagementRow, 'picture_link_1' | 'picture_link_2' | 'picture_link_3' | 'picture_link_4' | 'is_active' | 'ignore_during_configure'>
    >,
  ) => {
    setSavingImageId(id);
    const res = await fetch(`/api/cpq/setup/picture-management/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(payload.error || 'Failed to update picture mapping');
      setSavingImageId(null);
      return;
    }

    setImageRows((curr) => curr.map((row) => (row.id === id ? payload.row : row)));
    setStatus('Picture mapping updated.');
    setSavingImageId(null);
    setPictureDraft(null);
  };

  const setFeatureIgnoreFlag = async (featureLabel: string, ignoreDuringConfigure: boolean) => {
    const res = await fetch('/api/cpq/setup/picture-management/feature-flags', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feature_label: featureLabel,
        ignore_during_configure: ignoreDuringConfigure,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(payload.error || 'Failed to update feature ignore flag');
      return;
    }

    setImageRows((curr) =>
      curr.map((row) => (row.feature_label === featureLabel ? { ...row, ignore_during_configure: ignoreDuringConfigure } : row)),
    );
    setStatus(
      ignoreDuringConfigure
        ? `Feature "${featureLabel}" will be ignored during Configure all ticked items.`
        : `Feature "${featureLabel}" will be included during Configure all ticked items.`,
    );
    setPictureDraft((current) =>
      current && current.feature_label === featureLabel ? { ...current, ignore_during_configure: ignoreDuringConfigure } : current,
    );
  };

  const syncPictures = async () => {
    setSyncing(true);
    setSyncSummary(null);
    const res = await fetch('/api/cpq/setup/picture-management/sync', { method: 'POST' });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = [payload.error, payload.details].filter(Boolean).join(' | ');
      setStatus(message || 'Failed to sync from sampler results');
      setSyncing(false);
      return;
    }

    const summary = (payload.summary || {}) as SyncSummary;
    setSyncSummary(summary);
    setStatus(`Sync complete. Inserted ${summary.inserted ?? 0}, skipped existing ${summary.skippedExisting ?? 0}, total rows ${summary.total ?? 0}.`);
    await loadPictures();
    setSyncing(false);
  };

  return (
    <main className="pageRoot">
      <section className="pageHeader compactCard">
        <h1>CPQ Setup</h1>
        <p>Manage account context defaults, CPQ rulesets, and picture-management option mappings stored in Neon.</p>
        <div className="tabRow">
          <button className={tab === 'accounts' ? 'primary' : ''} onClick={() => setTab('accounts')}>Account code management</button>
          <button className={tab === 'rulesets' ? 'primary' : ''} onClick={() => setTab('rulesets')}>Ruleset management</button>
          <button className={tab === 'pictures' ? 'primary' : ''} onClick={() => setTab('pictures')}>Picture management</button>
        </div>
        {status && <div className="note compactNote">{status}</div>}
      </section>

      {tab === 'accounts' && (
        <section className="compactCard compactSection">
          <div className="filtersHeader">
            <strong>{editingAccountId ? 'Edit account context' : 'Add account context'}</strong>
            {editingAccountId && <button onClick={resetAccountDraft}>Cancel edit</button>}
          </div>
          <div className="denseGrid4">
            <label>Account code<input value={accountDraft.account_code} onChange={(e) => setAccountDraft((prev) => ({ ...prev, account_code: e.target.value }))} /></label>
            <label>Customer ID<input value={accountDraft.customer_id} onChange={(e) => setAccountDraft((prev) => ({ ...prev, customer_id: e.target.value }))} /></label>
            <label>Currency<input value={accountDraft.currency} onChange={(e) => setAccountDraft((prev) => ({ ...prev, currency: e.target.value }))} /></label>
            <label>Language<input value={accountDraft.language} onChange={(e) => setAccountDraft((prev) => ({ ...prev, language: e.target.value }))} /></label>
            <label>Country code
              <input
                value={accountDraft.country_code}
                maxLength={2}
                onChange={(e) => setAccountDraft((prev) => ({ ...prev, country_code: e.target.value.toUpperCase() }))}
              />
            </label>
          </div>
          <label className="inlineCheck"><input type="checkbox" checked={accountDraft.is_active} onChange={(e) => setAccountDraft((prev) => ({ ...prev, is_active: e.target.checked }))} /> Active</label>
          <div className="toolbar compactToolbar">
            <button className="primary" onClick={saveAccount}>{editingAccountId ? 'Update account context' : 'Create account context'}</button>
          </div>

          <div className="tableWrap" style={{ maxHeight: 420 }}>
            <table>
              <thead>
                <tr><th>Account</th><th>Customer ID</th><th>Currency</th><th>Language</th><th>Country</th><th>Active</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {accounts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.account_code}</td>
                    <td>{row.customer_id}</td>
                    <td>{row.currency}</td>
                    <td>{row.language}</td>
                    <td>{row.country_code}</td>
                    <td>{row.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      <div className="rowButtons">
                        <button onClick={() => { setEditingAccountId(row.id); setAccountDraft({ account_code: row.account_code, customer_id: row.customer_id, currency: row.currency, language: row.language, country_code: row.country_code, is_active: row.is_active }); }}>Edit</button>
                        <button onClick={() => void deleteAccount(row.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'rulesets' && (
        <section className="compactCard compactSection">
          <div className="filtersHeader">
            <strong>{editingRulesetId ? 'Edit ruleset' : 'Add ruleset'}</strong>
            {editingRulesetId && <button onClick={resetRulesetDraft}>Cancel edit</button>}
          </div>
          <div className="denseGrid4">
            <label>CPQ ruleset<input value={rulesetDraft.cpq_ruleset} onChange={(e) => setRulesetDraft((prev) => ({ ...prev, cpq_ruleset: e.target.value }))} /></label>
            <label>Description<input value={rulesetDraft.description ?? ''} onChange={(e) => setRulesetDraft((prev) => ({ ...prev, description: e.target.value }))} /></label>
            <label>Bike type<input value={rulesetDraft.bike_type ?? ''} onChange={(e) => setRulesetDraft((prev) => ({ ...prev, bike_type: e.target.value }))} /></label>
            <label>Namespace<input value={rulesetDraft.namespace} onChange={(e) => setRulesetDraft((prev) => ({ ...prev, namespace: e.target.value }))} /></label>
            <label>Header ID<input value={rulesetDraft.header_id} onChange={(e) => setRulesetDraft((prev) => ({ ...prev, header_id: e.target.value }))} /></label>
            <label>Sort order<input type="number" value={rulesetDraft.sort_order} onChange={(e) => setRulesetDraft((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} /></label>
          </div>
          <label className="inlineCheck"><input type="checkbox" checked={rulesetDraft.is_active} onChange={(e) => setRulesetDraft((prev) => ({ ...prev, is_active: e.target.checked }))} /> Active</label>
          <div className="toolbar compactToolbar">
            <button className="primary" onClick={saveRuleset}>{editingRulesetId ? 'Update ruleset' : 'Create ruleset'}</button>
          </div>

          <div className="tableWrap" style={{ maxHeight: 420 }}>
            <table>
              <thead>
                <tr><th>Ruleset</th><th>Namespace</th><th>Header ID</th><th>Sort</th><th>Bike type</th><th>Active</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rulesets.map((row) => (
                  <tr key={row.id}>
                    <td>{row.cpq_ruleset}</td>
                    <td>{row.namespace}</td>
                    <td>{row.header_id}</td>
                    <td>{row.sort_order}</td>
                    <td>{row.bike_type ?? '-'}</td>
                    <td>{row.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      <div className="rowButtons">
                        <button onClick={() => {
                          setEditingRulesetId(row.id);
                          setRulesetDraft({
                            cpq_ruleset: row.cpq_ruleset,
                            description: row.description ?? '',
                            bike_type: row.bike_type ?? '',
                            namespace: row.namespace,
                            header_id: row.header_id,
                            sort_order: row.sort_order,
                            is_active: row.is_active,
                          });
                        }}>Edit</button>
                        <button onClick={() => void deleteRuleset(row.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'pictures' && (
        <section className="compactCard compactSection">
          <div className="toolbar compactToolbar">
            <button className="primary" onClick={() => void syncPictures()} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync from sampler results'}</button>
            <label className="pictureSearchField">
              Search feature, option, or value
              <input value={pictureSearch} onChange={(e) => setPictureSearch(e.target.value)} placeholder="Type to filter picture mappings" />
            </label>
            <label className="inlineCheck" style={{ marginBottom: 0 }}>
              <input type="checkbox" checked={onlyMissingPicture} onChange={(e) => setOnlyMissingPicture(e.target.checked)} />
              Missing all picture links only
            </label>
          </div>
          {syncSummary && (
            <div className="note compactNote">
              Scanned sampler rows: {syncSummary.sourceRowsScanned} | selectedOptions scanned: {syncSummary.selectedOptionsScanned} | distinct combos: {syncSummary.distinctCombinationsFound} | inserted: {syncSummary.inserted} | already existing: {syncSummary.skippedExisting} | sampler rows marked processed: {syncSummary.samplerRowsMarkedProcessed} | unprocessed rows remaining: {syncSummary.unprocessedRowsRemaining} | sync errors: {syncSummary.syncErrors?.length ?? 0} | current total rows: {syncSummary.total}
            </div>
          )}
          {syncSummary?.syncErrors?.length ? (
            <div className="note compactNote" style={{ maxHeight: 130, overflow: 'auto' }}>
              {syncSummary.syncErrors.map((message, index) => (
                <div key={`${index}-${message}`}>{message}</div>
              ))}
            </div>
          ) : null}

          <div className="pictureFeatureTabs" role="tablist" aria-label="Picture management features">
            {featureTabs.map((feature) => (
              <button
                key={feature}
                role="tab"
                aria-selected={selectedFeature === feature}
                className={selectedFeature === feature ? 'primary' : ''}
                onClick={() => setSelectedFeature(feature)}
              >
                {feature}
              </button>
            ))}
          </div>

          {selectedFeature && (
            <div className="pictureSummaryGrid" aria-live="polite">
              <article className="pictureSummaryCard">
                <span>Total items</span>
                <strong>{featureSummary.total}</strong>
              </article>
              <article className="pictureSummaryCard pictureSummaryCardDanger">
                <span>Missing pictures</span>
                <strong>{featureSummary.missing}</strong>
              </article>
              <article className="pictureSummaryCard pictureSummaryCardSuccess">
                <span>With pictures</span>
                <strong>{featureSummary.withPictures}</strong>
              </article>
              <article className="pictureSummaryCard">
                <span>Completion</span>
                <strong>{featureSummary.completion.toFixed(1)}%</strong>
              </article>
              <article className="pictureSummaryCard">
                <span>Fully complete (4/4)</span>
                <strong>{featureSummary.fullyComplete}</strong>
              </article>
            </div>
          )}
          {selectedFeature && (
            <div className="note compactNote" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <strong>{selectedFeature}</strong> bulk configure behavior
                <div style={{ fontSize: 12, color: '#475569' }}>
                  When enabled, this entire feature is skipped during <code>Configure all ticked items</code>.
                </div>
              </div>
              <label className="inlineCheck" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={featureIgnoreDuringConfigure}
                  onChange={(event) => void setFeatureIgnoreFlag(selectedFeature, event.target.checked)}
                />
                Ignore during /configure
              </label>
            </div>
          )}

          <div className="tableWrap" style={{ maxHeight: 620, padding: 10 }}>
            <div className="pictureTileGrid">
              {featureRows.map((row) => {
                const pictureCount = countPictureLinks(row);
                const hasPictures = pictureCount > 0;
                return (
                  <button
                    key={row.id}
                    className="pictureTile"
                    onClick={() => setPictureDraft({
                      id: row.id,
                      feature_label: row.feature_label,
                      option_label: row.option_label,
                      option_value: row.option_value,
                      ignore_during_configure: row.ignore_during_configure,
                      picture_link_1: row.picture_link_1 ?? '',
                      picture_link_2: row.picture_link_2 ?? '',
                      picture_link_3: row.picture_link_3 ?? '',
                      picture_link_4: row.picture_link_4 ?? '',
                      is_active: row.is_active,
                    })}
                  >
                    <div className="pictureTileHeader">
                      <strong>{row.option_label}</strong>
                      <span className={`pictureStatusDot ${hasPictures ? 'isComplete' : 'isMissing'}`} aria-hidden="true" />
                    </div>
                    <div className="pictureTileValue">{row.option_value}</div>
                    <div className="pictureTileMeta">
                      <span>{pictureCount}/4 pictures</span>
                      <span>{hasPictures ? 'Ready' : 'Missing'}</span>
                    </div>
                  </button>
                );
              })}

              {featureRows.length === 0 && <div className="note compactNote">No picture mappings match the current filters.</div>}
            </div>
          </div>

          {pictureDraft && (
            <div className="modalBackdrop" role="presentation" onClick={() => setPictureDraft(null)}>
              <div className="modalCard pictureModalCard" role="dialog" aria-modal="true" aria-label="Edit picture mapping" onClick={(event) => event.stopPropagation()}>
                <h3>Edit picture mapping</h3>
                <div className="pictureModalMeta">
                  <div><strong>Feature:</strong> {pictureDraft.feature_label}</div>
                  <div><strong>Option:</strong> {pictureDraft.option_label}</div>
                  <div><strong>Value:</strong> {pictureDraft.option_value}</div>
                </div>
                <div className="pictureModalGrid">
                  <label>Picture link 1
                    <input value={pictureDraft.picture_link_1} placeholder="https://cdn.example.com/layer-1.png" onChange={(e) => setPictureDraft((prev) => prev ? ({ ...prev, picture_link_1: e.target.value }) : prev)} />
                  </label>
                  <label>Picture link 2
                    <input value={pictureDraft.picture_link_2} placeholder="https://cdn.example.com/layer-2.png" onChange={(e) => setPictureDraft((prev) => prev ? ({ ...prev, picture_link_2: e.target.value }) : prev)} />
                  </label>
                  <label>Picture link 3
                    <input value={pictureDraft.picture_link_3} placeholder="https://cdn.example.com/layer-3.png" onChange={(e) => setPictureDraft((prev) => prev ? ({ ...prev, picture_link_3: e.target.value }) : prev)} />
                  </label>
                  <label>Picture link 4
                    <input value={pictureDraft.picture_link_4} placeholder="https://cdn.example.com/layer-4.png" onChange={(e) => setPictureDraft((prev) => prev ? ({ ...prev, picture_link_4: e.target.value }) : prev)} />
                  </label>
                </div>
                <label className="inlineCheck" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={pictureDraft.is_active} onChange={(e) => setPictureDraft((prev) => prev ? ({ ...prev, is_active: e.target.checked }) : prev)} />
                  Active
                </label>
                <div className="modalActions">
                  <button onClick={() => setPictureDraft(null)}>Cancel</button>
                  <button
                    className="primary"
                    disabled={savingImageId === pictureDraft.id}
                    onClick={() => void savePictureRow(pictureDraft.id, {
                      picture_link_1: pictureDraft.picture_link_1,
                      picture_link_2: pictureDraft.picture_link_2,
                      picture_link_3: pictureDraft.picture_link_3,
                      picture_link_4: pictureDraft.picture_link_4,
                      is_active: pictureDraft.is_active,
                      ignore_during_configure: pictureDraft.ignore_during_configure,
                    })}
                  >
                    {savingImageId === pictureDraft.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {visiblePictureRows.length === 0 && <div className="note compactNote">No picture-management rows found. Run sync to seed from sampler results.</div>}
        </section>
      )}
    </main>
  );
}
