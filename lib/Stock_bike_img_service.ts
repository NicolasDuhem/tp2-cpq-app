import { sql } from '@/lib/db/client';

export type Stock_bike_img_condition = {
  position: number;
  allowedValues: string[];
};

export type Stock_bike_img_rule_row = {
  id: number;
  stock_bike_img_model_year: number | null;
  stock_bike_img_rule_category: string;
  stock_bike_img_rule_family_id: number;
  stock_bike_img_rule_family_key: string;
  stock_bike_img_rule_family_name: string;
  stock_bike_img_bike_type_group_id: number | null;
  stock_bike_img_bike_type_group_key: string | null;
  stock_bike_img_bike_type_group_name: string | null;
  stock_bike_img_rule_name: string;
  stock_bike_img_rule_description: string | null;
  stock_bike_img_conditions_json: Stock_bike_img_condition[];
  stock_bike_img_conditions_signature: string;
  stock_bike_img_layer_order: number;
  stock_bike_img_picture_link_1: string | null;
  stock_bike_img_picture_link_2: string | null;
  stock_bike_img_picture_link_3: string | null;
  stock_bike_img_is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Stock_bike_img_match_result = {
  stock_bike_img_sku_code: string;
  stock_bike_img_model_year: number;
  stock_bike_img_model_year_digit: string;
  stock_bike_img_resolved_bike_type: {
    id: number;
    key: string;
    name: string;
    source_digit_value: string;
  };
  stock_bike_img_matched_rules: Stock_bike_img_rule_row[];
  stock_bike_img_layered_images: Array<{
    stock_bike_img_rule_id: number;
    stock_bike_img_rule_category: string;
    stock_bike_img_layer_order: number;
    stock_bike_img_slot: 1 | 2 | 3;
    stock_bike_img_picture_link: string;
  }>;
};

export type Stock_bike_img_digit_reference_row = {
  id: number;
  stock_bike_img_digit_position: number;
  stock_bike_img_rule_category_name: string;
  stock_bike_img_digit_value: string;
  stock_bike_img_value_meaning: string;
};

export type Stock_bike_img_reference_category = {
  stock_bike_img_rule_category_key: string;
  stock_bike_img_rule_category_name: string;
  stock_bike_img_digit_positions: number[];
  stock_bike_img_row_count: number;
};

export type Stock_bike_img_family_group = {
  id: number;
  stock_bike_img_group_key: string;
  stock_bike_img_group_name: string;
  stock_bike_img_group_description: string | null;
};

export type Stock_bike_img_rule_family = {
  id: number;
  stock_bike_img_family_key: string;
  stock_bike_img_family_name: string;
  stock_bike_img_family_description: string | null;
  stock_bike_img_categories: string[];
  stock_bike_img_groups: Stock_bike_img_family_group[];
};

const STOCK_BIKE_IMG_SKU_LENGTH = 30;

const STOCK_BIKE_IMG_MODEL_YEAR_MAP: Record<string, number> = {
  '1': 2020,
  '2': 2021,
  '3': 2022,
  '4': 2023,
  '5': 2024,
  '6': 2025,
  '7': 2026,
  '8': 2027,
  '9': 2028,
};

const Stock_bike_img_normalize_whitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
const Stock_bike_img_normalize_token = (value: string) => Stock_bike_img_normalize_whitespace(value).toUpperCase();

const Stock_bike_img_as_text = (value: unknown) => String(value ?? '').trim();
const Stock_bike_img_normalize_category = (value: unknown) => Stock_bike_img_normalize_token(Stock_bike_img_as_text(value));

const Stock_bike_img_normalize_allowed_values = (value: unknown): string[] => {
  const raw = Array.isArray(value)
    ? value.map((entry) => String(entry ?? ''))
    : String(value ?? '')
        .split(',')
        .map((entry) => entry.trim());

  const tokens = [...new Set(raw.map(Stock_bike_img_normalize_token).filter((entry) => entry.length > 0))].sort(
    (a, b) => a.localeCompare(b),
  );

  if (tokens.length === 0) {
    throw new Error('Each condition must provide at least one allowed value.');
  }

  return tokens;
};

export const Stock_bike_img_resolve_model_year_from_sku = (stock_bike_img_sku_code: string) => {
  const normalized = Stock_bike_img_as_text(stock_bike_img_sku_code).toUpperCase();
  if (normalized.length !== STOCK_BIKE_IMG_SKU_LENGTH) {
    throw new Error('SKU code must be exactly 30 characters.');
  }

  const modelYearDigit = normalized.charAt(19);
  const modelYear = STOCK_BIKE_IMG_MODEL_YEAR_MAP[modelYearDigit];

  if (!modelYear) {
    throw new Error(`Digit 20 value "${modelYearDigit}" is not mapped to a model year.`);
  }

  return {
    stock_bike_img_sku_code: normalized,
    stock_bike_img_model_year_digit: modelYearDigit,
    stock_bike_img_model_year: modelYear,
  };
};

export const Stock_bike_img_normalize_conditions = (value: unknown): Stock_bike_img_condition[] => {
  const source = Array.isArray(value) ? value : [];

  const normalized = source
    .map((entry) => {
      const raw = (entry ?? {}) as Record<string, unknown>;
      const position = Number(raw.position ?? raw.stock_bike_img_position ?? raw.stock_bike_img_digit_position ?? raw.digitPosition);
      if (!Number.isInteger(position) || position < 1 || position > STOCK_BIKE_IMG_SKU_LENGTH) {
        throw new Error('Condition position must be an integer between 1 and 30.');
      }

      return {
        position,
        allowedValues: Stock_bike_img_normalize_allowed_values(
          raw.allowedValues ?? raw.stock_bike_img_allowed_values ?? raw.values ?? raw.stock_bike_img_digit_values,
        ),
      };
    })
    .sort((a, b) => a.position - b.position);

  if (normalized.length === 0) {
    throw new Error('At least one condition is required for a rule.');
  }

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].position === normalized[index].position) {
      throw new Error(`Duplicate condition position detected (${normalized[index].position}).`);
    }
  }

  return normalized;
};

export const Stock_bike_img_build_conditions_signature = (conditions: Stock_bike_img_condition[]) =>
  conditions.map((condition) => `${condition.position}:${condition.allowedValues.join('|')}`).join(';');

const Stock_bike_img_parse_rule_row = (row: Record<string, unknown>): Stock_bike_img_rule_row => ({
  id: Number(row.id),
  stock_bike_img_model_year: row.stock_bike_img_model_year ? Number(row.stock_bike_img_model_year) : null,
  stock_bike_img_rule_category: String(row.stock_bike_img_rule_category ?? ''),
  stock_bike_img_rule_family_id: Number(row.stock_bike_img_rule_family_id),
  stock_bike_img_rule_family_key: String(row.stock_bike_img_rule_family_key ?? ''),
  stock_bike_img_rule_family_name: String(row.stock_bike_img_rule_family_name ?? ''),
  stock_bike_img_bike_type_group_id: row.stock_bike_img_bike_type_group_id ? Number(row.stock_bike_img_bike_type_group_id) : null,
  stock_bike_img_bike_type_group_key: row.stock_bike_img_bike_type_group_key
    ? String(row.stock_bike_img_bike_type_group_key)
    : null,
  stock_bike_img_bike_type_group_name: row.stock_bike_img_bike_type_group_name
    ? String(row.stock_bike_img_bike_type_group_name)
    : null,
  stock_bike_img_rule_name: String(row.stock_bike_img_rule_name ?? ''),
  stock_bike_img_rule_description: row.stock_bike_img_rule_description ? String(row.stock_bike_img_rule_description) : null,
  stock_bike_img_conditions_json: Stock_bike_img_normalize_conditions(row.stock_bike_img_conditions_json),
  stock_bike_img_conditions_signature: String(row.stock_bike_img_conditions_signature ?? ''),
  stock_bike_img_layer_order: Number(row.stock_bike_img_layer_order ?? 100),
  stock_bike_img_picture_link_1: row.stock_bike_img_picture_link_1 ? String(row.stock_bike_img_picture_link_1) : null,
  stock_bike_img_picture_link_2: row.stock_bike_img_picture_link_2 ? String(row.stock_bike_img_picture_link_2) : null,
  stock_bike_img_picture_link_3: row.stock_bike_img_picture_link_3 ? String(row.stock_bike_img_picture_link_3) : null,
  stock_bike_img_is_active: Boolean(row.stock_bike_img_is_active),
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
});

const Stock_bike_img_parse_digit_reference_row = (row: Record<string, unknown>): Stock_bike_img_digit_reference_row => ({
  id: Number(row.id),
  stock_bike_img_digit_position: Number(row.stock_bike_img_digit_position),
  stock_bike_img_rule_category_name: String(row.stock_bike_img_rule_category_name ?? ''),
  stock_bike_img_digit_value: String(row.stock_bike_img_digit_value ?? ''),
  stock_bike_img_value_meaning: String(row.stock_bike_img_value_meaning ?? ''),
});

export async function Stock_bike_img_list_rules(stock_bike_img_model_year?: number, stock_bike_img_rule_category?: string) {
  const year = Number(stock_bike_img_model_year ?? 0);
  const category = Stock_bike_img_as_text(stock_bike_img_rule_category);
  const normalizedCategory = Stock_bike_img_normalize_category(category);

  const rows =
    year && category
      ? await sql`
          select
            r.*,
            f.stock_bike_img_family_key as stock_bike_img_rule_family_key,
            f.stock_bike_img_family_name as stock_bike_img_rule_family_name,
            g.stock_bike_img_group_key as stock_bike_img_bike_type_group_key,
            g.stock_bike_img_group_name as stock_bike_img_bike_type_group_name
          from stock_bike_img_rule r
          join stock_bike_img_rule_family f on f.id = r.stock_bike_img_rule_family_id
          left join stock_bike_img_family_bike_group g on g.id = r.stock_bike_img_bike_type_group_id
          where upper(regexp_replace(trim(r.stock_bike_img_rule_category), '\s+', ' ', 'g')) = ${normalizedCategory}
            and (r.stock_bike_img_model_year = ${year} or r.stock_bike_img_model_year is null)
          order by r.stock_bike_img_layer_order, r.stock_bike_img_rule_category, r.id
        `
      : year
        ? await sql`
            select
              r.*,
              f.stock_bike_img_family_key as stock_bike_img_rule_family_key,
              f.stock_bike_img_family_name as stock_bike_img_rule_family_name,
              g.stock_bike_img_group_key as stock_bike_img_bike_type_group_key,
              g.stock_bike_img_group_name as stock_bike_img_bike_type_group_name
            from stock_bike_img_rule r
            join stock_bike_img_rule_family f on f.id = r.stock_bike_img_rule_family_id
            left join stock_bike_img_family_bike_group g on g.id = r.stock_bike_img_bike_type_group_id
            where r.stock_bike_img_model_year = ${year} or r.stock_bike_img_model_year is null
            order by r.stock_bike_img_layer_order, r.stock_bike_img_rule_category, r.id
          `
        : category
          ? await sql`
              select
                r.*,
                f.stock_bike_img_family_key as stock_bike_img_rule_family_key,
                f.stock_bike_img_family_name as stock_bike_img_rule_family_name,
                g.stock_bike_img_group_key as stock_bike_img_bike_type_group_key,
                g.stock_bike_img_group_name as stock_bike_img_bike_type_group_name
              from stock_bike_img_rule r
              join stock_bike_img_rule_family f on f.id = r.stock_bike_img_rule_family_id
              left join stock_bike_img_family_bike_group g on g.id = r.stock_bike_img_bike_type_group_id
              where upper(regexp_replace(trim(r.stock_bike_img_rule_category), '\s+', ' ', 'g')) = ${normalizedCategory}
              order by r.stock_bike_img_model_year nulls first, r.stock_bike_img_layer_order, r.id
            `
          : await sql`
              select
                r.*,
                f.stock_bike_img_family_key as stock_bike_img_rule_family_key,
                f.stock_bike_img_family_name as stock_bike_img_rule_family_name,
                g.stock_bike_img_group_key as stock_bike_img_bike_type_group_key,
                g.stock_bike_img_group_name as stock_bike_img_bike_type_group_name
              from stock_bike_img_rule r
              join stock_bike_img_rule_family f on f.id = r.stock_bike_img_rule_family_id
              left join stock_bike_img_family_bike_group g on g.id = r.stock_bike_img_bike_type_group_id
              order by r.stock_bike_img_model_year nulls first, r.stock_bike_img_layer_order, r.stock_bike_img_rule_category, r.id
            `;

  return (rows as Record<string, unknown>[]).map(Stock_bike_img_parse_rule_row);
}

export async function Stock_bike_img_list_digit_reference_rows(stock_bike_img_rule_category_name?: string) {
  const category = Stock_bike_img_as_text(stock_bike_img_rule_category_name);
  const normalizedCategory = Stock_bike_img_normalize_category(category);
  const rows = category
    ? await sql`
        select *
        from stock_bike_img_digit_reference
        where upper(regexp_replace(trim(stock_bike_img_rule_category_name), '\s+', ' ', 'g')) = ${normalizedCategory}
        order by stock_bike_img_digit_position, stock_bike_img_digit_value, id
      `
    : await sql`
        select *
        from stock_bike_img_digit_reference
        order by stock_bike_img_rule_category_name, stock_bike_img_digit_position, stock_bike_img_digit_value, id
      `;

  return (rows as Record<string, unknown>[]).map(Stock_bike_img_parse_digit_reference_row);
}

export async function Stock_bike_img_list_reference_categories(): Promise<Stock_bike_img_reference_category[]> {
  const rows = (await sql`
    select
      upper(regexp_replace(trim(stock_bike_img_rule_category_name), '\s+', ' ', 'g')) as stock_bike_img_rule_category_key,
      min(trim(stock_bike_img_rule_category_name)) as stock_bike_img_rule_category_name,
      array_agg(distinct stock_bike_img_digit_position order by stock_bike_img_digit_position) as stock_bike_img_digit_positions
      ,
      count(*)::int as stock_bike_img_row_count
    from stock_bike_img_digit_reference
    group by upper(regexp_replace(trim(stock_bike_img_rule_category_name), '\s+', ' ', 'g'))
    order by min(trim(stock_bike_img_rule_category_name))
  `) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    stock_bike_img_rule_category_key: Stock_bike_img_as_text(row.stock_bike_img_rule_category_key),
    stock_bike_img_rule_category_name: Stock_bike_img_as_text(row.stock_bike_img_rule_category_name),
    stock_bike_img_digit_positions: Array.isArray(row.stock_bike_img_digit_positions)
      ? row.stock_bike_img_digit_positions.map((entry) => Number(entry))
      : [],
    stock_bike_img_row_count: Number(row.stock_bike_img_row_count ?? 0),
  }));
}

export async function Stock_bike_img_list_rule_families(): Promise<Stock_bike_img_rule_family[]> {
  const rows = (await sql`
    select
      f.id,
      f.stock_bike_img_family_key,
      f.stock_bike_img_family_name,
      f.stock_bike_img_family_description,
      coalesce(
        array_agg(distinct fc.stock_bike_img_rule_category_name) filter (where fc.stock_bike_img_rule_category_name is not null),
        '{}'::text[]
      ) as stock_bike_img_categories,
      coalesce(
        jsonb_agg(
          distinct jsonb_build_object(
            'id', g.id,
            'stock_bike_img_group_key', g.stock_bike_img_group_key,
            'stock_bike_img_group_name', g.stock_bike_img_group_name,
            'stock_bike_img_group_description', g.stock_bike_img_group_description
          )
        ) filter (where g.id is not null),
        '[]'::jsonb
      ) as stock_bike_img_groups
    from stock_bike_img_rule_family f
    left join stock_bike_img_rule_family_category fc
      on fc.stock_bike_img_rule_family_id = f.id
    left join stock_bike_img_family_bike_group g
      on g.stock_bike_img_rule_family_id = f.id
    group by f.id, f.stock_bike_img_family_key, f.stock_bike_img_family_name, f.stock_bike_img_family_description
    order by f.stock_bike_img_family_name
  `) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row.id),
    stock_bike_img_family_key: String(row.stock_bike_img_family_key ?? ''),
    stock_bike_img_family_name: String(row.stock_bike_img_family_name ?? ''),
    stock_bike_img_family_description: row.stock_bike_img_family_description
      ? String(row.stock_bike_img_family_description)
      : null,
    stock_bike_img_categories: Array.isArray(row.stock_bike_img_categories)
      ? row.stock_bike_img_categories.map((entry) => Stock_bike_img_as_text(entry)).filter(Boolean)
      : [],
    stock_bike_img_groups: Array.isArray(row.stock_bike_img_groups)
      ? row.stock_bike_img_groups.map((group) => ({
          id: Number((group as { id: unknown }).id),
          stock_bike_img_group_key: String((group as { stock_bike_img_group_key: unknown }).stock_bike_img_group_key ?? ''),
          stock_bike_img_group_name: String((group as { stock_bike_img_group_name: unknown }).stock_bike_img_group_name ?? ''),
          stock_bike_img_group_description: (group as { stock_bike_img_group_description?: unknown })
            .stock_bike_img_group_description
            ? String((group as { stock_bike_img_group_description?: unknown }).stock_bike_img_group_description)
            : null,
        }))
      : [],
  }));
}

const Stock_bike_img_parse_optional_model_year = (value: unknown): number | null => {
  const raw = Stock_bike_img_as_text(value);
  if (!raw || raw.toLowerCase() === 'all') {
    return null;
  }
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2020 || year > 2028) {
    throw new Error('stock_bike_img_model_year must be between 2020 and 2028 when provided.');
  }
  return year;
};

const Stock_bike_img_validate_family_and_group = async (familyId: number, groupId: number | null, category: string) => {
  const normalizedCategory = Stock_bike_img_normalize_category(category);
  const rows = (await sql`
    select
      f.id,
      f.stock_bike_img_family_key,
      f.stock_bike_img_family_name,
      exists (
        select 1
        from stock_bike_img_rule_family_category fc
        where fc.stock_bike_img_rule_family_id = f.id
          and upper(regexp_replace(trim(fc.stock_bike_img_rule_category_name), '\s+', ' ', 'g')) = ${normalizedCategory}
      ) as stock_bike_img_category_allowed,
      g.id as stock_bike_img_group_id,
      g.stock_bike_img_group_name
    from stock_bike_img_rule_family f
    left join stock_bike_img_family_bike_group g
      on g.stock_bike_img_rule_family_id = f.id
     and g.id = ${groupId}
    where f.id = ${familyId}
  `) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) {
    throw new Error('Selected rule family does not exist.');
  }

  if (!Boolean(row.stock_bike_img_category_allowed)) {
    throw new Error('Selected category is not mapped to this rule family.');
  }

  if (groupId !== null && !row.stock_bike_img_group_id) {
    throw new Error('Selected bike-type group does not belong to this rule family.');
  }
};

export async function Stock_bike_img_create_rule(input: Record<string, unknown>) {
  const stock_bike_img_model_year = Stock_bike_img_parse_optional_model_year(input.stock_bike_img_model_year);
  const stock_bike_img_rule_category = Stock_bike_img_as_text(input.stock_bike_img_rule_category);
  const stock_bike_img_rule_family_id = Number(input.stock_bike_img_rule_family_id);
  const rawGroupId = Number(input.stock_bike_img_bike_type_group_id ?? 0);
  const stock_bike_img_bike_type_group_id = Number.isInteger(rawGroupId) && rawGroupId > 0 ? rawGroupId : null;
  const stock_bike_img_rule_name = Stock_bike_img_as_text(input.stock_bike_img_rule_name);
  const stock_bike_img_rule_description = Stock_bike_img_as_text(input.stock_bike_img_rule_description) || null;
  const stock_bike_img_conditions_json = Stock_bike_img_normalize_conditions(input.stock_bike_img_conditions_json);
  const stock_bike_img_conditions_signature = Stock_bike_img_build_conditions_signature(stock_bike_img_conditions_json);
  const stock_bike_img_layer_order = Number(input.stock_bike_img_layer_order ?? 100);
  const stock_bike_img_picture_link_1 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_1) || null;
  const stock_bike_img_picture_link_2 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_2) || null;
  const stock_bike_img_picture_link_3 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_3) || null;

  if (!stock_bike_img_rule_category || !stock_bike_img_rule_name || !Number.isInteger(stock_bike_img_rule_family_id)) {
    throw new Error('Rule category, rule family and rule name are required.');
  }

  if (!Number.isInteger(stock_bike_img_layer_order) || stock_bike_img_layer_order < 1 || stock_bike_img_layer_order > 999) {
    throw new Error('stock_bike_img_layer_order must be an integer between 1 and 999.');
  }

  await Stock_bike_img_validate_family_and_group(
    stock_bike_img_rule_family_id,
    stock_bike_img_bike_type_group_id,
    stock_bike_img_rule_category,
  );

  const rows = (await sql`
    insert into stock_bike_img_rule (
      stock_bike_img_model_year,
      stock_bike_img_rule_category,
      stock_bike_img_rule_family_id,
      stock_bike_img_bike_type_group_id,
      stock_bike_img_rule_name,
      stock_bike_img_rule_description,
      stock_bike_img_conditions_json,
      stock_bike_img_conditions_signature,
      stock_bike_img_layer_order,
      stock_bike_img_picture_link_1,
      stock_bike_img_picture_link_2,
      stock_bike_img_picture_link_3
    )
    values (
      ${stock_bike_img_model_year},
      ${stock_bike_img_rule_category},
      ${stock_bike_img_rule_family_id},
      ${stock_bike_img_bike_type_group_id},
      ${stock_bike_img_rule_name},
      ${stock_bike_img_rule_description},
      ${JSON.stringify(stock_bike_img_conditions_json)}::jsonb,
      ${stock_bike_img_conditions_signature},
      ${stock_bike_img_layer_order},
      ${stock_bike_img_picture_link_1},
      ${stock_bike_img_picture_link_2},
      ${stock_bike_img_picture_link_3}
    )
    returning *
  `) as Record<string, unknown>[];

  const parsed = await sql`
    select
      r.*,
      f.stock_bike_img_family_key as stock_bike_img_rule_family_key,
      f.stock_bike_img_family_name as stock_bike_img_rule_family_name,
      g.stock_bike_img_group_key as stock_bike_img_bike_type_group_key,
      g.stock_bike_img_group_name as stock_bike_img_bike_type_group_name
    from stock_bike_img_rule r
    join stock_bike_img_rule_family f on f.id = r.stock_bike_img_rule_family_id
    left join stock_bike_img_family_bike_group g on g.id = r.stock_bike_img_bike_type_group_id
    where r.id = ${rows[0].id}
  `;
  return Stock_bike_img_parse_rule_row((parsed as Record<string, unknown>[])[0]);
}

export async function Stock_bike_img_update_rule(id: number, input: Record<string, unknown>) {
  const stock_bike_img_model_year = Stock_bike_img_parse_optional_model_year(input.stock_bike_img_model_year);
  const stock_bike_img_rule_category = Stock_bike_img_as_text(input.stock_bike_img_rule_category);
  const stock_bike_img_rule_family_id = Number(input.stock_bike_img_rule_family_id);
  const rawGroupId = Number(input.stock_bike_img_bike_type_group_id ?? 0);
  const stock_bike_img_bike_type_group_id = Number.isInteger(rawGroupId) && rawGroupId > 0 ? rawGroupId : null;
  const stock_bike_img_rule_name = Stock_bike_img_as_text(input.stock_bike_img_rule_name);
  const stock_bike_img_rule_description = Stock_bike_img_as_text(input.stock_bike_img_rule_description) || null;
  const stock_bike_img_conditions_json = Stock_bike_img_normalize_conditions(input.stock_bike_img_conditions_json);
  const stock_bike_img_conditions_signature = Stock_bike_img_build_conditions_signature(stock_bike_img_conditions_json);
  const stock_bike_img_layer_order = Number(input.stock_bike_img_layer_order ?? 100);
  const stock_bike_img_picture_link_1 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_1) || null;
  const stock_bike_img_picture_link_2 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_2) || null;
  const stock_bike_img_picture_link_3 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_3) || null;
  const stock_bike_img_is_active = Boolean(input.stock_bike_img_is_active ?? true);

  if (!stock_bike_img_rule_category || !stock_bike_img_rule_name || !Number.isInteger(stock_bike_img_rule_family_id)) {
    throw new Error('Rule category, rule family and rule name are required.');
  }

  if (!Number.isInteger(stock_bike_img_layer_order) || stock_bike_img_layer_order < 1 || stock_bike_img_layer_order > 999) {
    throw new Error('stock_bike_img_layer_order must be an integer between 1 and 999.');
  }

  await Stock_bike_img_validate_family_and_group(
    stock_bike_img_rule_family_id,
    stock_bike_img_bike_type_group_id,
    stock_bike_img_rule_category,
  );

  const rows = (await sql`
    update stock_bike_img_rule
    set stock_bike_img_model_year = ${stock_bike_img_model_year},
        stock_bike_img_rule_category = ${stock_bike_img_rule_category},
        stock_bike_img_rule_family_id = ${stock_bike_img_rule_family_id},
        stock_bike_img_bike_type_group_id = ${stock_bike_img_bike_type_group_id},
        stock_bike_img_rule_name = ${stock_bike_img_rule_name},
        stock_bike_img_rule_description = ${stock_bike_img_rule_description},
        stock_bike_img_conditions_json = ${JSON.stringify(stock_bike_img_conditions_json)}::jsonb,
        stock_bike_img_conditions_signature = ${stock_bike_img_conditions_signature},
        stock_bike_img_layer_order = ${stock_bike_img_layer_order},
        stock_bike_img_picture_link_1 = ${stock_bike_img_picture_link_1},
        stock_bike_img_picture_link_2 = ${stock_bike_img_picture_link_2},
        stock_bike_img_picture_link_3 = ${stock_bike_img_picture_link_3},
        stock_bike_img_is_active = ${stock_bike_img_is_active},
        updated_at = now()
    where id = ${id}
    returning *
  `) as Record<string, unknown>[];

  if (!rows[0]) {
    return null;
  }

  const parsed = await sql`
    select
      r.*,
      f.stock_bike_img_family_key as stock_bike_img_rule_family_key,
      f.stock_bike_img_family_name as stock_bike_img_rule_family_name,
      g.stock_bike_img_group_key as stock_bike_img_bike_type_group_key,
      g.stock_bike_img_group_name as stock_bike_img_bike_type_group_name
    from stock_bike_img_rule r
    join stock_bike_img_rule_family f on f.id = r.stock_bike_img_rule_family_id
    left join stock_bike_img_family_bike_group g on g.id = r.stock_bike_img_bike_type_group_id
    where r.id = ${rows[0].id}
  `;
  return Stock_bike_img_parse_rule_row((parsed as Record<string, unknown>[])[0]);
}

export async function Stock_bike_img_delete_rule(id: number) {
  await sql`delete from stock_bike_img_rule where id = ${id}`;
}

const Stock_bike_img_rule_matches_sku = (rule: Stock_bike_img_rule_row, stock_bike_img_sku_code: string) =>
  rule.stock_bike_img_conditions_json.every((condition) => {
    const digit = stock_bike_img_sku_code.charAt(condition.position - 1).toUpperCase();
    return condition.allowedValues.includes(digit);
  });

const Stock_bike_img_resolve_business_bike_type = async (stock_bike_img_sku_code: string) => {
  const bikeTypeDigit = stock_bike_img_sku_code.charAt(16).toUpperCase();

  const rows = (await sql`
    select
      bt.id,
      bt.stock_bike_img_bike_type_key,
      bt.stock_bike_img_bike_type_name
    from stock_bike_img_business_bike_type_digit_map dm
    join stock_bike_img_business_bike_type bt on bt.id = dm.stock_bike_img_business_bike_type_id
    where dm.stock_bike_img_digit_position = 17
      and dm.stock_bike_img_digit_value = ${bikeTypeDigit}
    order by bt.stock_bike_img_sort_order, bt.id
    limit 1
  `) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) {
    throw new Error(`Digit 17 value "${bikeTypeDigit}" is not mapped to a business bike type.`);
  }

  return {
    id: Number(row.id),
    key: String(row.stock_bike_img_bike_type_key ?? ''),
    name: String(row.stock_bike_img_bike_type_name ?? ''),
    source_digit_value: bikeTypeDigit,
  };
};

export async function Stock_bike_img_match_rules_by_sku(stock_bike_img_sku_code_input: string): Promise<Stock_bike_img_match_result> {
  const sku = Stock_bike_img_resolve_model_year_from_sku(stock_bike_img_sku_code_input);
  const businessBikeType = await Stock_bike_img_resolve_business_bike_type(sku.stock_bike_img_sku_code);

  const rows = (await sql`
    select
      r.*,
      f.stock_bike_img_family_key as stock_bike_img_rule_family_key,
      f.stock_bike_img_family_name as stock_bike_img_rule_family_name,
      g.stock_bike_img_group_key as stock_bike_img_bike_type_group_key,
      g.stock_bike_img_group_name as stock_bike_img_bike_type_group_name
    from stock_bike_img_rule r
    join stock_bike_img_rule_family f on f.id = r.stock_bike_img_rule_family_id
    left join stock_bike_img_family_bike_group g on g.id = r.stock_bike_img_bike_type_group_id
    left join stock_bike_img_family_bike_group_member gm
      on gm.stock_bike_img_family_bike_group_id = r.stock_bike_img_bike_type_group_id
     and gm.stock_bike_img_business_bike_type_id = ${businessBikeType.id}
    where r.stock_bike_img_is_active = true
      and (r.stock_bike_img_model_year = ${sku.stock_bike_img_model_year} or r.stock_bike_img_model_year is null)
      and (r.stock_bike_img_bike_type_group_id is null or gm.stock_bike_img_family_bike_group_id is not null)
    order by
      case when r.stock_bike_img_model_year is null then 1 else 0 end,
      r.stock_bike_img_layer_order,
      r.stock_bike_img_rule_category,
      r.id
  `) as Record<string, unknown>[];

  const rules = rows.map(Stock_bike_img_parse_rule_row);
  const matchedRules = rules.filter((rule) => Stock_bike_img_rule_matches_sku(rule, sku.stock_bike_img_sku_code));

  const layeredImages = matchedRules.flatMap((rule) => {
    const links = [rule.stock_bike_img_picture_link_1, rule.stock_bike_img_picture_link_2, rule.stock_bike_img_picture_link_3];
    return links
      .map((link, index) => ({
        stock_bike_img_rule_id: rule.id,
        stock_bike_img_rule_category: rule.stock_bike_img_rule_category,
        stock_bike_img_layer_order: rule.stock_bike_img_layer_order,
        stock_bike_img_slot: (index + 1) as 1 | 2 | 3,
        stock_bike_img_picture_link: String(link ?? '').trim(),
      }))
      .filter((entry) => entry.stock_bike_img_picture_link.length > 0);
  });

  return {
    stock_bike_img_sku_code: sku.stock_bike_img_sku_code,
    stock_bike_img_model_year: sku.stock_bike_img_model_year,
    stock_bike_img_model_year_digit: sku.stock_bike_img_model_year_digit,
    stock_bike_img_resolved_bike_type: businessBikeType,
    stock_bike_img_matched_rules: matchedRules,
    stock_bike_img_layered_images: layeredImages,
  };
}
