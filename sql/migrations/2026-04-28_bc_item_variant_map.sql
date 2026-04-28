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
