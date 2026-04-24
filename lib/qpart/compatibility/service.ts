import { sql } from '@/lib/db/client';
import { QPartCompatibilityCandidate } from '@/types/qpart';

const asTrimmedText = (value: unknown) => String(value ?? '').trim();

export async function listBikeTypes() {
  const rows = (await sql`
    select distinct bike_type
    from CPQ_setup_ruleset
    where bike_type is not null
      and btrim(bike_type) <> ''
    order by bike_type
  `) as Array<{ bike_type: string }>;

  return rows.map((row) => row.bike_type);
}

export async function listReferenceValues(bikeType?: string) {
  const filter = asTrimmedText(bikeType);
  return (await sql`
    select id, bike_type, feature_label, option_value, option_label, is_active, created_at, updated_at
    from qpart_compatibility_reference_values
    where (${filter} = '' or bike_type = ${filter})
    order by bike_type, feature_label, option_value
  `) as Array<{
    id: number;
    bike_type: string;
    feature_label: string;
    option_value: string;
    option_label: string | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
  }>;
}

export async function createReferenceValue(input: Record<string, unknown>) {
  const bikeType = asTrimmedText(input.bike_type);
  const featureLabel = asTrimmedText(input.feature_label);
  const optionValue = asTrimmedText(input.option_value);
  const optionLabel = asTrimmedText(input.option_label) || null;
  const isActive = typeof input.is_active === 'boolean' ? input.is_active : true;

  if (!bikeType || !featureLabel || !optionValue) {
    throw new Error('bike_type, feature_label, and option_value are required');
  }

  const rows = (await sql`
    insert into qpart_compatibility_reference_values (bike_type, feature_label, option_value, option_label, is_active)
    values (${bikeType}, ${featureLabel}, ${optionValue}, ${optionLabel}, ${isActive})
    returning id, bike_type, feature_label, option_value, option_label, is_active, created_at, updated_at
  `) as Array<Record<string, unknown>>;

  return rows[0];
}

export async function updateReferenceValue(id: number, input: Record<string, unknown>) {
  const bikeType = asTrimmedText(input.bike_type);
  const featureLabel = asTrimmedText(input.feature_label);
  const optionValue = asTrimmedText(input.option_value);
  const optionLabel = asTrimmedText(input.option_label) || null;
  const isActive = typeof input.is_active === 'boolean' ? input.is_active : true;

  if (!bikeType || !featureLabel || !optionValue) {
    throw new Error('bike_type, feature_label, and option_value are required');
  }

  const rows = (await sql`
    update qpart_compatibility_reference_values
    set bike_type = ${bikeType},
        feature_label = ${featureLabel},
        option_value = ${optionValue},
        option_label = ${optionLabel},
        is_active = ${isActive},
        updated_at = now()
    where id = ${id}
    returning id, bike_type, feature_label, option_value, option_label, is_active, created_at, updated_at
  `) as Array<Record<string, unknown>>;

  return rows[0] ?? null;
}

export async function deleteReferenceValue(id: number) {
  await sql`delete from qpart_compatibility_reference_values where id = ${id}`;
}

const parseSamplerCandidates = (json: unknown) => {
  const normalized = new Map<string, QPartCompatibilityCandidate>();
  const payload = typeof json === 'string' ? JSON.parse(json) : json;
  if (!payload || typeof payload !== 'object') return normalized;

  const selectedOptions = Array.isArray((payload as Record<string, unknown>).selectedOptions)
    ? ((payload as Record<string, unknown>).selectedOptions as Array<Record<string, unknown>>)
    : [];

  if (selectedOptions.length > 0) {
    for (const option of selectedOptions) {
      const feature_label = asTrimmedText(option.featureLabel);
      const option_value = asTrimmedText(option.optionValue);
      const option_label = asTrimmedText(option.optionLabel) || null;
      if (!feature_label || !option_value) continue;
      normalized.set(`${feature_label}::${option_value}`, {
        bike_type: '',
        feature_label,
        option_value,
        option_label,
        source: 'derived',
      });
    }
    return normalized;
  }

  const fallback = (payload as Record<string, unknown>).dropdownOrderSnapshot;
  const fallbackEntries = fallback && typeof fallback === 'object' ? Object.entries(fallback as Record<string, unknown>) : [];

  for (const [featureLabel, value] of fallbackEntries) {
    const optionValue = asTrimmedText(value);
    if (!featureLabel || !optionValue) continue;
    normalized.set(`${featureLabel}::${optionValue}`, {
      bike_type: '',
      feature_label: featureLabel,
      option_value: optionValue,
      option_label: null,
      source: 'derived',
    });
  }

  return normalized;
};

export async function deriveCompatibilityCandidates(bikeTypes: string[], sampleLimit = 300) {
  const uniqueBikeTypes = [...new Set(bikeTypes.map((bikeType) => bikeType.trim()).filter(Boolean))];
  if (!uniqueBikeTypes.length) return [] as QPartCompatibilityCandidate[];

  const rulesets = (await sql`
    select distinct bike_type, cpq_ruleset
    from CPQ_setup_ruleset
    where bike_type = any(${uniqueBikeTypes}::text[])
      and cpq_ruleset is not null
      and btrim(cpq_ruleset) <> ''
  `) as Array<{ bike_type: string; cpq_ruleset: string }>;

  const bikeTypeByRuleset = new Map<string, string[]>();
  for (const row of rulesets) {
    const list = bikeTypeByRuleset.get(row.cpq_ruleset) ?? [];
    list.push(row.bike_type);
    bikeTypeByRuleset.set(row.cpq_ruleset, list);
  }

  const rulesetNames = [...bikeTypeByRuleset.keys()];
  if (!rulesetNames.length) return [];

  const sampleRows = (await sql`
    select ruleset, json_result
    from CPQ_sampler_result
    where ruleset = any(${rulesetNames}::text[])
    order by created_at desc
    limit ${sampleLimit}
  `) as Array<{ ruleset: string; json_result: unknown }>;

  const candidates = new Map<string, QPartCompatibilityCandidate>();

  for (const row of sampleRows) {
    let parsed = new Map<string, QPartCompatibilityCandidate>();
    try {
      parsed = parseSamplerCandidates(row.json_result);
    } catch {
      continue;
    }

    const relatedBikeTypes = bikeTypeByRuleset.get(row.ruleset) ?? [];
    for (const bikeType of relatedBikeTypes) {
      for (const entry of parsed.values()) {
        const key = `${bikeType}::${entry.feature_label}::${entry.option_value}`;
        candidates.set(key, { ...entry, bike_type: bikeType, source: 'derived' });
      }
    }
  }

  const referenceRows = (await sql`
    select bike_type, feature_label, option_value, option_label
    from qpart_compatibility_reference_values
    where is_active = true
      and bike_type = any(${uniqueBikeTypes}::text[])
  `) as Array<{ bike_type: string; feature_label: string; option_value: string; option_label: string | null }>;

  for (const ref of referenceRows) {
    const key = `${ref.bike_type}::${ref.feature_label}::${ref.option_value}`;
    if (!candidates.has(key)) {
      candidates.set(key, {
        bike_type: ref.bike_type,
        feature_label: ref.feature_label,
        option_value: ref.option_value,
        option_label: ref.option_label,
        source: 'reference',
      });
    }
  }

  return [...candidates.values()].sort((a, b) =>
    `${a.bike_type}|${a.feature_label}|${a.option_value}`.localeCompare(`${b.bike_type}|${b.feature_label}|${b.option_value}`),
  );
}
