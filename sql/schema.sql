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

-- QPart isolated spare parts PIM domain
create table if not exists qpart_hierarchy_nodes (
  id bigserial primary key,
  level smallint not null check (level between 1 and 7),
  code text not null,
  label_en text not null,
  parent_id bigint references qpart_hierarchy_nodes(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level, code)
);

create unique index if not exists qpart_hierarchy_nodes_parent_code_uniq on qpart_hierarchy_nodes(parent_id, code);

create or replace function qpart_validate_hierarchy_parent()
returns trigger
language plpgsql
as $$
declare
  parent_level smallint;
begin
  if new.parent_id is null then
    if new.level <> 1 then
      raise exception 'Hierarchy nodes without parent must be level 1';
    end if;
    return new;
  end if;

  select level into parent_level from qpart_hierarchy_nodes where id = new.parent_id;
  if parent_level is null then raise exception 'Parent hierarchy node does not exist'; end if;
  if parent_level <> new.level - 1 then
    raise exception 'Invalid hierarchy parent level: expected %, got %', new.level - 1, parent_level;
  end if;
  return new;
end;
$$;

drop trigger if exists qpart_hierarchy_parent_trg on qpart_hierarchy_nodes;
create trigger qpart_hierarchy_parent_trg before insert or update on qpart_hierarchy_nodes
for each row execute function qpart_validate_hierarchy_parent();

create table if not exists qpart_parts (
  id bigserial primary key,
  part_number text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'draft')),
  default_name text not null,
  default_description text,
  hierarchy_node_id bigint references qpart_hierarchy_nodes(id),
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qpart_parts_search_idx on qpart_parts(part_number, default_name);

create table if not exists qpart_country_allocation (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  country_code char(2) not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qpart_country_allocation_country_code_chk check (country_code ~ '^[A-Z]{2}$'),
  constraint qpart_country_allocation_part_country_uniq unique (part_id, country_code)
);
create index if not exists qpart_country_allocation_country_idx on qpart_country_allocation(country_code);
create index if not exists qpart_country_allocation_active_idx on qpart_country_allocation(active);

create table if not exists qpart_metadata_definitions (
  id bigserial primary key,
  key text not null unique,
  label_en text not null,
  field_type text not null check (field_type in ('text', 'long_text', 'number', 'boolean', 'date', 'single_select', 'multi_select')),
  is_translatable boolean not null default false,
  is_required boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 100,
  validation_json jsonb not null default '{}'::jsonb,
  options_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists qpart_part_metadata_values (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  metadata_definition_id bigint not null references qpart_metadata_definitions(id) on delete cascade,
  locale text not null default 'en-GB',
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part_id, metadata_definition_id, locale)
);

create table if not exists qpart_part_translations (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  locale text not null,
  name text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part_id, locale)
);

create table if not exists qpart_part_bike_type_compatibility (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  bike_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part_id, bike_type)
);

create table if not exists qpart_part_compatibility_rules (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  bike_type text not null,
  feature_label text not null,
  option_value text not null,
  option_label text,
  source text not null default 'derived' check (source in ('derived', 'reference', 'manual')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part_id, bike_type, feature_label, option_value)
);

create table if not exists qpart_compatibility_reference_values (
  id bigserial primary key,
  bike_type text not null,
  feature_label text not null,
  option_value text not null,
  option_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bike_type, feature_label, option_value)
);
