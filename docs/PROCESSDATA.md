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
  1) fresh init,
  2) feature remap,
  3) option remap within mapped feature,
  4) configure steps (skip ignored features / already selected options),
  5) finalize,
  6) canonical save,
  7) sampler save.
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
