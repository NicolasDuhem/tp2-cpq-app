-- Archive table for admin CPQ replay overwrite (/admin/cpq-replay-validation).
--
-- Every controlled overwrite archives the full live rows BEFORE updating them, inside the
-- same transaction as the updates. The live update statements are guarded by an
-- `exists (...)` check against this table for the current batch, so a live row can never
-- be updated unless its archive row landed first.
--
-- This table is the rollback source. Rollback itself is not implemented yet.

create table if not exists app_cpq_replay_overwrite_archive (
  id bigserial primary key,
  created_at timestamptz not null default now(),

  actor_user_id text null,
  actor_email text null,
  actor_display_name text null,

  source_page text not null default 'admin.cpq_replay_validation',
  source_process text not null default 'cpq_replay_overwrite',

  replay_run_id text null,
  overwrite_batch_id text not null,

  configuration_reference_id bigint null,
  configuration_reference text null,

  sampler_result_id bigint null,
  existing_item_code text null,
  replayed_item_code text null,

  country_code text null,
  bike_type text null,
  ruleset text null,

  old_configuration_reference_row jsonb null,
  old_sampler_result_row jsonb null,

  new_configuration_reference_payload jsonb null,
  new_sampler_result_payload jsonb null,

  status text not null default 'archived',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists app_cpq_replay_overwrite_archive_created_at_idx
  on app_cpq_replay_overwrite_archive(created_at desc);

create index if not exists app_cpq_replay_overwrite_archive_config_ref_idx
  on app_cpq_replay_overwrite_archive(configuration_reference);

create index if not exists app_cpq_replay_overwrite_archive_batch_idx
  on app_cpq_replay_overwrite_archive(overwrite_batch_id);

create index if not exists app_cpq_replay_overwrite_archive_actor_idx
  on app_cpq_replay_overwrite_archive(actor_user_id);

-- Supports the archive-before-update guard used by the overwrite transaction.
create index if not exists app_cpq_replay_overwrite_archive_batch_ref_idx
  on app_cpq_replay_overwrite_archive(overwrite_batch_id, configuration_reference_id);
