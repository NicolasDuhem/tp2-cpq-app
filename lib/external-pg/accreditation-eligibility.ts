import 'server-only';

import { withExternalPgClient } from '@/lib/external-pg/client';
import { normalizeExternalPgError } from '@/lib/external-pg/errors';

/**
 * External PostgreSQL writer/reader for the Accreditation allocation page.
 *
 * Table: `${EXTERNAL_PG_SCHEMA}.accreditation_category_eligibilities`
 * (DDL in sql/external/2026-11-20_accreditation_category_eligibilities.sql).
 *
 * Isolated from the bike/QPart writer in `variant-tables.ts`: it never touches
 * `variants` or `variant_eligibilities`.
 *
 * Write model: one country at a time is replaced as a full snapshot inside a
 * transaction (delete that country's rows for the channel, insert the current rows).
 * That keeps the external table an exact mirror of the tool, needs no unique index,
 * and naturally removes rows for deleted categories or removed levels.
 */

export const EXTERNAL_ACCREDITATION_TABLE = 'accreditation_category_eligibilities';
const INSERT_CHUNK_SIZE = 5000;

export type ExternalAccreditationRow = {
  countryCode: string;
  levelCode: string;
  categoryId: number;
  parentCategoryId: number;
  categoryName: string;
  categoryDepth: number;
  isActive: boolean;
};

export type ExternalAccreditationCountryResult = {
  countryCode: string;
  ok: boolean;
  rowCount: number;
  deletedCount: number;
  error?: string;
};

export type ExternalAccreditationStatusRow = {
  countryCode: string;
  levelCode: string;
  categoryId: number;
  isActive: boolean;
};

type Queryable = { query: (queryText: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
const qualified = (schema: string) => `${quoteIdentifier(schema)}.${quoteIdentifier(EXTERNAL_ACCREDITATION_TABLE)}`;

async function assertTableExists(client: Queryable, schema: string) {
  const result = await client.query('select to_regclass($1) as reg', [`${quoteIdentifier(schema)}.${quoteIdentifier(EXTERNAL_ACCREDITATION_TABLE)}`]);
  if (!result.rows[0]?.reg) {
    throw new Error(
      `External table ${schema}.${EXTERNAL_ACCREDITATION_TABLE} does not exist. Run sql/external/2026-11-20_accreditation_category_eligibilities.sql on the external PostgreSQL first.`,
    );
  }
}

const unixSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Replace each country's external snapshot. Countries are processed independently:
 * one failing country is rolled back and reported, the others still commit.
 */
export async function replaceExternalAccreditationCountries(
  channelId: number,
  countryCodes: string[],
  rows: ExternalAccreditationRow[],
): Promise<ExternalAccreditationCountryResult[]> {
  const countries = [...new Set(countryCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (!countries.length) return [];

  const rowsByCountry = new Map<string, ExternalAccreditationRow[]>();
  for (const row of rows) {
    const list = rowsByCountry.get(row.countryCode) ?? [];
    list.push(row);
    rowsByCountry.set(row.countryCode, list);
  }

  return withExternalPgClient(async (client, schema) => {
    await assertTableExists(client as Queryable, schema);
    const table = qualified(schema);
    const results: ExternalAccreditationCountryResult[] = [];

    for (const countryCode of countries) {
      const countryRows = rowsByCountry.get(countryCode) ?? [];
      const updatedAt = unixSeconds();
      try {
        await client.query('begin');
        const deleted = (await (client as Queryable).query(
          `delete from ${table} where "ChannelId" = $1 and "CountryCode" = $2`,
          [channelId, countryCode],
        )) as { rowCount?: number | null };

        for (let start = 0; start < countryRows.length; start += INSERT_CHUNK_SIZE) {
          const chunk = countryRows.slice(start, start + INSERT_CHUNK_SIZE);
          await client.query(
            `insert into ${table}
               ("ChannelId", "CountryCode", "AccreditationLevel", "CategoryId", "ParentCategoryId", "CategoryName", "CategoryDepth", "IsActive", "UpdatedAt")
             select $1::bigint, $2::text, t.level_code, t.category_id, t.parent_id, t.category_name, t.depth, t.is_active, $3::bigint
             from unnest($4::text[], $5::bigint[], $6::bigint[], $7::text[], $8::int[], $9::boolean[])
               as t(level_code, category_id, parent_id, category_name, depth, is_active)`,
            [
              channelId,
              countryCode,
              updatedAt,
              chunk.map((row) => row.levelCode),
              chunk.map((row) => row.categoryId),
              chunk.map((row) => row.parentCategoryId),
              chunk.map((row) => row.categoryName),
              chunk.map((row) => row.categoryDepth),
              chunk.map((row) => row.isActive),
            ],
          );
        }
        await client.query('commit');
        results.push({ countryCode, ok: true, rowCount: countryRows.length, deletedCount: Number(deleted.rowCount ?? 0) });
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        const normalized = normalizeExternalPgError(error, { stage: 'accreditation_country_replace' });
        results.push({ countryCode, ok: false, rowCount: 0, deletedCount: 0, error: normalized.message });
      }
    }
    return results;
  });
}

/** Read the external state for the given countries (one query). */
export async function readExternalAccreditationStatus(channelId: number, countryCodes: string[]): Promise<ExternalAccreditationStatusRow[]> {
  const countries = [...new Set(countryCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (!countries.length) return [];
  return withExternalPgClient(async (client, schema) => {
    await assertTableExists(client as Queryable, schema);
    const result = await client.query(
      `select "CountryCode", "AccreditationLevel", "CategoryId", "IsActive"
       from ${qualified(schema)}
       where "ChannelId" = $1 and "CountryCode" = any($2::text[])`,
      [channelId, countries],
    );
    return result.rows.map((row) => ({
      countryCode: String(row.CountryCode ?? '').toUpperCase(),
      levelCode: String(row.AccreditationLevel ?? ''),
      categoryId: Number(row.CategoryId),
      isActive: row.IsActive === true,
    }));
  });
}

/** Remove every external row for one level (used when a level is removed in the tool). */
export async function deleteExternalAccreditationLevel(channelId: number, levelCode: string): Promise<number> {
  return withExternalPgClient(async (client, schema) => {
    await assertTableExists(client as Queryable, schema);
    const result = (await (client as Queryable).query(
      `delete from ${qualified(schema)} where "ChannelId" = $1 and "AccreditationLevel" = $2`,
      [channelId, levelCode],
    )) as { rowCount?: number | null };
    return Number(result.rowCount ?? 0);
  });
}
