'use client';

import Link from 'next/link';
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QPartCompatibilityCandidate, QPartCompatibilityRule, QPartHierarchyNode, QPartMetadataDefinition } from '@/types/qpart';

type Props = { partId?: number };
type LevelSelections = Record<number, string>;

const emptyLevelSelections: LevelSelections = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' };

export default function QPartPartFormPage({ partId }: Props) {
  const router = useRouter();
  const [partNumber, setPartNumber] = useState('');
  const [defaultName, setDefaultName] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [locales, setLocales] = useState<string[]>([]);
  const [baseLocale, setBaseLocale] = useState('en-GB');
  const [hierarchyNodes, setHierarchyNodes] = useState<QPartHierarchyNode[]>([]);
  const [metadataDefs, setMetadataDefs] = useState<QPartMetadataDefinition[]>([]);
  const [bikeTypes, setBikeTypes] = useState<string[]>([]);
  const [selectedBikeTypes, setSelectedBikeTypes] = useState<string[]>([]);
  const [translations, setTranslations] = useState<Record<string, { name: string; description: string }>>({});
  const [metadataValues, setMetadataValues] = useState<Record<string, unknown>>({});
  const [metadataTranslations, setMetadataTranslations] = useState<Record<string, Record<string, unknown>>>({});
  const [compatibilityRules, setCompatibilityRules] = useState<QPartCompatibilityRule[]>([]);
  const [derivedCandidates, setDerivedCandidates] = useState<QPartCompatibilityCandidate[]>([]);
  const [hierarchySelections, setHierarchySelections] = useState<LevelSelections>(emptyLevelSelections);
  const [message, setMessage] = useState('');

  const selectedHierarchyNodeId = useMemo(() => {
    for (let level = 7; level >= 1; level -= 1) {
      if (hierarchySelections[level]) return Number(hierarchySelections[level]);
    }
    return null;
  }, [hierarchySelections]);

  const loadDependencies = async () => {
    const [localeRes, hierarchyRes, metadataRes, bikeTypeRes] = await Promise.all([
      fetch('/api/qpart/locales'),
      fetch('/api/qpart/hierarchy'),
      fetch('/api/qpart/metadata?activeOnly=true'),
      fetch('/api/qpart/bike-types'),
    ]);
    const localePayload = await localeRes.json().catch(() => ({ locales: [], baseLocale: 'en-GB' }));
    const hierarchyPayload = await hierarchyRes.json().catch(() => ({ rows: [] }));
    const metadataPayload = await metadataRes.json().catch(() => ({ rows: [] }));
    const bikeTypePayload = await bikeTypeRes.json().catch(() => ({ bikeTypes: [] }));

    setLocales(localePayload.locales || []);
    setBaseLocale(localePayload.baseLocale || 'en-GB');
    setHierarchyNodes(hierarchyPayload.rows || []);
    setMetadataDefs(metadataPayload.rows || []);
    setBikeTypes(bikeTypePayload.bikeTypes || []);
  };

  const hydrateSelectionsFromNode = (nodeId: number | null) => {
    if (!nodeId) return setHierarchySelections(emptyLevelSelections);
    const nodeById = new Map(hierarchyNodes.map((node) => [node.id, node]));
    const next = { ...emptyLevelSelections };
    let cursor: QPartHierarchyNode | undefined = nodeById.get(nodeId);
    while (cursor) {
      next[cursor.level] = String(cursor.id);
      cursor = cursor.parent_id ? nodeById.get(cursor.parent_id) : undefined;
    }
    setHierarchySelections(next);
  };

  useEffect(() => {
    void loadDependencies();
  }, []);

  useEffect(() => {
    if (!partId) return;
    const loadPart = async () => {
      const res = await fetch(`/api/qpart/parts/${partId}`);
      const payload = await res.json().catch(() => ({}));
      const row = payload.row;
      if (!row) return;

      setPartNumber(row.part.part_number || '');
      setDefaultName(row.part.default_name || '');
      setDefaultDescription(row.part.default_description || '');
      setStatus(row.part.status || 'active');
      setSelectedBikeTypes(row.bike_types || []);
      setCompatibilityRules(row.compatibility_rules || []);

      const nextTranslations: Record<string, { name: string; description: string }> = {};
      for (const locale of row.translations || []) {
        nextTranslations[locale.locale] = {
          name: locale.name || '',
          description: locale.description || '',
        };
      }
      setTranslations(nextTranslations);

      const nextMetadataBase: Record<string, unknown> = {};
      const nextMetadataTranslations: Record<string, Record<string, unknown>> = {};
      for (const value of row.metadata_values || []) {
        const key = String(value.metadata_definition_id);
        const candidate = value.value_json ?? value.value_date ?? value.value_boolean ?? value.value_number ?? value.value_text ?? '';
        if ((value.locale || baseLocale) === baseLocale) {
          nextMetadataBase[key] = candidate;
        } else {
          if (!nextMetadataTranslations[key]) nextMetadataTranslations[key] = {};
          nextMetadataTranslations[key][value.locale] = candidate;
        }
      }
      setMetadataValues(nextMetadataBase);
      setMetadataTranslations(nextMetadataTranslations);

      hydrateSelectionsFromNode(row.part.hierarchy_node_id ?? null);
    };
    void loadPart();
  }, [partId, hierarchyNodes.length]);

  const getLevelOptions = (level: number) => {
    if (level === 1) return hierarchyNodes.filter((node) => node.level === 1 && node.is_active);
    const parentId = hierarchySelections[level - 1];
    if (!parentId) return [];
    return hierarchyNodes.filter((node) => node.level === level && String(node.parent_id ?? '') === parentId && node.is_active);
  };

  const setHierarchyLevel = (level: number, value: string) => {
    const next = { ...hierarchySelections, [level]: value };
    for (let l = level + 1; l <= 7; l += 1) next[l] = '';
    setHierarchySelections(next);
  };

  const deriveCompatibility = async () => {
    const res = await fetch('/api/qpart/compatibility/derive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bike_types: selectedBikeTypes }),
    });
    const payload = await res.json().catch(() => ({ rows: [] }));
    setDerivedCandidates(payload.rows || []);
  };

  const persist = async () => {
    const translationRows = locales
      .filter((locale) => locale !== baseLocale)
      .map((locale) => ({ locale, name: translations[locale]?.name || '', description: translations[locale]?.description || '' }));

    const metadataRows: Array<Record<string, unknown>> = [];
    for (const definition of metadataDefs) {
      const baseValue = metadataValues[String(definition.id)];
      metadataRows.push({ ...toMetadataPayload(definition.field_type, baseValue), metadata_definition_id: definition.id, locale: baseLocale });
      if (definition.is_translatable) {
        for (const locale of locales.filter((value) => value !== baseLocale)) {
          const localized = metadataTranslations[String(definition.id)]?.[locale];
          metadataRows.push({ ...toMetadataPayload(definition.field_type, localized), metadata_definition_id: definition.id, locale });
        }
      }
    }

    const payload = {
      part_number: partNumber,
      default_name: defaultName,
      default_description: defaultDescription,
      status,
      hierarchy_node_id: selectedHierarchyNodeId,
      translations: translationRows,
      metadata_values: metadataRows,
      bike_types: selectedBikeTypes,
      compatibility_rules: compatibilityRules,
    };

    const res = await fetch(partId ? `/api/qpart/parts/${partId}` : '/api/qpart/parts', {
      method: partId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responsePayload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(responsePayload.error || 'Failed to save part');
      return;
    }

    setMessage('Part saved');
    if (!partId && responsePayload.row?.part?.id) router.push(`/qpart/parts/${responsePayload.row.part.id}`);
  };

  return (
    <section className="pageRoot">
      <div className="compactPageHeader">
        <div>
          <h1>{partId ? `Edit part #${partId}` : 'Create part'}</h1>
          <p className="subtle">Core info, hierarchy, metadata, translations, and compatibility in one isolated QPart workflow.</p>
        </div>
        <div className="rowButtons">
          <Link className="tab" href="/qpart/parts">Back to parts</Link>
          <button className="primary" onClick={persist}>Save part</button>
        </div>
      </div>

      {message ? <div className="note">{message}</div> : null}

      <div className="card">
        <h3>Core</h3>
        <div className="denseGrid4">
          <label>Part number<input value={partNumber} onChange={(event) => setPartNumber(event.target.value)} /></label>
          <label>English title<input value={defaultName} onChange={(event) => setDefaultName(event.target.value)} /></label>
          <label>Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="draft">draft</option>
            </select>
          </label>
        </div>
        <label style={{ display: 'grid', gap: 6 }}>
          English description
          <textarea value={defaultDescription} onChange={(event) => setDefaultDescription(event.target.value)} rows={3} />
        </label>
      </div>

      <div className="card">
        <h3>Hierarchy assignment (1-7)</h3>
        <div className="denseGrid4">
          {Array.from({ length: 7 }).map((_, index) => {
            const level = index + 1;
            return (
              <label key={level}>L{level}
                <select value={hierarchySelections[level]} onChange={(event) => setHierarchyLevel(level, event.target.value)}>
                  <option value="">Unassigned</option>
                  {getLevelOptions(level).map((node) => <option key={node.id} value={node.id}>{node.label_en}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Metadata values</h3>
        {metadataDefs.map((definition) => (
          <div key={definition.id} style={{ marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              {definition.label_en} ({definition.key})
              <MetadataField
                definition={definition}
                value={metadataValues[String(definition.id)]}
                onChange={(value) => setMetadataValues((prev) => ({ ...prev, [String(definition.id)]: value }))}
              />
            </label>
            {definition.is_translatable ? (
              <div className="denseGrid4" style={{ marginTop: 8 }}>
                {locales.filter((locale) => locale !== baseLocale).map((locale) => (
                  <label key={`${definition.id}-${locale}`}>
                    {definition.label_en} ({locale})
                    <MetadataField
                      definition={definition}
                      value={metadataTranslations[String(definition.id)]?.[locale]}
                      onChange={(value) =>
                        setMetadataTranslations((prev) => ({
                          ...prev,
                          [String(definition.id)]: { ...(prev[String(definition.id)] || {}), [locale]: value },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Translations</h3>
        <p className="subtle">Base locale: {baseLocale}</p>
        <div className="denseGrid4">
          {locales.filter((locale) => locale !== baseLocale).map((locale) => (
            <div key={locale} className="tile">
              <strong>{locale}</strong>
              <label>Name
                <input
                  value={translations[locale]?.name || ''}
                  onChange={(event) => setTranslations((prev) => ({ ...prev, [locale]: { ...prev[locale], name: event.target.value, description: prev[locale]?.description || '' } }))}
                />
              </label>
              <label>Description
                <textarea
                  rows={2}
                  value={translations[locale]?.description || ''}
                  onChange={(event) => setTranslations((prev) => ({ ...prev, [locale]: { ...prev[locale], description: event.target.value, name: prev[locale]?.name || '' } }))}
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Compatibility</h3>
        <label>Bike types
          <select
            multiple
            className="multiSelect"
            value={selectedBikeTypes}
            onChange={(event) => setSelectedBikeTypes(Array.from(event.target.selectedOptions).map((opt) => opt.value))}
          >
            {bikeTypes.map((bikeType) => <option key={bikeType} value={bikeType}>{bikeType}</option>)}
          </select>
        </label>
        <div className="rowButtons" style={{ margin: '8px 0' }}>
          <button type="button" onClick={deriveCompatibility}>Derive compatibility options</button>
        </div>

        {!!derivedCandidates.length && (
          <div className="tableWrap" style={{ marginBottom: 8 }}>
            <table>
              <thead><tr><th>Bike type</th><th>Feature</th><th>Option</th><th>Source</th><th /></tr></thead>
              <tbody>
                {derivedCandidates.map((candidate, index) => (
                  <tr key={`${candidate.bike_type}-${candidate.feature_label}-${candidate.option_value}-${index}`}>
                    <td>{candidate.bike_type}</td>
                    <td>{candidate.feature_label}</td>
                    <td>{candidate.option_label || candidate.option_value}</td>
                    <td>{candidate.source}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          setCompatibilityRules((prev) => [
                            ...prev,
                            {
                              bike_type: candidate.bike_type,
                              feature_label: candidate.feature_label,
                              option_value: candidate.option_value,
                              option_label: candidate.option_label,
                              source: candidate.source === 'reference' ? 'reference' : 'derived',
                              is_active: true,
                            },
                          ])
                        }
                      >
                        Add rule
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="tableWrap">
          <table>
            <thead><tr><th>Bike type</th><th>Feature</th><th>Option value</th><th>Option label</th><th>Source</th><th>Active</th><th /></tr></thead>
            <tbody>
              {compatibilityRules.map((rule, index) => (
                <tr key={`${rule.bike_type}-${rule.feature_label}-${rule.option_value}-${index}`}>
                  <td><input value={rule.bike_type} onChange={(e) => updateRule(index, 'bike_type', e.target.value, setCompatibilityRules)} /></td>
                  <td><input value={rule.feature_label} onChange={(e) => updateRule(index, 'feature_label', e.target.value, setCompatibilityRules)} /></td>
                  <td><input value={rule.option_value} onChange={(e) => updateRule(index, 'option_value', e.target.value, setCompatibilityRules)} /></td>
                  <td><input value={rule.option_label || ''} onChange={(e) => updateRule(index, 'option_label', e.target.value, setCompatibilityRules)} /></td>
                  <td>
                    <select value={rule.source} onChange={(e) => updateRule(index, 'source', e.target.value as QPartCompatibilityRule['source'], setCompatibilityRules)}>
                      <option value="manual">manual</option>
                      <option value="derived">derived</option>
                      <option value="reference">reference</option>
                    </select>
                  </td>
                  <td><input type="checkbox" checked={rule.is_active} onChange={(e) => updateRule(index, 'is_active', e.target.checked, setCompatibilityRules)} /></td>
                  <td><button type="button" onClick={() => setCompatibilityRules((prev) => prev.filter((_, i) => i !== index))}>Remove</button></td>
                </tr>
              ))}
              {!compatibilityRules.length ? <tr><td colSpan={7}>No compatibility rules yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function toMetadataPayload(fieldType: string, rawValue: unknown) {
  if (fieldType === 'number') return { value_text: null, value_number: rawValue === '' ? null : Number(rawValue), value_boolean: null, value_date: null, value_json: null };
  if (fieldType === 'boolean') return { value_text: null, value_number: null, value_boolean: Boolean(rawValue), value_date: null, value_json: null };
  if (fieldType === 'date') return { value_text: null, value_number: null, value_boolean: null, value_date: String(rawValue || ''), value_json: null };
  if (fieldType === 'multi_select') return { value_text: null, value_number: null, value_boolean: null, value_date: null, value_json: Array.isArray(rawValue) ? rawValue : [] };
  return { value_text: String(rawValue ?? ''), value_number: null, value_boolean: null, value_date: null, value_json: null };
}

function updateRule<K extends keyof QPartCompatibilityRule>(
  index: number,
  key: K,
  value: QPartCompatibilityRule[K],
  setter: Dispatch<SetStateAction<QPartCompatibilityRule[]>>,
) {
  setter((prev) => prev.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [key]: value } : rule)));
}

function MetadataField({
  definition,
  value,
  onChange,
}: {
  definition: QPartMetadataDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (definition.field_type === 'long_text') {
    return <textarea rows={3} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
  }
  if (definition.field_type === 'number') {
    return <input type="number" value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(event.target.value)} />;
  }
  if (definition.field_type === 'boolean') {
    return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;
  }
  if (definition.field_type === 'date') {
    return <input type="date" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
  }
  if (definition.field_type === 'single_select') {
    return (
      <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {(definition.options_json || []).map((option) => (
          <option key={option.value} value={option.value}>{option.label || option.value}</option>
        ))}
      </select>
    );
  }
  if (definition.field_type === 'multi_select') {
    return (
      <select
        multiple
        className="multiSelect"
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((opt) => opt.value))}
      >
        {(definition.options_json || []).map((option) => (
          <option key={option.value} value={option.value}>{option.label || option.value}</option>
        ))}
      </select>
    );
  }

  return <input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
}
