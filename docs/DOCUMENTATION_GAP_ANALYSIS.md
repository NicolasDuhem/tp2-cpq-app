# Documentation gap analysis (repo-wide reconciliation)

## Audit scope executed
Reviewed current markdown docs against:
1. code behavior (`app/**`, `components/**`, `lib/**`, `types/**`, root config files),
2. live Neon schema CSV exports (`table.csv`, `columns.csv`, `fieldrequired.csv`, `constraints.csv`, `indexes.csv`),
3. active route/UI/API behavior.

## 1) Docs reviewed

Root:
- `README.md`

`docs/`:
- `ARCHITECTURE.md`
- `CANONICAL_SAVE_CAPABILITY_GAP.md`
- `CPQ_API_PAYLOADS.md`
- `CPQ_DATABASE_SAVE_FLOW.md`
- `CPQ_MANUAL_LIFECYCLE.md`
- `DATABASE.md`
- `EXTRACTION_REPORT.md`
- `PROCESSDATA.md`
- `README.md`
- `REPO_STRUCTURE.md`
- `RETRIEVE_AND_REFERENCE_FLOW.md`

## 2) Stale/contradictory docs found

### CopyConfiguration claims were stale
- Previous docs claimed active copy-backed canonical save and HTTP 501 behavior when copy capability is missing.
- Current runtime routes do not call `copy-configuration.ts`.
- Updated docs now mark copy capability as historical/future-only.

### SQL baseline treated as authoritative (stale)
- Previous DB docs did not consistently prioritize live CSV exports.
- Updated docs now treat CSV exports as schema source of truth and explicitly call out SQL drift.

### Overlap without clear scope
- Several lifecycle docs repeated similar content with slight variations.
- Updated docs now separate concerns:
  - architecture/layout,
  - process flows,
  - strict manual lifecycle,
  - DB save/retrieve semantics,
  - payload contracts.

## 3) Missing topics found (now addressed)

- Explicit Neon CSV source-of-truth statement.
- Formal mismatch section: live schema vs `sql/schema.sql`.
- Clear canonical-vs-secondary table role definitions.
- Bulk row failure diagnostics and post-run row retention behavior.
- Explicit preview layer ordering and image matching contract.
- Governance statement tying UI changes to `/cpq/ui-docs` updates.

## 4) Docs updated

- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/PROCESSDATA.md`
- `docs/CPQ_MANUAL_LIFECYCLE.md`
- `docs/CPQ_DATABASE_SAVE_FLOW.md`
- `docs/RETRIEVE_AND_REFERENCE_FLOW.md`
- `docs/CPQ_API_PAYLOADS.md`
- `docs/REPO_STRUCTURE.md`
- `docs/CANONICAL_SAVE_CAPABILITY_GAP.md`
- `docs/EXTRACTION_REPORT.md`

## 5) Docs added

- `docs/DOCUMENTATION_GAP_ANALYSIS.md` (this report)

## 6) Merged/superseded framing decisions

No files were deleted. Instead:
- `CANONICAL_SAVE_CAPABILITY_GAP.md` was reframed as historical note (not active contract).
- `EXTRACTION_REPORT.md` was reframed as historical context (not runtime truth source).
- `docs/README.md` was restructured to mark authoritative vs historical docs.

## 7) DB truth used from Neon CSV exports

Used all five CSV exports for reconciliation:
- table inventory,
- per-table column inventory,
- insert requirement status,
- constraints,
- indexes.

## 8) Mismatches found between live CSV schema and `sql/schema.sql`

### `cpq_configuration_references` columns missing from baseline SQL
- `canonical_header_id`
- `canonical_detail_id`
- `source_working_detail_id`
- `source_session_id`

These are used by current runtime save/retrieve code, so baseline SQL is incomplete for full current behavior.

## 9) Remaining uncertainties (explicit)

### Proven from code/schema
- save-source rule (configure > start, never finalize body)
- canonical save target table
- retrieve by reference route behavior
- sampler sync mechanics
- image layer matching + ordering
- bulk remap/feature-scoped option matching semantics

### Inferred / unverified from code alone
- Exact external CPQ service-side semantics beyond request/response handling (e.g., server-side side effects in Infor CPQ).
- Whether every deployment has applied DB migrations equivalent to live CSV schema drift (outside this repo baseline SQL).

## Maintenance rule going forward
- Any UI/API/DB behavior change must include same-change doc reconciliation and (for visible labels/sections) `/cpq/ui-docs` mapping updates.
