# tp2-cpq-app

Next.js CPQ operations app for bike configuration, setup management, sampler analytics, and sales allocation handoff.

Release process smoke-test note: this README-only update is intended to validate the GitHub-to-Vercel deployment flow. Re-run marker: 2026-06-02 release pipeline retry.

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
  - Active/Inactive now updates Neon `CPQ_sampler_result.active` and then automatically pushes external PostgreSQL `variants` and `variant_eligibilities` when BC status is OK. The cell also shows a compact external sync state (`Pushed`, `Pending BC`, `Error`, `Unknown`, or `Out of sync`), and **Push all BC OK** retries eligible current-scope rows.
  - Supports route filters `country_code`, `ruleset`, and `bike_type` for deep-link drill-down from dashboard views.
  - Toggle/bulk mutations revalidate + refresh the route so UI status updates immediately from `CPQ_sampler_result.active`.
- `/sales/qpart-allocation` → sales territory allocation matrix for QPart spare parts.
  - Active/Inactive now updates Neon `qpart_country_allocation.active` and then automatically pushes external PostgreSQL `variants` and `variant_eligibilities` when BC status is OK. The cell also shows a compact external sync state (`Pushed`, `Pending BC`, `Error`, `Unknown`, or `Out of sync`), and **Push all BC OK** retries eligible rows in current-page or Update-all filtered scope.
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


## Environment variables

See `docs/ENVIRONMENT_VARIABLES.md` and `.env.example` for the canonical code-derived environment variable inventory, safe placeholder values, expected Vercel values checklist, and screenshot-only variable findings.

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

The integrated allocation push on `/sales/bike-allocation` and `/sales/qpart-allocation` writes server-side to external PostgreSQL `variants` first and `variant_eligibilities` second after the internal Active/Inactive update succeeds and BC status is OK. The manual per-cell sync pill and **Push all BC OK** reuse the same writer. The old external `cpq_sampler_result` push is removed from active usage; Neon `CPQ_sampler_result` remains in use internally for sampler persistence and bike allocation state.

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

### Manual external status refresh

The Sales bike and QPart allocation pages do **not** query external PostgreSQL automatically on page load. Operators can click **Refresh external status** when they need display awareness for the current filters. The refresh rebuilds the complete filtered allocation dataset on the backend and checks every eligible (`Sku`, `CountryCode`) pair across all filtered pages, not just the visible page or the currently rendered rows.

The refresh reads only `${EXTERNAL_PG_SCHEMA}.variant_eligibilities` columns `"Sku"`, `"CountryCode"`, and `"IsActive"` using batched, parameterized lookups. Button display rules after refresh are:

- no refresh yet, or no external match: grey **Push**
- external row exists with `"IsActive" = true`: green **Update**
- external row exists with `"IsActive" = false`: orange **Update**

The external sync pill uses the same row push API/action as the integrated Active/Inactive workflow; its label reports `Pushed`, `Pending BC`, `Error`, `Unknown`, or `Out of sync` rather than hiding the internal Active/Inactive state. Operationally, (`"Sku"`, `"CountryCode"`) should be unique in `variant_eligibilities` even if the database has not enforced that with an index yet. A quick external check is:

```sql
select "Sku", "CountryCode", count(*)
from public.variant_eligibilities
group by "Sku", "CountryCode"
having count(*) > 1
order by count(*) desc, "Sku", "CountryCode";
```


Push is allowed only when Neon `bc_item_variant_map` has `bc_status = 'OK'` plus both `bc_product_id` and `bc_variant_id` for the SKU. If either ID is missing, the API returns a skipped result and writes nothing externally; the Sales UIs hide Push for rows that do not meet this precondition.

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

`/sales/qpart-allocation` supports password-protected **Update all** bulk activate/deactivate and **Push all BC OK** from the centered bottom pagination control. By default, bulk actions keep the existing current-page behavior. When **Update all** is enabled with the server-side password (`QPART_UPDATE_ALL_PASSWORD`, default `Br0mpt0n2026!`), the backend rebuilds the full filtered QPart target set across all pages before updating the countries selected in the Territory filter.

The page also includes part-number, title, hierarchy, and `OK` / `NOK` BC status filters. These filters are applied server-side before pagination so row counts and page counts describe the filtered dataset; if a requested page is outside the filtered range, the page is safely clamped back to the first valid page. The same normalized filter criteria are reused by the backend Update all target rebuild and the Push all BC OK target rebuild; the Territory filter remains the single UI source for selected country columns and bulk country scope.

QPart external PostgreSQL pushes hardcode QPart-only external mappings (`BblRuleSetItem`, `ForecastCtyCode`, and `DetailId` = `Qpart`) so QPart pushes do not require a bike-style sampler ruleset. Bike allocation uses the same integrated BC-gated push sequence without QPart overrides.


### Integrated allocation push and Pending BC

The old allocation handoff was operationally two steps: set Active/Inactive in Neon, then manually Push/Update to external PostgreSQL. The current behavior integrates those steps safely. A single-cell or bulk Active/Inactive action first saves the internal Neon state, then checks the latest `bc_item_variant_map` row. If BC status is `OK` and the BC product/variant IDs are present, the app runs the existing external PostgreSQL variant-table push. If BC is `NOK`, `ERR`, `DISABLED`, unknown, or IDs are missing, the external write is skipped and the UI shows **Pending BC**.

The cell status is now two-level: the main availability pill remains **Active** or **Inactive** (bike rows can still be **Not configured**), while the adjacent external sync pill shows **Pushed**, **Pending BC**, **Error**, **Unknown**, or **Out of sync**. **Push all BC OK** retries external sync for eligible rows without changing allocation state. On QPart allocation it respects current-page vs password-protected Update-all filtered scope; on bike allocation it respects the current page/client filters and selected bulk country columns.

### Bulk allocation external sync performance

Bulk Active/Inactive and **Push all BC OK** on `/sales/bike-allocation` and `/sales/qpart-allocation` now use an optimized bulk external-sync path. The internal Neon allocation update still happens first, and the BC gate is unchanged: external PostgreSQL writes happen only when the latest `bc_item_variant_map` row has `bc_status = 'OK'` plus both BC IDs.

The optimized path batches Neon BC-ID lookups by unique SKU, batches bike ruleset lookup by unique SKU, reuses one external PostgreSQL connection per bulk operation, batches SELECT-first existence checks for `variants` and `variant_eligibilities`, and writes with bounded concurrency (`EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY`, default `5`). `ON CONFLICT` is still not used because the external target database may not enforce the unique indexes required for safe conflict handling.

## Auth and permission foundation (May 19, 2026)
User management, local login/session foundation, and per-page permissions were added. See `docs/AUTH_AND_PERMISSIONS.md` and migration `sql/migrations/2026-05-19_app_auth_permissions.sql`.

## Auth quick test (current transition phase)

- Create/update users at `/setup/users`.
- Login at `/login`.
- Use **Test current login** on `/login` to verify `/api/auth/me` session resolution.
- Use header `👤` menu to confirm logged-in identity and run logout.
- Global route-level login enforcement is intentionally not active yet.

- 2026-05-19: Added auth session refresh fixes and direct permission enforcement for Bike/QPart allocation pages and APIs (no global lock yet).


### Allocation audit
- Active/Inactive status changes on Sales Bike Allocation and Sales QPart Allocation are written to `app_allocation_audit_log` with before/after values and actor metadata.

- `/sales/allocation-audit` → read-only audit history lookup by item code (bike IPN/SKU or QPart code), with permission key `sales.allocation_audit`.


## Dashboard (May 2026 operational rebuild)
- `/dashboard` now focuses on bike allocation health, qpart allocation health, last-24h allocation audit activity, and compact operational gap cards.
- Filters: region, sub-region, country, bike type, qpart hierarchy L1, BC status (OK/NOK/all), active status (active/inactive/all).
- Data is aggregated server-side in `lib/dashboard/service.ts` using explicit column selects and grouped SQL.
- Bike sources: `CPQ_sampler_result` + `CPQ_setup_ruleset` + `cpq_country_mappings` + latest `bc_item_variant_map` per SKU.
- QPart sources: `qpart_country_allocation` + `qpart_parts` + `qpart_hierarchy_nodes` + `cpq_country_mappings` + latest `bc_item_variant_map` per part number.
- Recent activity source: `app_allocation_audit_log` (last 24 hours).
- Old map/heatmap/picture-completeness dashboard visuals were removed from `/dashboard` and replaced with compact operational sections.
