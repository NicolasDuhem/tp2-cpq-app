# DOCUMENTATION_GAP_ANALYSIS (stable vs stock-bike-img reconciliation)

## Audit method and source-of-truth policy
This audit was performed against current code and active SQL in repo:
- `app/**`
- `components/**`
- `lib/**`
- `types/**`
- `sql/schema.sql`, `sql/seed.sql`
- existing `docs/**`

Critical policy applied:
- root schema CSV files (`table.csv`, `columns.csv`, `fieldrequired.csv`, `constraints.csv`, `indexes.csv`) were **not treated as authoritative** for this reconciliation.

---

## 1) Docs reviewed

### Core docs reviewed
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/PROCESSDATA.md`
- `docs/CPQ_MANUAL_LIFECYCLE.md`
- `docs/CPQ_DATABASE_SAVE_FLOW.md`
- `docs/RETRIEVE_AND_REFERENCE_FLOW.md`
- `docs/CPQ_API_PAYLOADS.md`
- `docs/DATABASE.md`
- `docs/REPO_STRUCTURE.md`
- `docs/STOCK_BIKE_IMG_EXPERIMENT.md`
- `docs/CANONICAL_SAVE_CAPABILITY_GAP.md`
- `docs/EXTRACTION_REPORT.md`

### Also reviewed for entrypoint context
- root `README.md`

---

## 2) Biggest stale/inaccurate areas found

1. **Source-of-truth mismatch in docs index**
   - `docs/README.md` explicitly stated Neon CSV exports as reconciled truth.
   - This conflicts with current instruction for this exercise and can mislead future maintenance when CSVs drift.

2. **Stable vs experiment blending risk**
   - Existing architecture/process docs were mostly stable-focused but did not provide a dedicated, deep stable-only reference with an explicit experiment boundary contract.

3. **Stock-bike doc lacked explicit removal/integration playbooks**
   - Existing experiment doc covered architecture/logic well but removal and integration guidance needed to be more operational and surgical.

---

## 3) Documentation split performed

## Track A (stable app, experiment excluded)
Added:
- `docs/MAIN_APP_DEEP_DIVE.md`

This new stable-track deep dive now centralizes:
- route/page architecture,
- CPQ manual lifecycle,
- canonical save/retrieve semantics,
- sampler flow and separation,
- picture-management and layered preview behavior,
- combinations/bulk row-country execution,
- stable tables and stable API map,
- proven vs inferred notes.

## Track B (stock-bike-img experiment only)
Refreshed:
- `docs/STOCK_BIKE_IMG_EXPERIMENT.md`

This now isolates and deepens:
- purpose and architecture,
- data model by concern (reference/family/group/rules),
- rule logic (digit 20 model year, digit 17 bike type, group filtering),
- authoring/runtime flow,
- limitations,
- explicit removal strategy,
- possible future integration strategy.

---

## 4) Files updated in this reconciliation
- `docs/README.md`
- `docs/STOCK_BIKE_IMG_EXPERIMENT.md`
- `docs/DOCUMENTATION_GAP_ANALYSIS.md`

## 5) Files added in this reconciliation
- `docs/MAIN_APP_DEEP_DIVE.md`

---

## 6) Stable vs experiment ownership map

### Stable documentation ownership
Primary stable deep reference:
- `docs/MAIN_APP_DEEP_DIVE.md`

Stable routes/tables/services:
- `/cpq`, `/cpq/setup`, `/cpq/results`, `/cpq/process`, `/cpq/ui-docs`
- `/api/cpq/*`
- `CPQ_*` + `cpq_*` stable tables

### Experimental documentation ownership
Primary experiment reference:
- `docs/STOCK_BIKE_IMG_EXPERIMENT.md`

Experiment routes/tables/services:
- `/cpq/stock-bike-img`
- `/api/stock_bike_img_rules/*`
- `lib/Stock_bike_img_service.ts`
- `stock_bike_img_*` tables

---

## 7) What remains uncertain from code
1. External Infor CPQ backend-side semantics beyond request/response contracts in this repo.
2. Whether all target environments have applied every SQL migration implied by `sql/schema.sql` and runtime assumptions.

No additional unresolved ambiguity found in stable-vs-experiment boundaries.

---

## 8) Practical outcome
This split makes future decisions straightforward:
- **Remove experiment**: follow the dedicated deletion checklist in `STOCK_BIKE_IMG_EXPERIMENT.md`.
- **Integrate experiment**: use the listed schema/runtime/UI touchpoints without polluting current stable-process docs.
