# External PostgreSQL row push (Bike + QPart)

This first-step integration adds row-level push actions from:
- `/sales/bike-allocation`
- `/sales/qpart-allocation`

Destination:
- External PostgreSQL table `public.cpq_sampler_result`.

## Runtime dependency
- Server-side push routes require the Node PostgreSQL client package `pg` at runtime.
- Keep `pg` in `dependencies` (not only `devDependencies`) so production/serverless deployments can import it.

## Required upsert business key
Application upsert logic matches rows using:
- `namespace`
- `ipn_code`
- `country_code`

> Do not rely on target `id` primary key for matching.

## Azure PostgreSQL preparation

### 1) Duplicate detection (before unique index)
```sql
select
  namespace,
  ipn_code,
  country_code,
  count(*) as duplicate_count
from public.cpq_sampler_result
group by namespace, ipn_code, country_code
having count(*) > 1
order by duplicate_count desc, namespace, ipn_code, country_code;
```

### 2) Inspect duplicate rows in detail (safe report)
```sql
with duplicate_keys as (
  select namespace, ipn_code, country_code
  from public.cpq_sampler_result
  group by namespace, ipn_code, country_code
  having count(*) > 1
)
select
  t.id,
  t.namespace,
  t.ipn_code,
  t.country_code,
  t.ruleset,
  t.account_code,
  t.customer_id,
  t.active,
  t.updated_at,
  t.created_at
from public.cpq_sampler_result t
join duplicate_keys d
  on d.namespace = t.namespace
 and d.ipn_code = t.ipn_code
 and d.country_code = t.country_code
order by t.namespace, t.ipn_code, t.country_code, t.updated_at desc, t.id desc;
```

### 3) Unique index for upsert key
```sql
create unique index if not exists cpq_sampler_result_namespace_ipn_country_uniq
  on public.cpq_sampler_result(namespace, ipn_code, country_code);
```

## Notes
- App uses PostgreSQL `INSERT ... ON CONFLICT (namespace, ipn_code, country_code) DO UPDATE`.
- `created_at` is preserved on update; `updated_at` is refreshed to `now()`.
