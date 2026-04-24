import { sql } from '@/lib/db/client';
import { getBaseLocale } from '@/lib/qpart/locales/service';
import { QPartCompatibilityRule, QPartMetadataValue, QPartPartDetail, QPartRecord, QPartTranslation } from '@/types/qpart';

type PartInput = {
  part_number: string;
  default_name: string;
  default_description?: string | null;
  status?: string;
  hierarchy_node_id?: number | null;
  translations?: QPartTranslation[];
  metadata_values?: QPartMetadataValue[];
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
  status: asTrimmedText(input.status || 'active') || 'active',
  hierarchy_node_id: input.hierarchy_node_id === null || input.hierarchy_node_id === '' ? null : Number(input.hierarchy_node_id),
  translations: Array.isArray(input.translations) ? (input.translations as QPartTranslation[]) : [],
  metadata_values: Array.isArray(input.metadata_values) ? (input.metadata_values as QPartMetadataValue[]) : [],
  bike_types: Array.isArray(input.bike_types) ? input.bike_types.map((x) => String(x).trim()).filter(Boolean) : [],
  compatibility_rules: Array.isArray(input.compatibility_rules) ? (input.compatibility_rules as QPartCompatibilityRule[]) : [],
});

export async function listParts(filters: { search?: string; hierarchy_node_id?: number | null } = {}) {
  const search = asTrimmedText(filters.search);
  const hierarchyNodeId = filters.hierarchy_node_id ?? null;

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
  `) as QPartRecord[];

  return rows;
}

export async function getPartById(id: number) {
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

  const [translationsRaw, metadataValuesRaw, compatibilityRulesRaw] = await Promise.all([
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
  ]);
  const translations = translationsRaw as QPartTranslation[];
  const metadataValues = metadataValuesRaw as QPartMetadataValue[];
  const compatibilityRules = compatibilityRulesRaw as QPartCompatibilityRule[];

  return {
    part,
    translations,
    metadata_values: metadataValues,
    bike_types: part.bike_types,
    compatibility_rules: compatibilityRules,
  };
}

async function saveChildCollections(partId: number, input: PartInput) {
  const baseLocale = await getBaseLocale();

  await sql`delete from qpart_part_translations where part_id = ${partId}`;
  await sql`delete from qpart_part_metadata_values where part_id = ${partId}`;
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
