-- QPart MVP foundation (isolated spare-parts PIM)

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

create unique index if not exists qpart_hierarchy_nodes_parent_code_uniq
  on qpart_hierarchy_nodes(parent_id, code);

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

  if parent_level is null then
    raise exception 'Parent hierarchy node does not exist';
  end if;

  if parent_level <> new.level - 1 then
    raise exception 'Invalid hierarchy parent level: expected %, got %', new.level - 1, parent_level;
  end if;

  return new;
end;
$$;

drop trigger if exists qpart_hierarchy_parent_trg on qpart_hierarchy_nodes;
create trigger qpart_hierarchy_parent_trg
before insert or update on qpart_hierarchy_nodes
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

insert into qpart_metadata_definitions (key, label_en, field_type, is_translatable, is_required, is_active, display_order, validation_json, options_json)
values
  ('ean13', 'EAN13', 'text', false, false, true, 10, '{"regex":"^[0-9]{13}$"}'::jsonb, '[]'::jsonb),
  ('material', 'Material', 'text', true, false, true, 20, '{}'::jsonb, '[]'::jsonb),
  ('weight_grams', 'Weight (grams)', 'number', false, false, true, 30, '{"min":0}'::jsonb, '[]'::jsonb),
  ('is_serviceable', 'Serviceable', 'boolean', false, false, true, 40, '{}'::jsonb, '[]'::jsonb)
on conflict (key) do nothing;
