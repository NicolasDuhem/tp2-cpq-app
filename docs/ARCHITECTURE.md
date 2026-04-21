# Architecture (current implementation)

## 1) Application scope
This app is a CPQ-focused Next.js application with five primary user-facing areas. The top ribbon runs in two visibility modes (standard/admin):

- `/cpq` — core Bike Builder manual lifecycle page.
- `/cpq/setup` — setup/admin page for account contexts, rulesets, and picture management.
- `/cpq/results` — sampler results matrix/pivot exploration page.
- `/cpq/process` — business SOP/instruction page for setup and configuration workflows.
- `/cpq/ui-docs` — internal UI label/code/data mapping reference.

Additional route aliases:
- `/` redirects to `/cpq`.
- `/bike-builder` redirects to `/cpq`.

## 2) Page/component architecture

### `/cpq`
- Route file: `app/cpq/page.tsx` (thin wrapper).
- Main component: `components/cpq/bike-builder-page.tsx`.
- Responsibilities:
  - Manual CPQ lifecycle (`StartConfiguration` → `Configure` → `FinalizeConfiguration` → canonical save).
  - Manual sampler save support action.
  - Configuration reference retrieval.
  - Layered preview resolution/download.
  - Combination generation + bulk configure orchestration with operational-grid controls:
    - feature-value filter panel generated from current combinations data,
    - filter model: OR within a feature, AND across features,
    - visible-row bulk row selection and visible-row bulk country assignment actions,
    - selected-only row filter,
    - column picker (feature + dynamic country columns),
    - pre-run row-country validation,
    - row-country execution queue with fresh StartConfiguration per unit.
  - In-page debug timeline and per-row/per-country failure diagnostics.
  - Non-admin compact desktop layout: compact control strip + two-column workspace (configurator left, layered preview right).
  - Admin-only Bike Builder technical runtime block (session/detail/IPN/save/retrieve/bulk internals).

### `/cpq/setup`
- Route file: `app/cpq/setup/page.tsx`.
- Main component: `components/setup/cpq-setup-page.tsx`.
- Responsibilities:
  - Account context CRUD (`cpq_setup_account_context`).
  - Ruleset CRUD (`cpq_setup_ruleset`).
  - Feature-tabbed picture management and modal editing (`cpq_image_management`).
  - Feature-level `ignore_during_configure` toggling.
  - Feature-level `feature_layer_order` maintenance (`Layer order (1 = top layer)`).
  - Sync from sampler results into picture management.

### `/cpq/results`
- Route file: `app/cpq/results/page.tsx`.
- Main components:
  - server: `components/cpq/cpq-results-page.tsx`
  - client table/filter: `components/cpq/cpq-results-matrix.client.tsx`
- Responsibilities:
  - Build a matrix from `CPQ_sampler_result` + ruleset lookup metadata.
  - Group rows by `(sku_code + ruleset + selected feature signature)`.
  - Pivot `detail_id` values across country columns.


### `/cpq/process`
- Route file: `app/cpq/process/page.tsx`.
- Main component: `components/docs/process-page.tsx`.
- Responsibility:
  - Business-facing SOP guide for role ownership, setup dependencies, manual single-bike flow, and bulk execution flow.
  - Read-only instructional content with anchored section navigation.

### `/cpq/ui-docs`
- Route file: `app/cpq/ui-docs/page.tsx`.
- Main component: `components/docs/ui-docs-page.tsx`.
- Responsibility:
  - Human-readable mapping of visible labels to owning code and backing data sources.

## 3) API route architecture

### Runtime CPQ routes
- `POST /api/cpq/init` → StartConfiguration.
- `POST /api/cpq/configure` → Configure.
- `POST /api/cpq/finalize` → FinalizeConfiguration.
- `POST /api/cpq/retrieve-configuration` → resolve saved reference + StartConfiguration.
- `POST /api/cpq/image-layers` → resolve stacked preview layers from `cpq_image_management`.

### Persistence routes
- `POST /api/cpq/configuration-references` → canonical save to `cpq_configuration_references`.
- `GET /api/cpq/configuration-references?configuration_reference=...` → resolve canonical row.
- `POST /api/cpq/sampler-result` → persist support/manual sampler snapshot to `CPQ_sampler_result`.

### Setup routes
- `GET/POST /api/cpq/setup/account-context`
- `PUT/DELETE /api/cpq/setup/account-context/[id]`
- `GET/POST /api/cpq/setup/rulesets`
- `PUT/DELETE /api/cpq/setup/rulesets/[id]`
- `GET /api/cpq/setup/picture-management`
- `PUT /api/cpq/setup/picture-management/[id]`
- `POST /api/cpq/setup/picture-management/sync`
- `PUT /api/cpq/setup/picture-management/feature-flags`
- `GET /api/cpq/setup/picture-management/ignored-features`

## 4) Runtime boundaries and modules

- `lib/cpq/runtime/*`
  - CPQ request building/client calls.
  - response normalization/mapping to `NormalizedBikeBuilderState`.
  - debug trace helpers.
  - canonical reference persistence adapter.
  - sampler persistence adapter.
- `lib/cpq/setup/service.ts`
  - setup CRUD data services.
  - sampler-to-picture sync.
  - image layer resolution query ordered by feature layer order (`feature_layer_order`).
- `lib/cpq/results/service.ts`
  - results matrix read-model for `/cpq/results`.
- `lib/db/client.ts`
  - Neon SQL client wrapper.

## 5) Lifecycle design rules (high level)

- Canonical save registry is `cpq_configuration_references`.
- Canonical save source snapshot rule is strictly:
  1. latest Configure snapshot,
  2. otherwise latest StartConfiguration snapshot.
- Finalize response is **not** used as canonical save snapshot source (stored only as finalize metadata).
- After canonical save succeeds, one support row is auto-saved to `CPQ_sampler_result` from the same source snapshot.
- Retrieve flow resolves `configuration_reference` then starts a fresh CPQ session.

## 6) Debug visibility

- API and CPQ/client layers emit structured logs using trace IDs (`x-cpq-trace-id` propagation).
- `/cpq` maintains a local debug timeline of recent calls when `NEXT_PUBLIC_CPQ_DEBUG=true`.
- Bulk run failures keep row-local diagnostics (stage, error, last requests/responses) shown via **Inspect failure** modal.


## 7) Admin mode visibility model
- Implemented client-side with `AdminModeProvider` (`components/shared/admin-mode-context.tsx`) and ribbon controls in `components/shared/app-navigation.tsx`.
- **Open as admin** uses password dialog (`Br0mpt0n`) and stores enabled state in `sessionStorage` for the active browser tab/session.
- Non-admin navigation surfaces: `/cpq/process`, `/cpq`, `/cpq/setup`.
- Admin navigation additionally exposes `/cpq/results` and `/cpq/ui-docs` (UI docs page body is also gated).
- Bike Builder debug timeline + technical runtime details are hidden unless admin mode is enabled.
