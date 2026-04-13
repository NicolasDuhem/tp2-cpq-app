# PROCESSDATA

## 1) Builder runtime flow
- Primary UI: `/cpq`.
- Alias UI: `/bike-builder` redirects to `/cpq`.
- Calls:
  - `POST /api/cpq/init`
  - `POST /api/cpq/configure`

## 2) Configuration traversal process (single workflow)
- Triggered from `/cpq` using **Start configuration traversal**.
- Steps:
  1. Initialize configuration via `POST /api/cpq/init`.
  2. Inspect currently available CPQ features/options from response.
  3. Apply one option change at a time via `POST /api/cpq/configure`.
  4. Continue traversal with newly returned dynamic option sets.
- Traversal is not a static cartesian product; option availability is resolved after each configure call.
- Persists snapshots via `POST /api/cpq/sampler-result` into `CPQ_sampler_result`.
- Duplicate protection:
  - unique tuple is `(ipn_code, country_code)`.
  - first tuple discovered is saved; subsequent duplicates are skipped.
  - same `ipn_code` can be saved for different `country_code` values.
- Country derivation:
  - selected account at page top maps to `CPQ_setup_account_context`.
  - `country_code` from this context is included in persisted rows.

## 3) Traversal status/progress semantics
- Estimated total uses a **lower-bound adaptive** heuristic:
  - lower bound = product of currently visible/selectable options.
  - adaptive growth = estimate increases as traversal discovers new states.
- Processed count represents executed traversal transitions (`/configure` calls).
- Progress bar displays `processed / estimated`.
- Additional counters include configure calls, saved rows, duplicates skipped, save errors, and delay/wait state.

## 4) Traversal controls
- Main workflow keeps one essential persistence toggle:
  - **Save discovered configurations to database** (on by default).
- Debug-only toggles were moved under **Show debug**:
  - traverse hidden/system features
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
