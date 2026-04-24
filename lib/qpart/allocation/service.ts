import { sql } from '@/lib/db/client';

const asTrimmed = (value: unknown) => String(value ?? '').trim();

export async function listQPartAllocationCountries(): Promise<string[]> {
  const rows = (await sql`
    select distinct country_code
    from cpq_country_mappings
    where is_active = true
      and coalesce(trim(country_code), '') <> ''
    order by country_code
  `) as Array<{ country_code: string | null }>;

  return rows
    .map((row) => asTrimmed(row.country_code).toUpperCase())
    .filter((countryCode, index, all) => countryCode.length === 2 && all.indexOf(countryCode) === index);
}

export async function syncQPartCountryAllocationRows(input: { partIds?: number[] } = {}) {
  const normalizedPartIds = [...new Set((input.partIds ?? []).map((id) => Number(id)).filter(Number.isFinite))];
  const partIdsJson = JSON.stringify(normalizedPartIds);

  const insertedRows = (await sql`
    with countries as (
      select distinct country_code
      from cpq_country_mappings
      where is_active = true
        and coalesce(trim(country_code), '') <> ''
    ),
    target_parts as (
      select p.id
      from qpart_parts p
      where ${normalizedPartIds.length} = 0
         or p.id in (
           select value::bigint
           from jsonb_array_elements_text(${partIdsJson}::jsonb)
         )
    ),
    missing as (
      select tp.id as part_id, countries.country_code
      from target_parts tp
      cross join countries
      left join qpart_country_allocation allocation
        on allocation.part_id = tp.id
       and allocation.country_code = countries.country_code
      where allocation.id is null
    )
    insert into qpart_country_allocation (part_id, country_code, active)
    select part_id, country_code, false
    from missing
    returning id
  `) as Array<{ id: number }>;

  return {
    insertedCount: insertedRows.length,
    partScopeCount: normalizedPartIds.length,
  };
}
