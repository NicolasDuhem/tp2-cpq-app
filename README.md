# tp2-cpq-app

CPQ-focused Next.js app for manual lifecycle operations, setup/admin data, sampler results, and picture-layer preview.

## Routes
- `/cpq` — primary Bike Builder/manual lifecycle page.
- `/bike-builder` — redirect alias to `/cpq`.
- `/cpq/setup` — account/ruleset/picture management.
- `/cpq/results` — sampler matrix page (admin navigation).
- `/cpq/ui-docs` — UI label-to-code/data mapping page (admin-only content).

## Manual lifecycle summary
1. `StartConfiguration` (`/api/cpq/init`)
2. `Configure` (`/api/cpq/configure`)
3. `FinalizeConfiguration` (`/api/cpq/finalize`)
4. Canonical save into `cpq_configuration_references` (`/api/cpq/configuration-references`)
5. Auto support save into `CPQ_sampler_result` (`/api/cpq/sampler-result`)
6. Retrieve by `configuration_reference` (`/api/cpq/retrieve-configuration`)

### Save-source rule
Canonical save and sampler snapshot payloads are sourced from:
- latest Configure snapshot, else
- latest StartConfiguration snapshot,
- never Finalize response body.

## Bulk combinations flow
- Generate combinations from active state on `/cpq`.
- Operational grid controls:
  - `Feature filters` panel (collapsible) is generated dynamically from current generated combinations:
    - one filter group per feature,
    - option/value list comes from current generated rows (not hardcoded),
    - multi-select values per feature.
  - Filtering logic:
    - OR inside the same feature (selecting multiple values),
    - AND across features.
  - `Select all visible rows` and `Unselect all visible rows` accelerate row targeting after filtering.
  - `Visible-row country actions` can tick/untick chosen country codes for all visible selected rows in one action.
  - `Show selected only` toggle filters table to ticked rows.
  - `Columns` picker can show/hide feature and dynamic country columns.
  - Dynamic country checkbox columns are sourced from active `cpq_setup_account_context.country_code`.
- Validation rule before run:
  - every selected row must have at least one country selected,
  - invalid rows are highlighted and bulk run is blocked with a message.
- Run **Configure all ticked items**:
  - fresh StartConfiguration per **row-country pair** (no session reuse across rows/countries),
  - country-specific setup context resolution (`account_code`, `customer_id`, `currency`, `language`, `country_code`) for each execution,
  - per-session feature remap (because feature IDs and labels can drift by country/account context),
  - feature matching precedence:
    1. stable identity match (`featureName` / `FeatureQuestion` / `featureSequence`),
    2. exact feature label,
    3. normalized feature label (case-insensitive, trimmed, collapsed spaces, punctuation-tolerant),
    4. suffix-tolerant feature label (locale suffix handling, e.g. `_FR`),
    5. cautious fuzzy fallback (token overlap, unique winner only),
  - option matching precedence (inside resolved feature only):
    1. exact option value,
    2. normalized option value,
    3. exact option label,
    4. normalized option label,
    5. cautious fuzzy fallback (unique winner only),
  - skip ignored features (`ignore_during_configure`),
  - finalize + canonical save + sampler support save per row-country execution,
  - row-level diagnostics include remap strategy, source/target feature+option identities, and explicit structured failure reasons when matching is unsafe.

## Sales bike allocation flow
- Matrix statuses are derived from `CPQ_sampler_result.active` (DB column, not `json_result.active`):
  - `Active` (green) when at least one row for the IPN/ruleset/country is active.
  - `Inactive` (light red) when rows exist for the cell but all are inactive.
  - `Not configured` (grey) when no sampler rows exist for that cell.
- Clicking `Active` toggles to `Inactive`; clicking `Inactive` toggles back to `Active`.
- Clicking `Not configured` resolves launch context and opens `/cpq` with deterministic replay:
  1. apply account code context, ruleset, and target country launch context,
  2. wait 2 seconds,
  3. run the same **Start a new session** action used by the manual UI button,
  4. wait 2 seconds,
  5. replay bike options through standard `/api/cpq/configure`.
- Replay source is sampler `json_result.selectedOptions` (fallback: `dropdownOrderSnapshot`) using `featureLabel`, `optionLabel`, `optionValue`.
- Sales→CPQ replay handoff uses session-scoped storage (`sessionStorage`) plus a compact `replay_token` query parameter (avoids oversized URLs).
- Replay remap strategy reuses the existing Configure-all matching logic:
  - exact + normalized + suffix-tolerant feature/option matching,
  - cautious fuzzy fallback only for clear single-winner cases.

## Picture management layer order (feature-level)
- Stored on `cpq_image_management.feature_layer_order` (integer, default `10`, valid `1..20`).
- Maintained from **CPQ Setup → Picture management** at feature level via **Layer order (1 = top layer)**.
- One save updates all rows for the selected feature, so admins do not repeat the same value per option tile.
- Bike Builder preview sorts matched layers by feature order before rendering:
  - higher numbers are drawn first (deeper),
  - `1` is drawn last and is therefore the top-most visual layer.

## Database source of truth
For schema truth, use live Neon CSV exports in repo root:
- `table.csv`, `columns.csv`, `fieldrequired.csv`, `constraints.csv`, `indexes.csv`

Treat `sql/schema.sql` as baseline artifact that must be reconciled with these exports.

## Quick start
```bash
npm install
cp .env.example .env.local
psql "$DATABASE_URL" -f sql/schema.sql
psql "$DATABASE_URL" -f sql/seed.sql
npm run dev
```

## Environment variables
See `.env.example` for required CPQ and DB configuration.

## Documentation
See `docs/README.md` for the reconciled documentation set and audit report.

## Admin mode (lightweight UI gate)
- Top ribbon includes **Open as admin**.
- Password: `Br0mpt0n` (client-side visibility gate for internal use, not enterprise auth).
- Admin mode unlocks admin nav tabs (`/cpq/results`, `/cpq/ui-docs`) and technical/debug surfaces on Bike Builder.
- Non-admin top nav only shows: **CPQ - Process**, **CPQ - Bike Builder**, **CPQ - Setup**.

## Bike Builder desktop UX update
- Controls are compacted into a top strip (account/ruleset/actions/retrieve).
- Main workspace is a two-column layout: configurator (left) and layered preview (right).
- Technical runtime status lines and debug timeline are admin-only.
- Generated combinations keep an internal scroll container (vertical + horizontal) for large datasets.
