alter table app_allocation_audit_log
add column if not exists bigcommerce_status text null;

create index if not exists app_allocation_audit_log_bigcommerce_status_idx
on app_allocation_audit_log(bigcommerce_status);
