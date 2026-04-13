import { sql } from '@/lib/db/client';

export type PersistedSamplerResultInput = {
  ipn_code?: string | null;
  ruleset: string;
  account_code: string;
  customer_id?: string | null;
  currency?: string | null;
  language?: string | null;
  country_code?: string | null;
  namespace?: string | null;
  header_id?: string | null;
  detail_id?: string | null;
  session_id?: string | null;
  json_result: unknown;
};

type PersistedSamplerResultRow = {
  id: number;
  created_at: string;
};

export type PersistSamplerResultOutcome = {
  status: 'inserted' | 'duplicate';
  row?: PersistedSamplerResultRow;
};

const asOptionalText = (value: unknown) => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
};

const asRequiredText = (value: unknown, field: string) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
};

export async function persistSamplerResult(input: PersistedSamplerResultInput) {
  const ipnCode = asOptionalText(input.ipn_code);
  const countryCode = asOptionalText(input.country_code);
  const rows = (await sql`
    insert into CPQ_sampler_result (
      ipn_code,
      ruleset,
      account_code,
      customer_id,
      currency,
      language,
      country_code,
      namespace,
      header_id,
      detail_id,
      session_id,
      json_result
    )
    values (
      ${ipnCode},
      ${asRequiredText(input.ruleset, 'ruleset')},
      ${asRequiredText(input.account_code, 'account_code')},
      ${asOptionalText(input.customer_id)},
      ${asOptionalText(input.currency)},
      ${asOptionalText(input.language)},
      ${countryCode},
      ${asOptionalText(input.namespace)},
      ${asOptionalText(input.header_id)},
      ${asOptionalText(input.detail_id)},
      ${asOptionalText(input.session_id)},
      ${JSON.stringify(input.json_result ?? {})}::jsonb
    )
    on conflict do nothing
    returning id, created_at
  `) as PersistedSamplerResultRow[];

  if (rows[0]) {
    return { status: 'inserted', row: rows[0] } satisfies PersistSamplerResultOutcome;
  }

  if (ipnCode && countryCode) {
    const existingRows = (await sql`
      select id, created_at
      from CPQ_sampler_result
      where ipn_code = ${ipnCode} and country_code = ${countryCode}
      order by created_at asc, id asc
      limit 1
    `) as PersistedSamplerResultRow[];
    return { status: 'duplicate', row: existingRows[0] } satisfies PersistSamplerResultOutcome;
  }

  return { status: 'duplicate' } satisfies PersistSamplerResultOutcome;
}
