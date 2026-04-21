# Documentation index

## Source-of-truth hierarchy for this repo
Use this order when reconciling behavior:
1. current code (`app/**`, `components/**`, `lib/**`, `types/**`)
2. active API routes and SQL files in repo (`sql/**`)
3. docs as derived explanations

Note: root CSV schema exports are useful historical artifacts but should not be treated as the primary authority when they drift from code/runtime.

---

## Documentation tracks

## Track A — Stable/main app behavior
- `MAIN_APP_DEEP_DIVE.md` — consolidated deep-dive for stable app behavior (explicitly excludes stock-bike-img internals).
- `ARCHITECTURE.md` — page and route architecture overview.
- `PROCESSDATA.md` — process-oriented operational flow notes.
- `CPQ_MANUAL_LIFECYCLE.md` — manual lifecycle contract.
- `CPQ_DATABASE_SAVE_FLOW.md` — canonical save and persistence semantics.
- `RETRIEVE_AND_REFERENCE_FLOW.md` — retrieve by reference behavior.
- `CPQ_API_PAYLOADS.md` — API payload contracts.
- `DATABASE.md` — database model notes.
- `REPO_STRUCTURE.md` — repo structure map.

## Track B — Stock-bike-img experiment (cancelled)
- `STOCK_BIKE_IMG_EXPERIMENT.md` — cancelled-development historical record; feature removed from active app and SQL baseline.

## Reconciliation/audit
- `DOCUMENTATION_GAP_ANALYSIS.md` — audit of stale/overlapping docs and stable-vs-experiment split decisions.

## Historical context docs
- `CANONICAL_SAVE_CAPABILITY_GAP.md`
- `EXTRACTION_REPORT.md`

These are retained for context and should not override current code-derived behavior.
