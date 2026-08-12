# External PostgreSQL Row Push

This document describes the **current** UI row Push process for Sales bike allocation and Sales QPart allocation.

## Current state

The legacy external PostgreSQL push to an external `cpq_sampler_result` table has been removed from active usage. Neon `CPQ_sampler_result` remains the internal sampler/allocation table and is not removed or replaced.

The UI Push button now syncs only these external PostgreSQL tables, in this mandatory order:

1. `${EXTERNAL_PG_SCHEMA}.variants`
2. `${EXTERNAL_PG_SCHEMA}.variant_eligibilities`

`EXTERNAL_PG_SCHEMA` defaults to `public` through the external PostgreSQL client configuration. The schema is not hardcoded in the write helper.

## Scope

Implemented now:

- Single-cell Push from `/sales/bike-allocation`.
- Single-cell Push from `/sales/qpart-allocation`.
- Bulk Active/Inactive integrated external sync for bike and QPart allocation.
- Bulk **Push all BC OK** external sync for bike and QPart allocation.
- Diagnostics for connection, table existence/readability, and rollback-safe writes to the new target tables.

## Preconditions

Before any external write, the push process checks Neon `public.bc_item_variant_map` for the pushed SKU.

The SKU must have both:

- `bc_product_id`
- `bc_variant_id`

If either value is missing, the external push is skipped. The API returns a successful skipped result with a clear message; it does not write either external table.

The UI also hides the Push button for rows whose SKU/part number does not have both BC IDs in Neon, so most invalid push attempts are prevented before the API call.

## Source rows

### Bike allocation

`POST /api/sales/bike-allocation/push` builds its source payload from the latest matching Neon `CPQ_sampler_result` row for:

- `ruleset`
- `ipn_code`
- `country_code`

The source row provides `detail_id` and the current `active` value used for external `variant_eligibilities."IsActive"`.

### QPart allocation

`POST /api/sales/qpart-allocation/push` builds its source payload from Neon `qpart_country_allocation` joined to `qpart_parts` for:

- `part_id`
- `country_code`

The source allocation row provides the part number SKU, country, and current allocation `active` value used for external `variant_eligibilities."IsActive"`.

## External table mappings

### `${EXTERNAL_PG_SCHEMA}.variants`

| External column | Source/value |
| --- | --- |
| `"Sku"` | `bc_item_variant_map.sku_code` / pushed SKU |
| `"BcVariantId"` | `bc_item_variant_map.bc_variant_id` |
| `"BcProductId"` | `bc_item_variant_map.bc_product_id` |
| `"ForecastCtyCode"` | Bike: extracted full CPQ `ForecastAs` code; update preserves existing value when absent; insert falls back to legacy `F_BB` only when no valid code exists. QPart: `Qpart`. |
| `"BblRuleSetItem"` | deterministic Neon `cpq_sampler_result.ruleset` lookup by joining `cpq_sampler_result.ipn_code` to `bc_item_variant_map.sku_code` |
| `"CreatedAt"` | current Unix timestamp in seconds, for example `1778151766`, on insert only |
| `"UpdatedAt"` | current Unix timestamp in seconds, for example `1778151766`, on insert and update |

`CreatedAt` is preserved on update. Only `UpdatedAt` changes on update.

### `${EXTERNAL_PG_SCHEMA}.variant_eligibilities`

| External column | Source/value |
| --- | --- |
| `"Sku"` | pushed SKU (`CPQ_sampler_result.ipn_code` for bikes, `qpart_parts.part_number` for QParts) |
| `"CountryCode"` | current pushed country code |
| `"DetailId"` | current source payload `detail_id` |
| `"IsActive"` | current allocation state being pushed (`CPQ_sampler_result.active` for bikes, `qpart_country_allocation.active` for QParts) |

`"IsActive"` intentionally does **not** use `cpq_country_mappings.is_active`.

## Write algorithm

The external database currently cannot rely on unique indexes, so the active write path does not use `ON CONFLICT`.

### Step 1: validate BC IDs

- Query Neon `bc_item_variant_map` by SKU.
- If either BC ID is missing, return skipped results for both target tables and stop.

### Step 2: sync `variants` first

- `SELECT "Sku" FROM <schema>.variants WHERE "Sku" = $1 LIMIT 1`.
- If a row exists, `UPDATE` by `"Sku"` with BC IDs, forecast code, ruleset, and `UpdatedAt`.
- If no row exists, `INSERT` all mapped columns including `CreatedAt` and `UpdatedAt`.

### Step 3: sync `variant_eligibilities` second

- `SELECT "Sku" FROM <schema>.variant_eligibilities WHERE "Sku" = $1 AND "CountryCode" = $2 LIMIT 1`.
- If a row exists, `UPDATE` `"DetailId"` and `"IsActive"` by `("Sku", "CountryCode")`.
- If no row exists, `INSERT` `"Sku"`, `"CountryCode"`, `"DetailId"`, and `"IsActive"`.

This order is mandatory because `variant_eligibilities` depends on the SKU already existing in `variants`.

## API response shape

Push routes return:

- `result.skipped`
- `result.message`
- `result.variantResult.action` (`inserted`, `updated`, or `skipped`)
- `result.eligibilityResult.action` (`inserted`, `updated`, or `skipped`)
- business keys for the affected SKU/country

## Diagnostics

`/api/debug/external-postgres-test` checks:

- environment/config parsing
- DNS and TCP connectivity
- SSL/authentication/simple query
- existence of `variants` and `variant_eligibilities`
- basic read access to both tables

It does not require or check unique indexes.

`/api/debug/external-postgres-write-test` performs a rollback-safe write diagnostic against `variants` first and `variant_eligibilities` second. It uses the same SELECT-first UPDATE/INSERT helpers as the active push path and rolls the transaction back.

## QPart allocation row-push override

On `/sales/qpart-allocation`, the external PostgreSQL variant-table push intentionally bypasses the bike sampler ruleset lookup for QPart rows. QPart rows do not have bike-style `cpq_sampler_result.ruleset` / detail / forecast values, so the QPart push route sends explicit overrides only from the QPart allocation endpoint:

- `variants."BblRuleSetItem"` = `Qpart`
- `variants."ForecastCtyCode"` = `Qpart`
- `variant_eligibilities."DetailId"` = `Qpart`

The shared bike allocation push route remains unchanged and continues to resolve the latest sampler ruleset for bike SKUs before writing external `variants` and `variant_eligibilities` rows.

## Manual external status refresh for Sales allocation buttons

`/sales/bike-allocation` and `/sales/qpart-allocation` intentionally keep initial page load sourced from internal Neon data only. They do not automatically query external PostgreSQL because a page can represent many pages of SKU/country cells and an automatic external lookup on every navigation would create unnecessary load.

Operators can click **Refresh external status** on either allocation page. That action calls a status-only API endpoint and reads external `${EXTERNAL_PG_SCHEMA}.variant_eligibilities` columns:

- `"Sku"`
- `"CountryCode"`
- `"IsActive"`

The matching key is (`"Sku"`, `"CountryCode"`). The status refresh does not call the push route and does not write to external PostgreSQL.

### Scope and performance

The refresh scope is the full current filter context rebuilt on the backend:

- Bike allocation: ruleset, country, bike type, IPN contains filter, feature-value filters, and per-country allocation-status filters.
- QPart allocation: part/title search, Territory country filter, hierarchy filters, metadata filters, and BC status filter.

The backend gathers every eligible SKU/country pair across all matching rows in the filtered dataset, including rows on later pagination pages. It then performs a batched, parameterized external lookup; it does not perform one external query per table cell.

### Button display rules

Before refresh, or when no external match is found, the row action remains grey **Push**. After refresh:

- external row exists and `"IsActive" = true` → green **Update**
- external row exists and `"IsActive" = false` → orange **Update**
- external row does not exist → grey **Push**

The click behavior is unchanged. **Push** and **Update** both run the same existing single-cell push process described above.

### Operations SQL

Confirm a specific external status:

```sql
select "Sku", "CountryCode", "IsActive"
from public.variant_eligibilities
where "Sku" = 'YOUR-SKU'
  and "CountryCode" = 'GB';
```

Check for duplicate business keys. The application uses SELECT-first update/insert logic and can run without a unique index, but operationally (`"Sku"`, `"CountryCode"`) should be unique for deterministic status display:

```sql
select "Sku", "CountryCode", count(*) as row_count,
       bool_or("IsActive" is true) as any_active
from public.variant_eligibilities
group by "Sku", "CountryCode"
having count(*) > 1
order by row_count desc, "Sku", "CountryCode";
```

## Integrated allocation push behavior (2026-05)

The sales allocation workflow is no longer a strictly two-step operator process. On both `/sales/bike-allocation` and `/sales/qpart-allocation`, changing a configured cell to **Active** or **Inactive** now performs the operational sync sequence automatically:

1. write the internal Neon allocation state (`CPQ_sampler_result.active` for bikes, `qpart_country_allocation.active` for QParts),
2. read the latest Neon `bc_item_variant_map` row for the SKU,
3. if `bc_status = OK` and both `bc_product_id` and `bc_variant_id` are present, run the existing external PostgreSQL `variants` then `variant_eligibilities` sync,
4. if BC is `NOK`, `ERR`, `DISABLED`, unknown, or IDs are missing, skip external PostgreSQL and report **Pending BC**.

External write errors do not roll back the successful internal Neon allocation update. They are surfaced as **Error** in the external sync state so operators can retry after the external issue is resolved.

### External sync state model

Each allocation cell keeps the allocation state separate from the external sync state:

- allocation state: **Active**, **Inactive**, or bike-only **Not configured**;
- BC state: **OK**, **NOK**, **ERR**, **DISABLED**, or not checked/cached;
- external sync state:
  - **Pushed** — external `variant_eligibilities."IsActive"` is known to match the internal allocation state, or the integrated push just completed;
  - **Pending BC** — the internal allocation changed, but the external push was skipped because BC status is not OK or required BC IDs are missing;
  - **Error** — the internal allocation changed, but the external PostgreSQL write failed;
  - **Unknown** — external status has not been refreshed and no action result is available;
  - **Out of sync** — refreshed external status exists but does not match the internal Active/Inactive state.

### Push all BC OK

Both sales allocation pages now include a **Push all BC OK** action. It does not change Neon allocation state. It only retries external PostgreSQL sync for rows in the current scope whose latest cached BC status is OK.

Scope rules:

- Bike allocation currently uses the visible/current-page filtered rows and the selected country checkboxes in the bulk toolbar.
- QPart allocation uses current page mode by default and, when password-protected **Update all** is enabled, rebuilds all filtered part IDs across every filtered page before pushing.
- QPart **Push all BC OK** uses the same filter criteria and country scope as QPart bulk activate/deactivate, so it is not a whole-database push.

The manual per-cell external sync pill remains available as a retry/diagnostic action and uses the same BC OK gate.

## Bulk allocation sync optimization

Bulk Active/Inactive and **Push all BC OK** now use a batched allocation-to-external path instead of opening the external PostgreSQL writer once per SKU/country target.

The behavior and table order are unchanged:

1. The internal Neon allocation mutation completes first.
2. The latest Neon `bc_item_variant_map` row must have `bc_status = 'OK'` and both `bc_product_id` and `bc_variant_id`.
3. External `variants` is written before `variant_eligibilities`.
4. QPart still maps `BblRuleSetItem`, `ForecastCtyCode`, and `DetailId` to `Qpart`.
5. External write failures do not roll back the successful Neon allocation update.

The bulk path reduces repeated work as follows:

- It collects unique target SKUs and reads the latest `bc_item_variant_map` rows in one Neon query.
- Bike allocation collects unique SKUs and reads deterministic latest sampler rulesets in one Neon query; QPart does not query sampler rulesets and continues to use the hardcoded `Qpart` mapping.
- It opens one external PostgreSQL connection for the batch through `withExternalPgClient`, reuses it for all external table reads/writes, and closes it once.
- It performs SELECT-first existence checks in batches: all requested `variants` SKUs, then all requested `variant_eligibilities` SKU/country pairs.
- It still does not use `ON CONFLICT` because the external database may not have the required unique indexes on `variants("Sku")` or `variant_eligibilities("Sku", "CountryCode")`.
- Row writes remain parameterized UPDATE/INSERT statements with bounded concurrency. The default limit is `5`, tunable with `EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY`.

Bulk responses include compact aggregate counts under `result.externalSync`: `attempted`, `totalTargets`, `pushed`, `pendingBc`, `errors`, `variantsInserted`, `variantsUpdated`, `eligibilityInserted`, `eligibilityUpdated`, `skipped`, and `timingsMs`. Per-row payloads are intentionally not returned by bulk routes to keep large operations lightweight.

## Bike `ForecastCtyCode` mapping from CPQ ForecastAs (2026-06-03)
- Bike allocation pushes populate external `${EXTERNAL_PG_SCHEMA}.variants."ForecastCtyCode"` from the primary full `ForecastAs` value extracted from the matching active `cpq_configuration_references.json_snapshot` row.
- The extractor ignores short ForecastAs fragments below 13 characters and prefers 15-to-30-character values from `raw.Details` / `Details` over selectable-option custom property paths.
- The bike bulk path batch-loads the latest active configuration reference snapshots only for the selected SKU/IPN set by `final_ipn_code`; it does not scan historical snapshots and does not query per country cell.
- Bike updates use `coalesce($forecast, "ForecastCtyCode")`, so a missing valid full ForecastAs does not overwrite an existing external value with blank, `null`, `0`, `_ULT`, `_BLA`, or another short fragment.
- Bike inserts fall back to the previous legacy `F_BB` value only when no valid full ForecastAs exists, preserving the existing insert behavior while preventing noisy ForecastAs fragments from being sent.
- QPart pushes remain hardcoded to `Qpart` for `BblRuleSetItem`, `ForecastCtyCode`, and `DetailId`.

External validation for one pushed SKU/IPN:

```sql
select
  "Sku",
  "ForecastCtyCode",
  "UpdatedAt"
from public.variants
where "Sku" = '<IPN_CODE>';
```
