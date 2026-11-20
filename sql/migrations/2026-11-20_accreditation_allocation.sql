-- Migration: Accreditation allocation (new, isolated feature)
-- Date: 2026-11-20
--
-- Adds the Neon tables behind /sales/accreditation-allocation:
--   * accreditation_levels                 - editable level list (Gold/Silver/Bronze seeded)
--   * accreditation_bc_categories          - local copy of the BigCommerce category tree for ONE channel
--                                            (Brompton B2B), so the page shows names while storing ids
--   * accreditation_category_eligibility   - country x level x category -> active (missing row = inactive)
--   * accreditation_allocation_audit_log   - who changed what (separate from app_allocation_audit_log
--                                            so existing audit pages are untouched)
-- and registers the page permission key `sales.accreditation_allocation`.
--
-- Additive only: no existing table, column, constraint or row is modified.
-- Safe to re-run (if not exists / on conflict do nothing).

begin;

create table if not exists accreditation_levels (
  id bigserial primary key,
  code text not null,
  label text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accreditation_levels_code_chk check (code ~ '^[A-Z0-9_]{1,40}$'),
  constraint accreditation_levels_label_nonblank_chk check (btrim(label) <> ''),
  constraint accreditation_levels_code_uniq unique (code)
);

insert into accreditation_levels (code, label, display_order, is_active)
values
  ('GOLD', 'Gold', 10, true),
  ('SILVER', 'Silver', 20, true),
  ('BRONZE', 'Bronze', 30, true)
on conflict (code) do nothing;

create table if not exists accreditation_bc_categories (
  channel_id bigint not null,
  tree_id bigint not null,
  tree_name text null,
  category_id bigint not null,
  parent_id bigint not null default 0,
  name text not null,
  depth integer not null,
  sort_index integer not null default 0,
  is_visible boolean not null default true,
  is_deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accreditation_bc_categories_pk primary key (channel_id, category_id)
);

create index if not exists accreditation_bc_categories_channel_order_idx
  on accreditation_bc_categories (channel_id, is_deleted, sort_index);

create table if not exists accreditation_category_eligibility (
  id bigserial primary key,
  channel_id bigint not null,
  country_code text not null,
  accreditation_level_id bigint not null references accreditation_levels (id),
  category_id bigint not null,
  is_active boolean not null default false,
  updated_by_user_id text null,
  updated_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accreditation_category_eligibility_country_chk check (country_code ~ '^[A-Z]{2}$'),
  constraint accreditation_category_eligibility_uniq unique (channel_id, country_code, accreditation_level_id, category_id)
);

create index if not exists accreditation_category_eligibility_country_idx
  on accreditation_category_eligibility (channel_id, country_code);

create table if not exists accreditation_allocation_audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_user_id text null,
  actor_email text null,
  actor_display_name text null,
  action_type text not null,
  channel_id bigint null,
  country_code text null,
  accreditation_level_code text null,
  category_id bigint null,
  status_before boolean null,
  status_after boolean null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists accreditation_allocation_audit_log_created_at_idx
  on accreditation_allocation_audit_log (created_at desc);

create index if not exists accreditation_allocation_audit_log_country_idx
  on accreditation_allocation_audit_log (country_code, created_at desc);

-- Page permission (surfaces automatically in Setup -> Users, which is driven by this table).
insert into app_permission_pages (page_key, page_label, route_path, nav_group, display_order)
values ('sales.accreditation_allocation', 'Sales Accreditation Allocation', '/sales/accreditation-allocation', 'Sales', 35)
on conflict (page_key) do nothing;

commit;
