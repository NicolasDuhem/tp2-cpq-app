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

create table if not exists qpart_part_channel_assignment (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  channel text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qpart_part_channel_assignment_channel_chk check (channel in ('Ecom', 'Dealer', 'Junction', 'Subscription')),
  constraint qpart_part_channel_assignment_part_channel_uniq unique (part_id, channel)
);
create index if not exists qpart_part_channel_assignment_channel_idx on qpart_part_channel_assignment(channel);

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

create table if not exists qpart_part_images (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  part_number text not null,
  blob_url text not null,
  blob_path text not null,
  mime_type text not null default 'image/jpeg',
  file_size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part_id),
  unique (part_number)
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

-- Sequence drift inspection/resync helpers for manual Neon data operations.
create or replace function app_list_pk_sequence_health()
returns table (
  table_schema text,
  table_name text,
  pk_column text,
  sequence_schema text,
  sequence_name text,
  sequence_fq_name text,
  sequence_last_value bigint,
  sequence_is_called boolean,
  sequence_next_value bigint,
  table_max_id bigint,
  expected_next_value bigint,
  status text
)
language plpgsql
as $$
declare
  row record;
  max_id bigint;
  last_value bigint;
  is_called boolean;
  next_value bigint;
begin
  for row in
    select
      n.nspname as table_schema,
      c.relname as table_name,
      a.attname as pk_column,
      split_part(pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname), '.', 1) as sequence_schema,
      split_part(pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname), '.', 2) as sequence_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_index i on i.indrelid = c.oid and i.indisprimary
    join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
    join pg_type t on t.oid = a.atttypid
    where c.relkind = 'r'
      and n.nspname = 'public'
      and i.indnatts = 1
      and t.typname in ('int2', 'int4', 'int8')
      and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null
  loop
    execute format('select coalesce(max(%I), 0)::bigint from %I.%I', row.pk_column, row.table_schema, row.table_name)
      into max_id;

    execute format('select last_value::bigint, is_called from %I.%I', row.sequence_schema, row.sequence_name)
      into last_value, is_called;

    next_value := case when is_called then last_value + 1 else last_value end;

    return query
    select
      row.table_schema::text,
      row.table_name::text,
      row.pk_column::text,
      row.sequence_schema::text,
      row.sequence_name::text,
      format('%I.%I', row.sequence_schema, row.sequence_name)::text,
      last_value,
      is_called,
      next_value,
      max_id,
      greatest(max_id + 1, 1),
      case when next_value <= max_id then 'out_of_sync' else 'in_sync' end;
  end loop;
end;
$$;

create or replace function app_resync_pk_sequence(target_schema text, target_table text)
returns table (
  table_schema text,
  table_name text,
  pk_column text,
  sequence_schema text,
  sequence_name text,
  sequence_fq_name text,
  previous_sequence_next_value bigint,
  set_to_value bigint,
  sequence_last_value bigint,
  sequence_is_called boolean,
  sequence_next_value bigint,
  table_max_id bigint,
  expected_next_value bigint,
  status text
)
language plpgsql
as $$
declare
  pk_column_name text;
  seq_regclass text;
  sequence_schema_name text;
  sequence_name_value text;
  max_id bigint;
  applied_value bigint;
  last_value bigint;
  is_called boolean;
  previous_next bigint;
  next_value bigint;
begin
  select
    a.attname,
    pg_get_serial_sequence(format('%I.%I', target_schema, target_table), a.attname)
  into pk_column_name, seq_regclass
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i on i.indrelid = c.oid and i.indisprimary
  join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
  join pg_type t on t.oid = a.atttypid
  where c.relkind = 'r'
    and n.nspname = target_schema
    and c.relname = target_table
    and i.indnatts = 1
    and t.typname in ('int2', 'int4', 'int8')
  limit 1;

  if pk_column_name is null or seq_regclass is null then
    raise exception 'No sequence-backed integer primary key found for %.%', target_schema, target_table;
  end if;

  sequence_schema_name := split_part(seq_regclass, '.', 1);
  sequence_name_value := split_part(seq_regclass, '.', 2);

  execute format('select coalesce(max(%I), 0)::bigint from %I.%I', pk_column_name, target_schema, target_table)
    into max_id;

  execute format('select last_value::bigint, is_called from %I.%I', sequence_schema_name, sequence_name_value)
    into last_value, is_called;
  previous_next := case when is_called then last_value + 1 else last_value end;

  select setval(
    seq_regclass,
    greatest(max_id, 1),
    max_id > 0
  ) into applied_value;

  execute format('select last_value::bigint, is_called from %I.%I', sequence_schema_name, sequence_name_value)
    into last_value, is_called;
  next_value := case when is_called then last_value + 1 else last_value end;

  return query
  select
    target_schema,
    target_table,
    pk_column_name,
    sequence_schema_name,
    sequence_name_value,
    format('%I.%I', sequence_schema_name, sequence_name_value),
    previous_next,
    applied_value,
    last_value,
    is_called,
    next_value,
    max_id,
    greatest(max_id + 1, 1),
    case when next_value <= max_id then 'out_of_sync' else 'in_sync' end;
end;
$$;

create table if not exists public.bc_item_variant_map (
  id bigserial primary key,
  sku_code text not null,
  item_type text not null default 'UNKNOWN',
  bc_product_id integer,
  bc_variant_id integer,
  bc_sku_id integer,
  bc_status text not null default 'UNKNOWN',
  bc_product_name text,
  bc_variant_sku text,
  bc_image_url text,
  bc_calculated_price numeric(12, 2),
  bc_inventory_level integer,
  bc_purchasing_disabled boolean,
  bc_is_visible boolean,
  bc_channels_json jsonb,
  bc_channel_status text not null default 'UNKNOWN',
  bc_channel_last_checked_at timestamptz,
  bc_channel_last_error text,
  bc_variant_json jsonb,
  bc_last_checked_at timestamptz,
  bc_last_error text,
  bc_error_code text,
  source_page text,
  source_system text not null default 'tp2-cpq-app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bc_item_variant_map_sku_code_key unique (sku_code),
  constraint bc_item_variant_map_item_type_check check (item_type in ('BIKE', 'QPART', 'PNA', 'UNKNOWN')),
  constraint bc_item_variant_map_status_check check (bc_status in ('OK', 'NOK', 'ERR', 'DISABLED', 'UNKNOWN')),
  constraint bc_item_variant_map_channel_status_check check (bc_channel_status in ('OK', 'NOK', 'ERR', 'DISABLED', 'UNKNOWN'))
);

create index if not exists idx_bc_item_variant_map_sku_code on public.bc_item_variant_map (sku_code);
create index if not exists idx_bc_item_variant_map_bc_product_id on public.bc_item_variant_map (bc_product_id);
create index if not exists idx_bc_item_variant_map_bc_variant_id on public.bc_item_variant_map (bc_variant_id);
create index if not exists idx_bc_item_variant_map_status on public.bc_item_variant_map (bc_status);
create index if not exists idx_bc_item_variant_map_last_checked on public.bc_item_variant_map (bc_last_checked_at);
create index if not exists idx_bc_item_variant_map_channels_json on public.bc_item_variant_map using gin (bc_channels_json);
