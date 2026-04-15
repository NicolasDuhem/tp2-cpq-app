# tp2-cpq-app

CPQ-focused Next.js app for manual lifecycle operations, setup/admin data, sampler results, and picture-layer preview.

## Routes
- `/cpq` — primary Bike Builder/manual lifecycle page.
- `/bike-builder` — redirect alias to `/cpq`.
- `/cpq/setup` — account/ruleset/picture management.
- `/cpq/results` — sampler matrix page.
- `/cpq/ui-docs` — UI label-to-code/data mapping page.

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
- Run **Configure all ticked items**:
  - fresh StartConfiguration per row,
  - stable feature identity remap to fresh session,
  - feature-scoped option resolution,
  - skip ignored features (`ignore_during_configure`),
  - finalize + canonical save + sampler support save per row,
  - row-level failure diagnostics in-table.

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
