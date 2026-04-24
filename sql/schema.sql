-- tp2-cpq-app manual CPQ lifecycle schema baseline

create table if not exists CPQ_setup_account_context (
  id bigserial primary key,
  account_code text not null unique,
  customer_id text not null,
  currency text not null,
  language text not null,
  region text,
  sub_region text,
  country_code char(2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cpq_setup_account_context_country_code_chk check (country_code ~ '^[A-Z]{2}$'),
  constraint cpq_setup_account_context_account_code_nonblank_chk check (btrim(account_code) <> '')
);

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

create unique index if not exists cpq_setup_account_context_country_currency_uniq
  on CPQ_setup_account_context (country_code, currency);

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

create table if not exists CPQ_setup_ruleset (
  id bigserial primary key,
  cpq_ruleset text not null unique,
  description text,
  bike_type text,
  namespace text not null default 'Default',
  header_id text not null default 'Simulator',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists CPQ_setup_account_context
  add column if not exists region text;

alter table if exists CPQ_setup_account_context
  add column if not exists sub_region text;

create table if not exists CPQ_sampler_result (
  id bigserial primary key,
  ipn_code text,
  ruleset text not null,
  account_code text not null,
  customer_id text,
  currency text,
  language text,
  country_code text,
  namespace text,
  header_id text,
  detail_id text,
  session_id text,
  active boolean not null default true,
  json_result jsonb not null default '{}'::jsonb,
  processed_for_image_sync boolean not null default false,
  processed_for_image_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists cpq_sampler_result
  add column if not exists active boolean;

update cpq_sampler_result
set active = true
where active is null;

alter table if exists cpq_sampler_result
  alter column active set default true;

alter table if exists cpq_sampler_result
  alter column active set not null;

create index if not exists cpq_sampler_result_ipn_created_idx
  on CPQ_sampler_result (ipn_code, created_at desc, id desc);
create index if not exists cpq_sampler_result_filter_idx
  on CPQ_sampler_result (ruleset, account_code, country_code);
create index if not exists cpq_sampler_result_unprocessed_idx
  on CPQ_sampler_result (processed_for_image_sync)
  where processed_for_image_sync = false;

create table if not exists cpq_configuration_references (
  id bigserial primary key,
  configuration_reference text not null unique,
  ruleset text not null,
  namespace text not null,
  header_id text not null,
  finalized_detail_id text not null,
  source_header_id text,
  source_detail_id text,
  account_code text,
  customer_id text,
  account_type text,
  company text,
  currency text,
  language text,
  country_code text,
  customer_location text,
  application_instance text,
  application_name text,
  finalized_session_id text,
  final_ipn_code text,
  product_description text,
  finalize_response_json jsonb not null default '{}'::jsonb,
  json_snapshot jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cpq_configuration_references_lookup_idx
  on cpq_configuration_references (configuration_reference, is_active);
create index if not exists cpq_configuration_references_ruleset_idx
  on cpq_configuration_references (ruleset, namespace, created_at desc);
create index if not exists cpq_configuration_references_account_idx
  on cpq_configuration_references (account_code, country_code, created_at desc);

create table if not exists cpq_image_management (
  id bigserial primary key,
  feature_label text not null,
  option_label text not null,
  option_value text not null,
  feature_layer_order integer not null default 10,
  ignore_during_configure boolean not null default false,
  picture_link_1 text,
  picture_link_2 text,
  picture_link_3 text,
  picture_link_4 text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feature_label, option_label, option_value)
);

create index if not exists cpq_image_management_lookup_idx
  on cpq_image_management (feature_label, option_label, option_value)
  where is_active = true;

alter table if exists cpq_image_management
  add column if not exists ignore_during_configure boolean not null default false;

alter table if exists cpq_image_management
  add column if not exists feature_layer_order integer not null default 10;

update cpq_image_management
set feature_layer_order = 10
where feature_layer_order is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cpq_image_management_feature_layer_order_chk'
  ) then
    alter table cpq_image_management
      add constraint cpq_image_management_feature_layer_order_chk
      check (feature_layer_order between 1 and 20);
  end if;
end$$;
