import { sql } from '@/lib/db/client';

const normalizeLocale = (value: string) => value.trim();

export async function listSupportedLocales() {
  const rows = (await sql`
    select distinct language
    from CPQ_setup_account_context
    where language is not null
      and btrim(language) <> ''
    order by language
  `) as Array<{ language: string }>;

  return rows.map((row) => normalizeLocale(row.language)).filter(Boolean);
}

export async function getBaseLocale() {
  const locales = await listSupportedLocales();
  if (locales.includes('en-GB')) return 'en-GB';
  const enLike = locales.find((locale) => locale.toLowerCase().startsWith('en'));
  if (enLike) return enLike;
  return locales[0] ?? 'en-GB';
}
