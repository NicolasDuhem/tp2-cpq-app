# Documentation index (current, reconciled)

This documentation set is reconciled against the **current codebase** and the live Neon schema exports in:

- `table.csv`
- `columns.csv`
- `fieldrequired.csv`
- `constraints.csv`
- `indexes.csv`

## Core system docs
- `ARCHITECTURE.md` — route architecture, page responsibilities, and runtime boundaries.
- `PROCESSDATA.md` — end-to-end process flows (manual lifecycle, sampler, setup sync, bulk configure).
- `CPQ_MANUAL_LIFECYCLE.md` — strict manual lifecycle contract and invariants.
- `CPQ_DATABASE_SAVE_FLOW.md` — canonical save + retrieve persistence semantics.
- `RETRIEVE_AND_REFERENCE_FLOW.md` — reference-resolution and retrieve startup behavior.
- `CPQ_API_PAYLOADS.md` — active API contracts and payload shapes.
- `DATABASE.md` — authoritative DB model based on Neon CSV exports + SQL mismatch report.

## Repo and governance docs
- `REPO_STRUCTURE.md` — current folder and ownership map.
- `DOCUMENTATION_GAP_ANALYSIS.md` — explicit audit report of stale/updated/superseded docs and open uncertainties.

## Historical/legacy context
- `EXTRACTION_REPORT.md` — extraction history from earlier repo split (kept for historical context).
- `CANONICAL_SAVE_CAPABILITY_GAP.md` — historical note on CopyConfiguration experimentation; **not active in current runtime path**.
