import { sql } from '@/lib/db/client';

export type Stock_bike_img_condition = {
  position: number;
  allowedValues: string[];
};

export type Stock_bike_img_rule_row = {
  id: number;
  stock_bike_img_model_year: number;
  stock_bike_img_rule_category: string;
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
  stock_bike_img_matched_rules: Stock_bike_img_rule_row[];
  stock_bike_img_layered_images: Array<{
    stock_bike_img_rule_id: number;
    stock_bike_img_rule_category: string;
    stock_bike_img_layer_order: number;
    stock_bike_img_slot: 1 | 2 | 3;
    stock_bike_img_picture_link: string;
  }>;
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

const Stock_bike_img_normalize_token = (value: string) => value.trim().toUpperCase();

const Stock_bike_img_as_text = (value: unknown) => String(value ?? '').trim();

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
      const position = Number(raw.position ?? raw.stock_bike_img_position);
      if (!Number.isInteger(position) || position < 1 || position > STOCK_BIKE_IMG_SKU_LENGTH) {
        throw new Error('Condition position must be an integer between 1 and 30.');
      }

      return {
        position,
        allowedValues: Stock_bike_img_normalize_allowed_values(raw.allowedValues ?? raw.stock_bike_img_allowed_values),
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
  stock_bike_img_model_year: Number(row.stock_bike_img_model_year),
  stock_bike_img_rule_category: String(row.stock_bike_img_rule_category ?? ''),
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

export async function Stock_bike_img_list_rules(stock_bike_img_model_year?: number) {
  const year = Number(stock_bike_img_model_year ?? 0);

  const rows = year
    ? await sql`
        select *
        from stock_bike_img_rule
        where stock_bike_img_model_year = ${year}
        order by stock_bike_img_model_year, stock_bike_img_layer_order, stock_bike_img_rule_category, id
      `
    : await sql`
        select *
        from stock_bike_img_rule
        order by stock_bike_img_model_year, stock_bike_img_layer_order, stock_bike_img_rule_category, id
      `;

  return (rows as Record<string, unknown>[]).map(Stock_bike_img_parse_rule_row);
}

export async function Stock_bike_img_create_rule(input: Record<string, unknown>) {
  const stock_bike_img_model_year = Number(input.stock_bike_img_model_year);
  const stock_bike_img_rule_category = Stock_bike_img_as_text(input.stock_bike_img_rule_category);
  const stock_bike_img_rule_name = Stock_bike_img_as_text(input.stock_bike_img_rule_name);
  const stock_bike_img_rule_description = Stock_bike_img_as_text(input.stock_bike_img_rule_description) || null;
  const stock_bike_img_conditions_json = Stock_bike_img_normalize_conditions(input.stock_bike_img_conditions_json);
  const stock_bike_img_conditions_signature = Stock_bike_img_build_conditions_signature(stock_bike_img_conditions_json);
  const stock_bike_img_layer_order = Number(input.stock_bike_img_layer_order ?? 100);
  const stock_bike_img_picture_link_1 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_1) || null;
  const stock_bike_img_picture_link_2 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_2) || null;
  const stock_bike_img_picture_link_3 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_3) || null;

  if (!Number.isInteger(stock_bike_img_model_year) || stock_bike_img_model_year < 2020 || stock_bike_img_model_year > 2028) {
    throw new Error('stock_bike_img_model_year must be between 2020 and 2028.');
  }

  if (!stock_bike_img_rule_category || !stock_bike_img_rule_name) {
    throw new Error('stock_bike_img_rule_category and stock_bike_img_rule_name are required.');
  }

  if (!Number.isInteger(stock_bike_img_layer_order) || stock_bike_img_layer_order < 1 || stock_bike_img_layer_order > 999) {
    throw new Error('stock_bike_img_layer_order must be an integer between 1 and 999.');
  }

  const rows = (await sql`
    insert into stock_bike_img_rule (
      stock_bike_img_model_year,
      stock_bike_img_rule_category,
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

  return Stock_bike_img_parse_rule_row(rows[0]);
}

export async function Stock_bike_img_update_rule(id: number, input: Record<string, unknown>) {
  const stock_bike_img_model_year = Number(input.stock_bike_img_model_year);
  const stock_bike_img_rule_category = Stock_bike_img_as_text(input.stock_bike_img_rule_category);
  const stock_bike_img_rule_name = Stock_bike_img_as_text(input.stock_bike_img_rule_name);
  const stock_bike_img_rule_description = Stock_bike_img_as_text(input.stock_bike_img_rule_description) || null;
  const stock_bike_img_conditions_json = Stock_bike_img_normalize_conditions(input.stock_bike_img_conditions_json);
  const stock_bike_img_conditions_signature = Stock_bike_img_build_conditions_signature(stock_bike_img_conditions_json);
  const stock_bike_img_layer_order = Number(input.stock_bike_img_layer_order ?? 100);
  const stock_bike_img_picture_link_1 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_1) || null;
  const stock_bike_img_picture_link_2 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_2) || null;
  const stock_bike_img_picture_link_3 = Stock_bike_img_as_text(input.stock_bike_img_picture_link_3) || null;
  const stock_bike_img_is_active = Boolean(input.stock_bike_img_is_active ?? true);

  const rows = (await sql`
    update stock_bike_img_rule
    set stock_bike_img_model_year = ${stock_bike_img_model_year},
        stock_bike_img_rule_category = ${stock_bike_img_rule_category},
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

  return rows[0] ? Stock_bike_img_parse_rule_row(rows[0]) : null;
}

export async function Stock_bike_img_delete_rule(id: number) {
  await sql`delete from stock_bike_img_rule where id = ${id}`;
}

const Stock_bike_img_rule_matches_sku = (rule: Stock_bike_img_rule_row, stock_bike_img_sku_code: string) =>
  rule.stock_bike_img_conditions_json.every((condition) => {
    const digit = stock_bike_img_sku_code.charAt(condition.position - 1).toUpperCase();
    return condition.allowedValues.includes(digit);
  });

export async function Stock_bike_img_match_rules_by_sku(stock_bike_img_sku_code_input: string): Promise<Stock_bike_img_match_result> {
  const sku = Stock_bike_img_resolve_model_year_from_sku(stock_bike_img_sku_code_input);

  const rows = (await sql`
    select *
    from stock_bike_img_rule
    where stock_bike_img_model_year = ${sku.stock_bike_img_model_year}
      and stock_bike_img_is_active = true
    order by stock_bike_img_layer_order, stock_bike_img_rule_category, id
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
    stock_bike_img_matched_rules: matchedRules,
    stock_bike_img_layered_images: layeredImages,
  };
}
