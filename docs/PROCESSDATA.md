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
  - country checkbox source: active `CPQ_setup_account_context` rows (unique `country_code`)
  - per selected market:
    1. initialize with that market context (`account_code`, `customer_id`, `currency`, `language`, `country_code`)
    2. replay selected configurator options
    3. save through `POST /api/cpq/sampler-result`
    4. wait 5000ms before next market
  - shows status for selected count, processed count, saved count, duplicates skipped, current country, last message

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
- `detailId` is extracted from CPQ init/configure responses and stored in live normalized state.
- UI live `detailId` is refreshed after each successful `/configure`.
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
- `/cpq/results` loads latest rows per IPN from `CPQ_sampler_result`.
- Uses picture mappings from `cpq_image_management`.
