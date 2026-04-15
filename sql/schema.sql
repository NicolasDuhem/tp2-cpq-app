-- tp2-cpq-app manual CPQ lifecycle schema baseline

create table if not exists CPQ_setup_account_context (
  id bigserial primary key,
  account_code text not null unique,
  customer_id text not null,
  currency text not null,
  language text not null,
  country_code char(2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cpq_setup_account_context_country_code_chk check (country_code ~ '^[A-Z]{2}$')
);

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
  json_result jsonb not null default '{}'::jsonb,
  processed_for_image_sync boolean not null default false,
  processed_for_image_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
