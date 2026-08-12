import { sql } from '@/lib/db/client';
import { QPartMetadataDefinition } from '@/types/qpart';

const asTrimmedText = (value: unknown) => String(value ?? '').trim();
const asBool = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);
const ALLOWED_FIELD_TYPES = new Set(['text', 'long_text', 'number', 'boolean', 'date', 'single_select', 'multi_select']);

const parseJsonObject = (value: unknown, fallback: Record<string, unknown> = {}) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const parseOptions = (value: unknown) => {
  if (Array.isArray(value)) return value as Array<{ value: string; label?: string }>;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as Array<{ value: string; label?: string }>;
    } catch {
      return [];
    }
  }
  return [];
};

export async function listMetadataDefinitions(activeOnly = false) {
  if (activeOnly) {
    return (await sql`
      select id, key, label_en, field_type, is_translatable, is_required, is_active, display_order, validation_json, options_json, created_at, updated_at
      from qpart_metadata_definitions
      where is_active = true
      order by display_order, key
    `) as QPartMetadataDefinition[];
  }

  return (await sql`
    select id, key, label_en, field_type, is_translatable, is_required, is_active, display_order, validation_json, options_json, created_at, updated_at
    from qpart_metadata_definitions
    order by display_order, key
  `) as QPartMetadataDefinition[];
}

export async function createMetadataDefinition(input: Record<string, unknown>) {
  const key = asTrimmedText(input.key).toLowerCase();
  const label = asTrimmedText(input.label_en);
  const fieldType = asTrimmedText(input.field_type);

  if (!key) throw new Error('key is required');
  if (!label) throw new Error('label_en is required');
  if (!ALLOWED_FIELD_TYPES.has(fieldType)) throw new Error('invalid field_type');

  const rows = (await sql`
    insert into qpart_metadata_definitions
      (key, label_en, field_type, is_translatable, is_required, is_active, display_order, validation_json, options_json)
    values
      (
        ${key},
        ${label},
        ${fieldType},
        ${asBool(input.is_translatable, false)},
        ${asBool(input.is_required, false)},
        ${asBool(input.is_active, true)},
        ${Number(input.display_order ?? 100)},
        ${JSON.stringify(parseJsonObject(input.validation_json))}::jsonb,
        ${JSON.stringify(parseOptions(input.options_json))}::jsonb
      )
    returning id, key, label_en, field_type, is_translatable, is_required, is_active, display_order, validation_json, options_json, created_at, updated_at
  `) as QPartMetadataDefinition[];

  return rows[0];
}

export async function updateMetadataDefinition(id: number, input: Record<string, unknown>) {
  const key = asTrimmedText(input.key).toLowerCase();
  const label = asTrimmedText(input.label_en);
  const fieldType = asTrimmedText(input.field_type);

  if (!key) throw new Error('key is required');
  if (!label) throw new Error('label_en is required');
  if (!ALLOWED_FIELD_TYPES.has(fieldType)) throw new Error('invalid field_type');

  const rows = (await sql`
    update qpart_metadata_definitions
    set key = ${key},
        label_en = ${label},
        field_type = ${fieldType},
        is_translatable = ${asBool(input.is_translatable, false)},
        is_required = ${asBool(input.is_required, false)},
        is_active = ${asBool(input.is_active, true)},
        display_order = ${Number(input.display_order ?? 100)},
        validation_json = ${JSON.stringify(parseJsonObject(input.validation_json))}::jsonb,
        options_json = ${JSON.stringify(parseOptions(input.options_json))}::jsonb,
        updated_at = now()
    where id = ${id}
    returning id, key, label_en, field_type, is_translatable, is_required, is_active, display_order, validation_json, options_json, created_at, updated_at
  `) as QPartMetadataDefinition[];

  return rows[0] ?? null;
}

export async function deleteMetadataDefinition(id: number) {
  await sql`delete from qpart_metadata_definitions where id = ${id}`;
}
