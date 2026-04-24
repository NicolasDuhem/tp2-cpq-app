-- Migration: CPQ country management master mapping and account-context linkage
-- Date: 2026-04-24

begin;

create table if not exists cpq_country_mappings (
  id bigserial primary key,
  region text not null,
  sub_region text not null,
  country_code char(2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cpq_country_mappings_country_code_chk check (country_code ~ '^[A-Z]{2}$'),
  constraint cpq_country_mappings_uniq unique (region, sub_region, country_code)
);

insert into cpq_country_mappings (region, sub_region, country_code, is_active)
values
  ('America', 'North America', 'CA', true),
  ('America', 'North America', 'US', true),
  ('APAC', 'APAC', 'JP', true),
  ('APAC', 'APAC', 'SG', true),
  ('APAC', 'China', 'CN', true),
  ('Europe', 'DACH', 'AT', true),
  ('Europe', 'DACH', 'CH', true),
  ('Europe', 'DACH', 'DE', true),
  ('Europe', 'EMEA', 'BE', true),
  ('Europe', 'EMEA', 'CZ', true),
  ('Europe', 'EMEA', 'DK', true),
  ('Europe', 'EMEA', 'EL', true),
  ('Europe', 'EMEA', 'ES', true),
  ('Europe', 'EMEA', 'FI', true),
  ('Europe', 'EMEA', 'FR', true),
  ('Europe', 'EMEA', 'HU', true),
  ('Europe', 'EMEA', 'IT', true),
  ('Europe', 'EMEA', 'LT', true),
  ('Europe', 'EMEA', 'LU', true),
  ('Europe', 'EMEA', 'LV', true),
  ('Europe', 'EMEA', 'NL', true),
  ('Europe', 'EMEA', 'PL', true),
  ('Europe', 'EMEA', 'PT', true),
  ('Europe', 'EMEA', 'RO', true),
  ('Europe', 'EMEA', 'SE', true),
  ('Europe', 'EMEA', 'SI', true),
  ('Europe', 'UK', 'GB', true),
  ('Europe', 'UK', 'IE', true)
on conflict (region, sub_region, country_code) do update
set is_active = excluded.is_active,
    updated_at = now();

alter table if exists CPQ_setup_account_context
  add column if not exists region text;

alter table if exists CPQ_setup_account_context
  add column if not exists sub_region text;

with ranked as (
  select
    country_code,
    region,
    sub_region,
    row_number() over (partition by country_code order by region, sub_region, id) as rn
  from cpq_country_mappings
  where is_active = true
)
update CPQ_setup_account_context account
set region = ranked.region,
    sub_region = ranked.sub_region
from ranked
where ranked.rn = 1
  and account.country_code = ranked.country_code
  and (account.region is null or account.sub_region is null);

create unique index if not exists cpq_setup_account_context_country_currency_uniq
  on CPQ_setup_account_context (country_code, currency);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cpq_setup_account_context_account_code_nonblank_chk'
  ) then
    alter table CPQ_setup_account_context
      add constraint cpq_setup_account_context_account_code_nonblank_chk
      check (btrim(account_code) <> '');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cpq_setup_account_context_region_sub_region_country_fk'
  ) then
    alter table CPQ_setup_account_context
      add constraint cpq_setup_account_context_region_sub_region_country_fk
      foreign key (region, sub_region, country_code)
      references cpq_country_mappings (region, sub_region, country_code);
  end if;
end$$;

commit;
