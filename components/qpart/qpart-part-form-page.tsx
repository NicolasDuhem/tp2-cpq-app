'use client';

import Link from 'next/link';
import { ChangeEvent, Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QPART_CHANNEL_OPTIONS } from '@/lib/qpart/channels';
import { QPartCompatibilityCandidate, QPartCompatibilityRule, QPartHierarchyNode, QPartMetadataDefinition } from '@/types/qpart';

type Props = { partId?: number };
type LevelSelections = Record<number, string>;

const emptyLevelSelections: LevelSelections = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' };

export default function QPartPartFormPage({ partId }: Props) {
  const router = useRouter();
  const [partNumber, setPartNumber] = useState('');
  const [defaultName, setDefaultName] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [locales, setLocales] = useState<string[]>([]);
  const [baseLocale, setBaseLocale] = useState('en-GB');
  const [hierarchyNodes, setHierarchyNodes] = useState<QPartHierarchyNode[]>([]);
  const [metadataDefs, setMetadataDefs] = useState<QPartMetadataDefinition[]>([]);
  const [bikeTypes, setBikeTypes] = useState<string[]>([]);
  const [selectedBikeTypes, setSelectedBikeTypes] = useState<string[]>([]);
  const [translations, setTranslations] = useState<Record<string, { name: string; description: string }>>({});
  const [metadataValues, setMetadataValues] = useState<Record<string, unknown>>({});
  const [metadataTranslations, setMetadataTranslations] = useState<Record<string, Record<string, unknown>>>({});
  const [expandedMetadataLocales, setExpandedMetadataLocales] = useState<Record<string, boolean>>({});
  const [translatingMetadata, setTranslatingMetadata] = useState<Record<string, boolean>>({});
  const [metadataMessages, setMetadataMessages] = useState<Record<string, string>>({});
  const [expandedCoreLocales, setExpandedCoreLocales] = useState<Record<'name' | 'description', boolean>>({ name: false, description: false });
  const [translatingCore, setTranslatingCore] = useState<Record<'name' | 'description', boolean>>({ name: false, description: false });
  const [coreMessages, setCoreMessages] = useState<Record<'name' | 'description', string>>({ name: '', description: '' });
  const [hierarchyExpanded, setHierarchyExpanded] = useState(false);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [compatibilityExpanded, setCompatibilityExpanded] = useState(false);
  const [assignmentExpanded, setAssignmentExpanded] = useState(false);
  const [compatibilityRules, setCompatibilityRules] = useState<QPartCompatibilityRule[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [derivedCandidates, setDerivedCandidates] = useState<QPartCompatibilityCandidate[]>([]);
  const [hierarchySelections, setHierarchySelections] = useState<LevelSelections>(emptyLevelSelections);
  const [message, setMessage] = useState('');
  const [imageUploadMessage, setImageUploadMessage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const nonBaseLocales = useMemo(() => locales.filter((locale) => locale !== baseLocale), [locales, baseLocale]);

  const selectedHierarchyNodeId = useMemo(() => {
    for (let level = 7; level >= 1; level -= 1) {
      if (hierarchySelections[level]) return Number(hierarchySelections[level]);
    }
    return null;
  }, [hierarchySelections]);
  const booleanMetadataDefs = useMemo(
    () => metadataDefs.filter((definition) => definition.field_type === 'boolean'),
    [metadataDefs],
  );
  const warrantyMetadataDef = useMemo(
    () => booleanMetadataDefs.find((definition) => definition.label_en.trim().toLowerCase() === 'warranty item only'),
    [booleanMetadataDefs],
  );
  const nonBooleanMetadataDefs = useMemo(
    () => metadataDefs.filter((definition) => definition.field_type !== 'boolean'),
    [metadataDefs],
  );
  const metadataColumns = useMemo(() => {
    const left: QPartMetadataDefinition[] = [];
    const right: QPartMetadataDefinition[] = [];
    nonBooleanMetadataDefs.forEach((definition, index) => {
      if (index % 2 === 0) left.push(definition);
      else right.push(definition);
    });
    return { left, right };
  }, [nonBooleanMetadataDefs]);

  const loadDependencies = async () => {
    const [localeRes, hierarchyRes, metadataRes, bikeTypeRes, countryRes] = await Promise.all([
      fetch('/api/qpart/locales'),
      fetch('/api/qpart/hierarchy'),
      fetch('/api/qpart/metadata?activeOnly=true'),
      fetch('/api/qpart/bike-types'),
      fetch('/api/qpart/countries'),
    ]);
    const localePayload = await localeRes.json().catch(() => ({ locales: [], baseLocale: 'en-GB' }));
    const hierarchyPayload = await hierarchyRes.json().catch(() => ({ rows: [] }));
    const metadataPayload = await metadataRes.json().catch(() => ({ rows: [] }));
    const bikeTypePayload = await bikeTypeRes.json().catch(() => ({ bikeTypes: [] }));
    const countryPayload = await countryRes.json().catch(() => ({ countries: [] }));

    setLocales(localePayload.locales || []);
    setBaseLocale(localePayload.baseLocale || 'en-GB');
    setHierarchyNodes(hierarchyPayload.rows || []);
    setMetadataDefs(metadataPayload.rows || []);
    setBikeTypes(bikeTypePayload.bikeTypes || []);
    setCountryOptions(countryPayload.countries || []);
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
      setStatus(row.part.status || 'draft');
      setSelectedBikeTypes(row.bike_types || []);
      setSelectedChannels(row.channels || []);
      setSelectedCountries(row.country_codes || []);
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
  }, [partId, hierarchyNodes.length, baseLocale]);

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

  const translateMetadataField = async (definition: QPartMetadataDefinition) => {
    const key = String(definition.id);
    const baseValue = String(metadataValues[key] ?? '').trim();
    if (!baseValue) {
      setMetadataMessages((prev) => ({ ...prev, [key]: `Enter a ${baseLocale} value before translating.` }));
      return;
    }
    if (!partId) {
      setMetadataMessages((prev) => ({ ...prev, [key]: 'Save the part first before requesting AI translation.' }));
      return;
    }

    setMetadataMessages((prev) => ({ ...prev, [key]: '' }));
    setTranslatingMetadata((prev) => ({ ...prev, [key]: true }));

    const res = await fetch('/api/qpart/translations/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_id: partId,
        metadata_definition_id: definition.id,
        fill_missing_only: true,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    setTranslatingMetadata((prev) => ({ ...prev, [key]: false }));

    if (!res.ok) {
      setMetadataMessages((prev) => ({ ...prev, [key]: payload.error || 'Translation failed.' }));
      return;
    }

    const translatedRows = Array.isArray(payload.row?.translated) ? payload.row.translated : [];
    if (translatedRows.length) {
      setMetadataTranslations((prev) => {
        const next = { ...prev };
        const row = { ...(next[key] || {}) };
        for (const item of translatedRows) {
          row[item.locale] = item.text;
        }
        next[key] = row;
        return next;
      });
      setExpandedMetadataLocales((prev) => ({ ...prev, [key]: true }));
    }

    const skippedLocales = Array.isArray(payload.row?.skippedLocales) ? payload.row.skippedLocales.length : 0;
    const failedLocales = Array.isArray(payload.row?.failedLocales) ? payload.row.failedLocales.length : 0;

    if (failedLocales > 0) {
      setMetadataMessages((prev) => ({
        ...prev,
        [key]: `Translated ${translatedRows.length} locale(s), ${failedLocales} failed, ${skippedLocales} skipped (already filled).`,
      }));
      return;
    }

    if (!translatedRows.length) {
      setMetadataMessages((prev) => ({ ...prev, [key]: 'All locale values are already filled.' }));
      return;
    }

    setMetadataMessages((prev) => ({ ...prev, [key]: `Translated ${translatedRows.length} locale(s). ${skippedLocales} skipped (already filled).` }));
  };

  const translateCoreField = async (field: 'name' | 'description') => {
    const baseValue = (field === 'name' ? defaultName : defaultDescription).trim();
    if (!baseValue) {
      const label = field === 'name' ? 'English title' : 'English description';
      setCoreMessages((prev) => ({ ...prev, [field]: `Enter ${label} before translating.` }));
      return;
    }
    if (!partId) {
      setCoreMessages((prev) => ({ ...prev, [field]: 'Save the part first before requesting AI translation.' }));
      return;
    }

    setCoreMessages((prev) => ({ ...prev, [field]: '' }));
    setTranslatingCore((prev) => ({ ...prev, [field]: true }));

    const res = await fetch('/api/qpart/translations/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_id: partId,
        core_field: field,
        fill_missing_only: true,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    setTranslatingCore((prev) => ({ ...prev, [field]: false }));

    if (!res.ok) {
      setCoreMessages((prev) => ({ ...prev, [field]: payload.error || 'Translation failed.' }));
      return;
    }

    const translatedRows = Array.isArray(payload.row?.translated) ? payload.row.translated : [];
    if (translatedRows.length) {
      setTranslations((prev) => {
        const next = { ...prev };
        for (const item of translatedRows) {
          next[item.locale] = {
            name: next[item.locale]?.name || '',
            description: next[item.locale]?.description || '',
            [field]: item.text,
          };
        }
        return next;
      });
      setExpandedCoreLocales((prev) => ({ ...prev, [field]: true }));
    }

    const skippedLocales = Array.isArray(payload.row?.skippedLocales) ? payload.row.skippedLocales.length : 0;
    const failedLocales = Array.isArray(payload.row?.failedLocales) ? payload.row.failedLocales.length : 0;

    if (failedLocales > 0) {
      setCoreMessages((prev) => ({
        ...prev,
        [field]: `Translated ${translatedRows.length} locale(s), ${failedLocales} failed, ${skippedLocales} skipped (already filled).`,
      }));
      return;
    }
    if (!translatedRows.length) {
      setCoreMessages((prev) => ({ ...prev, [field]: 'All locale values are already filled.' }));
      return;
    }
    setCoreMessages((prev) => ({ ...prev, [field]: `Translated ${translatedRows.length} locale(s). ${skippedLocales} skipped (already filled).` }));
  };


  const resizeImageFile = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to process image.');

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Unable to encode image.');

    return new File([blob], `${partNumber}.jpg`, { type: 'image/jpeg' });
  };

  const onImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      setImageUploadMessage('No file selected.');
      return;
    }
    if (!partId || !partNumber.trim()) {
      setImageUploadMessage('Save the part with a valid part number before uploading an image.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setImageUploadMessage('Please select an image file.');
      return;
    }

    setUploadingImage(true);
    setImageUploadMessage('Processing image…');

    try {
      const optimizedFile = await resizeImageFile(file);
      const formData = new FormData();
      formData.append('image', optimizedFile);

      const response = await fetch(`/api/qpart/parts/${partId}/image`, { method: 'POST', body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Upload failed.');

      setImageUploadMessage('Picture uploaded successfully.');
    } catch (error) {
      setImageUploadMessage(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };
  const persist = async () => {
    const translationRows = nonBaseLocales.map((locale) => ({ locale, name: translations[locale]?.name || '', description: translations[locale]?.description || '' }));

    const metadataRows: Array<Record<string, unknown>> = [];
    for (const definition of metadataDefs) {
      const baseValue = metadataValues[String(definition.id)];
      metadataRows.push({ ...toMetadataPayload(definition.field_type, baseValue), metadata_definition_id: definition.id, locale: baseLocale });
      if (definition.is_translatable) {
        for (const locale of nonBaseLocales) {
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
      channels: selectedChannels,
      country_codes: selectedCountries,
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
          <h1>{partId ? (partNumber || `Part #${partId}`) : 'Create part'}</h1>
          <p className="subtle">Core info, hierarchy, metadata, and compatibility in one isolated QPart workflow.</p>
        </div>
        <div className="rowButtons">
          <Link className="tab" href="/qpart/parts">Back to parts</Link>
          {partId ? <a className="tab" href={`/api/qpart/parts/export?part_id=${partId}`}>Export CSV</a> : null}
          <button className="primary" onClick={persist}>Save part</button>
        </div>
      </div>

      {message ? <div className="note">{message}</div> : null}
      {imageUploadMessage ? <div className="note">{imageUploadMessage}</div> : null}

      <div className="card">
        <div className="qpartTopHeader">
          <div className="qpartTopIdentity">
            <div className="qpartPartIdentityRow">
              <h3 className="qpartPartNumberTitle">{partNumber || (partId ? `Part #${partId}` : 'New part')}</h3>
              {partId ? (
                <>
                  <button type="button" className="tab qpartTakePictureButton" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage || !partNumber.trim()}>
                    {uploadingImage ? 'Uploading…' : 'Take picture'}
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" capture="environment" onChange={onImageFileChange} style={{ display: 'none' }} />
                </>
              ) : null}
            </div>
            {!partId ? (
              <label className="qpartTopHeaderInput">
                Assign part number
                <input value={partNumber} onChange={(event) => setPartNumber(event.target.value)} placeholder="e.g. QP-0002" />
              </label>
            ) : null}
          </div>
          <div className="qpartTopHeaderStatus">
            <div className="qpartStatusSegmented" role="group" aria-label="Part status">
              {(['active', 'inactive', 'draft'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={status === value ? 'isSelected' : ''}
                  onClick={() => setStatus(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="qpartTopHeaderRight">
            {warrantyMetadataDef ? (
              <label className="inlineCheck" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(metadataValues[String(warrantyMetadataDef.id)])}
                  onChange={(event) =>
                    setMetadataValues((prev) => ({
                      ...prev,
                      [String(warrantyMetadataDef.id)]: event.target.checked,
                    }))
                  }
                />
                {warrantyMetadataDef.label_en}
              </label>
            ) : null}
          </div>
        </div>

        <div className="qpartCoreColumns">
          <div className="qpartCoreColumn">
            <label className="qpartFieldLabel">
              Title ({baseLocale})
              <textarea className="qpartCoreMainField" rows={2} value={defaultName} onChange={(event) => setDefaultName(event.target.value)} />
            </label>
            <div className="qpartFieldActions">
              <button type="button" onClick={() => setExpandedCoreLocales((prev) => ({ ...prev, name: !prev.name }))}>
                {expandedCoreLocales.name ? 'Hide translations' : 'Translations'}
              </button>
              <span className="subtle">
                {nonBaseLocales.filter((locale) => translations[locale]?.name?.trim()).length}/{nonBaseLocales.length} translated
              </span>
              <button type="button" disabled={!partId || translatingCore.name} onClick={() => void translateCoreField('name')}>
                {translatingCore.name ? 'Translating…' : 'Auto-translate'}
              </button>
            </div>
            {expandedCoreLocales.name ? (
              <div className="qpartTranslationStack">
                {nonBaseLocales.map((locale) => (
                  <label key={`name-${locale}`} className="qpartFieldLabel">
                    Title ({locale})
                    <textarea
                      className="qpartCoreMainField"
                      rows={2}
                      value={translations[locale]?.name || ''}
                      onChange={(event) =>
                        setTranslations((prev) => ({
                          ...prev,
                          [locale]: { ...prev[locale], name: event.target.value, description: prev[locale]?.description || '' },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}
            {coreMessages.name ? <p className="subtle" style={{ margin: 0 }}>{coreMessages.name}</p> : null}
          </div>

          <div className="qpartCoreColumn">
            <label className="qpartFieldLabel">
              Description ({baseLocale})
              <textarea className="qpartCoreMainField" value={defaultDescription} onChange={(event) => setDefaultDescription(event.target.value)} rows={2} />
            </label>
            <div className="qpartFieldActions">
              <button type="button" onClick={() => setExpandedCoreLocales((prev) => ({ ...prev, description: !prev.description }))}>
                {expandedCoreLocales.description ? 'Hide translations' : 'Translations'}
              </button>
              <span className="subtle">
                {nonBaseLocales.filter((locale) => translations[locale]?.description?.trim()).length}/{nonBaseLocales.length} translated
              </span>
              <button type="button" disabled={!partId || translatingCore.description} onClick={() => void translateCoreField('description')}>
                {translatingCore.description ? 'Translating…' : 'Auto-translate'}
              </button>
            </div>
            {expandedCoreLocales.description ? (
              <div className="qpartTranslationStack">
                {nonBaseLocales.map((locale) => (
                  <label key={`description-${locale}`} className="qpartFieldLabel">
                    Description ({locale})
                    <textarea
                      className="qpartCoreMainField"
                      rows={2}
                      value={translations[locale]?.description || ''}
                      onChange={(event) =>
                        setTranslations((prev) => ({
                          ...prev,
                          [locale]: { ...prev[locale], description: event.target.value, name: prev[locale]?.name || '' },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}
            {coreMessages.description ? <p className="subtle" style={{ margin: 0 }}>{coreMessages.description}</p> : null}
          </div>
        </div>
        {booleanMetadataDefs.length ? (
          <div className="qpartBooleanStrip">
            {booleanMetadataDefs
              .filter((definition) => definition.id !== warrantyMetadataDef?.id)
              .map((definition) => {
                const key = String(definition.id);
                return (
                  <label key={definition.id} className="inlineCheck" style={{ marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(metadataValues[key])}
                      onChange={(event) => setMetadataValues((prev) => ({ ...prev, [key]: event.target.checked }))}
                    />
                    {definition.label_en}
                  </label>
                );
              })}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="qpartSectionHeader">
          <h3>Hierarchy assignment (1-7)</h3>
          <button type="button" onClick={() => setHierarchyExpanded((prev) => !prev)}>
            {hierarchyExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {hierarchyExpanded ? (
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
        ) : null}
      </div>

      <div className="card">
        <div className="qpartSectionHeader">
          <h3>Metadata values</h3>
          <button type="button" onClick={() => setMetadataExpanded((prev) => !prev)}>
            {metadataExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {metadataExpanded ? (
          <div className="qpartMetadataGrid">
            <div className="qpartMetadataColumn">
              {metadataColumns.left.map((definition) => (
                <MetadataRow
                  key={definition.id}
                  definition={definition}
                  baseLocale={baseLocale}
                  nonBaseLocales={nonBaseLocales}
                  partId={partId}
                  baseValue={metadataValues[String(definition.id)]}
                  translatedValues={metadataTranslations[String(definition.id)]}
                  message={metadataMessages[String(definition.id)]}
                  isExpanded={Boolean(expandedMetadataLocales[String(definition.id)])}
                  isTranslating={Boolean(translatingMetadata[String(definition.id)])}
                  onToggleTranslations={() =>
                    setExpandedMetadataLocales((prev) => ({ ...prev, [String(definition.id)]: !prev[String(definition.id)] }))
                  }
                  onAutoTranslate={() => void translateMetadataField(definition)}
                  onBaseChange={(value) => setMetadataValues((prev) => ({ ...prev, [String(definition.id)]: value }))}
                  onTranslatedChange={(locale, value) =>
                    setMetadataTranslations((prev) => ({
                      ...prev,
                      [String(definition.id)]: { ...(prev[String(definition.id)] || {}), [locale]: value },
                    }))
                  }
                />
              ))}
            </div>
            <div className="qpartMetadataColumn">
              {metadataColumns.right.map((definition) => (
                <MetadataRow
                  key={definition.id}
                  definition={definition}
                  baseLocale={baseLocale}
                  nonBaseLocales={nonBaseLocales}
                  partId={partId}
                  baseValue={metadataValues[String(definition.id)]}
                  translatedValues={metadataTranslations[String(definition.id)]}
                  message={metadataMessages[String(definition.id)]}
                  isExpanded={Boolean(expandedMetadataLocales[String(definition.id)])}
                  isTranslating={Boolean(translatingMetadata[String(definition.id)])}
                  onToggleTranslations={() =>
                    setExpandedMetadataLocales((prev) => ({ ...prev, [String(definition.id)]: !prev[String(definition.id)] }))
                  }
                  onAutoTranslate={() => void translateMetadataField(definition)}
                  onBaseChange={(value) => setMetadataValues((prev) => ({ ...prev, [String(definition.id)]: value }))}
                  onTranslatedChange={(locale, value) =>
                    setMetadataTranslations((prev) => ({
                      ...prev,
                      [String(definition.id)]: { ...(prev[String(definition.id)] || {}), [locale]: value },
                    }))
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="qpartSectionHeader">
          <h3>Channel &amp; Country assignment</h3>
          <button type="button" onClick={() => setAssignmentExpanded((prev) => !prev)}>
            {assignmentExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {assignmentExpanded ? (
          <>
            <div className="denseGrid4">
              <label>Channels
                <select
                  multiple
                  className="multiSelect"
                  value={selectedChannels}
                  onChange={(event) => setSelectedChannels(Array.from(event.target.selectedOptions).map((opt) => opt.value))}
                >
                  {QPART_CHANNEL_OPTIONS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </label>
              <label>Countries
                <select
                  multiple
                  className="multiSelect"
                  value={selectedCountries}
                  onChange={(event) => setSelectedCountries(Array.from(event.target.selectedOptions).map((opt) => opt.value))}
                >
                  {countryOptions.map((countryCode) => (
                    <option key={countryCode} value={countryCode}>
                      {countryCode}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="subtle" style={{ marginBottom: 0 }}>
              Country selection edits the same allocation matrix used by /sales/qpart-allocation (selected = active, unselected = inactive).
            </p>
          </>
        ) : null}
      </div>

      <div className="card">
        <div className="qpartSectionHeader">
          <h3>Compatibility</h3>
          <button type="button" onClick={() => setCompatibilityExpanded((prev) => !prev)}>
            {compatibilityExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {compatibilityExpanded ? (
          <>
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
          </>
        ) : null}
      </div>
    </section>
  );
}

function hasMetadataValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
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

function MetadataRow({
  definition,
  baseLocale,
  nonBaseLocales,
  partId,
  baseValue,
  translatedValues,
  message,
  isExpanded,
  isTranslating,
  onToggleTranslations,
  onAutoTranslate,
  onBaseChange,
  onTranslatedChange,
}: {
  definition: QPartMetadataDefinition;
  baseLocale: string;
  nonBaseLocales: string[];
  partId?: number;
  baseValue: unknown;
  translatedValues?: Record<string, unknown>;
  message?: string;
  isExpanded: boolean;
  isTranslating: boolean;
  onToggleTranslations: () => void;
  onAutoTranslate: () => void;
  onBaseChange: (value: unknown) => void;
  onTranslatedChange: (locale: string, value: unknown) => void;
}) {
  const translatedCount = definition.is_translatable
    ? nonBaseLocales.filter((locale) => hasMetadataValue(translatedValues?.[locale])).length
    : 0;
  const totalTranslations = definition.is_translatable ? nonBaseLocales.length : 0;

  return (
    <div className="qpartMetadataRow">
      <label className="qpartFieldLabel">
        {definition.label_en} ({baseLocale})
        <MetadataField
          definition={definition}
          value={baseValue}
          onChange={onBaseChange}
        />
      </label>

      {definition.is_translatable ? (
        <div className="qpartFieldActions">
          <button type="button" onClick={onToggleTranslations}>
            {isExpanded ? 'Hide translations' : 'Translations'}
          </button>
          <span className="subtle">{translatedCount}/{totalTranslations} translated</span>
          <button type="button" disabled={!partId || isTranslating} onClick={onAutoTranslate}>
            {isTranslating ? 'Translating…' : 'Auto-translate'}
          </button>
        </div>
      ) : null}

      {definition.is_translatable && isExpanded ? (
        <div className="qpartTranslationStack">
          {nonBaseLocales.map((locale) => (
            <label key={`${definition.id}-${locale}`} className="qpartFieldLabel">
              {definition.label_en} ({locale})
              <MetadataField
                definition={definition}
                value={translatedValues?.[locale]}
                onChange={(value) => onTranslatedChange(locale, value)}
              />
            </label>
          ))}
        </div>
      ) : null}

      {message ? <p className="subtle" style={{ margin: 0 }}>{message}</p> : null}
    </div>
  );
}
