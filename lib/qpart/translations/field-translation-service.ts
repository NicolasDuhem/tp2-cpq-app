import 'server-only';

import { sql } from '@/lib/db/client';
import { getBaseLocale, listSupportedLocales } from '@/lib/qpart/locales/service';

const DEFAULT_TRANSLATION_MODEL = 'gpt-5.4-mini';
const TRANSLATABLE_FIELD_TYPES = new Set(['text', 'long_text', 'single_select']);

type TranslationRequest = {
  partId: number;
  metadataDefinitionId: number;
  fillMissingOnly?: boolean;
};

type MetadataDefinitionRow = {
  id: number;
  key: string;
  label_en: string;
  field_type: string;
  is_translatable: boolean;
};

type MetadataValueRow = {
  locale: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_json: unknown;
};

type PartContextRow = {
  part_number: string;
  hierarchy_node_id: number | null;
};

type LocaleTranslation = { locale: string; text: string };

type TranslationResult = {
  partId: number;
  metadataDefinitionId: number;
  fieldKey: string;
  sourceLocale: string;
  baseValue: string;
  fillMissingOnly: boolean;
  translated: LocaleTranslation[];
  skippedLocales: string[];
  failedLocales: string[];
  totalTargetLocales: number;
};

function asTrimmedString(value: unknown) {
  return String(value ?? '').trim();
}

function extractTextValue(row: MetadataValueRow | undefined, fieldType: string) {
  if (!row) return '';
  if (fieldType === 'text' || fieldType === 'long_text' || fieldType === 'single_select') return asTrimmedString(row.value_text);
  return '';
}

function valuePayloadForFieldType(fieldType: string, value: string) {
  if (fieldType === 'text' || fieldType === 'long_text' || fieldType === 'single_select') {
    return {
      value_text: value.trim() ? value : null,
      value_number: null,
      value_boolean: null,
      value_date: null,
      value_json: null,
    };
  }
  throw new Error(`Unsupported translatable field type: ${fieldType}`);
}

function parseModelTranslations(raw: unknown) {
  if (!raw || typeof raw !== 'object') return [];
  const rows = (raw as { target_translations?: unknown }).target_translations;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const locale = asTrimmedString((row as { locale?: unknown }).locale);
      const text = asTrimmedString((row as { text?: unknown }).text);
      if (!locale || !text) return null;
      return { locale, text };
    })
    .filter(Boolean) as LocaleTranslation[];
}

async function getHierarchyContext(hierarchyNodeId: number | null) {
  if (!hierarchyNodeId) return [] as Array<{ level: number; label_en: string }>;

  const rows = (await sql`
    with recursive lineage as (
      select id, parent_id, level, label_en
      from qpart_hierarchy_nodes
      where id = ${hierarchyNodeId}
      union all
      select parent.id, parent.parent_id, parent.level, parent.label_en
      from qpart_hierarchy_nodes parent
      join lineage child on child.parent_id = parent.id
    )
    select level, label_en
    from lineage
    order by level
  `) as Array<{ level: number; label_en: string }>;

  return rows;
}

async function callOpenAiForFieldTranslations(params: {
  model: string;
  partNumber: string;
  fieldKey: string;
  fieldLabel: string;
  sourceLocale: string;
  sourceText: string;
  hierarchyContext: Array<{ level: number; label_en: string }>;
  targetLocales: string[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const hierarchyLines = params.hierarchyContext.length
    ? params.hierarchyContext.map((row) => `L${row.level}: ${row.label_en}`).join('\n')
    : 'Unassigned';

  const prompt = [
    'Translate one Brompton spare-part metadata field for PIM usage.',
    `Part number: ${params.partNumber || 'Unknown'}`,
    `Field key: ${params.fieldKey}`,
    `Field label: ${params.fieldLabel}`,
    `Source locale: ${params.sourceLocale}`,
    `Source value: ${params.sourceText}`,
    `Target locales: ${params.targetLocales.join(', ')}`,
    'Hierarchy context:',
    hierarchyLines,
    'Rules:',
    '- Preserve technical meaning and controlled terms.',
    '- Preserve identifiers/codes/SKUs/EANs/part numbers and raw measurements exactly when present.',
    '- Do not add or invent information.',
    '- Return only requested locale translations.',
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a translation engine for Brompton spare-part metadata. Output valid JSON only and keep technical tokens unchanged when appropriate.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'qpart_field_translation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              field_key: { type: 'string' },
              source_locale: { type: 'string' },
              target_translations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    locale: { type: 'string' },
                    text: { type: 'string' },
                  },
                  required: ['locale', 'text'],
                  additionalProperties: false,
                },
              },
            },
            required: ['field_key', 'source_locale', 'target_translations'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Malformed structured output from OpenAI');
  }

  return parseModelTranslations(parsed);
}

export async function translateMetadataField(request: TranslationRequest): Promise<TranslationResult> {
  const partId = Number(request.partId);
  const metadataDefinitionId = Number(request.metadataDefinitionId);
  const fillMissingOnly = request.fillMissingOnly !== false;

  if (!Number.isFinite(partId)) throw new Error('Invalid partId');
  if (!Number.isFinite(metadataDefinitionId)) throw new Error('Invalid metadataDefinitionId');

  const [baseLocale, locales] = await Promise.all([getBaseLocale(), listSupportedLocales()]);
  const targetLocales = locales.filter((locale) => locale !== baseLocale);
  if (!targetLocales.length) throw new Error('No target locales available');

  const [definitionRows, partRows, metadataRows] = await Promise.all([
    sql`
      select id, key, label_en, field_type, is_translatable
      from qpart_metadata_definitions
      where id = ${metadataDefinitionId}
      limit 1
    `,
    sql`
      select part_number, hierarchy_node_id
      from qpart_parts
      where id = ${partId}
      limit 1
    `,
    sql`
      select locale, value_text, value_number, value_boolean, value_date, value_json
      from qpart_part_metadata_values
      where part_id = ${partId}
        and metadata_definition_id = ${metadataDefinitionId}
    `,
  ]);

  const definition = (definitionRows as MetadataDefinitionRow[])[0];
  if (!definition) throw new Error('Metadata definition not found');
  if (!definition.is_translatable) throw new Error('Metadata field is not translatable');
  if (!TRANSLATABLE_FIELD_TYPES.has(definition.field_type)) {
    throw new Error(`Field type ${definition.field_type} is not supported for AI translation`);
  }

  const part = (partRows as PartContextRow[])[0];
  if (!part) throw new Error('Part not found');

  const valuesByLocale = new Map<string, MetadataValueRow>();
  for (const row of metadataRows as MetadataValueRow[]) valuesByLocale.set(row.locale, row);

  const baseValue = extractTextValue(valuesByLocale.get(baseLocale), definition.field_type);
  if (!baseValue) throw new Error(`Base (${baseLocale}) value is required before translation`);

  const existingByLocale = new Map<string, string>();
  for (const locale of targetLocales) {
    existingByLocale.set(locale, extractTextValue(valuesByLocale.get(locale), definition.field_type));
  }

  const localesToTranslate = fillMissingOnly
    ? targetLocales.filter((locale) => !asTrimmedString(existingByLocale.get(locale)))
    : targetLocales;

  if (!localesToTranslate.length) {
    return {
      partId,
      metadataDefinitionId,
      fieldKey: definition.key,
      sourceLocale: baseLocale,
      baseValue,
      fillMissingOnly,
      translated: [],
      skippedLocales: targetLocales,
      failedLocales: [],
      totalTargetLocales: targetLocales.length,
    };
  }

  const model = asTrimmedString(process.env.OPENAI_TRANSLATION_MODEL) || DEFAULT_TRANSLATION_MODEL;
  const hierarchyContext = await getHierarchyContext(part.hierarchy_node_id);
  const generated = await callOpenAiForFieldTranslations({
    model,
    partNumber: part.part_number,
    fieldKey: definition.key,
    fieldLabel: definition.label_en,
    sourceLocale: baseLocale,
    sourceText: baseValue,
    hierarchyContext,
    targetLocales: localesToTranslate,
  });

  const generatedByLocale = new Map<string, string>();
  for (const row of generated) {
    if (localesToTranslate.includes(row.locale)) generatedByLocale.set(row.locale, row.text);
  }

  const translated: LocaleTranslation[] = [];
  const failedLocales: string[] = [];

  for (const locale of localesToTranslate) {
    const translatedText = asTrimmedString(generatedByLocale.get(locale));
    if (!translatedText) {
      failedLocales.push(locale);
      continue;
    }

    const payload = valuePayloadForFieldType(definition.field_type, translatedText);
    await sql`
      insert into qpart_part_metadata_values
        (part_id, metadata_definition_id, locale, value_text, value_number, value_boolean, value_date, value_json)
      values
        (
          ${partId},
          ${metadataDefinitionId},
          ${locale},
          ${payload.value_text},
          ${payload.value_number},
          ${payload.value_boolean},
          ${payload.value_date},
          ${payload.value_json === null ? null : JSON.stringify(payload.value_json)}::jsonb
        )
      on conflict (part_id, metadata_definition_id, locale)
      do update
      set value_text = excluded.value_text,
          value_number = excluded.value_number,
          value_boolean = excluded.value_boolean,
          value_date = excluded.value_date,
          value_json = excluded.value_json
    `;

    translated.push({ locale, text: translatedText });
  }

  const skippedLocales = fillMissingOnly
    ? targetLocales.filter((locale) => locale !== baseLocale && asTrimmedString(existingByLocale.get(locale)))
    : [];

  return {
    partId,
    metadataDefinitionId,
    fieldKey: definition.key,
    sourceLocale: baseLocale,
    baseValue,
    fillMissingOnly,
    translated,
    skippedLocales,
    failedLocales,
    totalTargetLocales: targetLocales.length,
  };
}
