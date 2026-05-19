# Architecture (current implementation)

## 1) Application scope

This repository is a CPQ-focused Next.js app with operational setup, runtime configuration, sampler analytics, and sales allocation orchestration.

Primary routes:

- `/dashboard` (executive operations dashboard)
- `/cpq` (Bike Builder runtime)
- `/cpq/setup` (setup + picture management)
- `/cpq/results` (sampler matrix)
- `/cpq/process` (SOP content)
- `/cpq/ui-docs` (UI mapping table)
- `/sales/bike-allocation` (sales allocation matrix + launch-to-CPQ)
- `/sales/qpart-allocation` (sales territory matrix for QPart spare parts)

Aliases:

- `/` → `/cpq`
- `/bike-builder` → `/cpq`

## 2) Shell/navigation/auth model

- `app/layout.tsx` wraps pages in `AppShell`.
- `AppShell` provides brand header + nav + `AdminModeProvider`.
- Admin mode is client-side only (sessionStorage key `tp2-cpq-admin-mode`, password `Br0mpt0n`).
- Non-admin nav shows Process, Sales allocation, Bike Builder, Setup.
- Non-admin nav now also includes Dashboard.
- Admin nav additionally shows Sampler Results and UI Docs.

Important boundary: this is **not** server-enforced authentication/RBAC; it is UI visibility gating.

## 3) Page architecture

- `/cpq` → `components/cpq/bike-builder-page.tsx`
  - Start/Configure/Finalize lifecycle
  - canonical save/retrieve
  - sampler save
  - layered image preview
  - combination generation + bulk row-country execution
  - replay ingestion from sales launch context
- `/cpq/setup` → `components/setup/cpq-setup-page.tsx`
  - CRUD: account context/rulesets/country mappings
  - picture management editing
  - feature-level ignore + layer-order controls
  - sampler sync into `cpq_image_management`
- `/cpq/results` → `components/cpq/cpq-results-page.tsx` + client matrix component
- `/sales/bike-allocation` → server data loader + client matrix/toggle/bulk/replay launcher
- `/sales/qpart-allocation` → server data loader + client matrix/toggle/bulk controls for QPart active/inactive by country
- `/dashboard` → `lib/dashboard/service.ts` + `components/dashboard/dashboard-page.tsx`
  - Aggregates server-side data from sampler/config setup tables into KPI cards, territory map, stacked coverage bars, heatmap, picture completeness chart, actionable gap list, and ranked leaderboards.
  - Drill-down links route to `/sales/bike-allocation` and `/cpq/setup` with query-param context.
  - Page is explicitly dynamic and sales mutation routes revalidate `/sales/bike-allocation` to avoid stale server-component cache after Active/Inactive writes.
- `/cpq/process` and `/cpq/ui-docs` are static-ish client-doc pages.

## 4) API architecture

### CPQ runtime routes

- `POST /api/cpq/init`
- `POST /api/cpq/configure`
- `POST /api/cpq/finalize`
- `POST /api/cpq/retrieve-configuration`

### CPQ persistence/setup routes

- `POST/GET /api/cpq/configuration-references`
- `POST /api/cpq/sampler-result`
- `POST /api/cpq/image-layers`
- `GET/POST/PUT/DELETE /api/cpq/setup/account-context*`
- `GET/POST/PUT/DELETE /api/cpq/setup/country-mappings*`
- `GET/POST/PUT/DELETE /api/cpq/setup/rulesets*`
- `GET/PUT/POST /api/cpq/setup/picture-management*`

### Sales routes

- `POST /api/sales/bike-allocation/toggle`
- `POST /api/sales/bike-allocation/bulk-update`
- `POST /api/sales/bike-allocation/launch-context`
  - Toggle/bulk routes revalidate `/sales/bike-allocation` so App Router refresh picks up latest Neon state.
- `POST /api/sales/qpart-allocation/toggle`
- `POST /api/sales/qpart-allocation/bulk-update`
  - Toggle/bulk routes revalidate `/sales/qpart-allocation` after writes.

## 5) Data boundaries

- `cpq_configuration_references` = canonical saved configuration registry for retrieve.
- `CPQ_sampler_result` = support snapshots + sales allocation status source (`active`).
- `CPQ_setup_account_context`, `cpq_country_mappings`, `CPQ_setup_ruleset` = setup/master tables.
- `cpq_image_management` = layered preview mapping + feature-level bulk-ignore and layer order.
- `qpart_country_allocation` = canonical QPart sales territory allocation state (`active=true|false`) with one row per `(part_id, country_code)`.
- Bike-type source of truth used by dashboard and sales deep-links: `CPQ_setup_ruleset.cpq_ruleset -> CPQ_setup_ruleset.bike_type`.

## 6) Feature flags/runtime switches

- `NEXT_PUBLIC_CPQ_DEBUG=true`: client debug timeline capture in `/cpq` (still admin-visible only).
- `CPQ_USE_MOCK=true`: mock responses for init/configure routes.

## 7) Known constraints

- UI admin mode is not security.
- `/cpq/results` can be opened directly by URL even when admin tab is hidden.
- `/cpq/ui-docs` route renders for all users, but its component content gates detailed table to admin mode.

## External PostgreSQL variant push

- Sales allocation Push routes do not write to external `cpq_sampler_result` anymore. Neon `CPQ_sampler_result` remains the internal sampler/allocation table.
- External push targets are `variants` first, then `variant_eligibilities`, both under `EXTERNAL_PG_SCHEMA`. The order is required because eligibility rows depend on the SKU existing in `variants`.
- Push is skipped unless Neon `bc_item_variant_map` has both `bc_product_id` and `bc_variant_id` for the SKU. The Sales bike and QPart UIs hide Push when those IDs are missing.
- The external write path does not use `ON CONFLICT` and does not require unique indexes. It SELECTs by `"Sku"` for `variants` and by (`"Sku"`, `"CountryCode"`) for `variant_eligibilities`, then UPDATEs or INSERTs.
- `variants."BcVariantId"` and `variants."BcProductId"` are looked up from Neon `bc_item_variant_map`; `"ForecastCtyCode"` is temporarily hardcoded to `F_BB`; `"BblRuleSetItem"` is resolved deterministically from Neon `cpq_sampler_result.ruleset`; bigint timestamps are Unix seconds.
- BigCommerce item-map upserts only update Neon `bc_item_variant_map`; they no longer perform a background external variants push.

## 8) CPQ context invariants

- One authoritative active CPQ context is maintained in `/cpq` state with owner + accountCode + countryCode + ruleset + sessionId (+ ids).
- Bike Builder setup loading filters out blank account codes and blocks session actions until a valid account code is selected.
- `init` context is driven by current UI `accountCode` + `ruleset` (including replay launch from sales), and init requests are sequenced so stale responses cannot win.
- Replay launch sequence is: apply UI account/ruleset → run init in that context → accept only latest init result → replay configure steps on that session → finalize/save in same context/session lineage.
- Finalize always reads session id from the authoritative active context (never stale/default/previous session refs).
- `CPQ_sampler_result.active` remains canonical for Sales Active/Inactive rendering.

## 9) QPart module architecture (isolated)

- Domain entry route: `/qpart` with child pages `/qpart/parts`, `/qpart/hierarchy`, `/qpart/metadata`, `/qpart/compatibility`.
- API namespace: `/api/qpart/*` only.
- Domain services: `lib/qpart/locales`, `lib/qpart/hierarchy`, `lib/qpart/metadata`, `lib/qpart/parts`, `lib/qpart/parts/csv-service`, `lib/qpart/compatibility`.
- Types: `types/qpart.ts`.

- QPart AI translation endpoint: `POST /api/qpart/translations/field` (server-only OpenAI call, field-by-field translation for core title/description plus translatable metadata, fill-missing by default).
- QPart CSV endpoints: `GET /api/qpart/parts/export` and `POST /api/qpart/parts/import` (supports dry-run summary + apply upsert by `part_number`).
- CSV contract is intentionally flat while writes remain normalized across qpart core/translation/metadata/compatibility tables.
- Isolation rule implemented: QPart only reads CPQ setup/sampler tables for dynamic reference data (locales, bike types, compatibility derivation). It does not hook into CPQ configure/finalize/runtime flows.

QPart source-of-truth reads from CPQ tables:

- locales: `CPQ_setup_account_context.language`
- bike types: `CPQ_setup_ruleset.bike_type`
- sampler compatibility candidates: `CPQ_sampler_result.json_result`
- country list for QPart allocation: active `cpq_country_mappings.country_code`

QPart sales allocation behavior:

- no “Not configured” state; only Active/Inactive cells are rendered.
- matrix completeness is enforced by a sync helper that inserts missing `(part_id, country_code)` rows before load and before mutations.
- new part creation seeds default inactive rows across all active countries.

## 10) QPart AI translation (field scoped)

- Triggered inline from `/qpart/parts/new` + `/qpart/parts/[id]` on English title, English description, and each translatable metadata field.
- Server path only: browser calls QPart API route, route calls OpenAI with `OPENAI_API_KEY`; no key in client bundle.
- Locale targets are always derived from `CPQ_setup_account_context.language` via `/api/qpart/locales`.
- Base locale value is source-of-truth and is never replaced by AI output.
- Save policy currently uses fill-missing behavior (existing non-empty locale translations are skipped by default).
- Model default: `gpt-5.4-mini`, override with `OPENAI_TRANSLATION_MODEL`.

## 11) Admin data-contract observability

- New internal route: `/admin/data-point` (admin mode nav only).
- Purpose: browse page-by-page UI data points with source/read/write/process annotations.
- Backed by structured registry in `lib/admin/data-point-registry.ts` and rendered by `components/admin/data-point-page.tsx`.

## 2026-04-29 Performance pass

- Added server-side pagination for `/sales/bike-allocation` and `/cpq/results`.
- Added low-churn filter-option caching (5-minute in-process TTL) for those pages.
- Added debounced/min-length `sku_code` search gating on `/cpq/results`.

## Pagination updates (2026-04-29)

- Sales Bike Allocation uses server page size 100 and now renders page-number pagination below the table.
- Sales QPart Allocation now uses server-side pagination on part rows with default page size 200 and below-table page-number pagination.
- QPart Parts list now uses server-side pagination with default page size 200 and below-table pagination controls.

## QPart image upload (v1)

- QPart detail page has compact **Take picture** (primary slot) and **Manage pictures** actions beside the QPart code (mobile camera-capable via `accept=image/*` + `capture=environment`). **Take picture** always writes/replaces the primary image at `image_index=0` (`is_primary=true`).
- Selected image is resized client-side (max dimension 1600px, aspect ratio preserved) and re-encoded as JPEG at quality 0.82 before upload.
- Upload target uses Vercel Blob public store with deterministic key: `qparts/<part_number>.jpg` and overwrite enabled (`allowOverwrite: true`, `addRandomSuffix: false`).
- Metadata is stored in Neon table `qpart_part_images` (one-to-many per part) with primary (`image_index=0`) and numbered secondary slots (`1..n`), plus blob URL/path, mime type, file size and timestamps.
- Required env: `BLOB_READ_WRITE_TOKEN` in Vercel/hosted environment.
- QPart detail header preview resolves from `blob_url` (public CDN URL): preferred `is_primary=true`, fallback lowest `image_index` (including reconciled legacy rows), fallback no image.
- On image API reads/deletes, the service reconciles Neon metadata with Blob keys under `qparts/<part_number>` for both `qparts/<part_number>.jpg` and `qparts/<part_number>_<n>.jpg`; legacy random-suffix files are also surfaced by hydrating missing Neon rows so **Manage pictures** can list and delete them.
- Delete flow is Blob-first (`@vercel/blob del` using `blob_url`), then Neon metadata delete, then UI refresh; deleting a current primary image automatically shifts display to the next preferred row via existing primary/lowest-index selection.

## QPart allocation controls

`/sales/qpart-allocation` keeps the existing per-row toggle, per-row external push, and pagination flows, and adds a server-verified **Update all** bulk mode controlled from the bottom pagination area. The Territory filter is the single UI source for selected country columns and bulk country scope. The client only sends full-filter criteria when Update all is enabled; the API validates the HttpOnly update-all cookie, rebuilds the filtered QPart dataset on the server, and then updates the selected country allocation cells.

QPart external PostgreSQL pushes are page-specific: the QPart route passes `Qpart` for ruleset, forecast country code, and detail id overrides to the shared external variant-table writer. Bike allocation does not pass these overrides and therefore keeps its existing sampler ruleset resolution behavior.

## Sales external status refresh architecture

The Sales allocation pages separate internal allocation reads from external PostgreSQL status awareness. Initial page render for `/sales/bike-allocation` and `/sales/qpart-allocation` remains internal-data-only. A manual **Refresh external status** action calls:

- `POST /api/sales/bike-allocation/external-status`
- `POST /api/sales/qpart-allocation/external-status`

Each route rebuilds the current filtered dataset on the server, expands it to eligible SKU/country pairs across every matching pagination page, then calls the shared external `variant_eligibilities` status lookup. This avoids external PostgreSQL traffic on normal page opens and prevents N+1 button/cell queries.

The lookup reads (`"Sku"`, `"CountryCode"`, `"IsActive"`) from `${EXTERNAL_PG_SCHEMA}.variant_eligibilities` in JSON-recordset batches with SQL parameters. The client stores the returned status map for button rendering only; push routes and push payload logic are unchanged.

## Sales allocation integrated external sync

The allocation pages use a server-side integration layer (`lib/sales/allocation-external-sync.ts`) to keep the internal allocation write path separate from the existing external PostgreSQL variant-table writer.

- Bike internal source: `CPQ_sampler_result.active`.
- QPart internal source: `qpart_country_allocation.active`.
- BC gate source: latest Neon `bc_item_variant_map` row by SKU; external writes require `bc_status = OK` and both BC IDs.
- External target order remains `variants` first, then `variant_eligibilities`.

The integration layer returns a non-throwing sync result for allocation mutations so a successful Neon update is not undone by BC pending state or an external PostgreSQL error. Bulk routes summarize pushed, pending-BC, and error counts for the UI.

## Batched allocation external sync architecture

The integrated allocation sync for `/sales/bike-allocation` and `/sales/qpart-allocation` now has separate single-row and bulk execution paths. Single-row actions keep the straightforward BC-gated writer. Bulk actions use `lib/sales/allocation-external-sync.ts` to normalize targets, batch Neon reads, and call `lib/external-pg/variant-tables.ts` once for the external batch.

Bulk architecture details:

- Neon BC gate: unique SKUs are loaded from `bc_item_variant_map` in one query and evaluated in memory.
- Bike ruleset lookup: unique SKUs are loaded from `cpq_sampler_result` in one deterministic grouped/ranked query. QPart uses the fixed `Qpart` override and bypasses sampler ruleset lookup.
- External connection lifecycle: one external PostgreSQL client is opened for the bulk operation and reused for batched existence reads plus writes.
- External existence checks: `variants` is checked by SKU and `variant_eligibilities` by SKU/country using JSONB recordsets, chunked at 1,000 requested keys.
- External writes: UPDATE/INSERT remains SELECT-first rather than `ON CONFLICT`; writes are bounded by `EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY` (default `5`) to avoid unbounded `Promise.all` pressure.
- Observability: bulk stages log timing for target collection, BC map load, ruleset map load where applicable, external batch sync, and completion; external client/query stages are also logged through the existing stage callback.

## Auth and permission foundation (May 19, 2026)
User management, local login/session foundation, and per-page permissions were added. See `docs/AUTH_AND_PERMISSIONS.md` and migration `sql/migrations/2026-05-19_app_auth_permissions.sql`.
