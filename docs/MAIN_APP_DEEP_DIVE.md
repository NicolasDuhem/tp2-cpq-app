# MAIN_APP_DEEP_DIVE (stable app)

## Scope and boundary
This document describes the current stable TP2 CPQ app behavior from code. The former `stock-bike-img` experiment has been cancelled and removed from active app/runtime.

Boundary note:
- Stable routes/services do **not** call any stock-bike-img APIs/tables because that experimental module has been removed from active code and SQL baseline.

---

## 1) Route and page architecture

### Global shell and navigation
- `app/layout.tsx` wraps all pages with `AppShell`.
- `AppShell` includes the top brand bar and tab navigation.
- Home (`/`) redirects to `/cpq`.

### Active stable routes
- `/cpq` → Bike Builder runtime (`components/cpq/bike-builder-page.tsx`).
- `/cpq/setup` → Setup console (`components/setup/cpq-setup-page.tsx`).
- `/cpq/results` → Sampler matrix page (`components/cpq/cpq-results-page.tsx`).
- `/cpq/process` → SOP/process docs page (`components/docs/process-page.tsx`).
- `/cpq/ui-docs` → UI mapping docs page (`components/docs/ui-docs-page.tsx`, admin-gated in UI).

### Admin vs non-admin visibility
Admin mode is a **client-side UI visibility gate**:
- Password hardcoded in navigation: `Br0mpt0n`.
- Session state stored in `sessionStorage` key `tp2-cpq-admin-mode`.
- Non-admin sees tabs: Process, Bike Builder, Setup.
- Admin additionally sees: Sampler Results, UI Docs.

Important: this is not server-side auth; it is UI gating for internal tooling.

---

## 2) CPQ manual lifecycle (stable canonical flow)

### Sequence implemented in Bike Builder
1. **StartConfiguration** (`POST /api/cpq/init`) to get a fresh session.
2. **Configure** (`POST /api/cpq/configure`) for each selected feature option.
3. **FinalizeConfiguration** (`POST /api/cpq/finalize`).
4. **Canonical save** (`POST /api/cpq/configuration-references`) to Neon table `cpq_configuration_references`.
5. **Retrieve** later (`POST /api/cpq/retrieve-configuration`) by `configuration_reference`.

### Save-source invariant
Canonical `json_snapshot` source is intentionally:
- latest Configure snapshot if available,
- otherwise latest StartConfiguration snapshot,
- **never** the Finalize body as save source.

Finalize response is still stored separately (`finalize_response_json`) when saving reference rows.

### Identity behavior (sessionId, detailId, configuration_reference)
- `sessionId` is CPQ working session identity during Start/Configure/Finalize.
- `detailId` used for canonical linkage is extracted from finalize parsed payload.
- `configuration_reference` is generated if absent by backend (`CFG-YYYYMMDD-XXXXXXXX`) and saved unique.
- retrieve flow resolves reference row, then calls StartConfiguration with saved canonical/source fields to create a new CPQ working session.

### Debug behavior
- API/runtime calls propagate/emit trace IDs (`x-cpq-trace-id` + generated fallback).
- Bike Builder timeline is visible only if both:
  - admin mode is enabled, and
  - `NEXT_PUBLIC_CPQ_DEBUG=true`.

---

## 3) Sampler flow (separate from canonical save)

### Purpose
`CPQ_sampler_result` is a support dataset for:
- historical matrix/reporting (`/cpq/results`),
- picture-management seeding sync.

### Manual and automatic writes
- Manual: Bike Builder action “Save current configuration to sampler” → `POST /api/cpq/sampler-result`.
- Automatic: bulk row-country execution auto-saves sampler after canonical save success.

### Sampler payload shape
`json_result` stores selected option snapshots and related metadata; setup sync reads `json_result.selectedOptions` entries (`featureLabel`, `optionLabel`, `optionValue`).

### Separation from canonical save
- Canonical retrieval source of truth = `cpq_configuration_references`.
- Sampler rows are **not** used to retrieve canonical configuration.

---

## 4) Picture management (stable)

### Authoring UI and process
`/cpq/setup` → Picture management tab:
- optional sync from sampler to seed missing option combinations,
- feature tabs,
- per-feature summary cards (total/missing/completion/fully complete),
- option tiles opening modal editor for picture links 1..4 and active flag.

### Feature-level controls
- `ignore_during_configure` (feature-wide): bulk configure skips those features.
- `feature_layer_order` (1..20): lower number is top layer.

### Layered preview source logic
Bike Builder sends currently selected options to `POST /api/cpq/image-layers`.
Resolver:
- matches active `cpq_image_management` rows on exact (`feature_label`, `option_label`, `option_value`),
- returns `layers`, `matchedSelections`, `unmatchedSelections`.

Rendering ordering rule (as implemented):
- SQL orders by `feature_layer_order` descending then selection order,
- UI additionally sorts by layer order descending and slot ascending,
- docs/UI text communicate “1 = top layer”.
Operationally this means lower layer-order values are intended to visually appear on top.

---

## 5) Combinations and bulk configure flow

### Combination generation
From current CPQ state, Bike Builder constructs stable feature identities and produces cartesian option combinations across configurable features.

### Country selection model
Each selected combination row can be assigned to one or more countries (derived from account-context country codes). Execution unit is row-country.

### Execution model per row-country
For each queued unit:
1. Start fresh session.
2. Remap stable feature identities to fresh session feature IDs with layered safe matching:
   - stable identity → exact label → normalized label → locale-suffix tolerant label → cautious fuzzy (unique only).
3. Configure selected options (skipping ignored features).
4. Finalize.
5. Save canonical reference.
6. Save sampler snapshot.

### Validation and diagnostics
- Validation prevents run if selected rows have no countries.
- Row status lifecycle: pending/running/configured/finalized/saved/failed.
- Failure modal includes stage, summary/details, ignored features, and recent request/response events.
- Remap diagnostics include source/target feature+option identities and which remap strategy was used, plus explicit remap failure reasons/candidates.
- Progress counters show executions, successes, failures, current row/country/session/feature.

### Post-run table behavior
Generated rows remain visible with status updates and optional filters (selected-only, column hide/show, per-column text filter).

---

## 6) Stable database model (code-backed)

## Core stable tables
- `CPQ_setup_account_context`: account/country/currency/language context.
- `CPQ_setup_ruleset`: selectable CPQ rulesets and metadata.
- `CPQ_sampler_result`: sampler snapshots plus processing flags for sync.
- `cpq_configuration_references`: canonical save/retrieve registry.
- `cpq_image_management`: feature/option → picture links + flags (`ignore_during_configure`, `feature_layer_order`).

## Constraints/index highlights from `sql/schema.sql`
- `CPQ_setup_account_context.country_code` check regex for ISO2.
- `cpq_image_management` unique key on `(feature_label, option_label, option_value)`.
- `cpq_image_management_feature_layer_order_chk` check 1..20.
- sampler indexes for unprocessed sync, filters, and ipn timeline.
- configuration reference lookup/account/ruleset indexes.

## Stable vs experimental DB split
No `stock_bike_img_*` tables remain in the active SQL baseline.

---

## 7) Stable API map (purpose and persistence)

### CPQ-calling routes
- `POST /api/cpq/init` → CPQ `StartConfiguration`.
- `POST /api/cpq/configure` → CPQ `configure`.
- `POST /api/cpq/finalize` → CPQ `FinalizeConfiguration`.
- `POST /api/cpq/retrieve-configuration` → Neon resolve + CPQ `StartConfiguration`.

### Neon-calling stable routes
- `POST/GET /api/cpq/configuration-references` → `cpq_configuration_references`.
- `POST /api/cpq/sampler-result` → `CPQ_sampler_result`.
- `GET/POST/PUT/DELETE /api/cpq/setup/*` routes for account/ruleset/picture management tables.
- `POST /api/cpq/setup/picture-management/sync` reads sampler and inserts to `cpq_image_management`.
- `POST /api/cpq/image-layers` resolves layers from `cpq_image_management`.

---

## 8) UI/process consistency notes
- `/cpq/process` guidance (setup first; manual vs bulk; picture management responsibilities) is aligned with implemented setup and Bike Builder controls.
- `/cpq/ui-docs` entries reflect label-to-code mapping and admin-gated debug behavior.
- Stable docs may mention stock-bike-img only as cancelled historical context, not as active process logic.

---

## 9) Proven vs inferred

### Proven from code
- Route/component ownership, lifecycle actions, API shapes, save-source rule, sampler separation, bulk row-country execution pattern, and admin-mode tab gating.

### Inferred with caution
- External CPQ platform business-side side effects beyond returned payloads cannot be proven from this repo.
