# External PostgreSQL row push (Bike + QPart)

The row-level push actions from:

- `/sales/bike-allocation`
- `/sales/qpart-allocation`

now write to two external PostgreSQL variant target tables:

- `<EXTERNAL_PG_SCHEMA>.variant_eligibility`
- `<EXTERNAL_PG_SCHEMA>.variants`

The previous external push to `cpq_sampler_result` is no longer used. The internal Neon `cpq_sampler_result` table remains unchanged and continues to be used by the app for sampler persistence, sales allocation state, payload building, and ruleset lookups.

## Runtime dependency

- Server-side push routes require the Node PostgreSQL client package `pg` at runtime.
- Keep `pg` in `dependencies` (not only `devDependencies`) so production/serverless deployments can import it.

## External target 1: `variant_eligibility`

Columns are PascalCase and the app writes them double-quoted:

- `"Sku"`
- `"CountryCode"`
- `"DetailID"`
- `"IsActive"`

Business key:

- `("Sku", "CountryCode")`

Upsert behavior:

- insert when no row exists for `("Sku", "CountryCode")`
- update existing rows by setting `"DetailID"` and `"IsActive"`

Mapping:

- `"Sku"` = sampler payload `ipnCode` / item SKU
- `"CountryCode"` = sampler payload `countryCode`
- `"DetailID"` = sampler payload `detailId`
- `"IsActive"` = sampler payload `active`

Required unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS variant_eligibility_sku_country_uniq
  ON public.variant_eligibility ("Sku", "CountryCode");
```

Use the configured external schema instead of `public` if `EXTERNAL_PG_SCHEMA` is not `public`.

## External target 2: `variants`

Columns are PascalCase and the app writes them double-quoted:

- `"Sku"`
- `"BcVariantID"`
- `"BcProductID"`
- `"ForecastCtyCode"`
- `"BblRuleSetItem"`
- `"CreatedAt"`
- `"UpdatedAt"`

Business key:

- `("Sku")`

Upsert behavior:

- insert when no row exists for `"Sku"`
- update existing rows by setting `"BcVariantID"`, `"BcProductID"`, `"ForecastCtyCode"`, `"BblRuleSetItem"`, and `"UpdatedAt"`
- preserve the original `"CreatedAt"` on update

Mapping:

- `"Sku"` = sampler payload `ipnCode` / item SKU
- `"BcVariantID"` = Neon `bc_item_variant_map.bc_variant_id`, or `NULL` when no mapping exists
- `"BcProductID"` = Neon `bc_item_variant_map.bc_product_id`, or `NULL` when no mapping exists
- `"ForecastCtyCode"` = `NULL` for now
- `"BblRuleSetItem"` = sampler payload `ruleset`

Required unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS variants_sku_uniq
  ON public.variants ("Sku");
```

Use the configured external schema instead of `public` if `EXTERNAL_PG_SCHEMA` is not `public`.

## Push flow

For bike and QPart pushes, the app still builds source payloads from Neon first:

- `buildBikeExternalSamplerPayload()` reads the latest matching Neon `CPQ_sampler_result` row.
- `buildQpartExternalSamplerPayload()` reads the QPart allocation row plus active account context.

After payload build, each route:

1. looks up BC IDs in Neon `public.bc_item_variant_map` by `sku_code = payload.ipnCode`
2. upserts `variant_eligibility`
3. upserts `variants`

The two external upserts are sequential so route logs show each target independently.

## BigCommerce item-map follow-up push

`POST /api/bigcommerce/item-map/upsert` continues to upsert Neon `bc_item_variant_map` first. After that succeeds, rows with a non-null `bc_product_id` or `bc_variant_id` trigger external `variants` upserts in parallel.

This covers the case where a SKU was previously pushed to external `variants` with null BC IDs, then a later “Check BC Status” populates the IDs in Neon.

For these follow-up pushes:

- ruleset is loaded from the most recent Neon `public.cpq_sampler_result` row for the SKU (`updated_at desc nulls last, created_at desc nulls last, id desc`)
- if no sampler ruleset exists, `"BblRuleSetItem"` is set to `Unknown`
- external push failures are returned as warnings and do not fail the main Neon item-map upsert response

## Diagnostics

`/api/debug/external-postgres-test` verifies:

- external PostgreSQL environment/config parsing
- DNS and connection/authentication checks
- simple query execution
- `variant_eligibility` table existence
- `variants` table existence
- unique support for `variant_eligibility ("Sku", "CountryCode")`
- unique support for `variants ("Sku")`

`/api/debug/external-postgres-write-test` performs a rollback-safe write diagnostic against `variant_eligibility`; it no longer writes to external `cpq_sampler_result`.
