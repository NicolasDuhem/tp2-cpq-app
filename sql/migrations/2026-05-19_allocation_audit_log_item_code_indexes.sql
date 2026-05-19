create index if not exists app_allocation_audit_log_item_code_created_at_idx
on app_allocation_audit_log (item_code, created_at desc);

create index if not exists app_allocation_audit_log_item_country_created_at_idx
on app_allocation_audit_log (item_code, country_code, created_at desc);
