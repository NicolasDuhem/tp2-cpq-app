# Pages and Components

## Page: CPQ - Bike Builder
- Route: `/cpq` (alias: `/bike-builder` redirects here)
- File: `app/cpq/page.tsx` → `components/cpq/bike-builder-page.tsx`
- Purpose: Main CPQ runtime page for manual configuration lifecycle, bulk combination execution, canonical save/retrieve, sampler writes, and layered preview.
- Access control: Route is publicly reachable in app shell; technical sub-sections are hidden unless admin mode is enabled.
- Feature flags:
  - `NEXT_PUBLIC_CPQ_DEBUG=true` enables debug timeline collection.
- Main data sources:
  - `GET /api/cpq/setup/account-context?activeOnly=true`
  - `GET /api/cpq/setup/rulesets?activeOnly=true`
  - CPQ runtime APIs: `/api/cpq/init`, `/api/cpq/configure`, `/api/cpq/finalize`
  - Canonical persistence/retrieve APIs
  - `/api/cpq/image-layers`
  - `/api/cpq/setup/picture-management/ignored-features`
- Main write actions:
  - Save configuration (finalize + canonical save + auto sampler save)
  - Manual sampler save
  - Bulk configure flow (row-country queue writes to canonical + sampler)
- API endpoints used:
  - `/api/cpq/init`
  - `/api/cpq/configure`
  - `/api/cpq/finalize`
  - `/api/cpq/configuration-references` (POST/GET)
  - `/api/cpq/retrieve-configuration`
  - `/api/cpq/sampler-result`
  - `/api/cpq/image-layers`
  - `/api/cpq/setup/account-context`
  - `/api/cpq/setup/rulesets`
  - `/api/cpq/setup/picture-management/ignored-features`
- Database tables involved:
  - Reads: `CPQ_setup_account_context`, `CPQ_setup_ruleset`, `cpq_image_management`, `cpq_configuration_references`
  - Writes: `cpq_configuration_references`, `CPQ_sampler_result`
- Key components:

### Component: BikeBuilderPage
- File: `components/cpq/bike-builder-page.tsx`
- Purpose: End-to-end orchestration of CPQ runtime and operational bulk flow.
- Used in page: `/cpq`
- Inputs / props:
  - `prefill` (ruleset, country_code, ipn_code, account_code, replay_token)
- Data displayed:
  - account/ruleset selectors
  - feature options and selected state
  - save/retrieve/sampler statuses
  - generated combinations grid with dynamic feature/country columns
  - layered image preview
  - optional debug/diagnostic panels
- User-editable fields:
  - account/ruleset selectors
  - configuration reference input
  - feature selections
  - bulk grid row/country checkboxes and filters
- Validation / rules:
  - cannot configure without active session
  - save requires session + selected account
  - retrieve requires configuration reference
  - bulk run blocks when selected rows have no selected countries
  - remap safety thresholds for feature/option matching
- Write actions:
  - CPQ configure/finalize calls
  - canonical save and sampler writes
  - bulk queue writes (same endpoints)
- Side effects / dependencies:
  - tracks snapshots for save-source rule
  - clears/refreshes bulk state on session change
  - handles sales replay payload from `sessionStorage`

### Component: AdminModeProvider / AppNavigation (cross-page dependency)
- File: `components/shared/admin-mode-context.tsx`, `components/shared/app-navigation.tsx`
- Purpose: controls admin visibility in Bike Builder (debug/technical surfaces).
- Used in page: via app shell wrapper.
- Inputs / props: context state only.
- Side effects: writes `tp2-cpq-admin-mode` in `sessionStorage`.

### Data usage
- Reads:
  - setup rows (account/ruleset)
  - ignored feature labels
  - image layer mappings by selected options
  - canonical row by reference (retrieve)
- Writes:
  - canonical save row (upsert)
  - sampler result rows (manual/auto/bulk)
- Important fields/columns:
  - `cpq_configuration_references.configuration_reference`, canonical/source fields, `json_snapshot`, `finalize_response_json`
  - `CPQ_sampler_result.active`, `json_result`, context columns
  - `cpq_image_management.feature_layer_order`, `ignore_during_configure`, `picture_link_1..4`
- Notes / constraints:
  - canonical snapshot source is configure/start only.
  - feature-level ignore flags affect bulk configure.

### User flow
- Step 1: Select account/ruleset (init auto-runs when both resolved).
- Step 2: Configure options manually or generate combinations.
- Step 3: Finalize and save canonical reference (sampler auto-saves).
- Step 4: Optionally retrieve by configuration reference.
- Step 5: For bulk, select rows/countries and run queue.

### Risks / gaps
- Admin mode is UI-only, not auth.
- Bulk remap depends on fuzzy safeguards; ambiguous cases fail by design.
- Route accepts replay token payload from client storage (session-scoped, non-cryptographic).

---

## Page: CPQ - Setup
- Route: `/cpq/setup`
- File: `app/cpq/setup/page.tsx` → `components/setup/cpq-setup-page.tsx`
- Purpose: CRUD for setup master data and picture management.
- Access control: no server auth; visible in nav for all users.
- Feature flags: none.
- Main data sources:
  - `/api/cpq/setup/account-context`
  - `/api/cpq/setup/rulesets`
  - `/api/cpq/setup/picture-management`
- Main write actions:
  - account/ruleset create/update/delete
  - picture row update
  - feature-level ignore/layer order update
  - sampler-to-picture sync
- API endpoints used:
  - account/ruleset CRUD endpoints
  - `/api/cpq/setup/picture-management/[id]`
  - `/api/cpq/setup/picture-management/feature-flags`
  - `/api/cpq/setup/picture-management/sync`
- Database tables involved:
  - Reads: `CPQ_setup_account_context`, `CPQ_setup_ruleset`, `cpq_image_management`, `CPQ_sampler_result` (sync source)
  - Writes: all same tables except ruleset/account only via own CRUD; sync also updates `CPQ_sampler_result.processed_for_image_sync`
- Key components:

### Component: CpqSetupPage
- File: `components/setup/cpq-setup-page.tsx`
- Purpose: three-tab management UI (accounts/rulesets/pictures).
- Used in page: `/cpq/setup`
- Inputs / props: none
- Data displayed:
  - account table + draft form
  - ruleset table + draft form
  - picture feature tabs, tile cards, summary cards, modal editor
- User-editable fields:
  - account fields (`account_code`, `customer_id`, `currency`, `language`, `country_code`, `is_active`)
  - ruleset fields (`cpq_ruleset`, `description`, `bike_type`, `namespace`, `header_id`, `sort_order`, `is_active`)
  - picture links and active flag
  - feature-level ignore and layer order
- Validation / rules:
  - account requires all fields and 2-letter country code
  - ruleset requires ruleset+namespace+header
  - layer order forced to 1..20
- Write actions: API calls listed above
- Side effects / dependencies:
  - sync operation marks sampler rows processed
  - feature-level save updates all picture rows for that feature label

### Data usage
- Reads: setup tables and picture rows with optional missing-picture filter.
- Writes:
  - direct setup CRUD writes
  - sync inserts missing image mappings from sampler JSON selected options
- Important fields/columns:
  - `CPQ_setup_account_context.country_code`
  - `CPQ_setup_ruleset.bike_type`, `sort_order`
  - `cpq_image_management.ignore_during_configure`, `feature_layer_order`, links, `is_active`
  - `CPQ_sampler_result.processed_for_image_sync`
- Notes / constraints:
  - picture sync only processes rows with `processed_for_image_sync=false`.

### User flow
- Step 1: Maintain account contexts and rulesets.
- Step 2: Sync picture-management rows from sampler.
- Step 3: Per-feature configure ignore/layer order.
- Step 4: Per-option edit picture links in modal and save.

### Risks / gaps
- No server RBAC on setup endpoints.
- Feature label consistency is required for feature-level bulk updates.

---

## Page: CPQ - Sampler Results
- Route: `/cpq/results`
- File: `app/cpq/results/page.tsx` → `components/cpq/cpq-results-page.tsx`
- Purpose: matrix read model of sampler history grouped by SKU/ruleset/feature signature and pivoted by country.
- Access control: nav link admin-only, but route itself not server-restricted.
- Feature flags: none.
- Main data sources: `getCpqResultsPageData()` from `lib/cpq/results/service.ts`.
- Main write actions: none (read-only UI).
- API endpoints used: none from client component (data loaded server-side through service).
- Database tables involved:
  - Reads: `CPQ_sampler_result`, `CPQ_setup_ruleset`, `CPQ_setup_account_context`
  - Writes: none
- Key components:

### Component: CpqResultsPage
- File: `components/cpq/cpq-results-page.tsx`
- Purpose: server page loader to collect filter/search params and fetch matrix data.
- Used in page: `/cpq/results`

### Component: CpqResultsMatrixClient
- File: `components/cpq/cpq-results-matrix.client.tsx`
- Purpose: interactive matrix table with client-side filtering and feature column picker.
- Inputs / props:
  - `rows`, `featureColumns`, `countryColumns`, `rowIdentityDescription`
- User-editable fields:
  - ruleset filter
  - bike_type filter
  - SKU search
  - country-presence filter
  - visible feature columns
- Validation / rules:
  - no write actions; filters are local state only.

### Data usage
- Reads:
  - `json_result.selectedOptions` for feature columns/values
  - `detail_id` for per-country pivot cells
- Writes: none
- Important fields/columns:
  - `CPQ_sampler_result.ipn_code`, `ruleset`, `country_code`, `detail_id`, `json_result`
  - `CPQ_setup_ruleset.bike_type`

### User flow
- Step 1: Open page and review matrix.
- Step 2: Apply filters and feature-column visibility.
- Step 3: Inspect per-country detail-id presence.

### Risks / gaps
- Country columns include union of sampler + setup countries, so some cells may be intentionally empty.

---

## Page: Sales - bike allocation
- Route: `/sales/bike-allocation`
- File: `app/sales/bike-allocation/page.tsx` → `components/sales/sales-bike-allocation-page.tsx`
- Purpose: allocation status control plane per IPN + country with toggle, bulk status updates, and launch-to-CPQ replay for not-configured cells.
- Access control: visible to all users in nav; no server RBAC.
- Feature flags: none.
- Main data sources:
  - server: `getSalesBikeAllocationPageData()`
  - includes filter options + matrix rows derived from sampler JSON + active flag
- Main write actions:
  - cell toggle active/inactive
  - bulk activate/deactivate
- API endpoints used:
  - `/api/sales/bike-allocation/toggle`
  - `/api/sales/bike-allocation/bulk-update`
  - `/api/sales/bike-allocation/launch-context`
- Database tables involved:
  - Reads: `CPQ_sampler_result`, `CPQ_setup_account_context`
  - Writes: `CPQ_sampler_result.active`, `updated_at`
- Key components:

### Component: SalesBikeAllocationPage
- File: `components/sales/sales-bike-allocation-page.tsx`
- Purpose: server-page loader for filters and matrix data.

### Component: SalesBikeAllocationTableClient
- File: `components/sales/sales-bike-allocation-table.client.tsx`
- Purpose: interactive allocation matrix UI with filter rows, status actions, and bulk panel.
- Inputs / props:
  - `rows`, `availableFeatures`, `countryColumns`, `filterOptions`, `filters`
- Data displayed:
  - IPN rows with dynamic feature and country status columns
- User-editable fields:
  - ruleset/country query filters
  - IPN and feature text filters
  - country status filters
  - bulk country target checkboxes
- Validation / rules:
  - bulk requires selected ruleset, visible rows, and at least one target country
  - status target must be `active` or `not_active`
- Write actions:
  - toggle single cell status
  - bulk status update
- Side effects / dependencies:
  - "Not configured" action resolves context, stores replay payload in `sessionStorage`, and routes to `/cpq` with `replay_token`

### Data usage
- Reads:
  - `json_result.selectedOptions` and fallback `dropdownOrderSnapshot` for replay payload
  - sampler row status via `active`
- Writes:
  - `CPQ_sampler_result.active`
- Important fields/columns:
  - `ruleset`, `ipn_code`, `country_code`, `active`, `json_result`
- Notes / constraints:
  - only existing sampler rows are updated by toggle/bulk actions.

### User flow
- Step 1: Filter by ruleset/country.
- Step 2: Inspect status by IPN-country cell.
- Step 3a: Toggle Active/Inactive directly.
- Step 3b: Run bulk action across visible IPNs and selected countries.
- Step 3c: For Not configured, launch CPQ replay flow.

### Risks / gaps
- Not-configured launch depends on replay data quality in sampler JSON.
- No hard auth boundaries; operational discipline required.

---

## Page: CPQ - Process
- Route: `/cpq/process`
- File: `app/cpq/process/page.tsx` → `components/docs/process-page.tsx`
- Purpose: SOP/instructional documentation page for internal users.
- Access control: visible to all users.
- Feature flags: none.
- Main data sources: static content.
- Main write actions: none.
- API endpoints used: none.
- Database tables involved: none.
- Key components:

### Component: ProcessPage
- File: `components/docs/process-page.tsx`
- Purpose: anchored instructional sections for setup/manual/bulk steps and role responsibilities.
- Inputs / props: none.
- Side effects / dependencies: none.

### Data usage
- Reads: none (static text)
- Writes: none
- Notes / constraints:
  - content must be manually kept aligned with implementation.

### User flow
- Step 1: Navigate sections by anchors.
- Step 2: Follow role-specific SOP guidance.

### Risks / gaps
- Potential staleness risk if implementation changes without doc update.

---

## Page: CPQ - UI Docs
- Route: `/cpq/ui-docs`
- File: `app/cpq/ui-docs/page.tsx` → `components/docs/ui-docs-page.tsx`
- Purpose: internal label-to-code/data mapping reference.
- Access control:
  - route is reachable, but full table view requires admin mode in component.
- Feature flags: none.
- Main data sources: static in-file `entries` array.
- Main write actions: none.
- API endpoints used: none.
- Database tables involved: none directly.
- Key components:

### Component: UiDocsPage
- File: `components/docs/ui-docs-page.tsx`
- Purpose: searchable table of UI labels mapped to code/data origin.
- Inputs / props: none
- User-editable fields: search query input only.
- Validation / rules:
  - if not admin mode, shows restricted message instead of table.

### Data usage
- Reads: admin mode context + static entries list.
- Writes: none.
- Notes / constraints:
  - docs table quality depends on manual maintenance.

### User flow
- Step 1: Enable admin mode.
- Step 2: Search/filter mapping rows.

### Risks / gaps
- Static entries can drift from code unless updated in same PRs.

---

## Cross-page dependencies
- Sales not-configured launch depends on `/cpq` replay handling.
- `/cpq` depends on setup tables and picture-management feature flags authored in `/cpq/setup`.
- `/cpq/results` and `/sales/bike-allocation` both depend on sampler data quality and JSON shape.

## Shared components
- `components/shared/app-shell.tsx` (global shell)
- `components/shared/app-navigation.tsx` (nav + admin mode controls)
- `components/shared/admin-mode-context.tsx` (admin visibility state)

## Shared API/data patterns
- Server routes parse JSON with safe fallbacks (`req.json().catch(() => ({}))`).
- DB access centralized through Neon client (`lib/db/client.ts`).
- JSON payload columns (`json_snapshot`, `json_result`) store normalized snapshots for downstream read models.
- Sales and CPQ both rely on selected options triplets (`featureLabel`, `optionLabel`, `optionValue`).

## Permissions and feature-flag matrix

| Surface | Visibility/Auth behavior | Feature flags |
|---|---|---|
| `/cpq` | accessible to all; technical blocks hidden unless admin mode | `NEXT_PUBLIC_CPQ_DEBUG` impacts debug timeline |
| `/cpq/setup` | accessible to all | none |
| `/cpq/results` | admin tab only, route not server-blocked | none |
| `/cpq/process` | accessible to all | none |
| `/cpq/ui-docs` | detailed content rendered only in admin mode | none |
| `/sales/bike-allocation` | accessible to all | none |
| `/api/cpq/init` + `/api/cpq/configure` | no auth gates in route | `CPQ_USE_MOCK` switches to mock mode |
