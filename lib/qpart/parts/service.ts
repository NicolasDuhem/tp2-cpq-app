import { sql } from '@/lib/db/client';
import { getBaseLocale } from '@/lib/qpart/locales/service';
import { setQPartActiveCountries } from '@/lib/qpart/allocation/service';
import { QPART_CHANNEL_SET } from '@/lib/qpart/channels';
import { QPartCompatibilityRule, QPartMetadataValue, QPartPartDetail, QPartRecord, QPartTranslation } from '@/types/qpart';

type PartInput = {
  part_number: string;
  default_name: string;
  default_description?: string | null;
  status?: string;
  hierarchy_node_id?: number | null;
  translations?: QPartTranslation[];
  metadata_values?: QPartMetadataValue[];
  channels?: string[];
  country_codes?: string[];
  bike_types?: string[];
  compatibility_rules?: QPartCompatibilityRule[];
};

const asTrimmedText = (value: unknown) => String(value ?? '').trim();
const asNullableText = (value: unknown) => {
  const text = asTrimmedText(value);
  return text.length ? text : null;
};

const normalizePartInput = (input: Record<string, unknown>): PartInput => ({
  part_number: asTrimmedText(input.part_number),
  default_name: asTrimmedText(input.default_name),
  default_description: asNullableText(input.default_description),
  status: asTrimmedText(input.status || 'draft') || 'draft',
  hierarchy_node_id: input.hierarchy_node_id === null || input.hierarchy_node_id === '' ? null : Number(input.hierarchy_node_id),
  translations: Array.isArray(input.translations) ? (input.translations as QPartTranslation[]) : [],
  metadata_values: Array.isArray(input.metadata_values) ? (input.metadata_values as QPartMetadataValue[]) : [],
  channels: Array.isArray(input.channels) ? input.channels.map((x) => String(x).trim()).filter(Boolean) : [],
  country_codes: Array.isArray(input.country_codes) ? input.country_codes.map((x) => String(x).trim().toUpperCase()).filter(Boolean) : [],
  bike_types: Array.isArray(input.bike_types) ? input.bike_types.map((x) => String(x).trim()).filter(Boolean) : [],
  compatibility_rules: Array.isArray(input.compatibility_rules) ? (input.compatibility_rules as QPartCompatibilityRule[]) : [],
});

export async function listParts(filters: { search?: string; hierarchy_node_id?: number | null; page?: number; pageSize?: number } = {}) {
  const search = asTrimmedText(filters.search);
  const hierarchyNodeId = filters.hierarchy_node_id ?? null;

  const pageSize = Math.min(500, Math.max(1, Number(filters.pageSize ?? 200)));

  const countRows = (await sql`
    select count(*)::int as count
    from qpart_parts p
    where (${search} = '' or p.part_number ilike ${`%${search}%`} or p.default_name ilike ${`%${search}%`})
      and (${hierarchyNodeId}::bigint is null or p.hierarchy_node_id = ${hierarchyNodeId})
  `) as Array<{ count: number }>;
  const totalRows = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(filters.page ?? 1)));
  const offset = (page - 1) * pageSize;

  const rows = (await sql`
    with recursive hierarchy_path as (
      select n.id, n.parent_id, n.label_en::text as path
      from qpart_hierarchy_nodes n
      where n.parent_id is null
      union all
      select c.id, c.parent_id, hp.path || ' > ' || c.label_en
      from qpart_hierarchy_nodes c
      join hierarchy_path hp on hp.id = c.parent_id
    )
    select p.id, p.part_number, p.status, p.default_name, p.default_description,
      p.hierarchy_node_id, hp.path as hierarchy_path,
      coalesce(array_remove(array_agg(distinct bt.bike_type), null), '{}') as bike_types,
      count(distinct pr.id)::int as compatibility_count,
      p.created_at, p.updated_at
    from qpart_parts p
    left join hierarchy_path hp on hp.id = p.hierarchy_node_id
    left join qpart_part_bike_type_compatibility bt on bt.part_id = p.id
    left join qpart_part_compatibility_rules pr on pr.part_id = p.id and pr.is_active = true
    where (${search} = '' or p.part_number ilike ${`%${search}%`} or p.default_name ilike ${`%${search}%`})
      and (${hierarchyNodeId}::bigint is null or p.hierarchy_node_id = ${hierarchyNodeId})
    group by p.id, hp.path
    order by p.updated_at desc, p.id desc
    limit ${pageSize}
    offset ${offset}
  `) as QPartRecord[];

  return { rows, pagination: { page, pageSize, totalRows, totalPages } };
}

export async function getPartById(id: number) {
  const pageSize = Math.min(500, Math.max(1, Number(filters.pageSize ?? 200)));

  const countRows = (await sql`
    select count(*)::int as count
    from qpart_parts p
    where (${search} = '' or p.part_number ilike ${`%${search}%`} or p.default_name ilike ${`%${search}%`})
      and (${hierarchyNodeId}::bigint is null or p.hierarchy_node_id = ${hierarchyNodeId})
  `) as Array<{ count: number }>;
  const totalRows = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(filters.page ?? 1)));
  const offset = (page - 1) * pageSize;

  const rows = (await sql`
    with recursive hierarchy_path as (
      select n.id, n.parent_id, n.label_en::text as path
      from qpart_hierarchy_nodes n
      where n.parent_id is null
      union all
      select c.id, c.parent_id, hp.path || ' > ' || c.label_en
      from qpart_hierarchy_nodes c
      join hierarchy_path hp on hp.id = c.parent_id
    )
    select p.id, p.part_number, p.status, p.default_name, p.default_description,
      p.hierarchy_node_id, hp.path as hierarchy_path,
      coalesce(array_remove(array_agg(distinct bt.bike_type), null), '{}') as bike_types,
      count(distinct pr.id)::int as compatibility_count,
      p.created_at, p.updated_at
    from qpart_parts p
    left join hierarchy_path hp on hp.id = p.hierarchy_node_id
    left join qpart_part_bike_type_compatibility bt on bt.part_id = p.id
    left join qpart_part_compatibility_rules pr on pr.part_id = p.id and pr.is_active = true
    where p.id = ${id}
    group by p.id, hp.path
  `) as QPartRecord[];

  return rows[0] ?? null;
}

export async function getPartDetail(id: number): Promise<QPartPartDetail | null> {
  const part = await getPartById(id);
  if (!part) return null;

  const [translationsRaw, metadataValuesRaw, compatibilityRulesRaw, channelsRaw, countriesRaw] = await Promise.all([
    sql`
      select locale, name, description
      from qpart_part_translations
      where part_id = ${id}
      order by locale
    `,
    sql`
      select metadata_definition_id, locale, value_text, value_number, value_boolean, value_date, value_json
      from qpart_part_metadata_values
      where part_id = ${id}
      order by metadata_definition_id, locale
    `,
    sql`
      select bike_type, feature_label, option_value, option_label, source, is_active
      from qpart_part_compatibility_rules
      where part_id = ${id}
      order by bike_type, feature_label, option_value
    `,
    sql`
      select channel
      from qpart_part_channel_assignment
      where part_id = ${id}
      order by channel
    `,
    sql`
      select country_code
      from qpart_country_allocation
      where part_id = ${id}
        and active = true
      order by country_code
    `,
  ]);
  const translations = translationsRaw as QPartTranslation[];
  const metadataValues = metadataValuesRaw as QPartMetadataValue[];
  const compatibilityRules = compatibilityRulesRaw as QPartCompatibilityRule[];
  const channels = (channelsRaw as Array<{ channel: string }>).map((row) => asTrimmedText(row.channel));
  const countryCodes = (countriesRaw as Array<{ country_code: string }>).map((row) => asTrimmedText(row.country_code).toUpperCase());

  return {
    part,
    translations,
    metadata_values: metadataValues,
    channels,
    country_codes: countryCodes,
    bike_types: part.bike_types,
    compatibility_rules: compatibilityRules,
  };
}

async function saveChildCollections(partId: number, input: PartInput) {
  const baseLocale = await getBaseLocale();

  await sql`delete from qpart_part_translations where part_id = ${partId}`;
  await sql`delete from qpart_part_metadata_values where part_id = ${partId}`;
  await sql`delete from qpart_part_channel_assignment where part_id = ${partId}`;
  await sql`delete from qpart_part_bike_type_compatibility where part_id = ${partId}`;
  await sql`delete from qpart_part_compatibility_rules where part_id = ${partId}`;

  for (const translation of input.translations ?? []) {
    const locale = asTrimmedText(translation.locale);
    if (!locale || locale === baseLocale) continue;
    await sql`
      insert into qpart_part_translations (part_id, locale, name, description)
      values (${partId}, ${locale}, ${asNullableText(translation.name)}, ${asNullableText(translation.description)})
    `;
  }

  for (const value of input.metadata_values ?? []) {
    const definitionId = Number(value.metadata_definition_id);
    if (!Number.isFinite(definitionId)) continue;
    const locale = asTrimmedText(value.locale || baseLocale) || baseLocale;

    const hasValue =
      asTrimmedText(value.value_text).length > 0 ||
      value.value_number !== null ||
      value.value_boolean !== null ||
      asTrimmedText(value.value_date).length > 0 ||
      (value.value_json !== null && value.value_json !== undefined);

    if (!hasValue) continue;

    await sql`
      insert into qpart_part_metadata_values
        (part_id, metadata_definition_id, locale, value_text, value_number, value_boolean, value_date, value_json)
      values
        (
          ${partId},
          ${definitionId},
          ${locale},
          ${asNullableText(value.value_text)},
          ${value.value_number === null || value.value_number === undefined ? null : Number(value.value_number)},
          ${value.value_boolean === null || value.value_boolean === undefined ? null : Boolean(value.value_boolean)},
          ${asNullableText(value.value_date)},
          ${value.value_json === undefined ? null : JSON.stringify(value.value_json)}::jsonb
        )
    `;
  }

  const channels = [...new Set((input.channels ?? []).map((channel) => asTrimmedText(channel)).filter(Boolean))];
  const invalidChannels = channels.filter((channel) => !QPART_CHANNEL_SET.has(channel));
  if (invalidChannels.length) {
    throw new Error(`Invalid channel(s): ${invalidChannels.join(', ')}`);
  }
  for (const channel of channels) {
    await sql`
      insert into qpart_part_channel_assignment (part_id, channel)
      values (${partId}, ${channel})
    `;
  }

  await setQPartActiveCountries({ partId, countryCodes: input.country_codes ?? [] });

  for (const bikeType of input.bike_types ?? []) {
    await sql`
      insert into qpart_part_bike_type_compatibility (part_id, bike_type)
      values (${partId}, ${bikeType})
    `;
  }

  for (const rule of input.compatibility_rules ?? []) {
    const bikeType = asTrimmedText(rule.bike_type);
    const featureLabel = asTrimmedText(rule.feature_label);
    const optionValue = asTrimmedText(rule.option_value);
    if (!bikeType || !featureLabel || !optionValue) continue;

    await sql`
      insert into qpart_part_compatibility_rules
        (part_id, bike_type, feature_label, option_value, option_label, source, is_active)
      values
        (
          ${partId},
          ${bikeType},
          ${featureLabel},
          ${optionValue},
          ${asNullableText(rule.option_label)},
          ${rule.source || 'manual'},
          ${rule.is_active ?? true}
        )
    `;
  }
}

export async function createPart(rawInput: Record<string, unknown>) {
  const input = normalizePartInput(rawInput);

  if (!input.part_number) throw new Error('part_number is required');
  if (!input.default_name) throw new Error('default_name is required');

  const pageSize = Math.min(500, Math.max(1, Number(filters.pageSize ?? 200)));

  const countRows = (await sql`
    select count(*)::int as count
    from qpart_parts p
    where (${search} = '' or p.part_number ilike ${`%${search}%`} or p.default_name ilike ${`%${search}%`})
      and (${hierarchyNodeId}::bigint is null or p.hierarchy_node_id = ${hierarchyNodeId})
  `) as Array<{ count: number }>;
  const totalRows = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(filters.page ?? 1)));
  const offset = (page - 1) * pageSize;

  const rows = (await sql`
    insert into qpart_parts (part_number, status, default_name, default_description, hierarchy_node_id)
    values (${input.part_number}, ${input.status}, ${input.default_name}, ${input.default_description ?? null}, ${input.hierarchy_node_id ?? null})
    returning id
  `) as Array<{ id: number }>;

  const partId = rows[0]?.id;
  if (!partId) throw new Error('Failed to create part');

  await saveChildCollections(partId, input);
  return getPartDetail(partId);
}

export async function updatePart(id: number, rawInput: Record<string, unknown>) {
  const input = normalizePartInput(rawInput);

  if (!input.part_number) throw new Error('part_number is required');
  if (!input.default_name) throw new Error('default_name is required');

  const pageSize = Math.min(500, Math.max(1, Number(filters.pageSize ?? 200)));

  const countRows = (await sql`
    select count(*)::int as count
    from qpart_parts p
    where (${search} = '' or p.part_number ilike ${`%${search}%`} or p.default_name ilike ${`%${search}%`})
      and (${hierarchyNodeId}::bigint is null or p.hierarchy_node_id = ${hierarchyNodeId})
  `) as Array<{ count: number }>;
  const totalRows = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(filters.page ?? 1)));
  const offset = (page - 1) * pageSize;

  const rows = (await sql`
    update qpart_parts
    set part_number = ${input.part_number},
        status = ${input.status},
        default_name = ${input.default_name},
        default_description = ${input.default_description ?? null},
        hierarchy_node_id = ${input.hierarchy_node_id ?? null},
        updated_at = now()
    where id = ${id}
    returning id
  `) as Array<{ id: number }>;

  if (!rows[0]) return null;

  await saveChildCollections(id, input);
  return getPartDetail(id);
}

export async function deletePart(id: number) {
  await sql`delete from qpart_parts where id = ${id}`;
}

export async function getQPartSummary() {
  const [partRowsRaw, hierarchyRowsRaw, metadataRowsRaw] = await Promise.all([
    sql`select count(*)::int as count from qpart_parts`,
    sql`select count(*)::int as count from qpart_hierarchy_nodes`,
    sql`select count(*)::int as count from qpart_metadata_definitions where is_active = true`,
  ]);
  const partRows = partRowsRaw as Array<{ count: number }>;
  const hierarchyRows = hierarchyRowsRaw as Array<{ count: number }>;
  const metadataRows = metadataRowsRaw as Array<{ count: number }>;

  return {
    parts: partRows[0]?.count ?? 0,
    hierarchyNodes: hierarchyRows[0]?.count ?? 0,
    activeMetadataDefinitions: metadataRows[0]?.count ?? 0,
  };
}
