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

-- Stock_bike_img_ isolated experimental rule engine

create table if not exists stock_bike_img_rule (
  id bigserial primary key,
  stock_bike_img_model_year integer not null,
  stock_bike_img_rule_category text not null,
  stock_bike_img_rule_name text not null,
  stock_bike_img_rule_description text,
  stock_bike_img_conditions_json jsonb not null default '[]'::jsonb,
  stock_bike_img_conditions_signature text not null,
  stock_bike_img_layer_order integer not null default 100,
  stock_bike_img_picture_link_1 text,
  stock_bike_img_picture_link_2 text,
  stock_bike_img_picture_link_3 text,
  stock_bike_img_is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_bike_img_rule_model_year_chk check (stock_bike_img_model_year between 2020 and 2028),
  constraint stock_bike_img_rule_layer_order_chk check (stock_bike_img_layer_order between 1 and 999),
  constraint stock_bike_img_rule_conditions_type_chk check (jsonb_typeof(stock_bike_img_conditions_json) = 'array'),
  constraint stock_bike_img_rule_unique_signature unique (
    stock_bike_img_model_year,
    stock_bike_img_rule_category,
    stock_bike_img_conditions_signature
  )
);

create index if not exists stock_bike_img_rule_runtime_idx
  on stock_bike_img_rule (stock_bike_img_model_year, stock_bike_img_is_active, stock_bike_img_layer_order, id);

create index if not exists stock_bike_img_rule_category_idx
  on stock_bike_img_rule (stock_bike_img_model_year, stock_bike_img_rule_category, stock_bike_img_rule_name);

create table if not exists stock_bike_img_digit_reference (
  id bigserial primary key,
  stock_bike_img_digit_position integer not null,
  stock_bike_img_rule_category_name text not null,
  stock_bike_img_digit_value text not null,
  stock_bike_img_value_meaning text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_bike_img_digit_reference_position_chk check (stock_bike_img_digit_position between 1 and 30),
  constraint stock_bike_img_digit_reference_value_chk check (length(trim(stock_bike_img_digit_value)) > 0),
  constraint stock_bike_img_digit_reference_category_chk check (length(trim(stock_bike_img_rule_category_name)) > 0),
  constraint stock_bike_img_digit_reference_unique unique (
    stock_bike_img_digit_position,
    stock_bike_img_rule_category_name,
    stock_bike_img_digit_value
  )
);

create index if not exists stock_bike_img_digit_reference_category_idx
  on stock_bike_img_digit_reference (stock_bike_img_rule_category_name, stock_bike_img_digit_position, stock_bike_img_digit_value);
