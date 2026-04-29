import { getBaseLocale, listSupportedLocales } from '@/lib/qpart/locales/service';
import { listMetadataDefinitions } from '@/lib/qpart/metadata/service';
import { createPart, getPartDetail, listParts, updatePart } from '@/lib/qpart/parts/service';
import { listHierarchyNodes } from '@/lib/qpart/hierarchy/service';
import { listQPartAllocationCountries } from '@/lib/qpart/allocation/service';
import { QPART_CHANNEL_SET } from '@/lib/qpart/channels';
import { QPartCompatibilityRule, QPartMetadataDefinition, QPartMetadataValue, QPartPartDetail } from '@/types/qpart';

const CORE_COLUMNS = ['part_number', 'english_title', 'english_description', 'status'] as const;
const HIERARCHY_COLUMNS = ['hierarchy_1', 'hierarchy_2', 'hierarchy_3', 'hierarchy_4', 'hierarchy_5', 'hierarchy_6', 'hierarchy_7'] as const;
const STATIC_COLLECTION_COLUMNS = ['channels', 'countries', 'bike_types', 'compatibility_rules'] as const;

const PART_STATUSES = new Set(['active', 'inactive', 'draft']);

type CsvContext = {
  locales: string[];
  baseLocale: string;
  metadataDefinitions: QPartMetadataDefinition[];
  hierarchyNodes: Awaited<ReturnType<typeof listHierarchyNodes>>;
  countries: string[];
};

type ImportRowResult = {
  rowNumber: number;
  part_number: string;
  action: 'created' | 'updated' | 'skipped';
  errors: string[];
};

type ImportSummary = {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  totalRows: number;
  rowResults: ImportRowResult[];
};

type ParsedCell = { rowNumber: number; values: Record<string, string> };

type NormalizedImportRow = {
  rowNumber: number;
  part_number: string;
  payload: Record<string, unknown>;
};

const asText = (value: unknown) => String(value ?? '').trim();
const nullableText = (value: unknown) => {
  const text = asText(value);
  return text.length ? text : null;
};

const toCsvCell = (value: unknown) => {
  const raw = value === null || value === undefined ? '' : String(value);
  if (raw.includes('"')) {
    const escaped = raw.replaceAll('"', '""');
    return `"${escaped}"`;
  }
  if (raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw}"`;
  }
  return raw;
};

const parseCsv = (raw: string) => {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (inQuotes) {
      if (char === '"' && raw[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (char === '\r') continue;
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0) || rows.length === 0) rows.push(row);

  return rows;
};

const metadataColumnName = (key: string) => `metadata__${key}`;
const coreTranslationColumnName = (field: 'title' | 'description', locale: string) => `${field}__${locale}`;
const metadataTranslationColumnName = (key: string, locale: string) => `metadata__${key}__${locale}`;

async function getCsvContext(): Promise<CsvContext> {
  const [locales, baseLocale, metadataDefinitions, hierarchyNodes, countries] = await Promise.all([
    listSupportedLocales(),
    getBaseLocale(),
    listMetadataDefinitions(true),
    listHierarchyNodes(),
    listQPartAllocationCountries(),
  ]);

  const normalizedLocales = [...new Set(locales.map((locale) => locale.trim()).filter(Boolean))];

  return {
    locales: normalizedLocales,
    baseLocale,
    metadataDefinitions,
    hierarchyNodes,
    countries,
  };
}

function buildHierarchyPath(partHierarchyNodeId: number | null, hierarchyNodes: CsvContext['hierarchyNodes']) {
  const nodeById = new Map(hierarchyNodes.map((node) => [node.id, node]));
  const path = Array.from({ length: 7 }, () => '');
  if (!partHierarchyNodeId) return path;

  let cursor = nodeById.get(partHierarchyNodeId);
  while (cursor) {
    path[cursor.level - 1] = cursor.label_en;
    cursor = cursor.parent_id ? nodeById.get(cursor.parent_id) : undefined;
  }

  return path;
}

function serializeMetadataValue(value: QPartMetadataValue | undefined) {
  if (!value) return '';
  if (value.value_json !== null && value.value_json !== undefined) return JSON.stringify(value.value_json);
  if (value.value_date) return value.value_date;
  if (value.value_boolean !== null && value.value_boolean !== undefined) return value.value_boolean ? 'true' : 'false';
  if (value.value_number !== null && value.value_number !== undefined) return String(value.value_number);
  return value.value_text ?? '';
}

function parseMetadataFieldValue(definition: QPartMetadataDefinition, rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed.length) {
    return {
      value_text: null,
      value_number: null,
      value_boolean: null,
      value_date: null,
      value_json: null,
    };
  }

  switch (definition.field_type) {
    case 'number': {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) throw new Error(`metadata ${definition.key} expects a number`);
      return { value_text: null, value_number: parsed, value_boolean: null, value_date: null, value_json: null };
    }
    case 'boolean': {
      const lowered = trimmed.toLowerCase();
      if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lowered)) {
        throw new Error(`metadata ${definition.key} expects boolean true/false`);
      }
      return {
        value_text: null,
        value_number: null,
        value_boolean: ['true', '1', 'yes'].includes(lowered),
        value_date: null,
        value_json: null,
      };
    }
    case 'date': {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
      if (!valid) throw new Error(`metadata ${definition.key} expects date YYYY-MM-DD`);
      return { value_text: null, value_number: null, value_boolean: null, value_date: trimmed, value_json: null };
    }
    case 'single_select':
      return { value_text: trimmed, value_number: null, value_boolean: null, value_date: null, value_json: null };
    case 'multi_select': {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) throw new Error('must be a JSON array');
        return { value_text: null, value_number: null, value_boolean: null, value_date: null, value_json: parsed };
      } catch {
        throw new Error(`metadata ${definition.key} expects JSON array for multi_select`);
      }
    }
    case 'long_text':
    case 'text':
    default:
      return { value_text: trimmed, value_number: null, value_boolean: null, value_date: null, value_json: null };
  }
}

function parseCompatibilityRules(raw: string): QPartCompatibilityRule[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('compatibility_rules must be valid JSON array');
  }

  if (!Array.isArray(parsed)) throw new Error('compatibility_rules must be a JSON array');

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`compatibility_rules[${index}] must be object`);

    const row = entry as Record<string, unknown>;
    const bikeType = asText(row.bike_type);
    const featureLabel = asText(row.feature_label);
    const optionValue = asText(row.option_value);
    if (!bikeType || !featureLabel || !optionValue) {
      throw new Error(`compatibility_rules[${index}] requires bike_type, feature_label, option_value`);
    }

    const sourceRaw = asText(row.source || 'manual') || 'manual';
    const source = ['derived', 'reference', 'manual'].includes(sourceRaw) ? sourceRaw : 'manual';

    return {
      bike_type: bikeType,
      feature_label: featureLabel,
      option_value: optionValue,
      option_label: nullableText(row.option_label),
      source: source as 'derived' | 'reference' | 'manual',
      is_active: row.is_active === false ? false : true,
    };
  });
}

function resolveHierarchyNodeId(pathColumns: string[], hierarchyNodes: CsvContext['hierarchyNodes']) {
  const pathValues = pathColumns.map((value) => value.trim());
  const filled = pathValues.filter(Boolean);
  if (!filled.length) return null;

  const nodeById = new Map(hierarchyNodes.map((node) => [node.id, node]));
  let currentParent: number | null = null;
  let resolvedId: number | null = null;

  for (let idx = 0; idx < pathValues.length; idx += 1) {
    const label = pathValues[idx];
    const level = idx + 1;
    if (!label) {
      if (pathValues.slice(idx + 1).some(Boolean)) throw new Error('Hierarchy levels must be contiguous from 1..n');
      break;
    }

    const candidates = hierarchyNodes.filter((node) => node.level === level && node.label_en === label && node.parent_id === currentParent);
    if (candidates.length !== 1) {
      throw new Error(`Unable to resolve hierarchy level ${level} label "${label}"`);
    }

    resolvedId = candidates[0].id;
    currentParent = candidates[0].id;
  }

  if (resolvedId && !nodeById.get(resolvedId)?.is_active) {
    throw new Error('Resolved hierarchy node is inactive');
  }

  return resolvedId;
}

function buildColumns(context: CsvContext) {
  const nonBaseLocales = context.locales.filter((locale) => locale !== context.baseLocale);
  const metadataColumns = context.metadataDefinitions.map((definition) => metadataColumnName(definition.key));
  const coreTranslationColumns = nonBaseLocales.flatMap((locale) => [
    coreTranslationColumnName('title', locale),
    coreTranslationColumnName('description', locale),
  ]);

  const metadataTranslationColumns = context.metadataDefinitions
    .filter((definition) => definition.is_translatable)
    .flatMap((definition) => nonBaseLocales.map((locale) => metadataTranslationColumnName(definition.key, locale)));

  return [
    ...CORE_COLUMNS,
    ...HIERARCHY_COLUMNS,
    ...metadataColumns,
    ...coreTranslationColumns,
    ...metadataTranslationColumns,
    ...STATIC_COLLECTION_COLUMNS,
  ];
}

async function listAllPartRecords() {
  const allRows: Awaited<ReturnType<typeof listParts>>['rows'] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await listParts({ page, pageSize: 500 });
    allRows.push(...result.rows);
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return allRows;
}

export async function exportPartsCsv(partId?: number) {
  const context = await getCsvContext();
  const columns = buildColumns(context);
  const metadataById = new Map(context.metadataDefinitions.map((definition) => [definition.id, definition]));

  const parts = partId
    ? [await getPartDetail(partId)].filter((row): row is QPartPartDetail => Boolean(row))
    : await Promise.all((await listAllPartRecords()).map((row) => getPartDetail(row.id))).then((rows) => rows.filter((row): row is QPartPartDetail => Boolean(row)));
  if (partId && !parts.length) throw new Error('Part not found');

  const lines = [columns.join(',')];

  for (const detail of parts) {
    const hierarchyPath = buildHierarchyPath(detail.part.hierarchy_node_id, context.hierarchyNodes);

    const translationByLocale = new Map(detail.translations.map((translation) => [translation.locale, translation]));
    const metadataByKeyAndLocale = new Map<string, QPartMetadataValue>();
    for (const value of detail.metadata_values) {
      const definition = metadataById.get(value.metadata_definition_id);
      if (!definition) continue;
      metadataByKeyAndLocale.set(`${definition.key}::${value.locale}`, value);
    }

    const row: Record<string, unknown> = {
      part_number: detail.part.part_number,
      english_title: detail.part.default_name,
      english_description: detail.part.default_description ?? '',
      status: detail.part.status,
      channels: detail.channels.join('|'),
      countries: detail.country_codes.join('|'),
      bike_types: detail.bike_types.join('|'),
      compatibility_rules: JSON.stringify(detail.compatibility_rules),
    };

    HIERARCHY_COLUMNS.forEach((column, idx) => {
      row[column] = hierarchyPath[idx] || '';
    });

    for (const definition of context.metadataDefinitions) {
      row[metadataColumnName(definition.key)] = serializeMetadataValue(metadataByKeyAndLocale.get(`${definition.key}::${context.baseLocale}`));

      if (!definition.is_translatable) continue;
      for (const locale of context.locales.filter((candidate) => candidate !== context.baseLocale)) {
        row[metadataTranslationColumnName(definition.key, locale)] = serializeMetadataValue(metadataByKeyAndLocale.get(`${definition.key}::${locale}`));
      }
    }

    for (const locale of context.locales.filter((candidate) => candidate !== context.baseLocale)) {
      const translation = translationByLocale.get(locale);
      row[coreTranslationColumnName('title', locale)] = translation?.name ?? '';
      row[coreTranslationColumnName('description', locale)] = translation?.description ?? '';
    }

    const line = columns.map((column) => toCsvCell(row[column] ?? '')).join(',');
    lines.push(line);
  }

  return {
    columns,
    csv: `${lines.join('\n')}\n`,
    fileName: partId ? `qpart-part-${partId}.csv` : 'qpart-parts.csv',
  };
}

function validateHeaders(headers: string[], context: CsvContext) {
  const errors: string[] = [];
  const expectedColumns = new Set(buildColumns(context));
  const requiredColumns = new Set(['part_number', 'english_title', 'status']);

  for (const required of requiredColumns) {
    if (!headers.includes(required)) errors.push(`Missing required column: ${required}`);
  }

  for (const header of headers) {
    if (expectedColumns.has(header)) continue;

    if (header.startsWith('metadata__')) {
      errors.push(`Unknown metadata column: ${header}`);
      continue;
    }

    if (header.startsWith('title__') || header.startsWith('description__')) {
      errors.push(`Unknown locale core translation column: ${header}`);
      continue;
    }

    errors.push(`Unknown column: ${header}`);
  }

  return errors;
}

function parseRows(rawCsv: string): { headers: string[]; rows: ParsedCell[] } {
  const parsed = parseCsv(rawCsv);
  if (!parsed.length) throw new Error('CSV is empty');

  const headers = parsed[0].map((value) => value.trim());
  if (!headers.length || headers.every((header) => !header)) throw new Error('CSV header row is empty');

  const rows: ParsedCell[] = [];
  for (let rowIndex = 1; rowIndex < parsed.length; rowIndex += 1) {
    const cells = parsed[rowIndex];
    const mapped: Record<string, string> = {};
    headers.forEach((header, idx) => {
      mapped[header] = cells[idx] ?? '';
    });

    const hasAnyValue = Object.values(mapped).some((value) => value.trim().length > 0);
    if (!hasAnyValue) continue;

    rows.push({ rowNumber: rowIndex + 1, values: mapped });
  }

  return { headers, rows };
}

async function normalizeImportRows(rawRows: ParsedCell[], context: CsvContext) {
  const partNumbers = new Set<string>();
  const metadataByKey = new Map(context.metadataDefinitions.map((definition) => [definition.key, definition]));
  const nonBaseLocales = context.locales.filter((locale) => locale !== context.baseLocale);
  const localeSet = new Set(nonBaseLocales);

  const normalizedRows: NormalizedImportRow[] = [];
  const rowResults: ImportRowResult[] = [];

  for (const row of rawRows) {
    const errors: string[] = [];
    const partNumber = asText(row.values.part_number);
    const englishTitle = asText(row.values.english_title);
    const englishDescription = nullableText(row.values.english_description);
    const status = asText(row.values.status || 'active').toLowerCase();

    if (!partNumber) errors.push('part_number is required');
    if (!englishTitle) errors.push('english_title is required');
    if (!PART_STATUSES.has(status)) errors.push(`Invalid status: ${status || '(blank)'}`);

    if (partNumber && partNumbers.has(partNumber)) {
      errors.push(`Duplicate part_number in file: ${partNumber}`);
    }
    partNumbers.add(partNumber);

    let hierarchyNodeId: number | null = null;
    try {
      hierarchyNodeId = resolveHierarchyNodeId(HIERARCHY_COLUMNS.map((column) => row.values[column] ?? ''), context.hierarchyNodes);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid hierarchy path');
    }

    const translations = nonBaseLocales.map((locale) => ({
      locale,
      name: nullableText(row.values[coreTranslationColumnName('title', locale)] ?? ''),
      description: nullableText(row.values[coreTranslationColumnName('description', locale)] ?? ''),
    }));

    const metadataValues: QPartMetadataValue[] = [];
    for (const definition of context.metadataDefinitions) {
      const baseColumn = metadataColumnName(definition.key);
      try {
        metadataValues.push({
          ...parseMetadataFieldValue(definition, row.values[baseColumn] ?? ''),
          metadata_definition_id: definition.id,
          locale: context.baseLocale,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Invalid metadata value for ${definition.key}`);
      }

      if (!definition.is_translatable) continue;
      for (const locale of nonBaseLocales) {
        try {
          metadataValues.push({
            ...parseMetadataFieldValue(definition, row.values[metadataTranslationColumnName(definition.key, locale)] ?? ''),
            metadata_definition_id: definition.id,
            locale,
          });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Invalid metadata translation for ${definition.key}/${locale}`);
        }
      }
    }

    const bikeTypes = asText(row.values.bike_types)
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
    const channels = asText(row.values.channels)
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
    const invalidChannels = channels.filter((channel) => !QPART_CHANNEL_SET.has(channel));
    if (invalidChannels.length) {
      errors.push(`Invalid channels: ${invalidChannels.join(', ')}`);
    }

    const countries = asText(row.values.countries)
      .split('|')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const countrySet = new Set(context.countries);
    const invalidCountries = countries.filter((countryCode) => !countrySet.has(countryCode));
    if (invalidCountries.length) {
      errors.push(`Invalid countries: ${invalidCountries.join(', ')}`);
    }

    const invalidLocaleColumns = Object.keys(row.values)
      .filter((column) => column.startsWith('title__') || column.startsWith('description__'))
      .map((column) => column.split('__')[1])
      .filter((locale) => locale && !localeSet.has(locale));

    for (const locale of invalidLocaleColumns) {
      errors.push(`Unsupported locale in column: ${locale}`);
    }

    let compatibilityRules: QPartCompatibilityRule[] = [];
    try {
      compatibilityRules = parseCompatibilityRules(row.values.compatibility_rules ?? '');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid compatibility_rules value');
    }

    const unknownMetadataColumns = Object.keys(row.values)
      .filter((column) => column.startsWith('metadata__'))
      .filter((column) => {
        const segments = column.split('__');
        const metadataKey = segments[1];
        return !metadataByKey.has(metadataKey);
      });

    for (const column of unknownMetadataColumns) {
      errors.push(`Unknown metadata column: ${column}`);
    }

    rowResults.push({
      rowNumber: row.rowNumber,
      part_number: partNumber,
      action: 'skipped',
      errors,
    });

    if (errors.length) continue;

    normalizedRows.push({
      rowNumber: row.rowNumber,
      part_number: partNumber,
      payload: {
        part_number: partNumber,
        default_name: englishTitle,
        default_description: englishDescription,
        status,
        hierarchy_node_id: hierarchyNodeId,
        translations,
        metadata_values: metadataValues,
        channels,
        country_codes: countries,
        bike_types: bikeTypes,
        compatibility_rules: compatibilityRules,
      },
    });
  }

  return { normalizedRows, rowResults };
}

async function findPartByNumber(partNumber: string) {
  const rows = await listParts({ search: partNumber });
  return rows.find((row) => row.part_number === partNumber) ?? null;
}

export async function importPartsCsv(rawCsv: string, dryRun = true): Promise<ImportSummary> {
  const context = await getCsvContext();
  const { headers, rows } = parseRows(rawCsv);
  const headerErrors = validateHeaders(headers, context);

  const summary: ImportSummary = {
    dryRun,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    totalRows: rows.length,
    rowResults: [],
  };

  if (headerErrors.length) {
    summary.rowResults = [{ rowNumber: 1, part_number: '', action: 'skipped', errors: headerErrors }];
    summary.errors = headerErrors.length;
    summary.skipped = rows.length;
    return summary;
  }

  const { normalizedRows, rowResults } = await normalizeImportRows(rows, context);
  summary.rowResults = rowResults;

  const validationErrorCount = rowResults.reduce((acc, row) => acc + row.errors.length, 0);
  if (validationErrorCount > 0) {
    summary.errors = validationErrorCount;
    summary.skipped = rows.length;
    return summary;
  }

  for (const row of normalizedRows) {
    const result = summary.rowResults.find((candidate) => candidate.rowNumber === row.rowNumber);
    if (!result) continue;

    const existing = await findPartByNumber(row.part_number);

    if (dryRun) {
      result.action = existing ? 'updated' : 'created';
      if (existing) summary.updated += 1;
      else summary.created += 1;
      continue;
    }

    try {
      if (existing) {
        await updatePart(existing.id, row.payload);
        result.action = 'updated';
        summary.updated += 1;
      } else {
        await createPart(row.payload);
        result.action = 'created';
        summary.created += 1;
      }
    } catch (error) {
      result.action = 'skipped';
      result.errors.push(error instanceof Error ? error.message : 'Failed to persist row');
      summary.errors += 1;
      summary.skipped += 1;
    }
  }

  return summary;
}
