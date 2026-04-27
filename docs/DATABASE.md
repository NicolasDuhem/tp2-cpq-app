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
