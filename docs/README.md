# Documentation index

## Source of truth policy (current)
Use this precedence when documentation and implementation diverge:
1. current code (`app/**`, `components/**`, `lib/**`, `types/**`)
2. runtime SQL and migrations in repo (`sql/schema.sql`, `sql/migrations/**`)
3. documentation files in `docs/**`

The docs are intentionally code-derived and must be updated with behavior changes.

## Core implementation docs
- `ARCHITECTURE.md` — route/component/API architecture.
- `PROCESSDATA.md` — runtime workflows and data/write flow.
- `DATABASE.md` — DB tables, read/write ownership, and schema usage.
- `CPQ_MANUAL_LIFECYCLE.md` — strict `/cpq` lifecycle contract.
- `CPQ_DATABASE_SAVE_FLOW.md` — canonical save + sampler write behavior.
- `RETRIEVE_AND_REFERENCE_FLOW.md` — retrieve-by-reference sequence and payload construction.
- `CPQ_API_PAYLOADS.md` — route payload contracts (CPQ + setup + sales allocation APIs).
- `REPO_STRUCTURE.md` — ownership map by folder/route/service.
- `MAIN_APP_DEEP_DIVE.md` — cross-cutting deep dive for current production behavior.
- `PAGES_AND_COMPONENTS.md` — detailed page-by-page and component-by-component documentation.
- `PAGE_DATA_POINTS.md` — page-level UI data-point/source-target audit + Admin Data point viewer scope.
- `EXTERNAL_POSTGRES_ROW_PUSH.md` — external Azure PostgreSQL row-push behavior, env vars, and upsert-key SQL prep.

## Audit artifacts
- `DOC_GAP_ANALYSIS.md` — current audit of doc-vs-code gaps and what was fixed.
- `DOCUMENTATION_GAP_ANALYSIS.md` — prior historical audit retained for context.

## Historical/legacy context
- `STOCK_BIKE_IMG_EXPERIMENT.md` — archived experiment documentation (not active runtime).
- `CANONICAL_SAVE_CAPABILITY_GAP.md` — historical note about non-active copy capability.
- `EXTRACTION_REPORT.md` — extraction history/context only.

### QPart allocation update-all operations

The QPart allocation page adds a password-protected **Update all** mode for bulk activate/deactivate. Current-page bulk behavior remains the default. When enabled, the backend validates the update-all cookie and rebuilds the full filtered target set across every page before updating `qpart_country_allocation` rows for the selected countries.

The same page includes a compact `OK` / `NOK` BC status filter, and QPart external PostgreSQL pushes use QPart-only values (`Qpart`) for ruleset, forecast country code, and detail id. Bike allocation external push logic is not changed by this override.


### Sales Bike Allocation redesign (2026-09-30)

`/sales/bike-allocation` now has a Region → Sub-region → Country Territory selector, country
flags, server-applied filters, a visible page-number pagination bar and explicitly
current-page bulk scope. See `ARCHITECTURE.md` for the design and `PAGES_AND_COMPONENTS.md`
for the URL/filter contract and mutation semantics.

Shared, unit-tested helpers live in `lib/sales/allocation-territory.ts` (territory hierarchy,
pagination range, flag URL, status matching, URL encoding). Run them with `npm run test`
(`node --test`); `npm run typecheck` runs `tsc --noEmit`.

A follow-up density pass replaced the filter drawer with a single-row toolbar plus
popovers, moved the IPN search / feature-column picker / feature filters into the table
header, shrank the matrix cells (a dot for Not configured, icons for sync state), and added
a **CSV export** of the filtered dataset for sales ops. See `ARCHITECTURE.md`.

Shared, unit-tested helpers: `lib/sales/allocation-territory.ts` and `lib/sales/csv.ts`.

Screenshots of the finished UX are in `docs/screenshots/`.
