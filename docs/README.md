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
- `EXTERNAL_POSTGRES_ROW_PUSH.md` — external Azure PostgreSQL row-push behavior, env vars, and upsert-key SQL prep.

## Audit artifacts
- `DOC_GAP_ANALYSIS.md` — current audit of doc-vs-code gaps and what was fixed.
- `DOCUMENTATION_GAP_ANALYSIS.md` — prior historical audit retained for context.

## Historical/legacy context
- `STOCK_BIKE_IMG_EXPERIMENT.md` — archived experiment documentation (not active runtime).
- `CANONICAL_SAVE_CAPABILITY_GAP.md` — historical note about non-active copy capability.
- `EXTRACTION_REPORT.md` — extraction history/context only.
