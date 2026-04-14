# PROCESSDATA

## 1) Builder runtime flow
- Primary UI: `/cpq`.
- Alias UI: `/bike-builder` redirects to `/cpq`.
- Calls:
  - `POST /api/cpq/init`
  - `POST /api/cpq/configure`

## 1.1) Operating modes on `/cpq`
- **CPQ for a market**:
  - existing single-market account-context behavior
  - supports traversal and manual save
- **CPQ for a bike across market**:
  - uses current selected bike configuration (no traversal through all combinations)
  - captures/keeps canonical source identity for loaded bike:
    - `sourceHeaderId`
    - `sourceDetailId`
    - `ruleset`
    - `namespace`
    - optional `configurationReference`
  - country checkbox source: active `CPQ_setup_account_context` rows (unique `country_code`)
  - per selected market:
    1. generate a new `detailId` (new configuration identity for this market branch)
    2. initialize with coherent market context (`account_code`, `customer_id`, `currency`, `language`, `country_code`, `Company`, `CustomerLocation`, `AccountType`) and canonical `sourceHeaderDetail` using `POST /api/cpq/init`
    3. use fresh `sessionId` returned by init and run a configure hydration pass to force session evaluation in market context
    4. save through `POST /api/cpq/sampler-result` using the rebuilt market run state and rebuilt market `detailId`
    5. wait 5000ms before next market
  - shows status for selected count, processed count, saved count, duplicates skipped, current country, last message
  - per-market run reports explicit outcome: `started`, `rebuilt`, `saved`, `duplicate-skipped`, `incompatible-failed`

## 2) Configuration traversal process (single workflow)
- Triggered from `/cpq` using **Start configuration traversal**.
- Steps:
  1. Initialize configuration via `POST /api/cpq/init`.
  2. Build traversal candidates from the same visible Configurator dropdown model rendered in UI (`state.features`), not from raw CPQ feature arrays.
  3. Apply one dropdown option change at a time via `POST /api/cpq/configure`.
  4. Continue traversal with newly returned visible dropdown sets from the configure response.
- Traversal is not a static cartesian product; option availability is resolved after each configure call.
- Persists snapshots via `POST /api/cpq/sampler-result` into `CPQ_sampler_result`.
- Manual **Save Configuration** uses the same persistence path and same payload shape as traversal auto-save.
- Duplicate protection:
  - unique tuple is `(ipn_code, country_code)`.
  - first tuple discovered is saved; subsequent duplicates are skipped.
  - same `ipn_code` can be saved for different `country_code` values.
- Country derivation:
  - selected account at page top maps to `CPQ_setup_account_context`.
  - `country_code` from this context is included in persisted rows.

## 2.1) detailId refresh/capture behavior
- `detailId` is unique per configuration state and is extracted from every parsed CPQ response (`/init`, `/configure`, and equivalent parsed-state flows).
- Canonical live `detailId` is refreshed after each successful CPQ response and replaces any previous value in UI state/debug badges.
- Runtime identity split:
  - `sessionId`: runtime CPQ session state used by `/configure`.
  - `detailId`: configuration identity passed at init/start of a branch.
- Across-market mode generates a fresh target `detailId` per market branch while still using canonical source identity (`sourceHeaderDetail`) for retrieve semantics.
- Save actions use current live `detailId` in priority order:
  1. explicit override (across-market run)
  2. current normalized state detailId
  3. local fallback detailId
- Applies to:
  - manual save
  - traversal auto-save
  - across-market save

## 3) Traversal status/progress semantics
- Estimated total uses a **lower-bound adaptive** heuristic:
  - lower bound = product of currently visible/selectable Configurator dropdown choices.
  - adaptive growth = estimate increases as traversal discovers new states.
- Processed count represents executed traversal transitions (`/configure` calls).
- Progress bar displays `processed / estimated`.
- Additional counters include configure calls, saved rows, duplicates skipped, save errors, and delay/wait state.
- UI also exposes a transient highlight on the most recently changed dropdown field so traversal changes are visually traceable.

## 4) Traversal controls
- Main workflow keeps one essential persistence toggle:
  - **Save discovered configurations to database** (on by default).
- Debug-only toggles were moved under **Show debug**:
  - include currently-selected options as debug reconfigure steps

## 5) Setup management
- `/cpq/setup` exposes exactly:
  - Account code management
  - Ruleset management
  - Picture management
- Backed by `/api/cpq/setup/*` routes.

## 6) Results browsing
- `/cpq/results` now renders a bike matrix sourced from `CPQ_sampler_result` and `CPQ_setup_ruleset`.
- Row identity is normalized as `sku_code + ruleset + selected feature signature` (sku_code maps to `CPQ_sampler_result.ipn_code`).
- Dynamic feature columns are derived from `json_result.selectedOptions` entries (`featureLabel` -> selected `optionLabel`/`optionValue`).
- Dynamic country columns come from observed sampler `country_code` values plus active `CPQ_setup_account_context.country_code` values.
- Country cell values are sampler `detail_id`; missing combinations render as grey placeholders.
- The page includes simple business filters (`ruleset`, `bike_type`, `sku_code`, country presence) and feature-column visibility controls.
