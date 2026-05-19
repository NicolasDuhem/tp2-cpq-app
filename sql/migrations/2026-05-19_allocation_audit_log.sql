create table if not exists app_allocation_audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_user_id text null,
  actor_email text null,
  actor_display_name text null,
  page_key text not null,
  source_process text not null,
  entity_type text not null,
  item_code text not null,
  country_code text null,
  action_type text not null,
  status_before boolean null,
  status_after boolean null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists app_allocation_audit_log_created_at_idx on app_allocation_audit_log(created_at desc);
