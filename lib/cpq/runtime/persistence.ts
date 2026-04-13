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
      ${asOptionalText(input.ipn_code)},
      ${asRequiredText(input.ruleset, 'ruleset')},
      ${asRequiredText(input.account_code, 'account_code')},
      ${asOptionalText(input.customer_id)},
      ${asOptionalText(input.currency)},
      ${asOptionalText(input.language)},
      ${asOptionalText(input.country_code)},
      ${asOptionalText(input.namespace)},
      ${asOptionalText(input.header_id)},
      ${asOptionalText(input.detail_id)},
      ${asOptionalText(input.session_id)},
      ${JSON.stringify(input.json_result ?? {})}::jsonb
    )
    returning id, created_at
  `) as PersistedSamplerResultRow[];

  return rows[0];
}
