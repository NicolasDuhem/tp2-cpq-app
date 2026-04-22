-- Migration: add canonical active flag to CPQ_sampler_result
-- Date: 2026-04-22
-- Safe, explicit steps:
--   1) add nullable column
--   2) backfill existing rows to true
--   3) enforce default true + not null

begin;

alter table if exists CPQ_sampler_result
  add column if not exists active boolean;

update CPQ_sampler_result
set active = true
where active is null;

alter table CPQ_sampler_result
  alter column active set default true;

alter table CPQ_sampler_result
  alter column active set not null;

commit;

-- Rollback (run manually if needed):
-- begin;
-- alter table if exists CPQ_sampler_result
--   drop column if exists active;
-- commit;
