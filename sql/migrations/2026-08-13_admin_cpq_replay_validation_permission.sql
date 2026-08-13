-- Admin CPQ replay validation page permission.
--
-- The page and its APIs are strictly read-only against Neon, so `read`, `edit` and
-- `admin` all grant the same capability (run replay + view comparison results);
-- `none` hides the nav entry and blocks the APIs. System admins bypass as usual.

insert into app_permission_pages (page_key, page_label, route_path, nav_group, display_order)
values ('admin.cpq_replay_validation','Admin CPQ Replay Validation','/admin/cpq-replay-validation','Admin',110)
on conflict (page_key) do nothing;
