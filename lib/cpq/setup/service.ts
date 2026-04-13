import { sql } from '@/lib/db/client';

import { CpqAccountContextRecord, CpqImageLayerResolution, CpqImageManagementRecord, CpqImageSelectionLookup, CpqResolvedImageLayer, CpqRulesetRecord } from '@/types/setup';

const parseBoolean = (value: unknown, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
};

const asTrimmedText = (value: unknown) => String(value ?? '').trim();
const asNullableTrimmedText = (value: unknown) => {
  const trimmed = asTrimmedText(value);
  return trimmed.length ? trimmed : null;
};
const ISO2_COUNTRY_REGEX = /^[A-Z]{2}$/;

export async function listAccountContexts(activeOnly = false) {
  if (activeOnly) {
    return (await sql`
      select id, account_code, customer_id, currency, language, country_code, is_active, created_at, updated_at
      from CPQ_setup_account_context
      where is_active = true
      order by account_code
    `) as CpqAccountContextRecord[];
  }

  return (await sql`
    select id, account_code, customer_id, currency, language, country_code, is_active, created_at, updated_at
    from CPQ_setup_account_context
    order by account_code
  `) as CpqAccountContextRecord[];
}

export async function createAccountContext(input: Record<string, unknown>) {
  const accountCode = asTrimmedText(input.account_code).toUpperCase();
  const customerId = asTrimmedText(input.customer_id);
  const currency = asTrimmedText(input.currency).toUpperCase();
  const language = asTrimmedText(input.language);
  const countryCode = asTrimmedText(input.country_code).toUpperCase();

  if (!accountCode || !customerId || !currency || !language || !countryCode) {
    throw new Error('account_code, customer_id, currency, language, and country_code are required');
  }

  if (!ISO2_COUNTRY_REGEX.test(countryCode)) {
    throw new Error('country_code must be a 2-letter ISO code (for example, GB)');
  }

  const rows = (await sql`
    insert into CPQ_setup_account_context (account_code, customer_id, currency, language, country_code, is_active)
    values (${accountCode}, ${customerId}, ${currency}, ${language}, ${countryCode}, ${parseBoolean(input.is_active, true)})
    returning id, account_code, customer_id, currency, language, country_code, is_active, created_at, updated_at
  `) as CpqAccountContextRecord[];

  return rows[0];
}

export async function updateAccountContext(id: number, input: Record<string, unknown>) {
  const accountCode = asTrimmedText(input.account_code).toUpperCase();
  const customerId = asTrimmedText(input.customer_id);
  const currency = asTrimmedText(input.currency).toUpperCase();
  const language = asTrimmedText(input.language);
  const countryCode = asTrimmedText(input.country_code).toUpperCase();

  if (!accountCode || !customerId || !currency || !language || !countryCode) {
    throw new Error('account_code, customer_id, currency, language, and country_code are required');
  }

  if (!ISO2_COUNTRY_REGEX.test(countryCode)) {
    throw new Error('country_code must be a 2-letter ISO code (for example, GB)');
  }

  const rows = (await sql`
    update CPQ_setup_account_context
    set account_code = ${accountCode},
        customer_id = ${customerId},
        currency = ${currency},
        language = ${language},
        country_code = ${countryCode},
        is_active = ${parseBoolean(input.is_active, true)}
    where id = ${id}
    returning id, account_code, customer_id, currency, language, country_code, is_active, created_at, updated_at
  `) as CpqAccountContextRecord[];

  return rows[0] ?? null;
}

export async function deleteAccountContext(id: number) {
  await sql`delete from CPQ_setup_account_context where id = ${id}`;
}

export async function listRulesets(activeOnly = false) {
  if (activeOnly) {
    return (await sql`
      select id, cpq_ruleset, description, bike_type, namespace, header_id, is_active, sort_order, created_at, updated_at
      from CPQ_setup_ruleset
      where is_active = true
      order by sort_order, cpq_ruleset
    `) as CpqRulesetRecord[];
  }

  return (await sql`
    select id, cpq_ruleset, description, bike_type, namespace, header_id, is_active, sort_order, created_at, updated_at
    from CPQ_setup_ruleset
    order by sort_order, cpq_ruleset
  `) as CpqRulesetRecord[];
}

export async function createRuleset(input: Record<string, unknown>) {
  const cpqRuleset = asTrimmedText(input.cpq_ruleset);
  if (!cpqRuleset) {
    throw new Error('cpq_ruleset is required');
  }

  const rows = (await sql`
    insert into CPQ_setup_ruleset (cpq_ruleset, description, bike_type, namespace, header_id, sort_order, is_active)
    values (
      ${cpqRuleset},
      ${asTrimmedText(input.description) || null},
      ${asTrimmedText(input.bike_type) || null},
      ${asTrimmedText(input.namespace) || 'Default'},
      ${asTrimmedText(input.header_id) || 'Simulator'},
      ${Number(input.sort_order ?? 0)},
      ${parseBoolean(input.is_active, true)}
    )
    returning id, cpq_ruleset, description, bike_type, namespace, header_id, is_active, sort_order, created_at, updated_at
  `) as CpqRulesetRecord[];

  return rows[0];
}

export async function updateRuleset(id: number, input: Record<string, unknown>) {
  const cpqRuleset = asTrimmedText(input.cpq_ruleset);
  if (!cpqRuleset) {
    throw new Error('cpq_ruleset is required');
  }

  const rows = (await sql`
    update CPQ_setup_ruleset
    set cpq_ruleset = ${cpqRuleset},
        description = ${asTrimmedText(input.description) || null},
        bike_type = ${asTrimmedText(input.bike_type) || null},
        namespace = ${asTrimmedText(input.namespace) || 'Default'},
        header_id = ${asTrimmedText(input.header_id) || 'Simulator'},
        sort_order = ${Number(input.sort_order ?? 0)},
        is_active = ${parseBoolean(input.is_active, true)}
    where id = ${id}
    returning id, cpq_ruleset, description, bike_type, namespace, header_id, is_active, sort_order, created_at, updated_at
  `) as CpqRulesetRecord[];

  return rows[0] ?? null;
}

export async function deleteRuleset(id: number) {
  await sql`delete from CPQ_setup_ruleset where id = ${id}`;
}

export async function listImageManagementRows(filters: { featureLabel?: string; onlyMissingPicture?: boolean } = {}) {
  const featureLabel = asTrimmedText(filters.featureLabel);
  const onlyMissingPicture = Boolean(filters.onlyMissingPicture);

  return (await sql`
    select
      id,
      feature_label,
      option_label,
      option_value,
      picture_link_1,
      picture_link_2,
      picture_link_3,
      picture_link_4,
      is_active,
      created_at,
      updated_at
    from cpq_image_management
    where (${featureLabel} = '' or feature_label ilike ${`%${featureLabel}%`})
      and (
        not ${onlyMissingPicture}
        or (
          (picture_link_1 is null or btrim(picture_link_1) = '')
          and (picture_link_2 is null or btrim(picture_link_2) = '')
          and (picture_link_3 is null or btrim(picture_link_3) = '')
          and (picture_link_4 is null or btrim(picture_link_4) = '')
        )
      )
    order by feature_label, option_label, option_value
  `) as CpqImageManagementRecord[];
}

export async function updateImageManagementRow(id: number, input: Record<string, unknown>) {
  const pictureLink1 = asNullableTrimmedText(input.picture_link_1);
  const pictureLink2 = asNullableTrimmedText(input.picture_link_2);
  const pictureLink3 = asNullableTrimmedText(input.picture_link_3);
  const pictureLink4 = asNullableTrimmedText(input.picture_link_4);
  const isActive = parseBoolean(input.is_active, true);

  const rows = (await sql`
    update cpq_image_management
    set picture_link_1 = ${pictureLink1},
        picture_link_2 = ${pictureLink2},
        picture_link_3 = ${pictureLink3},
        picture_link_4 = ${pictureLink4},
        is_active = ${isActive}
    where id = ${id}
    returning
      id,
      feature_label,
      option_label,
      option_value,
      picture_link_1,
      picture_link_2,
      picture_link_3,
      picture_link_4,
      is_active,
      created_at,
      updated_at
  `) as CpqImageManagementRecord[];

  return rows[0] ?? null;
}

export async function syncImageManagementFromSampler() {
  const samplerRows = (await sql`
    select id, json_result
    from CPQ_sampler_result
    where processed_for_image_sync = false
    order by id
  `) as Array<{ id: number; json_result: unknown }>;

  const distinctKeys = new Set<string>();
  const distinctRows: Array<{ feature_label: string; option_label: string; option_value: string }> = [];
  let selectedOptionsScanned = 0;
  const syncErrors: string[] = [];
  let samplerRowsMarkedProcessed = 0;

  for (const row of samplerRows) {
    try {
      if (row.json_result && typeof row.json_result === 'object') {
        const payload = row.json_result as Record<string, unknown>;
        const selectedOptions = payload.selectedOptions;
        if (Array.isArray(selectedOptions)) {
          for (const entry of selectedOptions) {
            selectedOptionsScanned += 1;
            if (!entry || typeof entry !== 'object') continue;
            const option = entry as Record<string, unknown>;

            const featureLabel = asTrimmedText(option.featureLabel);
            const optionLabel = asTrimmedText(option.optionLabel);
            const optionValue = asTrimmedText(option.optionValue);
            if (!featureLabel || !optionLabel || !optionValue) continue;

            const key = `${featureLabel}\u0000${optionLabel}\u0000${optionValue}`;
            if (distinctKeys.has(key)) continue;
            distinctKeys.add(key);
            distinctRows.push({ feature_label: featureLabel, option_label: optionLabel, option_value: optionValue });
          }
        }
      }

      const processed = (await sql`
        update CPQ_sampler_result
        set processed_for_image_sync = true,
            processed_for_image_sync_at = now()
        where id = ${row.id}
          and processed_for_image_sync = false
        returning id
      `) as Array<{ id: number }>;
      if (processed.length > 0) samplerRowsMarkedProcessed += 1;
    } catch (error) {
      syncErrors.push(`sampler row ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let inserted = 0;
  let skippedExisting = 0;
  for (const row of distinctRows) {
    const result = (await sql`
      insert into cpq_image_management (feature_label, option_label, option_value)
      values (${row.feature_label}, ${row.option_label}, ${row.option_value})
      on conflict (feature_label, option_label, option_value) do nothing
      returning id
    `) as Array<{ id: number }>;

    if (result.length > 0) inserted += 1;
    else skippedExisting += 1;
  }

  const totalRows = (await sql`
    select count(*)::int as total
    from cpq_image_management
  `) as Array<{ total: number }>;

  const unprocessedRemainingRows = (await sql`
    select count(*)::int as total
    from CPQ_sampler_result
    where processed_for_image_sync = false
  `) as Array<{ total: number }>;

  return {
    sourceRowsScanned: samplerRows.length,
    selectedOptionsScanned,
    distinctCombinationsFound: distinctRows.length,
    inserted,
    skippedExisting,
    samplerRowsMarkedProcessed,
    syncErrors,
    unprocessedRowsRemaining: unprocessedRemainingRows[0]?.total ?? 0,
    total: totalRows[0]?.total ?? 0,
  };
}

export async function resolveImageLayersForSelectedOptions(
  selectedOptions: CpqImageSelectionLookup[],
): Promise<CpqImageLayerResolution> {
  const normalizedSelections = selectedOptions
    .map((selection) => ({
      featureLabel: asTrimmedText(selection.featureLabel),
      optionLabel: asTrimmedText(selection.optionLabel),
      optionValue: asTrimmedText(selection.optionValue),
    }))
    .filter((selection) => selection.featureLabel && selection.optionLabel && selection.optionValue);

  if (!normalizedSelections.length) {
    return { layers: [], matchedSelections: [], unmatchedSelections: [] };
  }

  const selectionJson = JSON.stringify(
    normalizedSelections.map((selection) => ({
      feature_label: selection.featureLabel,
      option_label: selection.optionLabel,
      option_value: selection.optionValue,
    })),
  );

  const rows = (await sql`
    with selected_options as (
      select
        row_number() over () as selection_order,
        s.feature_label,
        s.option_label,
        s.option_value
      from jsonb_to_recordset(${selectionJson}::jsonb) as s(feature_label text, option_label text, option_value text)
    )
    select
      s.selection_order,
      s.feature_label,
      s.option_label,
      s.option_value,
      m.id as match_id,
      m.picture_link_1,
      m.picture_link_2,
      m.picture_link_3,
      m.picture_link_4
    from selected_options s
    left join cpq_image_management m
      on m.feature_label = s.feature_label
      and m.option_label = s.option_label
      and m.option_value = s.option_value
      and m.is_active = true
    order by s.selection_order
  `) as Array<{
    selection_order: number;
    feature_label: string;
    option_label: string;
    option_value: string;
    match_id: number | null;
    picture_link_1: string | null;
    picture_link_2: string | null;
    picture_link_3: string | null;
    picture_link_4: string | null;
  }>;

  const layers: CpqResolvedImageLayer[] = [];
  const matchedSelections: CpqImageSelectionLookup[] = [];
  const unmatchedSelections: CpqImageSelectionLookup[] = [];

  for (const row of rows) {
    const selection = {
      featureLabel: row.feature_label,
      optionLabel: row.option_label,
      optionValue: row.option_value,
    };

    if (!row.match_id) {
      unmatchedSelections.push(selection);
      continue;
    }

    matchedSelections.push(selection);
    const pictureLinks = [row.picture_link_1, row.picture_link_2, row.picture_link_3, row.picture_link_4];
    pictureLinks.forEach((pictureLink, index) => {
      const value = asTrimmedText(pictureLink);
      if (!value) return;
      layers.push({
        ...selection,
        slot: (index + 1) as 1 | 2 | 3 | 4,
        pictureLink: value,
      });
    });
  }

  return { layers, matchedSelections, unmatchedSelections };
}
