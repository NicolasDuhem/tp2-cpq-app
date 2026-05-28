# Database documentation (code-backed)

This document reflects what current code reads/writes and what `sql/schema.sql` + migrations define.

## Tables currently used by runtime code

1. `CPQ_setup_account_context`
2. `CPQ_setup_ruleset`
3. `CPQ_sampler_result`
4. `cpq_configuration_references`
5. `cpq_image_management`
6. `cpq_country_mappings`

## Canonical vs supporting data

### Canonical saved configuration

- Table: `cpq_configuration_references`
- Used by:
  - `POST/GET /api/cpq/configuration-references`
  - `POST /api/cpq/retrieve-configuration`
- Canonical retrieve identity: `configuration_reference` + `is_active=true`

### Supporting operational snapshots

- Table: `CPQ_sampler_result`
- Used by:
  - manual/auto sampler writes (`/api/cpq/sampler-result`)
  - picture sync source (`/api/cpq/setup/picture-management/sync`)
  - results matrix read model (`/cpq/results`)
  - sales allocation read/write (`/sales/bike-allocation` + sales APIs)
- Allocation status source: `CPQ_sampler_result.active` (not JSON field)

### Setup/master tables

- `CPQ_setup_account_context`: account/customer/currency/language + region/sub-region/country setup
- `CPQ_setup_ruleset`: ruleset metadata + bike_type + namespace/header defaults
- `cpq_country_mappings`: region/sub-region/country master mapping used by setup dropdowns

### Image/layer mapping table

- `cpq_image_management`
- Stores feature/option/value rows + `picture_link_1..4`, `is_active`, `ignore_during_configure`, `feature_layer_order`

## Key write paths

- `/cpq` save writes `cpq_configuration_references`, then writes `CPQ_sampler_result`.
- Setup page writes:
  - account contexts (`CPQ_setup_account_context`)
  - country mappings (`cpq_country_mappings`)
  - rulesets (`CPQ_setup_ruleset`)
  - picture rows and feature-wide settings (`cpq_image_management`)
- Picture sync writes:
  - marks sampler rows processed in `CPQ_sampler_result`
  - inserts missing combinations into `cpq_image_management`
- Sales allocation writes:
  - toggles or bulk-updates `CPQ_sampler_result.active`

## Constraints/behaviors that matter in code

- `CPQ_setup_account_context.country_code` must match ISO2 uppercase format.
- `CPQ_setup_account_context` enforces non-blank `account_code`.
- `CPQ_setup_account_context` enforces unique `(country_code, currency)` combinations.
- `CPQ_setup_account_context(region, sub_region, country_code)` references `cpq_country_mappings`.
- `cpq_country_mappings` enforces unique `(region, sub_region, country_code)` rows.
- `cpq_image_management` has unique `(feature_label, option_label, option_value)`.
- `cpq_image_management.feature_layer_order` constrained to `1..20`.
- `CPQ_sampler_result.active` is `NOT NULL DEFAULT true`.
- `cpq_configuration_references.configuration_reference` is unique.

## Notable schema nuance

`saveConfigurationReference()` writes fields including `canonical_header_id`, `canonical_detail_id`, and `source_working_detail_id`.
Ensure deployed DB schema includes all columns expected by current runtime code when provisioning new environments.

## QPart tables (MVP)

All QPart tables are prefixed `qpart_` and are isolated from CPQ runtime persistence.

1. `qpart_parts`
2. `qpart_hierarchy_nodes`
3. `qpart_metadata_definitions`
4. `qpart_part_metadata_values`
5. `qpart_part_translations`
6. `qpart_part_bike_type_compatibility`
7. `qpart_part_compatibility_rules`
8. `qpart_compatibility_reference_values`
9. `qpart_country_allocation`
10. `qpart_part_channel_assignment`

Additional integrity object:

- trigger function `qpart_validate_hierarchy_parent()` + trigger `qpart_hierarchy_parent_trg` enforces parent level = child level - 1 and level-1-without-parent rule.

QPart migration added:

- `sql/migrations/2026-04-24_qpart_mvp.sql` (foundation + initial metadata definition seed rows).
- `sql/migrations/2026-04-24_qpart_country_allocation.sql` (territory allocation table for sales matrix).

QPart dynamic reference reads (read-only):

- locales from `CPQ_setup_account_context.language` distinct values.
- bike types from `CPQ_setup_ruleset.bike_type` distinct values.
- derived compatibility options from `CPQ_sampler_result.json_result` parsing `selectedOptions` with fallback to `dropdownOrderSnapshot`.
- allocation countries from active `cpq_country_mappings.country_code` values.

## QPart allocation matrix storage

- Route: `/sales/qpart-allocation`.
- Canonical allocation state is `qpart_country_allocation.active` (`true=Active`, `false=Inactive`).
- Unique business key: `(part_id, country_code)` via `qpart_country_allocation_part_country_uniq`.
- Additional indexes: `qpart_country_allocation_country_idx`, `qpart_country_allocation_active_idx`.
- Missing-row prevention:
  - create part path seeds inactive rows for all active countries.
  - page load + toggle/bulk mutation paths call a sync helper to insert any missing rows safely.
- No “Not configured” state is modeled for QPart allocation.

## QPart CSV export/import mapping

- API routes: `GET /api/qpart/parts/export` and `POST /api/qpart/parts/import`.
- Upsert business key: `qpart_parts.part_number` (already unique in schema).
- CSV is flat by design (one row per part), but import maps to normalized writes:
  - core fields → `qpart_parts`
  - hierarchy path (`hierarchy_1..hierarchy_7`) → `qpart_parts.hierarchy_node_id`
  - core translations (`title__<locale>`, `description__<locale>`) → `qpart_part_translations`
  - metadata (`metadata__<key>`, `metadata__<key>__<locale>`) → `qpart_part_metadata_values`
  - bike types / compatibility rules → `qpart_part_bike_type_compatibility` + `qpart_part_compatibility_rules`
- Dynamic columns:
  - metadata columns come from active `qpart_metadata_definitions`
  - locale columns come from distinct `CPQ_setup_account_context.language` (non-base locales only).

## QPart metadata AI translation behavior

- API route `POST /api/qpart/translations/field` reads/writes `qpart_part_metadata_values` only (no schema changes).
- English/base row (`locale = base locale from locale service`) remains source input for translation requests.
- Target locale rows are upserted only for locales currently present in distinct `CPQ_setup_account_context.language` values.
- Default write policy is fill-missing only; non-empty existing locale rows are skipped unless future explicit overwrite mode is introduced.

## DB sequence maintenance helpers

- SQL functions (schema + migration):
  - `app_list_pk_sequence_health()`
  - `app_resync_pk_sequence(target_schema text, target_table text)`
- Scope: discovers all `public` tables with single-column integer PKs backed by a PostgreSQL sequence/identity and reports:
  - table + PK + sequence name
  - current sequence next value
  - table max PK value
  - expected next value
  - status (`in_sync` / `out_of_sync`)
- Resync behavior:
  - sets sequence using `setval(...)` to `max(id)` when table has rows
  - sets sequence to start state for empty table so next insert returns `1`
- App surfaces:
  - API: `GET /api/admin/db-sequences`, `POST /api/admin/db-sequences/resync`
  - UI: `/qpart/admin/sequences` (admin mode only in current app model)

## QPart Channel & Country assignment persistence

- Channel assignment source of truth: `qpart_part_channel_assignment` (`(part_id, channel)` unique).
- Country assignment source of truth remains `qpart_country_allocation.active` (same semantics as `/sales/qpart-allocation`).
- Part save flow updates both through `lib/qpart/parts/service.ts` and `lib/qpart/allocation/service.ts`.
- CSV import/export includes static columns:
  - `channels` (pipe-separated: `Ecom|Dealer`)
  - `countries` (pipe-separated ISO2: `GB|DE`)

## Data-point audit support tables (operational mapping)

The admin data-point viewer (`/admin/data-point`) maps page controls to the same table/service ownership documented above. It does not write data itself; it is an internal registry view sourced from `lib/admin/data-point-registry.ts`.

## Live Neon intelligence reference (April 2026)

- Source of truth for live database metadata is `database-intelligence/*` (current files are capitalized in-repo, e.g., `Schema.csv`, `Constraints.csv`, `Indexes.csv`, `Table_sizes.csv`).
- Note: `database-intelligence/Schema.csv` currently lacks a `table_name` column and appears to include only one table column list; use `columns_by_table_summary.csv` + constraints/index exports to validate table-wide shape until export format is corrected.
- Performance-sensitive tables from live stats include `qpart_country_allocation`, `qpart_hierarchy_nodes`, `qpart_parts`, and `CPQ_sampler_result`-backed matrix routes.
- See `docs/neon-compute-hotspot-analysis.md` for current hotspot prioritization and `docs/neon-compute-proposed-indexes.sql` for review-first SQL recommendations.

## 2026-04-29 Neon load reduction updates

- No new indexes were applied in this pass; review-first indexes remain pending in `docs/neon-compute-proposed-indexes.sql`.
- `sql/schema.sql` was reviewed against `database-intelligence/*` and intentionally not bulk-resynced in this pass for safety.

## QPart image upload (v1)

- QPart detail page has compact **Take picture** (primary slot) and **Manage pictures** actions beside the QPart code (mobile camera-capable via `accept=image/*` + `capture=environment`). **Take picture** always writes/replaces the primary image at `image_index=0` (`is_primary=true`).
- Selected image is resized client-side (max dimension 1600px, aspect ratio preserved) and re-encoded as JPEG at quality 0.82 before upload.
- Upload target uses Vercel Blob public store with deterministic key: `qparts/<part_number>.jpg` and overwrite enabled (`allowOverwrite: true`, `addRandomSuffix: false`).
- Metadata is stored in Neon table `qpart_part_images` (one-to-many per part) with primary (`image_index=0`) and numbered secondary slots (`1..n`), plus blob URL/path, mime type, file size and timestamps.
- Required env: `BLOB_READ_WRITE_TOKEN` in Vercel/hosted environment.
- QPart detail header preview resolves from `blob_url` (public CDN URL): preferred `is_primary=true`, fallback lowest `image_index` (including reconciled legacy rows), fallback no image.
- On image API reads/deletes, the service reconciles Neon metadata with Blob keys under `qparts/<part_number>` for both `qparts/<part_number>.jpg` and `qparts/<part_number>_<n>.jpg`; legacy random-suffix files are also surfaced by hydrating missing Neon rows so **Manage pictures** can list and delete them.
- Delete flow is Blob-first (`@vercel/blob del` using `blob_url`), then Neon metadata delete, then UI refresh; deleting a current primary image automatically shifts display to the next preferred row via existing primary/lowest-index selection.

## External PostgreSQL integration tables

The external PostgreSQL integration no longer writes to external `cpq_sampler_result`. Internal Neon `CPQ_sampler_result` remains the app's sampler/allocation source. The current UI Push target tables are:

- `${EXTERNAL_PG_SCHEMA}.variants`
- `${EXTERNAL_PG_SCHEMA}.variant_eligibilities`

The external Push button uses SELECT-first UPDATE/INSERT logic and does not require unique indexes yet. A SKU must have both `bc_product_id` and `bc_variant_id` in Neon `bc_item_variant_map`; otherwise the external push is skipped before any external write.

`variants` mapping:

- `"Sku"` = pushed SKU / `bc_item_variant_map.sku_code`
- `"BcVariantId"` = `bc_item_variant_map.bc_variant_id`
- `"BcProductId"` = `bc_item_variant_map.bc_product_id`
- Bike `"ForecastCtyCode"` = `F_BB`; QPart allocation push override = `Qpart`
- Bike `"BblRuleSetItem"` = deterministic Neon `cpq_sampler_result.ruleset` lookup by SKU; QPart allocation push override = `Qpart`
- `"CreatedAt"` and `"UpdatedAt"` = Unix-second bigint timestamp, for example `1778151766`

`variant_eligibilities` mapping:

- `"Sku"` = pushed SKU
- `"CountryCode"` = pushed country
- Bike `"DetailId"` = current source payload detail ID; QPart allocation push override = `Qpart`
- `"IsActive"` = current bike/QPart allocation active value

## QPart allocation operational filters

The QPart allocation backend derives full filtered bulk targets from the existing `qpart_parts`, `qpart_country_allocation`, `qpart_hierarchy_nodes`, `qpart_part_metadata_values`, `qpart_metadata_definitions`, and `bc_item_variant_map` data. Password-protected Update all operations update only `qpart_country_allocation.active` rows for the selected country codes and the part ids that match the submitted filter criteria.

## External `variant_eligibilities` status reads

The Sales allocation pages have a manual external status refresh that reads `${EXTERNAL_PG_SCHEMA}.variant_eligibilities` for display-only Push/Update state. The refresh reads these external columns:

- `"Sku"`
- `"CountryCode"`
- `"IsActive"`

The business key is (`"Sku"`, `"CountryCode"`). Refresh is manual rather than automatic on page load so normal navigation continues to use internal Neon data only and does not hammer external PostgreSQL. The backend rebuilds the complete filtered dataset and checks all matching SKU/country pairs across all pages in parameterized batches.

Useful duplicate-key check for external administrators:

```sql
select "Sku", "CountryCode", count(*) as row_count
from public.variant_eligibilities
group by "Sku", "CountryCode"
having count(*) > 1
order by row_count desc, "Sku", "CountryCode";
```

## Allocation external sync status notes

No new database tables or columns are required for the 2026-05 allocation workflow change. External sync state is derived at runtime from:

- the internal allocation boolean (`CPQ_sampler_result.active` or `qpart_country_allocation.active`),
- latest cached BC status and IDs in `bc_item_variant_map`, and
- optional refreshed external `variant_eligibilities` status.

`bc_item_variant_map.bc_status = 'OK'` is now the explicit gate for integrated allocation pushes. Rows with non-OK/unknown status or missing `bc_product_id`/`bc_variant_id` remain internally updated but externally **Pending BC** until BC status is refreshed and **Push all BC OK** is run.

## Auth and permission foundation (May 19, 2026)
User management, local login/session foundation, and per-page permissions were added. See `docs/AUTH_AND_PERMISSIONS.md` and migration `sql/migrations/2026-05-19_app_auth_permissions.sql`.


## Allocation Active/Inactive Audit Log
- Table: `app_allocation_audit_log` (migration `sql/migrations/2026-05-19_allocation_audit_log.sql`).
- Captures actor (id/email/display), page/source/entity/item/country, action type, `status_before`, `status_after`, `bigcommerce_status`, and json metadata.
- `bigcommerce_status` stores the latest known BC map status (`OK|NOK|ERR|DISABLED|UNKNOWN`) when available from existing Neon-side data; otherwise it is `null`.
- Canonical searchable status is `app_allocation_audit_log.bigcommerce_status` (metadata may still also include `bigcommerceStatus` for compatibility).
- Indexes include `created_at desc` and `bigcommerce_status` for history filtering.
- Audited writes: bike single/bulk active toggle, QPart single/bulk active toggle. Only real status changes are logged.
- Creation auditing (CSV/manual/CPQ-created) should write `status_before = null` and creation action types when those creation paths insert allocation rows.
- Not audited: filter/search/pagination/read-only status checks/pushes that do not modify Active/create allocation rows.
- Query example:
```sql
select created_at, actor_display_name, actor_email, page_key, source_process, entity_type, item_code, country_code, bigcommerce_status, action_type, status_before, status_after, metadata
from app_allocation_audit_log
order by created_at desc
limit 200;
```

- Allocation audit lookup route reads `app_allocation_audit_log` by case-insensitive `item_code` with optional `entity_type`, `country_code`, and date range filters; indexes include `(item_code, created_at desc)` and `(item_code, country_code, created_at desc)`.


## Dashboard (May 2026 operational rebuild)
- `/dashboard` now focuses on bike allocation health, qpart allocation health, last-24h allocation audit activity, and compact operational gap cards.
- Filters: region, sub-region, country, bike type, qpart hierarchy L1, BC status (OK/NOK/all), active status (active/inactive/all).
- Data is aggregated server-side in `lib/dashboard/service.ts` using explicit column selects and grouped SQL.
- Bike sources: `CPQ_sampler_result` + `CPQ_setup_ruleset` + `cpq_country_mappings` + latest `bc_item_variant_map` per SKU.
- QPart sources: `qpart_country_allocation` + `qpart_parts` + `qpart_hierarchy_nodes` + `cpq_country_mappings` + latest `bc_item_variant_map` per part number.
- Recent activity source: `app_allocation_audit_log` (last 24 hours).
- Old map/heatmap/picture-completeness dashboard visuals were removed from `/dashboard` and replaced with compact operational sections.

- Bulk configure skip rule: `cpq_image_management.ignore_during_configure` is evaluated per feature+option row. Only explicit `true` skips; `false` or no matching row means configure.

## 2026-05-28 Neon transfer reduction update

- `retrieve-configuration` now resolves canonical references through a lightweight projection that excludes `json_snapshot` and `finalize_response_json`.
- `json_snapshot` write path now reduces stored payload content to selected business captions (`ForecastAs`, `Description`, `DetailId`, `TradePrice`, `MSRP`) with non-empty/non-zero value filtering for new saves.
- Historical `cpq_configuration_references` rows are intentionally unchanged in this pass.
