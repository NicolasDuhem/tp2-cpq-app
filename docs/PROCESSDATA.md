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
- Ignore decision source: `/api/cpq/setup/picture-management` rows (`cpq_image_management`). During configure loop, rows are matched by normalized `(feature_label, option_label, option_value)` against selected `(featureLabel, optionLabel, optionValue)`.
- Ignore semantics are strict: only `ignore_during_configure = true` skips a selection; `false` and missing matches are configured.
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
- Bike `variants` receives BC IDs from Neon, `ForecastCtyCode` from the extracted full CPQ `ForecastAs` code (preserve-on-update and legacy insert fallback when absent), `BblRuleSetItem` from Neon `cpq_sampler_result.ruleset`, and Unix-second bigint timestamps. QPart allocation pushes override `ForecastCtyCode`, `BblRuleSetItem`, and `DetailId` to `Qpart`.
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

- `/sales/allocation-audit` provides read-only timeline search for allocation audit events using `GET /api/sales/allocation-audit` with required `itemCode` and optional filters (`entityType`, `countryCode`, date range, sort, pagination).


## Dashboard (May 2026 operational rebuild)
- `/dashboard` now focuses on bike allocation health, qpart allocation health, last-24h allocation audit activity, and compact operational gap cards.
- Filters: region, sub-region, country, bike type, qpart hierarchy L1, BC status (OK/NOK/all), active status (active/inactive/all).
- Data is aggregated server-side in `lib/dashboard/service.ts` using explicit column selects and grouped SQL.
- Bike sources: `CPQ_sampler_result` + `CPQ_setup_ruleset` + `cpq_country_mappings` + latest `bc_item_variant_map` per SKU.
- QPart sources: `qpart_country_allocation` + `qpart_parts` + `qpart_hierarchy_nodes` + `cpq_country_mappings` + latest `bc_item_variant_map` per part number.
- Recent activity source: `app_allocation_audit_log` (last 24 hours).
- Old map/heatmap/picture-completeness dashboard visuals were removed from `/dashboard` and replaced with compact operational sections.

## CPQ local draft persistence

- `/cpq` now autosaves a browser-local draft in `localStorage` under key `tp2-cpq:cpq-configurator-draft:v1`.
- Stored fields include account/ruleset context, CPQ session + header/detail IDs, selected dropdown options, CPQ feature snapshot, generated item code, and country/currency/language context.
- Draft restore runs on `/cpq` load, and operators can also use **Resume draft** / **Clear draft** controls.
- This draft is browser-local only (not a server/user draft), and does not write Neon until existing save/finalize actions run.
- If a restored CPQ session is expired, configure now surfaces an explicit restart hint while preserving current account/ruleset/option context.

## 2026-05-28 CPQ snapshot reduction behavior

- Canonical save still occurs in the same route order and ownership.
- New saves now reduce `json_snapshot` to selected captions only (`ForecastAs`, `Description`, `DetailId`, `TradePrice`, `MSRP`) and drop null/blank/zero-equivalent values.
- Retrieve flow does not depend on `json_snapshot`; it uses canonical identity/context fields and a fresh StartConfiguration call.

## ForecastAs and reduced snapshot downstream process (2026-06-03)
1. CPQ save reduces `json_snapshot` to `ForecastAs`, `Description`, `DetailId`, `TradePrice`, and `MSRP` entries only.
2. The reducer removes empty/zero values and removes short ForecastAs option fragments below 13 characters.
3. Price noise is reduced by retaining only max numeric `MSRP` and max numeric `TradePrice` entries.
4. Bike external PostgreSQL push batch-loads relevant active configuration references for the selected SKU/IPN set, extracts the primary full ForecastAs in memory, and maps it to `variants."ForecastCtyCode"`.
5. The external push path avoids unbounded or per-row snapshot reads: bulk push uses one bounded lookup for the selected SKUs, and single-row push uses the same lookup helper for one SKU.
6. QPart external push remains separate in behavior and continues writing `Qpart` for QPart forecast/ruleset/detail fields.

## CPQ replay validation admin page (read-only)

- Route: `/admin/cpq-replay-validation`. Permission key: `admin.cpq_replay_validation`.
- Purpose: re-run saved `cpq_configuration_references` rows through CPQ and compare the regenerated IPN/item code against the stored `final_ipn_code`. Validation only — no controlled-overwrite phase is implemented.
- APIs (all `read`-gated):
  - `GET /api/admin/cpq-replay-validation/options` → `{ bikeTypes, countries, bikeTypeSource, countrySource }`
  - `GET /api/admin/cpq-replay-validation/references?bikeType=...&countryCode=...&limit=...` → lightweight reference rows
  - `POST /api/admin/cpq-replay-validation/run` → `{ referenceIds, limit? }` → `{ results, summary }`
- Option sourcing:
  - bike type = `CPQ_setup_ruleset.bike_type` joined on `cpq_configuration_references.ruleset`, falling back to the ruleset name when a ruleset has no `bike_type` mapping (the references table has no bike-type column).
  - country = distinct `cpq_configuration_references.country_code` for active rows.
- Replay sequence per reference (mirrors the `/cpq` "Configure all ticked items" execution unit minus every persistence step):
  1. resolve the recorded option set. `json_snapshot` is reduced on write and no longer carries `selectedOptions`, so the option set comes from `CPQ_sampler_result.json_result` (matched by detail id, then session id, then ipn/ruleset/country); if no sampler payload exists, a CPQ source-copy StartConfiguration recovers it from the saved header/detail lineage.
  2. fresh `StartConfiguration` with a **new random `detailId`** and no source lineage, so the stored CPQ record is never targeted.
  3. `Configure` per option, skipping `cpq_image_management.ignore_during_configure = true` rows and options already selected.
  4. `FinalizeConfiguration`; the finalize `detailId` is returned per row as `replayedDetailId`.
  5. compare stored vs replayed item code.
- Comparison rule: `replayedItemCode` is taken from the latest Configure/Start state (the same source the stored `final_ipn_code` was written from); the finalize-response IPN is reported separately as `finalizedItemCode`.
- Result statuses: `match`, `different`, `failed`, `skipped` (skipped = no recorded option set, no ruleset, or no stored IPN to compare).
- Batch safety: references list default limit 100 / max 500; replay run default batch 10 / hard max 25, processed sequentially (no parallel CPQ calls). `maxDuration = 300` is set on the run route; keep batches small on Vercel because each reference costs one Start + N Configure + one Finalize CPQ round trip.
- No-write guarantee: every Neon statement in `lib/admin/cpq-replay-validation/*` is a `select`. The page and its routes never write `cpq_configuration_references`, never write `CPQ_sampler_result`, never write `app_allocation_audit_log`, never push external PostgreSQL, and never call BigCommerce write APIs. `edit`/`admin` do not unlock writes.
- The replay/validation path above stays read-only. A separate, explicitly triggered controlled-overwrite action was added later — see "CPQ replay controlled overwrite" below.

## CPQ replay controlled overwrite (2026-08-13)

- Action: **Apply selected replay results** on `/admin/cpq-replay-validation`, backed by `POST /api/admin/cpq-replay-validation/overwrite`.
- Permission: requires `admin` on `admin.cpq_replay_validation` (server-enforced via `requirePageAdmin`, not just a disabled button). `read`/`edit` can still validate but cannot overwrite.
- The browser sends only reference ids plus the values it believes it displayed. It never sends a payload that gets written:
  1. server loads the live reference rows and rejects any row whose submitted country/ruleset/bike type/item code no longer matches (stale results),
  2. server **re-runs the replay itself** (Start → Configure per option → Finalize) and computes the write payload from that run,
  3. server resolves the existing sampler row,
  4. server archives and updates.
- Only replays whose comparison finished (`match` or `different`) with a replayed item code are eligible; `failed`/`skipped` are never written. Applying a `match` refreshes the rows and is flagged in the confirmation modal.
- Archive-before-update is database-enforced: the archive insert and both updates run in one transaction (`sqlTransaction`), the archive captures the live rows with `to_jsonb(...)` inside that transaction, and each update carries `exists (select 1 from app_cpq_replay_overwrite_archive where overwrite_batch_id = <batch> and configuration_reference_id = <id>)`. A live row therefore cannot change unless its archive row landed first. The batch id is always generated server-side so the guard can never match an older batch.
- `cpq_configuration_references` updated fields: `final_ipn_code`, `product_description`, `canonical_header_id`, `header_id`, `canonical_detail_id`, `finalized_detail_id`, `finalized_session_id`, `finalize_response_json`, `json_snapshot` (rebuilt through `reduceConfigurationJsonSnapshot`), `updated_at`. Identity (`configuration_reference`), ruleset/namespace, account/country context and source lineage are left untouched.
- `CPQ_sampler_result` updated fields: `ipn_code`, `namespace`, `header_id`, `detail_id`, `session_id`, `json_result` (rebuilt in the `/cpq` sampler payload shape, tagged `source: "admin-cpq-replay-overwrite"`), `updated_at`. `active` and `processed_for_image_sync` are deliberately left alone — allocation status is owned by the sales flow.
- Overwrite-only, never create: if no existing sampler row matches (detail id, then session id, then exact ipn+ruleset+country), the row is reported `skipped` with "Existing sampler row not found; no insert performed." No live row is ever inserted by this flow.
- Row statuses: `updated`, `skipped`, `failed`. Batch max 25, processed sequentially (each row re-runs a full CPQ replay).
- No external side effects: no external PostgreSQL push, no BigCommerce write, no `app_allocation_audit_log` row. The archive table is the safety record.
- Rollback is not implemented in the UI. `app_cpq_replay_overwrite_archive` retains the full old rows, the intended new payloads, actor and batch id so a future rollback can be built from it.
