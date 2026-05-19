# Process data and flow contracts

## 1) `/cpq` manual lifecycle

1. StartConfiguration: `POST /api/cpq/init`
2. Configure (0..n): `POST /api/cpq/configure`
3. Finalize: `POST /api/cpq/finalize`
4. Canonical save: `POST /api/cpq/configuration-references`
5. Auto sampler save: `POST /api/cpq/sampler-result`
6. Optional retrieve by reference: `POST /api/cpq/retrieve-configuration`

### Critical save-source rule

Canonical `json_snapshot` and sampler payload source are:

- latest Configure snapshot, else
- latest Start snapshot,
- never Finalize response body.

## 2) `/cpq` bulk combination flow

- Generate cartesian combinations from visible, selectable feature options.
- User selects rows + assigns one/many countries per row.
- Validation blocks run if any selected row has zero countries.
- Execution unit is row-country pair:
  1. fresh init,
  2. feature remap,
  3. option remap within mapped feature,
  4. configure steps (skip ignored features / already selected options),
  5. finalize,
  6. canonical save,
  7. sampler save.
- Row status + failure diagnostics are persisted client-side for inspection.

## 3) Picture-management workflow (`/cpq/setup`)

- Sync step scans unprocessed sampler rows, extracts `json_result.selectedOptions`, inserts missing mapping rows.
- Feature-level controls:
  - `ignore_during_configure`
  - `feature_layer_order` (`1..20`, 1 = top visual layer)
- Option-level modal edits links `picture_link_1..4` and `is_active`.

## 4) Layered preview flow (`/cpq`)

- Current selected options are posted to `/api/cpq/image-layers`.
- Resolver matches exact `(featureLabel, optionLabel, optionValue)` against active `cpq_image_management` rows.
- Returned links are rendered with layer order and downloadable as merged client PNG.

## 5) Sales allocation workflow (`/sales/bike-allocation`)

### Status matrix

- Data source: grouped `CPQ_sampler_result` rows by `ruleset + ipn_code + country_code`.
- Optional route filters: `ruleset`, `country_code`, `bike_type` (bike type resolves to one-or-many rulesets via `CPQ_setup_ruleset`).
- Status logic:
  - any `active=true` → Active
  - rows exist but all inactive → Inactive
  - no rows → Not configured

### User actions

- Click Active/Inactive cell → toggle `CPQ_sampler_result.active` via `/api/sales/bike-allocation/toggle`.
- Bulk activate/deactivate visible IPNs across selected countries via `/api/sales/bike-allocation/bulk-update`.
- Click Not configured → resolve launch context (`/api/sales/bike-allocation/launch-context`) then navigate to `/cpq` with replay token.
- Toggle and bulk routes call `revalidatePath('/sales/bike-allocation')`, and the client table issues `router.refresh()` so status repaint is immediate and sourced from fresh server data.

## 8) Dashboard workflow (`/dashboard`)

- Server aggregation in `lib/dashboard/service.ts` combines:
  - `CPQ_sampler_result` (active/inactive configuration counts),
  - `CPQ_setup_ruleset` (ruleset-to-bike-type mapping),
  - `cpq_country_mappings` (territory metadata for map placement),
  - `cpq_image_management` (picture completeness by feature).
- Heatmap scoring contract:
  - **none**: no rows for country+bike type,
  - **weak**: rows exist but all inactive,
  - **mixed**: both active and inactive rows exist,
  - **strong**: rows exist and all are active.
- Picture completeness contract:
  - configured = any of `picture_link_1..4` contains a non-empty value,
  - missing = all four links blank.
- Drill-down contract:
  - territory clicks navigate to `/sales/bike-allocation?country_code=<ISO2>`,
  - bike-type clicks navigate to `/sales/bike-allocation?bike_type=<type>`,
  - country+bike-type cells navigate to both filters,
  - picture gaps navigate to `/cpq/setup?tab=pictures&feature=<feature>&onlyMissingPicture=true`.

### Replay handoff

- Sales page stores replay payload in `sessionStorage` key `tp2-cpq-launch-replay:<token>`.
- `/cpq` reads token payload, applies account/ruleset in UI, verifies those UI values are applied, then runs init with those live values.
- Replay launch owns CPQ context while it runs; default auto-init is prevented from taking over during this phase.
- Init requests use a sequence id, and only the latest init response is accepted as authoritative context/session; stale init responses are ignored.
- After init completes, `/cpq` replays options from `json_result.selectedOptions` (fallback `dropdownOrderSnapshot`) through existing configure/remap logic.
- Configure/finalize/save all use the same authoritative context session (sessionId + accountCode + ruleset) established by the accepted init.

## 5.1) `/cpq` init refresh contract

- Any account code change in UI triggers a fresh `POST /api/cpq/init`.
- Any ruleset change in UI triggers a fresh `POST /api/cpq/init`.
- Replay launch path explicitly starts init after UI account/ruleset sync to prevent stale default context leakage.
- If multiple init requests are in flight, stale responses are dropped and cannot overwrite active session state.

## 6) Access/visibility model

- Admin mode is a UI gate (sessionStorage + static password), not server auth.
- Some capabilities are hidden in navigation unless admin mode is on.
- `/cpq/ui-docs` content itself is admin-gated in component render.

## 7) Runtime toggles

- `NEXT_PUBLIC_CPQ_DEBUG=true`: debug timeline capture in `/cpq`.
- `CPQ_USE_MOCK=true`: mock CPQ init/configure responses in API routes.

## 9) QPart spare-parts PIM flow (`/qpart`)

### Module boundaries

- QPart has no write path into CPQ runtime/setup tables.
- QPart writes only to `qpart_*` tables and reads CPQ tables for reference derivation.

### Part management flow

1. `/qpart/parts` lists part records with search + hierarchy filters.
2. `/qpart/parts/new` and `/qpart/parts/[id]` persist:
   - core part fields (`qpart_parts`),
   - hierarchy assignment (`qpart_parts.hierarchy_node_id`),
   - metadata values (`qpart_part_metadata_values`),
   - locale translations (`qpart_part_translations`),
   - bike type assignment (`qpart_part_bike_type_compatibility`),
   - compatibility conditions (`qpart_part_compatibility_rules`).

### Dynamic locale flow

- Locale list is read from distinct `CPQ_setup_account_context.language` via `/api/qpart/locales`.
- Base locale preference: `en-GB`, else first `en-*`, else first available locale.

### Compatibility derivation flow

1. User selects bike types.
2. QPart resolves related rulesets using `CPQ_setup_ruleset`.
3. QPart reads `CPQ_sampler_result` rows for those rulesets.
4. QPart parses `json_result`:
   - primary: `selectedOptions[].featureLabel + optionValue (+ optionLabel)`
   - fallback: `dropdownOrderSnapshot`
5. QPart unions derived values with active `qpart_compatibility_reference_values`.

### Field-by-field metadata AI translation flow

1. User clicks **Translate** on one translatable metadata field in QPart part edit/create UI.
2. Backend resolves dynamic locales from `CPQ_setup_account_context.language` and excludes base locale.
3. Backend builds Brompton spare-part translation prompt with part number, hierarchy L1..L7 context, field key/label, and technical-token preservation rules.
4. Backend calls OpenAI (`gpt-5.4-mini` by default) and validates structured JSON output.
5. Backend upserts translated locale rows into `qpart_part_metadata_values` for missing locales only (default safety behavior).
6. UI refreshes field-level locale values/status (`x/y translated`) without expanding all locale inputs by default.

Future compatibility note: this design allows adding a bulk "new locale backfill" workflow later without changing table design.

## Admin process-audit page

- Route: `/admin/data-point` (admin-mode visibility).
- Process role: static+curated contract index connecting page UI controls to source table/service and write APIs.
- Primary maintenance rule: update registry entries when page controls, APIs, or data ownership changes.

## QPart image upload (v1)

- QPart detail page has compact **Take picture** (primary slot) and **Manage pictures** actions beside the QPart code (mobile camera-capable via `accept=image/*` + `capture=environment`). **Take picture** always writes/replaces the primary image at `image_index=0` (`is_primary=true`).
- Selected image is resized client-side (max dimension 1600px, aspect ratio preserved) and re-encoded as JPEG at quality 0.82 before upload.
- Upload target uses Vercel Blob public store with deterministic key: `qparts/<part_number>.jpg` and overwrite enabled (`allowOverwrite: true`, `addRandomSuffix: false`).
- Metadata is stored in Neon table `qpart_part_images` (one-to-many per part) with primary (`image_index=0`) and numbered secondary slots (`1..n`), plus blob URL/path, mime type, file size and timestamps.
- Required env: `BLOB_READ_WRITE_TOKEN` in Vercel/hosted environment.
- QPart detail header preview resolves from `blob_url` (public CDN URL): preferred `is_primary=true`, fallback lowest `image_index` (including reconciled legacy rows), fallback no image.
- On image API reads/deletes, the service reconciles Neon metadata with Blob keys under `qparts/<part_number>` for both `qparts/<part_number>.jpg` and `qparts/<part_number>_<n>.jpg`; legacy random-suffix files are also surfaced by hydrating missing Neon rows so **Manage pictures** can list and delete them.
- Delete flow is Blob-first (`@vercel/blob del` using `blob_url`), then Neon metadata delete, then UI refresh; deleting a current primary image automatically shifts display to the next preferred row via existing primary/lowest-index selection.

## External PostgreSQL push process

- Bike and QPart Push actions build their source payloads from Neon first and continue to rely on Neon `CPQ_sampler_result` / `qpart_country_allocation` for internal state.
- The old external `cpq_sampler_result` push process has been removed from active usage. Neon `CPQ_sampler_result` remains unchanged internally.
- The external write targets are `${EXTERNAL_PG_SCHEMA}.variants` first and `${EXTERNAL_PG_SCHEMA}.variant_eligibilities` second.
- Before any external write, the SKU must have both `bc_product_id` and `bc_variant_id` in Neon `bc_item_variant_map`. Missing IDs return a skipped API result and no external write.
- The current process uses SELECT-first UPDATE/INSERT logic rather than `ON CONFLICT`, so unique indexes are not a prerequisite.
- Bike `variants` receives BC IDs from Neon, `ForecastCtyCode = F_BB`, `BblRuleSetItem` from Neon `cpq_sampler_result.ruleset`, and Unix-second bigint timestamps. QPart allocation pushes override `ForecastCtyCode`, `BblRuleSetItem`, and `DetailId` to `Qpart`.
- `variant_eligibilities` receives SKU/country/detail ID plus `IsActive` from the current allocation row being pushed, not from country mapping metadata.
- Push buttons are hidden in the Sales bike and QPart allocation tables unless the row SKU/part number has both BigCommerce IDs available in Neon.

## QPart allocation filtered bulk updates

The `/sales/qpart-allocation` page supports two bulk-update modes:

1. **Current page** — default behavior. Bulk activate/deactivate sends the currently loaded, client-visible part ids and selected countries to the API.
2. **Update all** — password-protected behavior. After the operator enables **Update all** from the centered bottom pagination control, bulk activate/deactivate sends the current filter criteria to the backend. The backend rebuilds the matching QPart part set across all pages and applies the update only to those filtered rows and countries selected in the Territory filter.

The backend filter criteria includes territory/country scope, part-number search, title search, hierarchy selections, metadata selections, and the QPart BC status filter. This avoids requiring the browser to load every page before applying a full filtered update.

The **Update all** switch is protected by the `QPART_UPDATE_ALL_PASSWORD` server-side setting. The default operational password is `Br0mpt0n2026!`; set the environment variable in deployed environments to keep the comparison server-side.

## QPart BC status filter

The QPart allocation table includes a compact **BC status** segmented filter with `OK` and `NOK` options. The filter works with the existing territory, part, hierarchy, and metadata filters and is included in the backend filter rebuild used by password-protected Update all bulk operations.

## Sales allocation external status refresh

The Push/Update button status on `/sales/bike-allocation` and `/sales/qpart-allocation` is display-only awareness from external PostgreSQL. Users click **Refresh external status** when they want the current filtered view to reflect whether external `variant_eligibilities` rows already exist.

Refresh flow:

1. Client sends the current filter context to the page-specific `external-status` API route.
2. Backend rebuilds the full filtered dataset, including rows on all matching pagination pages.
3. Backend gathers eligible (`Sku`, `CountryCode`) pairs.
4. Backend batch-queries external `${EXTERNAL_PG_SCHEMA}.variant_eligibilities` for `"Sku"`, `"CountryCode"`, and `"IsActive"`.
5. Client updates button labels/colors only.

Button meanings:

- grey **Push**: not refreshed yet, or no external `variant_eligibilities` row exists for the SKU/country.
- green **Update**: an external row exists and `"IsActive" = true`.
- orange **Update**: an external row exists and `"IsActive" = false`.

Clicking the button still runs the existing single-cell push/update process. The status refresh does not write external data.

## Sales allocation integrated push process (2026-05)

Old operational model: operators first toggled Active/Inactive in Neon, then separately clicked Push/Update to sync the external PostgreSQL `variants` and `variant_eligibilities` tables when BC status allowed it.

New operational model for `/sales/bike-allocation` and `/sales/qpart-allocation`:

1. **Single-cell Active/Inactive** updates the internal allocation state first.
2. The server checks the latest `bc_item_variant_map` status for the SKU.
3. If BC is **OK** and both BigCommerce IDs exist, the existing external PostgreSQL row push runs immediately.
4. If BC is not OK, the external push is skipped and the cell is shown as **Pending BC**.
5. If the external PostgreSQL write fails, the internal state remains saved and the cell is shown as **Error**.

Bulk activate and bulk deactivate apply the same sequence to every row/country in scope. The new **Push all BC OK** bulk action only performs step 2 onward; it does not change Active/Inactive state.

QPart scope is controlled by the Territory filter and the current-page vs password-protected Update-all mode. Bike scope remains the current page/client-filtered rows plus selected bulk countries.

## Allocation to external PostgreSQL bulk process

The Sales bike and QPart allocation bulk process now batches the expensive lookup and external sync stages while preserving the existing business sequence. Bulk activate/deactivate first updates Neon allocation state, then the external sync helper collects unique SKU/country targets from the current page or filtered Update-all scope.

For all bulk operations, the helper reads latest BC status and BC IDs from Neon `bc_item_variant_map` once for the unique SKU set. Bike allocation also reads deterministic latest `cpq_sampler_result.ruleset` values once for the unique SKU set; QPart allocation never reads sampler rulesets for external mapping and continues to send `Qpart` for `BblRuleSetItem`, `ForecastCtyCode`, and `DetailId`.

The external writer reuses one PostgreSQL client for the batch. It batches SELECT-first existence checks for `variants` and `variant_eligibilities`, then writes rows with the configured bounded concurrency (`EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY`, default `5`). `ON CONFLICT` is still avoided because the external PostgreSQL target may not enforce the unique indexes that would make conflict handling safe.

Operational constraints remain: external writes are still row-level UPDATE/INSERT operations after the batched existence reads, the mandatory table order remains `variants` before `variant_eligibilities`, and external failures do not roll back already completed Neon allocation changes.

## Auth and permission foundation (May 19, 2026)
User management, local login/session foundation, and per-page permissions were added. See `docs/AUTH_AND_PERMISSIONS.md` and migration `sql/migrations/2026-05-19_app_auth_permissions.sql`.

## 10) Auth setup + login verification flow (temporary phase)

- Setup user creation/testing route is available at `/setup/users` while global lock is disabled.
- Login verification route is `/login` with a built-in **Test current login** action calling `/api/auth/me`.
- Main header shows current auth status (`Login` link when logged out, `👤` menu + logout when logged in).
- This is transitional and designed for safe auth/session validation before global enforcement middleware is added.

## Permission enforcement update (2026-05-19)
Bike and QPart allocation pages now enforce page permissions directly (without global app lock): read required for page data access, edit required for mutation/sync actions. Server APIs return 403 for insufficient permissions.


### Allocation audit behavior
- Allocation Active/Inactive changes now write audit rows into `app_allocation_audit_log` for bike and qpart single/bulk toggles.
- Bulk actions create one audit row per changed item/country only.
- Allocation audit rows also persist `bigcommerce_status` using already-loaded/cached BC map data (`bc_item_variant_map`) where available; if unavailable, audit stores `null` (or `UNKNOWN` if explicitly provided by upstream status data).
- Bulk audit logging must not do one BigCommerce API call per row just to populate audit status.
