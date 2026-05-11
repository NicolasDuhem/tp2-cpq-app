# tp2-cpq-app

Next.js CPQ operations app for bike configuration, setup management, sampler analytics, and sales allocation handoff.

## Current routes

- `/` → redirect to `/cpq`.
- `/bike-builder` → redirect to `/cpq`.
- `/cpq` → Bike Builder runtime (manual + bulk CPQ flow, save/retrieve, layered preview).
- `/cpq/setup` → setup console for account context, rulesets, and picture management.
- `/cpq/results` → sampler matrix explorer (admin-tab link only, route itself is not server-blocked).
- `/cpq/process` → SOP/process instruction page.
- `/dashboard` → executive operational dashboard (territory coverage, bike-type health, picture completeness, and gap leaderboards).
- `/cpq/ui-docs` → UI-label-to-code mapping page (content is admin-mode gated in UI component).
- `/admin/data-point` → internal admin page contract and data-point lineage viewer (admin mode only).
- `/sales/bike-allocation` → sales allocation matrix with active/inactive toggles and replay launch to `/cpq`.
  - Includes per-cell **Push** action to sync external PostgreSQL `variants` and then `variant_eligibilities` rows; Neon `CPQ_sampler_result` remains the internal allocation source.
  - Supports route filters `country_code`, `ruleset`, and `bike_type` for deep-link drill-down from dashboard views.
  - Toggle/bulk mutations revalidate + refresh the route so UI status updates immediately from `CPQ_sampler_result.active`.
- `/sales/qpart-allocation` → sales territory allocation matrix for QPart spare parts.
  - Includes per-cell **Push** action to sync external PostgreSQL `variants` and then `variant_eligibilities` rows; Neon `qpart_country_allocation` remains the internal allocation source.
  - Active/Inactive only (no Not configured state).
  - Part and territory matrix state is stored in `qpart_country_allocation.active`.
  - Toggle/bulk mutations revalidate + refresh the route so UI updates immediately.

## Core lifecycle contract (`/cpq`)

1. `POST /api/cpq/init` (StartConfiguration)
2. `POST /api/cpq/configure` (zero or more)
3. `POST /api/cpq/finalize`
4. `POST /api/cpq/configuration-references` (canonical save)
5. Auto-support save to `CPQ_sampler_result` via `POST /api/cpq/sampler-result`
6. Retrieve by `configuration_reference` via `POST /api/cpq/retrieve-configuration`

Canonical snapshot source for save/sampler is latest Configure snapshot, fallback latest Start snapshot (never Finalize body).

### `/cpq` init trigger contract

- `POST /api/cpq/init` is re-run whenever account code changes in UI.
- `POST /api/cpq/init` is re-run whenever ruleset changes in UI.
- Each init request is sequenced; only the latest init response is accepted as active context (stale responses are ignored).
- Sales “Not configured” launch takes temporary ownership of CPQ context: apply account/ruleset in UI → run init with those live values → accept latest init only → replay configure options on that same active session.
- Finalize/save always read session/ruleset/account from the authoritative active CPQ context set by the accepted init (not from stale/default session refs).

## Data ownership summary

- Canonical save/retrieve: `cpq_configuration_references`
- Operational/support snapshots and allocation state: `CPQ_sampler_result` (`active` is authoritative for sales allocation status: Active=true, Inactive=false, Not configured=no row)
- QPart sales territory allocation state: `qpart_country_allocation` (`active` is authoritative, one row per `part_id + country_code`)
- Setup master data: `CPQ_setup_account_context`, `CPQ_setup_ruleset`
- Layered preview + bulk-ignore behavior: `cpq_image_management`
- Dashboard aggregation source: `CPQ_sampler_result` + `CPQ_setup_ruleset` bike-type mapping + `cpq_country_mappings` territory metadata + `cpq_image_management` completeness status

## Admin mode and visibility

- Client-side admin visibility gate in top nav (`Open as admin`, password `Br0mpt0n`).
- Always-visible tabs: Process, Sales allocation, Bike Builder, Setup.
- Admin-only tabs: Sampler Results, UI Docs.
- `/cpq` technical/debug sections additionally require admin mode.

## Feature flags / runtime switches

- `NEXT_PUBLIC_CPQ_DEBUG=true` enables client debug timeline (still admin-only visible).
- `CPQ_USE_MOCK=true` switches `/api/cpq/init` and `/api/cpq/configure` to mock responses.

## Documentation

See `docs/README.md` for the full documentation map, including deep architecture, page/component breakdown, and gap analysis.

- `/qpart` → QPart spare-parts PIM landing page.
- `/qpart/parts` → spare part search/list and edit links.
- `/qpart/parts` also supports CSV export/import (dry-run preview + apply upsert by `part_number`).
- `/qpart/parts/new` and `/qpart/parts/[id]` → create/edit spare parts with hierarchy, metadata, translations, and compatibility.
- `/qpart/hierarchy` → hierarchy level 1..7 management.
- `/qpart/metadata` → metadata definition management.
- `/qpart/compatibility` → compatibility reference values and sampler derivation preview.

## QPart isolation summary

- Namespace isolation: routes are under `/qpart`, APIs under `/api/qpart/*`, services under `lib/qpart/*`, and tables are prefixed `qpart_`.
- CPQ/runtime pages (`/cpq`, `/cpq/setup`, `/sales/*`, dashboard) remain unchanged in behavior and do not depend on QPart tables at runtime.
- Dynamic locale source for QPart translations: `CPQ_setup_account_context.language` (distinct values).
- Dynamic bike type source: `CPQ_setup_ruleset.bike_type` (distinct values).
- Dynamic compatibility derivation source: `CPQ_sampler_result.json_result` (`selectedOptions` preferred, `dropdownOrderSnapshot` fallback).
- Dynamic country source for QPart sales allocation: active `cpq_country_mappings.country_code`.
- QPart allocation sync rule: missing `(part_id, country_code)` rows are auto-created as inactive on part create and during matrix load/mutation paths.
- QPart CSV export/import contract is intentionally flat/business-facing while persistence stays normalized in `qpart_*` tables.
- CSV metadata columns are dynamic from active `qpart_metadata_definitions` (`metadata__<key>` + `metadata__<key>__<locale>` for translatable definitions).
- CSV translation locale columns are dynamic from distinct `CPQ_setup_account_context.language` values (`title__<locale>`, `description__<locale>`, non-base locales only).

## QPart AI translation configuration

- `OPENAI_API_KEY` (required): server-side key for `POST /api/qpart/translations/field`.
- `OPENAI_TRANSLATION_MODEL` (optional): defaults to `gpt-5.4-mini`.
- QPart field translation is server-side only and never exposes API keys in browser code.
- Supported translation locales stay dynamic from distinct `CPQ_setup_account_context.language` values (excluding base locale).

## External PostgreSQL row push configuration

The row-level **Push** action on `/sales/bike-allocation` and `/sales/qpart-allocation` writes server-side to external PostgreSQL `variants` first and `variant_eligibilities` second. The old external `cpq_sampler_result` push is removed from active usage; Neon `CPQ_sampler_result` remains in use internally for sampler persistence and bike allocation state.

Runtime dependency requirement:

- `pg` must be present in production dependencies (not just devDependencies) so server-side push routes can load the Node PostgreSQL client at runtime (for example in Vercel serverless functions).

Required environment variables:

- `EXTERNAL_PG_HOST`
- `EXTERNAL_PG_PORT` (default `5432`)
- `EXTERNAL_PG_DATABASE`
- `EXTERNAL_PG_USER`
- `EXTERNAL_PG_PASSWORD`
- `EXTERNAL_PG_SSL` (`true` recommended for hosted PostgreSQL)
- `EXTERNAL_PG_SCHEMA` (default `public`)

External unique indexes are **not required** for the current push path. The app uses SELECT-first logic, then UPDATE or INSERT, because the external tables may not have unique indexes yet.

Push is allowed only when Neon `bc_item_variant_map` has both `bc_product_id` and `bc_variant_id` for the SKU. If either ID is missing, the API returns a skipped result and writes nothing externally; the Sales UIs hide Push for rows that do not meet this precondition.

For bike pushes, `variants` receives `"Sku"`, `"BcVariantId"`, `"BcProductId"`, hardcoded `"ForecastCtyCode" = 'F_BB'`, deterministic `"BblRuleSetItem"` from Neon `cpq_sampler_result.ruleset`, and bigint Unix-second `"CreatedAt"`/`"UpdatedAt"` values such as `1778151766`. QPart pushes use the QPart-only override (`BblRuleSetItem`, `ForecastCtyCode`, and `DetailId` = `Qpart`). `variant_eligibilities` receives `"Sku"`, `"CountryCode"`, `"DetailId"`, and `"IsActive"` from the current bike/QPart allocation state.

## Live Neon metadata source of truth

- Live schema intelligence exports are in `database-intelligence/` and should be treated as the primary runtime DB reference for performance/schema validation.
- Important: files in this repo currently use capitalized names (for example `Schema.csv`, `Constraints.csv`, `Indexes.csv`, `Table_sizes.csv`), and there is currently no `database-intelligence/README.md`.
- For Neon load analysis and optimization planning, use those CSV exports first, then reconcile with code.

## QPart image upload (v1)

- QPart detail page has compact **Take picture** (primary slot) and **Manage pictures** actions beside the QPart code (mobile camera-capable via `accept=image/*` + `capture=environment`). **Take picture** always writes/replaces the primary image at `image_index=0` (`is_primary=true`).
- Selected image is resized client-side (max dimension 1600px, aspect ratio preserved) and re-encoded as JPEG at quality 0.82 before upload.
- Upload target uses Vercel Blob public store with deterministic key: `qparts/<part_number>.jpg` and overwrite enabled (`allowOverwrite: true`, `addRandomSuffix: false`).
- Metadata is stored in Neon table `qpart_part_images` (one-to-many per part) with primary (`image_index=0`) and numbered secondary slots (`1..n`), plus blob URL/path, mime type, file size and timestamps.
- Required env: `BLOB_READ_WRITE_TOKEN` in Vercel/hosted environment.
- QPart detail header preview resolves from `blob_url` (public CDN URL): preferred `is_primary=true`, fallback lowest `image_index` (including reconciled legacy rows), fallback no image.
- On image API reads/deletes, the service reconciles Neon metadata with Blob keys under `qparts/<part_number>` for both `qparts/<part_number>.jpg` and `qparts/<part_number>_<n>.jpg`; legacy random-suffix files are also surfaced by hydrating missing Neon rows so **Manage pictures** can list and delete them.
- Delete flow is Blob-first (`@vercel/blob del` using `blob_url`), then Neon metadata delete, then UI refresh; deleting a current primary image automatically shifts display to the next preferred row via existing primary/lowest-index selection.

### QPart allocation Update all and BC filtering

`/sales/qpart-allocation` supports password-protected **Update all** bulk activate/deactivate from the centered bottom pagination control. By default, bulk actions keep the existing current-page behavior. When **Update all** is enabled with the server-side password (`QPART_UPDATE_ALL_PASSWORD`, default `Br0mpt0n2026!`), the backend rebuilds the full filtered QPart target set across all pages before updating the countries selected in the Territory filter.

The page also includes part-number, title, hierarchy, and `OK` / `NOK` BC status filters. These filters are applied server-side before pagination so row counts and page counts describe the filtered dataset; if a requested page is outside the filtered range, the page is safely clamped back to the first valid page. The same normalized filter criteria are reused by the backend Update all target rebuild; the Territory filter remains the single UI source for selected country columns and bulk country scope.

QPart external PostgreSQL pushes hardcode QPart-only external mappings (`BblRuleSetItem`, `ForecastCtyCode`, and `DetailId` = `Qpart`) so QPart pushes do not require a bike-style sampler ruleset. Bike allocation push behavior is unchanged.
