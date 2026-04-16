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
  - `Show selected only` toggle filters table to ticked rows.
  - `Columns` picker can show/hide feature and dynamic country columns.
  - Dynamic country checkbox columns are sourced from active `cpq_setup_account_context.country_code`.
- Validation rule before run:
  - every selected row must have at least one country selected,
  - invalid rows are highlighted and bulk run is blocked with a message.
- Run **Configure all ticked items**:
  - fresh StartConfiguration per **row-country pair** (no session reuse across rows/countries),
  - country-specific setup context resolution (`account_code`, `customer_id`, `currency`, `language`, `country_code`) for each execution,
  - stable feature identity remap to fresh session,
  - feature-scoped option resolution,
  - skip ignored features (`ignore_during_configure`),
  - finalize + canonical save + sampler support save per row-country execution,
  - row-level failure diagnostics include country execution context.

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
