# Pages and Components

## Page: Dashboard
- Route: `/dashboard`
- File: `app/dashboard/page.tsx` → `components/dashboard/dashboard-page.tsx` with server aggregation in `lib/dashboard/service.ts`
- Purpose: executive-ready operational cockpit for territory coverage, bike-type health, picture completeness, and prioritized drill-down actions.
- Access control: visible to all users in top-level nav.
- Main data sources:
  - `CPQ_sampler_result` (active/inactive totals and country/ruleset rollups)
  - `CPQ_setup_ruleset` (ruleset to bike-type mapping)
  - `cpq_country_mappings` (region/sub-region metadata for map placement)
  - `cpq_image_management` (feature picture completeness)
- Key sections implemented:
  - KPI cards (click-through to operational pages)
  - territory coverage map (zoom/pan + country click drill-down)
  - territory stacked active/inactive bars
  - country × bike-type heatmap
  - picture completeness by feature
  - actionable gaps panel + top-gaps leaderboards
  - extra insights: active/inactive share donut and rulesets-by-bike-type chart
- Drill-down routes:
  - `/sales/bike-allocation?country_code=<ISO2>`
  - `/sales/bike-allocation?bike_type=<bike_type>`
  - `/sales/bike-allocation?country_code=<ISO2>&bike_type=<bike_type>`
  - `/cpq/setup?tab=pictures&feature=<feature>&onlyMissingPicture=true`
- Notes / constraints:
  - map is a lightweight internal territory map using region/sub-region projected placement (not polygon choropleth boundaries).
  - heatmap health states: none / weak / mixed / strong based on active/inactive presence for each country+bike-type pair.

---

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
  - `/api/cpq/setup/country-mappings`
  - `/api/cpq/setup/picture-management/[id]`
  - `/api/cpq/setup/picture-management/feature-flags`
  - `/api/cpq/setup/picture-management/sync`
- Database tables involved:
  - Reads: `CPQ_setup_account_context`, `cpq_country_mappings`, `CPQ_setup_ruleset`, `cpq_image_management`, `CPQ_sampler_result` (sync source)
  - Writes: all same tables except ruleset/account only via own CRUD; sync also updates `CPQ_sampler_result.processed_for_image_sync`
- Key components:

### Component: CpqSetupPage
- File: `components/setup/cpq-setup-page.tsx`
- Purpose: three-tab management UI (accounts/rulesets/pictures).
- Used in page: `/cpq/setup`
- Inputs / props: none
- Data displayed:
  - account table + draft form
  - country-mapping table + draft form (same accounts tab)
  - ruleset table + draft form
  - picture feature tabs, tile cards, summary cards, modal editor
- User-editable fields:
  - account fields (`account_code`, `customer_id`, `currency`, `language`, `region`, `sub_region`, `country_code`, `is_active`)
  - country mapping fields (`region`, `sub_region`, `country_code`, `is_active`)
  - ruleset fields (`cpq_ruleset`, `description`, `bike_type`, `namespace`, `header_id`, `sort_order`, `is_active`)
  - picture links and active flag
  - feature-level ignore and layer order
- Validation / rules:
  - account requires all fields including region + sub-region and 2-letter country code
  - account region/sub-region/country options are dynamically read from `cpq_country_mappings`
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
- File: `app/sales/bike-allocation/page.tsx` -> `components/sales/sales-bike-allocation-page.tsx`
- Purpose: allocation status control plane per IPN + country with toggle, current-page bulk status updates, external PostgreSQL sync awareness, and launch-to-CPQ replay for not-configured cells.
- Access control: `sales.bike_allocation` page permission. Read is required for page data and for the read-only external-status refresh; Edit is required for every mutation and push. Server routes enforce this independently of whether a button is hidden or disabled.
- Feature flags: none.
- Main data sources:
  - server: `getSalesBikeAllocationPageData()`
  - filter options (5-minute in-process cache) + territory hierarchy + matrix rows derived from sampler JSON and the `active` flag
- Main write actions:
  - cell toggle active/inactive
  - current-page bulk activate/deactivate
  - per-cell Push and current-page Push all BC OK to external PostgreSQL (`variants`, then `variant_eligibilities`)
- API endpoints used:
  - `/api/sales/bike-allocation/toggle`
  - `/api/sales/bike-allocation/bulk-update`
  - `/api/sales/bike-allocation/bulk-push`
  - `/api/sales/bike-allocation/push`
  - `/api/sales/bike-allocation/external-status`
  - `/api/sales/bike-allocation/launch-context`
  - `/api/bigcommerce/item-map/lookup`, `/api/bigcommerce/variant-status`, `/api/bigcommerce/item-map/upsert`
- Database tables involved:
  - Reads: `CPQ_sampler_result`, `CPQ_setup_ruleset`, `CPQ_setup_account_context`, `cpq_country_mappings` (territory hierarchy), `bc_item_variant_map`
  - Writes: `CPQ_sampler_result.active`, `updated_at`; `app_allocation_audit_log`; Push writes external `variants` and `variant_eligibilities` only when the BC gate passes

### URL / filter contract

All server-relevant filter state lives in the URL, so refresh, back/forward and shared
links restore the same view. Unknown values are ignored; unrelated query parameters are
preserved.

| Parameter | Meaning | Parsing |
|---|---|---|
| `page` | 1-based page number | non-numeric -> 1; clamped to `totalPages` |
| `page_size` | rows per page | default 100, max 300 |
| `ruleset` | exact `CPQ_sampler_result.ruleset` | trimmed |
| `bike_type` | resolves to rulesets via `CPQ_setup_ruleset` | trimmed |
| `countries` | territory selection, comma-separated ISO-2 | uppercased, de-duplicated, sorted |
| `country_code` | **legacy** single-country deep link | normalized into `countries`; see below |
| `ipn` | `ipn_code` contains-search | trimmed, pushed into SQL |
| `status` | `active`, `not_active`, `not_configured` (comma-separated) | unknown values dropped |
| `cols` | visible feature columns, comma-separated URI-encoded labels | unknown features dropped |
| `features` | feature contains-filters as `label~value` pairs joined by `;` | each part URI-encoded (`~` escaped as `%7E`); malformed segments dropped |

Rules:
- Any change to a dataset filter resets `page=1`; `page_size` is preserved.
- Navigating between pages preserves every filter.
- The client only rewrites the URL when the serialized filter set actually differs from
  the URL's, which prevents an update loop with `router.replace`.

**Backward compatibility for `country_code`.** Dashboard drill-downs
(`/sales/bike-allocation?country_code=GB`, optionally with `bike_type`) still work: the
server folds `country_code` into the territory selection, so the page opens focused on
that one country column. This is a deliberate migration — previously the parameter
filtered rows while still rendering every country column, which showed an unrelated wide
matrix. The parameter is rewritten to `countries=` on the operator's first filter
interaction.

### Allocation-status semantics

`active`, `not_active` (labelled "Inactive") and `not_configured` stay distinct; they are
never collapsed, because only the first two have an allocation row to toggle and only
`not_configured` launches CPQ.

> A bike matches when **any** country in scope has **any** selected status.

Country scope is the Territory selection when one exists, otherwise every country column.
No status selected means no status filtering.

### Current-page mutation semantics

- Single-cell toggle affects exactly one `ruleset` + `ipn_code` + `country_code` cell.
- Bulk activate / Bulk deactivate / Push all BC OK affect **only** the bike rows the
  server returned for the current page, and **only** the explicitly selected countries.
- Moving from page 1 to page 2 changes the target IPN set.
- The confirmation dialog states the exact bike count, country count, country codes and
  "current page only".
- Bulk buttons are disabled (with a stated reason) when the user lacks Edit access, no
  ruleset is selected, the page has no rows, no country is selected, or local filter state
  has not yet been applied by the server.
- There is no "Update all" mode on this page. Current-page scope is the requirement.

### Component: SalesBikeAllocationPage
- File: `components/sales/sales-bike-allocation-page.tsx`
- Purpose: server page. Enforces read access, parses/normalizes search parameters defensively, requests page data, and resolves which feature columns are visible.

### Component: SalesBikeAllocationTableClient
- File: `components/sales/sales-bike-allocation-table.client.tsx`
- Purpose: filter/pagination/matrix UX, URL synchronization, transient busy/toast/external-status state, and exact current-page mutation targets.
- Inputs / props: `rows`, `availableFeatures`, `selectedFeatureColumns`, `countryColumns`, `filterOptions`, `filters`, `pagination`, `canEdit`
- Layout hierarchy:
  1. page header
  2. one-row toolbar: Territory popover · Ruleset · Bike type · allocation-status pills ·
     matched-row count · Active filters popover · Export CSV · Actions popover · Legend popover
  3. matrix with sticky header, sticky BC + `ipn_code` columns, in-header IPN search,
     in-header feature-column picker and in-header feature filters
  4. pagination bar directly below the table
- There is deliberately **no** full-width filter drawer: it consumed most of the viewport.
  Every filter is either in the toolbar row, in a popover, or in the column header it
  belongs to.
- Territory popover: country-code search, All/None, region and sub-region toggles with
  `selected/total` counts, flag + code per country, `aria-pressed` group buttons, labelled
  checkboxes and visible focus rings. Search only hides options and never alters the
  selection.
- Rows are rendered exactly as the server returned them; there is no second client-side
  row filter that could disagree with `totalRows`.
- A trailing filler column absorbs leftover table width so the identity columns keep their
  natural size when only a few country columns are selected.

### Component: ToolbarPopover
- File: `components/sales/toolbar-popover.tsx`
- Purpose: the compact dropdown used for Territory, Active filters, Actions, Legend and the
  feature-column picker.
- Behaviour: closes on outside pointer-down and on Escape, returning focus to its trigger.
  `anchorFixed` positions the panel with `position: fixed` computed from the trigger's
  bounding rect, which is what lets the column picker escape the matrix's `overflow: auto`
  container instead of being clipped; it repositions on scroll and resize.

### Component: AllocationMatrixCell
- File: `components/sales/allocation-matrix-cell.tsx`
- Purpose: one allocation cell, sized for a matrix that can be 30+ countries wide. Replaces
  the former shared `StatusCell`, which had no other consumer and was removed.
- Density rules:
  - `not_configured` is a small dashed dot, not the words "Not configured". It remains a
    real button with the same CPQ-launch behaviour and the accessible name
    `"<ipn> <country>: Not configured"`.
  - the external-sync state is an icon, never the word "Unknown": `✓` pushed, `≠` out of
    sync, `BC` pending BigCommerce, `!` push failed, faint `⤴` when not checked (still the
    manual-push button).
  - Active/Inactive keep their words, so status is never carried by colour alone.

### Component: CountryFlagLabel (shared)
- File: `components/shared/CountryFlagLabel.tsx`
- Purpose: compact flag + uppercase country code used in territory options and matrix headers.
- Behaviour: decorative `alt=""` plus `aria-hidden` so screen readers announce the code once; `loading="lazy"`; `EL` maps to the Greek flag via `getCountryFlagUrl`; the image is unstyled and zero-sized until it loads and is removed entirely on error, so a blocked or slow CDN never leaves a placeholder box.

### Data usage
- Reads:
  - `json_result.selectedOptions` and fallback `dropdownOrderSnapshot` for replay payload
  - sampler row status via `active`
  - `cpq_country_mappings` for the territory hierarchy (cached 5 minutes)
- Writes:
  - `CPQ_sampler_result.active`
  - `app_allocation_audit_log` for single and bulk status changes (bulk rows carry `scope: current_page`)
- CSV export:
  - `GET /api/sales/bike-allocation/export` with the page's current filter query
  - covers every page of the filtered dataset, one row per bike x country
  - `not_configured` pairs are excluded (no allocation row exists behind them)
  - read-only; Read access is sufficient
- Notes / constraints:
  - only existing sampler rows are updated by toggle/bulk actions
  - Push all BC OK never changes Active/Inactive
  - Refresh external status is read-only, covers every page of the filtered dataset, and uses one batched `variant_eligibilities` lookup (no per-cell queries)
  - Bike pushes keep sampler-derived ruleset resolution; QPart's fixed `Qpart` overrides are not applied here

### User flow
- Step 1: Open filters, pick a Region / Sub-region / Country scope.
- Step 2: Narrow with ruleset, bike type, IPN search, feature filters and allocation status.
- Step 3: Inspect status by bike-country cell.
- Step 4a: Toggle Active/Inactive directly.
- Step 4b: Run a bulk action across the current page and the selected countries.
- Step 4c: For Not configured, launch the CPQ replay flow.
- Step 5: Page through the filtered dataset; filters persist.

### Risks / gaps
- Not-configured launch depends on replay data quality in sampler JSON.
- Flag images come from a public CDN; if it is unreachable the code still renders, but no flag is shown.
- Matrix rows are still assembled in memory on the server before pagination, so a very
  large sampler table remains a server-side memory consideration (unchanged by this pass,
  but IPN search is now pushed into SQL to reduce it).

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
